import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { STEST_ADDRESS } from "../frontend/src/chainConfig.js";
import type { RegistryCommitment, RegistrySnapshot } from "../frontend/src/registryDiscovery.ts";
import { validateVerifiedCommitmentsDocument } from "../frontend/src/verifiedCommitments.ts";
import { sha256Canonical } from "../scripts/phase6-evidence-core.ts";
import { validateVerifierResult, type PublicResultDocument, type PublicResultEntry, type PublicResultIndex } from "../scripts/phase10b-publication.ts";
import { validatePublicationTransition, validateStoreSnapshot, type StoreSnapshot } from "../scripts/phase10b-pr-publication.ts";
import { emptySchedulerState, recordAttemptFailure, recordAttemptSuccess, recordScanIssues, SCHEDULER_PATH, selectFairCandidate, validateSchedulerState, type IsolatedScanIssue, type SchedulerState } from "../scripts/phase10b-scheduler.ts";
import { createExpectedPublicationTransition, type ExpectedPublicationTransition } from "../scripts/phase10b-transition-provenance.ts";

const ROOT = resolve(import.meta.dirname, "..");
const NOW = "2026-10-16T12:00:00.000Z";
const LATER = "2026-10-17T12:00:00.000Z";
const REGISTRY = "0x4e4887e28a8370678a9a37c08a85c65450b510c0";
const prepared = validateVerifiedCommitmentsDocument(JSON.parse(readFileSync(resolve(ROOT, "frontend/public/data/commitments.json"), "utf8")));

function validatedResult(id: string): Readonly<{ document: PublicResultDocument; entry: PublicResultEntry }> {
  const sourceId = id === "2" ? "2" : "1";
  const view = prepared.commitments[sourceId];
  const envelope = JSON.parse(readFileSync(resolve(ROOT, `evidence/phase6b2-commitment${sourceId}-receipt-v3.json`), "utf8"));
  if (id !== sourceId) {
    envelope.evidenceManifest.commitmentId = id;
    envelope.receipt.commitmentId = id;
    envelope.receipt.evidenceManifestDigest = sha256Canonical(envelope.evidenceManifest);
    const { receiptDigest: _old, ...unsigned } = envelope.receipt;
    envelope.receipt = { ...unsigned, receiptDigest: sha256Canonical(unsigned) };
  }
  const candidate = validateVerifierResult({
    envelope,
    pathBaseUnits: view.pathBaseUnits,
    terms: { id, creator: envelope.receipt.creator, subject: envelope.receipt.subject, token: envelope.receipt.token, minimumBalanceBaseUnits: envelope.receipt.minimumRequiredBaseUnits, startBlock: envelope.receipt.startBlock, endBlock: envelope.receipt.endBlock },
  });
  const receiptPath = `receipts/99801/${REGISTRY}/${id}/${candidate.entry.receiptDigest}.json`;
  return { document: candidate.document, entry: { ...candidate.entry, receiptPath, publishedAt: NOW } };
}

const results = new Map<string, ReturnType<typeof validatedResult>>([["1", validatedResult("1")], ["2", validatedResult("2")]]);
function result(id: string): ReturnType<typeof validatedResult> {
  const existing = results.get(id);
  if (existing) return existing;
  const created = validatedResult(id); results.set(id, created); return created;
}

function store(ids: readonly string[], scheduler: SchedulerState | null, operational = true): StoreSnapshot {
  const entries: Record<string, PublicResultEntry> = {};
  const files = new Map<string, string>();
  for (const id of ids) {
    const item = result(id); entries[id] = item.entry;
    files.set(item.entry.receiptPath, `${JSON.stringify(item.document, null, 2)}\n`);
  }
  const index: PublicResultIndex = { schemaVersion: "sicher.public-result-index/1.0", chainId: "99801", registryAddress: REGISTRY, automation: { operational }, results: entries };
  files.set("index.json", `${JSON.stringify(index, null, 2)}\n`);
  if (scheduler) files.set(SCHEDULER_PATH, `${JSON.stringify(scheduler, null, 2)}\n`);
  return validateStoreSnapshot(index, files);
}

const base = () => store(["1", "2"], null);
const prior = (value: StoreSnapshot) => ({ hasSchedulerFile: value.hasSchedulerFile, scheduler: value.scheduler });
const noCandidate = (before: StoreSnapshot, scanIssues: readonly IsolatedScanIssue[] = [], observedAt = NOW) => createExpectedPublicationTransition({ prior: prior(before), observedAt, scanIssues, candidateId: null, outcome: { kind: "NO_CANDIDATE" } });
const failure = (before: StoreSnapshot, id = "999", classification: "TRANSIENT" | "UNRESOLVED" = "TRANSIENT", code = "VERIFICATION_RETRY", scanIssues: readonly IsolatedScanIssue[] = [], observedAt = NOW) => createExpectedPublicationTransition({ prior: prior(before), observedAt, scanIssues, candidateId: id, outcome: { kind: "FAILURE", classification, code } });
const success = (before: StoreSnapshot, id = "999", observedAt = NOW) => createExpectedPublicationTransition({ prior: prior(before), observedAt, scanIssues: [], candidateId: id, outcome: { kind: "SUCCESS", entry: result(id).entry } });
const failureState = (scheduler = emptySchedulerState(), id = "999", classification: "TRANSIENT" | "UNRESOLVED" = "TRANSIENT", code = "VERIFICATION_RETRY", observedAt = NOW) => recordAttemptFailure({ scheduler: recordScanIssues(scheduler, [], observedAt), id, classification, code, attemptedAt: observedAt });
const successState = (scheduler = emptySchedulerState(), id = "999") => recordAttemptSuccess(recordScanIssues(scheduler, [], NOW), id);

function reject(before: StoreSnapshot, after: StoreSnapshot, expected: ExpectedPublicationTransition): void {
  assert.throws(() => validatePublicationTransition(before, after, expected));
}

test("1 rejects arbitrary schema-valid scanIssues", () => { const before = base(); const issues = [{ id: "888", classification: "UNRESOLVED" as const, code: "RECORD_MALFORMED" }]; reject(before, store(["1", "2"], recordScanIssues(emptySchedulerState(), issues, NOW)), noCandidate(before)); });
test("2 rejects arbitrary failure ID", () => { const before = base(); reject(before, store(["1", "2"], failureState(emptySchedulerState(), "888")), failure(before)); });
test("3 rejects wrong failure classification", () => { const before = base(); reject(before, store(["1", "2"], failureState(emptySchedulerState(), "999", "UNRESOLVED", "VERIFICATION_RETRY")), failure(before)); });
test("4 rejects wrong failure code", () => { const before = base(); reject(before, store(["1", "2"], failureState(emptySchedulerState(), "999", "TRANSIENT", "OTHER_RETRY")), failure(before)); });
test("5 rejects forged attempt count", () => { const before = base(); const twice = recordAttemptFailure({ scheduler: failureState(), id: "999", classification: "TRANSIENT", code: "VERIFICATION_RETRY", attemptedAt: LATER }); reject(before, store(["1", "2"], twice), failure(before)); });
test("6 rejects forged cursor", () => { const before = base(); const forged = validateSchedulerState({ ...failureState(), cursorAfterId: "888" }); reject(before, store(["1", "2"], forged), failure(before)); });
test("7 rejects arbitrary nextAttemptAt", () => { const before = base(); const actual = failureState(); const forged = validateSchedulerState({ ...actual, failures: { ...actual.failures, "999": { ...actual.failures["999"], nextAttemptAt: "2027-10-16T12:00:00.000Z" } } }); reject(before, store(["1", "2"], forged), failure(before)); });
test("8 rejects arbitrary lastAttemptAt", () => { const before = base(); const forged = failureState(emptySchedulerState(), "999", "TRANSIENT", "VERIFICATION_RETRY", LATER); reject(before, store(["1", "2"], forged), failure(before)); });
test("9 rejects modification of unrelated existing failure metadata", () => { const existing = failureState(emptySchedulerState(), "777", "UNRESOLVED", "DETERMINISTIC_VERIFICATION_FAILURE"); const before = store(["1", "2"], existing); const expected = failure(before); const proper = failureState(existing); const forged = validateSchedulerState({ ...proper, failures: { ...proper.failures, "777": { ...proper.failures["777"], code: "OTHER_FAILURE" } } }); reject(before, store(["1", "2"], forged), expected); });
test("10 rejects modification of unrelated scan issue metadata", () => { const issue = [{ id: "777", classification: "UNRESOLVED" as const, code: "RECORD_MALFORMED" }]; const before = store(["1", "2"], recordScanIssues(emptySchedulerState(), issue, NOW)); const expected = noCandidate(before, issue, LATER); const forgedIssue = [{ id: "777", classification: "TRANSIENT" as const, code: "RPC_RETRY" }]; reject(before, store(["1", "2"], recordScanIssues(before.scheduler, forgedIssue, LATER)), expected); });
test("11 rejects scheduler-only transition containing index mutation", () => { const before = base(); reject(before, store(["1", "2", "999"], failureState()), failure(before)); });
test("12 rejects scheduler-only transition adding a receipt", () => { const before = base(); const files = new Map(before.files); files.set(result("999").entry.receiptPath, JSON.stringify(result("999").document)); assert.throws(() => validateStoreSnapshot(before.index, files)); });
test("13 rejects trusted success for A when proposed result is B", () => { const before = base(); reject(before, store(["1", "2", "1000"], successState(emptySchedulerState(), "1000")), success(before, "999")); });
test("14 rejects success digest mismatch", () => { const before = base(); const expected = structuredClone(success(before)) as any; expected.outcome.entry.documentDigest = "0".repeat(64); reject(before, store(["1", "2", "999"], successState()), expected); });
test("15 rejects success path mismatch", () => { const before = base(); const expected = structuredClone(success(before)) as any; expected.outcome.entry.receiptPath = result("1").entry.receiptPath; reject(before, store(["1", "2", "999"], successState()), expected); });
test("16 rejects success that fails to clear candidate failure metadata", () => { const priorScheduler = failureState(emptySchedulerState(), "999"); const before = store(["1", "2"], priorScheduler); reject(before, store(["1", "2", "999"], validateSchedulerState({ ...priorScheduler, cursorAfterId: "999" })), success(before)); });
test("17 rejects malicious initial scheduler creation despite schema validity", () => { const before = base(); const malicious = failureState(emptySchedulerState(), "777", "UNRESOLVED", "DETERMINISTIC_VERIFICATION_FAILURE"); reject(before, store(["1", "2"], malicious), noCandidate(before)); });
test("18 rejects stale prior scheduler state", () => { const before = store(["1", "2"], failureState(emptySchedulerState(), "777")); reject(before, store(["1", "2"], failureState(before.scheduler)), failure(base())); });
test("19 rejects non-canonical missing-scheduler bootstrap assumptions", () => { const before = base(); const assumedPresent = store(["1", "2"], emptySchedulerState()); reject(before, store(["1", "2"], failureState()), failure(assumedPresent)); });
test("20 rejects more than one new terminal result", () => { const before = base(); reject(before, store(["1", "2", "999", "1000"], successState()), success(before)); });
test("21 rejects activation mutation", () => { const before = base(); reject(before, store(["1", "2"], emptySchedulerState(), false), noCandidate(before)); });
test("22 rejects modification or deletion of frozen #1/#2 bytes", () => { const before = base(); const canonicalAfter = store(["1", "2"], emptySchedulerState()); const files = new Map(canonicalAfter.files); files.set(result("1").entry.receiptPath, `${before.files.get(result("1").entry.receiptPath)} `); reject(before, validateStoreSnapshot(canonicalAfter.index, files), noCandidate(before)); const withoutTwo = store(["1"], emptySchedulerState()); reject(before, withoutTwo, noCandidate(before)); });

test("23 accepts missing-file scheduler-only canonical bootstrap", () => { const before = base(); const after = store(["1", "2"], failureState()); const transition = validatePublicationTransition(before, after, failure(before)); assert.deepEqual(transition.changedFiles, [SCHEDULER_PATH]); assert.equal(before.files.get("index.json"), after.files.get("index.json")); });
test("24 accepts missing-file result plus scheduler bootstrap", () => { const before = base(); const after = store(["1", "2", "999"], successState()); const transition = validatePublicationTransition(before, after, success(before)); assert.equal(transition.newId, "999"); assert.equal(before.files.get(result("1").entry.receiptPath), after.files.get(result("1").entry.receiptPath)); assert.equal(before.files.get(result("2").entry.receiptPath), after.files.get(result("2").entry.receiptPath)); });
test("25 accepts later scheduler-only retry transition", () => { const initial = failureState(emptySchedulerState(), "777", "UNRESOLVED", "DETERMINISTIC_VERIFICATION_FAILURE"); const before = store(["1", "2"], initial); const after = store(["1", "2"], failureState(initial)); assert.equal(validatePublicationTransition(before, after, failure(before)).newId, null); });
test("26 accepts later successful result transition", () => { const initial = failureState(); const before = store(["1", "2"], initial); const after = store(["1", "2", "999"], recordAttemptSuccess(recordScanIssues(initial, [], NOW), "999")); assert.equal(validatePublicationTransition(before, after, success(before)).newId, "999"); });

const ACCOUNT = "0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086";
const record = (id: string): RegistryCommitment => ({ id, creator: ACCOUNT, subject: ACCOUNT, token: STEST_ADDRESS, minimumBalanceBaseUnits: "1", startBlock: "1", endBlock: "10" });
const snapshot = (ids: readonly string[]): RegistrySnapshot => ({ chainId: 99801, head: 20n, upperBound: ids.reduce((max, id) => BigInt(id) > max ? BigInt(id) : max, 0n), commitments: ids.map(record) });
const choose = (ids: readonly string[], scheduler: SchedulerState, now = NOW) => selectFairCandidate({ snapshot: snapshot(ids), index: base().index, scheduler, now });

test("27 unresolved failure preserves fairness for later IDs", () => { const scheduler = failureState(emptySchedulerState(), "999", "UNRESOLVED", "DETERMINISTIC_VERIFICATION_FAILURE"); assert.equal(choose(["999", "1000"], scheduler)?.id, "1000"); });
test("28 transient failure retries only when due", () => { const scheduler = failureState(); assert.equal(choose(["999"], scheduler, NOW), undefined); assert.equal(choose(["999"], scheduler, LATER)?.id, "999"); });
test("29 isolated scan issue does not block later candidate selection", () => { const scheduler = recordScanIssues(emptySchedulerState(), [{ id: "999", classification: "UNRESOLVED", code: "RECORD_PROVIDER_DISAGREEMENT" }], NOW); assert.equal(choose(["1000"], scheduler)?.id, "1000"); });
test("30 arbitrary future result ID needs no hardcoding", () => assert.equal(choose(["1234"], emptySchedulerState())?.id, "1234"));
