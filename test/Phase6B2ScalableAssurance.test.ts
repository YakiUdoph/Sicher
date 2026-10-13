import assert from "node:assert/strict";
import { test } from "node:test";
import type { Address, Hex } from "viem";
import { COMPETITION_REGISTRY, sha256Canonical, type TransferEvidence } from "../scripts/phase6-evidence-core.ts";
import { createEvidenceCacheEntry, verifyEvidenceCacheEntry } from "../scripts/phase6-evidence-cache.ts";
import {
  CORROBORATED_LIMITATION,
  appendExhaustiveProgress,
  assessDiscoveredReceiptChecks,
  comparePhase5AndPhase6,
  createExhaustiveProgress,
  createReceiptV3,
  evaluateAssuranceCandidate,
  runExhaustiveProgress,
  verifyExhaustiveProgress,
  verifyReceiptV3,
  type ReceiptV3,
  type ReceiptV3Input,
} from "../scripts/phase6-assurance-core.ts";

const SUBJECT = "0x1000000000000000000000000000000000000001" as Address;
const OTHER = "0x2000000000000000000000000000000000000002" as Address;
const TOKEN = "0x3000000000000000000000000000000000000003" as Address;
const HASH = `0x${"aa".repeat(32)}` as Hex;
const TOPIC = `0x${"11".repeat(32)}` as Hex;
const tx = (id: number) => `0x${id.toString(16).padStart(64, "0")}` as Hex;
function event(id: number, from: Address, to: Address, value: bigint, blockNumber = 11n): TransferEvidence {
  return { address: TOKEN, from, to, value, blockNumber, blockHash: HASH, transactionHash: tx(id), transactionIndex: 0, logIndex: id, topics: [TOPIC], data: "0x" };
}
function evaluate(events: TransferEvidence[], overrides: Partial<Parameters<typeof evaluateAssuranceCandidate>[0]> = {}) {
  const finalBalance = events.reduce((balance, item) => balance - (item.from === SUBJECT ? item.value : 0n) + (item.to === SUBJECT ? item.value : 0n), 100n);
  return evaluateAssuranceCandidate({ requestedAssuranceLevel: "CORROBORATED", registryBound: true, logRangeCoverageComplete: true, logProviderAgreement: true, discoveredEventReceiptChecksComplete: true, exhaustiveReceiptVerificationCompleted: false, exhaustiveReceiptAgreement: false, boundaryHashConsensus: true, startingBalanceConsensus: true, endingBalanceConsensus: true, tokenModelStatus: "CONVENTIONAL_ERC20_TRANSFER_V1", finalityStatus: "FINALIZED", currentBlock: 21n, startBlock: 10n, endBlock: 20n, minimumBalance: 80n, subject: SUBJECT, startingBalance: 100n, pinnedEndBalance: finalBalance, events, ...overrides });
}
function receipt(overrides: Partial<ReceiptV3Input> = {}): ReceiptV3 {
  return createReceiptV3({
    proofResult: "PROVEN", assuranceLevel: "CORROBORATED", verifierVersion: "3.0.0", verifierFingerprint: "a".repeat(64), coreFingerprint: "b".repeat(64),
    chainId: "99801", registryAddress: COMPETITION_REGISTRY, commitmentId: "1", creator: SUBJECT, subject: SUBJECT, token: TOKEN, proofType: "MIN_BALANCE",
    minimumRequiredBaseUnits: "80", tokenDecimals: 18, startBlock: "10", startBlockHash: HASH, endBlock: "20", endBlockHash: HASH,
    startingBalanceBaseUnits: "100", minimumObservedBaseUnits: "92", finalBalanceBaseUnits: "92",
    minimumCausingEvidence: { blockNumber: "11", blockHash: HASH, transactionHash: tx(1), transactionIndex: 0, logIndex: 1 },
    windowStatus: "COMPLETE", breachStatus: "NOT_OBSERVED", evidenceStatus: "COMPLETE", finalityStatus: "FINALIZED",
    providers: [{ id: "hypedexer", endpoint: "https://hypedexer.invalid" }, { id: "conduit", endpoint: "https://conduit.invalid" }],
    providerAgreement: { logEvidence: true, discoveredReceiptChecks: true, exhaustiveReceiptEvidence: null, startingBalance: true, endingBalance: true, criticalBlockHashes: true, finalizedHead: true },
    logRangeCoverage: { complete: true, chunks: 2, successfulChunks: 2, fromBlock: "10", toBlock: "20", retries: 0 },
    discoveredEventReceiptChecks: { complete: true, eventsChecked: 1, checksPerformed: 2, digest: "c".repeat(64) },
    exhaustiveReceiptVerification: { requested: false, completed: false, blocksVerified: "0", totalBlocks: "11", progressDigest: null },
    finalizedBlock: "20", finalizedBlockHash: HASH, evidenceManifestDigest: "d".repeat(64), limitations: [CORROBORATED_LIMITATION], ...overrides,
  });
}
function resign(base: ReceiptV3, mutation: Record<string, unknown>): ReceiptV3 { const { receiptDigest: _old, ...unsigned } = { ...base, ...mutation }; return { ...unsigned, receiptDigest: sha256Canonical(unsigned) } as ReceiptV3; }

test("1 CORROBORATED valid PROVEN", () => { const result = evaluate([event(1, SUBJECT, OTHER, 8n)]); assert.equal(result.proofResult, "PROVEN"); assert.equal(result.assuranceLevel, "CORROBORATED"); });
test("2 CORROBORATED valid NOT_PROVEN", () => { const result = evaluate([event(2, SUBJECT, OTHER, 21n)]); assert.equal(result.proofResult, "NOT_PROVEN"); assert.equal(result.assuranceLevel, "CORROBORATED"); });
test("3 provider disagreement becomes INDETERMINATE", () => assert.equal(evaluate([], { logProviderAgreement: false }).proofResult, "INDETERMINATE"));
test("4 incomplete range becomes INDETERMINATE", () => assert.equal(evaluate([], { logRangeCoverageComplete: false }).proofResult, "INDETERMINATE"));
test("5 end balance mismatch becomes INDETERMINATE", () => assert.equal(evaluate([event(5, SUBJECT, OTHER, 8n)], { pinnedEndBalance: 93n }).proofResult, "INDETERMINATE"));
test("6 non-finalized end remains PENDING", () => assert.equal(evaluate([], { finalityStatus: "WAITING" }).proofResult, "PENDING"));
test("7 discovered log absent from transaction receipt", () => { const log = event(7, SUBJECT, OTHER, 8n); assert.equal(assessDiscoveredReceiptChecks([log], [{ provider: "a", queried: log, receipt: log }, { provider: "b", queried: log, receipt: null }], ["a", "b"]).complete, false); });
test("8 receipt metadata differs from log query", () => { const log = event(8, SUBJECT, OTHER, 8n); const altered = { ...log, blockHash: `0x${"bb".repeat(32)}` as Hex }; assert.equal(assessDiscoveredReceiptChecks([log], [{ provider: "a", queried: log, receipt: log }, { provider: "b", queried: log, receipt: altered }], ["a", "b"]).complete, false); });
test("9 CORROBORATED receipt explicitly contains limitation", () => assert.equal(receipt().limitations.includes(CORROBORATED_LIMITATION), true));
test("10 assuranceLevel cannot be omitted", () => { const { assuranceLevel: _omitted, ...value } = receipt(); assert.match(verifyReceiptV3(value).errors.join(" "), /Missing mandatory field: assuranceLevel/); });
test("11 assuranceLevel cannot be forged as EXHAUSTIVE", () => assert.match(verifyReceiptV3(resign(receipt(), { assuranceLevel: "EXHAUSTIVE" })).errors.join(" "), /EXHAUSTIVE assurance requires/));
test("12 EXHAUSTIVE requested but incomplete cannot claim EXHAUSTIVE", () => { const result = evaluate([], { requestedAssuranceLevel: "EXHAUSTIVE", exhaustiveReceiptVerificationCompleted: false }); assert.equal(result.proofResult, "INDETERMINATE"); assert.equal(result.assuranceLevel, null); });
test("13 exhaustive progress resume validates prior digests", () => { const initial = createExhaustiveProgress({ chainId: "99801", token: TOKEN, startBlock: "10", endBlock: "20" }); const progress = appendExhaustiveProgress(initial, { fromBlock: "10", toBlock: "14", evidenceDigest: "a".repeat(64) }); assert.equal(verifyExhaustiveProgress(progress).valid, true); assert.equal(progress.nextBlock, "15"); });
test("14 corrupted exhaustive progress rejected", () => { const initial = createExhaustiveProgress({ chainId: "99801", token: TOKEN, startBlock: "10", endBlock: "20" }); const progress = appendExhaustiveProgress(initial, { fromBlock: "10", toBlock: "14", evidenceDigest: "a".repeat(64) }); assert.equal(verifyExhaustiveProgress({ ...progress, nextBlock: "16" }).valid, false); });
test("15 V3 digest changes with assurance level", () => { const original = receipt(); const { receiptDigest, ...unsigned } = original; assert.notEqual(receiptDigest, sha256Canonical({ ...unsigned, assuranceLevel: "EXHAUSTIVE" })); });
test("16 V3 digest changes with limitation", () => { const original = receipt(); const { receiptDigest, ...unsigned } = original; assert.notEqual(receiptDigest, sha256Canonical({ ...unsigned, limitations: [...original.limitations, "different"] })); });
test("17 V3 strict schema validation", () => assert.match(verifyReceiptV3(resign(receipt(), { unexpected: true })).errors.join(" "), /Unknown receipt field/));
test("18 Phase 5 and Phase 6 mismatch blocks acceptance", () => { const common = { commitmentId: "2", subject: SUBJECT, token: TOKEN, minimumRequiredBaseUnits: "80", startBlock: "10", endBlock: "20", startingBalanceBaseUnits: "100", pathBaseUnits: ["100", "70", "100"], minimumObservedBaseUnits: "70", minimumCausingBlock: "11", minimumCausingTransactionHash: tx(18), finalBalanceBaseUnits: "100", proofResult: "NOT_PROVEN" }; assert.deepEqual(comparePhase5AndPhase6(common, { ...common, finalBalanceBaseUnits: "99" }), { agreement: false, mismatches: ["finalBalanceBaseUnits"] }); });
test("19 sparse checkpoint cannot upgrade assurance", () => assert.equal(evaluate([], { discoveredEventReceiptChecksComplete: false, startingBalance: 100n, pinnedEndBalance: 100n }).proofResult, "INDETERMINATE"));
test("20 start/end equality cannot upgrade assurance", () => assert.equal(evaluate([], { logRangeCoverageComplete: false, startingBalance: 100n, pinnedEndBalance: 100n }).proofResult, "INDETERMINATE"));
test("21 exhaustive runner uses bounded concurrency and persists digest checkpoints", async () => {
  let active = 0; let maximum = 0; const saved: string[] = [];
  const progress = await runExhaustiveProgress({ progress: createExhaustiveProgress({ chainId: "99801", token: TOKEN, startBlock: "10", endBlock: "15" }), concurrency: 2, checkpointBlocks: 3, scanBlock: async (block) => { active += 1; maximum = Math.max(maximum, active); await Promise.resolve(); active -= 1; return { block: block.toString() }; }, persist: (value) => { saved.push(value.progressDigest); } });
  assert.equal(maximum <= 2, true); assert.equal(saved.length, 2); assert.equal(progress.nextBlock, "16"); assert.equal(verifyExhaustiveProgress(progress).valid, true);
});
test("22 exhaustive runner resumes without rescanning verified blocks", async () => {
  const initial = appendExhaustiveProgress(createExhaustiveProgress({ chainId: "99801", token: TOKEN, startBlock: "10", endBlock: "12" }), { fromBlock: "10", toBlock: "11", evidenceDigest: "e".repeat(64) });
  const scanned: string[] = []; await runExhaustiveProgress({ progress: initial, concurrency: 2, checkpointBlocks: 2, scanBlock: async (block) => { scanned.push(block.toString()); return block.toString(); }, persist: () => undefined });
  assert.deepEqual(scanned, ["12"]);
});
test("23 finalized-context evidence cache entry is usable", () => {
  const context = { chainId: "99801", token: TOKEN, fromBlock: "10", fromBlockHash: HASH, toBlock: "20", toBlockHash: HASH, finalizedBlock: "25", finalizedBlockHash: HASH, provider: "hypedexer" };
  const entry = createEvidenceCacheEntry(context, [event(23, SUBJECT, OTHER, 1n)]); assert.equal(verifyEvidenceCacheEntry(entry, context).usable, true);
});
test("24 stale or differently pinned cache entry is never authoritative", () => {
  const context = { chainId: "99801", token: TOKEN, fromBlock: "10", fromBlockHash: HASH, toBlock: "20", toBlockHash: HASH, finalizedBlock: "25", finalizedBlockHash: HASH, provider: "hypedexer" };
  const entry = createEvidenceCacheEntry(context, []); const changed = { ...context, finalizedBlockHash: `0x${"bb".repeat(32)}` as Hex }; assert.equal(verifyEvidenceCacheEntry(entry, changed).usable, false);
});
