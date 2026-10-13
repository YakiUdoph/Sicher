import assert from "node:assert/strict";
import { test } from "node:test";
import type { Address, Hex } from "viem";
import {
  auditCoverage,
  assessBlockHashAgreement,
  assessFinalizedHeads,
  compareProviderEvidence,
  createCompetitionReceiptV2,
  createTamperEvidentReceipt,
  deterministicRanges,
  evaluateCandidate,
  normalizeAndDeduplicate,
  reconstructPath,
  sha256Canonical,
  SHARED_INFRASTRUCTURE_LIMITATION,
  verifyTamperEvidentReceipt,
  type CoverageRecord,
  type TransferEvidence,
} from "../scripts/phase6-evidence-core.ts";

const SUBJECT = "0x1000000000000000000000000000000000000001" as Address;
const OTHER = "0x2000000000000000000000000000000000000002" as Address;
const TOKEN = "0x3000000000000000000000000000000000000003" as Address;
const UNIT = 10n ** 18n;
const topic = `0x${"00".repeat(32)}` as Hex;
const HASH_A = `0x${"aa".repeat(32)}` as Hex;
const HASH_B = `0x${"bb".repeat(32)}` as Hex;
const txHash = (id: number) => `0x${id.toString(16).padStart(64, "0")}` as Hex;
function event(id: number, from: Address, to: Address, value: bigint, blockNumber = 11n, transactionIndex = 0, logIndex = 0): TransferEvidence {
  return { address: TOKEN, from, to, value, blockNumber, blockHash: HASH_A, transactionIndex, logIndex, transactionHash: txHash(id), topics: [topic], data: "0x" };
}
const ranges = deterministicRanges(10n, 20n, 4n);
function successRecords(provider: string): CoverageRecord[] {
  return ranges.map((range) => ({ provider, ...range, status: "SUCCESS", logCount: 0, digest: "0".repeat(64) }));
}
function evaluation(overrides: Partial<Parameters<typeof evaluateCandidate>[0]> = {}) {
  const events = overrides.events ?? [];
  const startingBalance = overrides.startingBalance === undefined && "startingBalance" in overrides ? undefined : overrides.startingBalance ?? 100_000n * UNIT;
  const reconstructedFinal = startingBalance === undefined ? undefined : events.reduce((balance, item) => balance - (item.from === SUBJECT ? item.value : 0n) + (item.to === SUBJECT ? item.value : 0n), startingBalance);
  return evaluateCandidate({
    registryBound: true, evidenceComplete: true, evidenceConsensus: true,
    receiptEvidenceComplete: true, receiptEvidenceConsensus: true, crossChannelConsensus: true,
    boundaryHashConsensus: true, startingBalanceConsensus: true,
    endBalanceConsensus: true,
    tokenModelStatus: "CONVENTIONAL_ERC20_TRANSFER_V1", finalityStatus: "FINALIZED",
    currentBlock: 22n, startBlock: 10n, endBlock: 20n,
    minimumBalance: 80_000n * UNIT, subject: SUBJECT, startingBalance, events,
    pinnedEndBalance: "pinnedEndBalance" in overrides ? overrides.pinnedEndBalance : reconstructedFinal,
    ...overrides,
  });
}
function consensus(a: TransferEvidence[], b: TransferEvidence[] = a) {
  return compareProviderEvidence(new Map([["a", a], ["b", b]]));
}

test("1 exact threshold is not a breach", () => {
  const result = evaluation({ events: [event(1, SUBJECT, OTHER, 20_000n * UNIT)] });
  assert.equal(result.finalVerdict, "PROVEN"); assert.equal(result.minimumObserved, 80_000n * UNIT);
});
test("2 one base unit below threshold is a breach", () => assert.equal(evaluation({ events: [event(2, SUBJECT, OTHER, 20_000n * UNIT + 1n)] }).finalVerdict, "NOT_PROVEN"));
test("3 breach at start block is observed", () => assert.equal(evaluation({ events: [event(3, SUBJECT, OTHER, 21_000n * UNIT, 10n)] }).breachStatus, "OBSERVED"));
test("4 breach at end block is observed", () => assert.equal(evaluation({ events: [event(4, SUBJECT, OTHER, 21_000n * UNIT, 20n)] }).breachStatus, "OBSERVED"));
test("5 multiple transfers in one block order by transaction index", () => {
  const path = reconstructPath({ subject: SUBJECT, startingBalance: 100n, startBlock: 10n, endBlock: 20n, events: [event(5, OTHER, SUBJECT, 20n, 11n, 2), event(6, SUBJECT, OTHER, 30n, 11n, 1)] });
  assert.deepEqual(path.path, [100n, 70n, 90n]);
});
test("6 multiple transfers in one transaction order by log index", () => {
  const first = event(7, SUBJECT, OTHER, 30n, 11n, 1, 1); const second = { ...event(8, OTHER, SUBJECT, 20n, 11n, 1, 2), transactionHash: first.transactionHash };
  assert.deepEqual(reconstructPath({ subject: SUBJECT, startingBalance: 100n, startBlock: 10n, endBlock: 20n, events: [second, first] }).path, [100n, 70n, 90n]);
});
test("7 incoming transfer adds", () => assert.equal(reconstructPath({ subject: SUBJECT, startingBalance: 10n, startBlock: 10n, endBlock: 20n, events: [event(9, OTHER, SUBJECT, 5n)] }).finalBalance, 15n));
test("8 outgoing transfer subtracts", () => assert.equal(reconstructPath({ subject: SUBJECT, startingBalance: 10n, startBlock: 10n, endBlock: 20n, events: [event(10, SUBJECT, OTHER, 5n)] }).finalBalance, 5n));
test("9 self-transfer has zero net effect", () => assert.equal(reconstructPath({ subject: SUBJECT, startingBalance: 10n, startBlock: 10n, endBlock: 20n, events: [event(11, SUBJECT, SUBJECT, 9n)] }).finalBalance, 10n));
test("10 duplicate RPC log is deterministically deduplicated", () => { const item = event(12, SUBJECT, OTHER, 1n); assert.equal(normalizeAndDeduplicate([item, { ...item }]).length, 1); });
test("11 missing first chunk is incomplete", () => assert.equal(auditCoverage({ expectedRanges: ranges, records: successRecords("a").slice(1), providers: ["a"] }).complete, false));
test("12 missing middle chunk is incomplete", () => assert.equal(auditCoverage({ expectedRanges: ranges, records: successRecords("a").filter((_, i) => i !== 1), providers: ["a"] }).complete, false));
test("13 missing final chunk is incomplete", () => assert.equal(auditCoverage({ expectedRanges: ranges, records: successRecords("a").slice(0, -1), providers: ["a"] }).complete, false));
test("14 overlapping or unexpected chunk is rejected", () => {
  const records = [...successRecords("a"), { provider: "a", fromBlock: 12n, toBlock: 16n, status: "SUCCESS" as const, logCount: 0, digest: "0".repeat(64) }];
  assert.equal(auditCoverage({ expectedRanges: ranges, records, providers: ["a"] }).complete, false);
});
test("15 provider A missing one relevant log loses consensus", () => assert.equal(consensus([], [event(13, SUBJECT, OTHER, 1n)]).consensus, false));
test("16 provider B missing one relevant log loses consensus", () => assert.equal(consensus([event(14, SUBJECT, OTHER, 1n)], []).consensus, false));
test("17 provider disagreement is indeterminate", () => {
  const check = consensus([event(15, SUBJECT, OTHER, 1n)], [event(15, SUBJECT, OTHER, 2n)]);
  assert.equal(check.consensus, false); assert.equal(evaluation({ evidenceConsensus: check.consensus }).finalVerdict, "INDETERMINATE");
});
test("18 provider timeout failed chunk is indeterminate", () => {
  const records = successRecords("a"); records[1] = { ...records[1], status: "FAILED", logCount: null, digest: null, error: "timeout" };
  assert.equal(evaluation({ evidenceComplete: auditCoverage({ expectedRanges: ranges, records, providers: ["a"] }).complete }).finalVerdict, "INDETERMINATE");
});
test("19 provider rate limit failed chunk is indeterminate", () => {
  const records = successRecords("a"); records[0] = { ...records[0], status: "FAILED", logCount: null, digest: null, error: "HTTP 429" };
  assert.equal(evaluation({ evidenceComplete: auditCoverage({ expectedRanges: ranges, records, providers: ["a"] }).complete }).finalVerdict, "INDETERMINATE");
});
test("20 malformed relevant log is indeterminate", () => {
  const malformed = { ...event(16, SUBJECT, OTHER, 1n), transactionHash: "0x12" as Hex };
  assert.equal(compareProviderEvidence(new Map([["a", [malformed]], ["b", [malformed]]])).consensus, false);
});
test("21 unavailable historical starting balance is indeterminate", () => assert.equal(evaluation({ startingBalance: undefined }).finalVerdict, "INDETERMINATE"));
test("22 wrong chain binding is indeterminate", () => assert.equal(evaluation({ registryBound: false }).finalVerdict, "INDETERMINATE"));
test("23 wrong registry binding is indeterminate", () => assert.equal(evaluation({ registryBound: false }).finalVerdict, "INDETERMINATE"));
test("24 wrong commitment ID binding is indeterminate", () => assert.equal(evaluation({ registryBound: false }).finalVerdict, "INDETERMINATE"));
test("25 cached threshold disagreement cannot override registry", () => assert.equal(evaluation({ registryBound: false }).finalVerdict, "INDETERMINATE"));
test("26 cached subject disagreement cannot override registry", () => assert.equal(evaluation({ registryBound: false }).finalVerdict, "INDETERMINATE"));
test("27 active window has PENDING final verdict", () => {
  const result = evaluation({ currentBlock: 19n, events: [event(17, SUBJECT, OTHER, 90_000n * UNIT)] });
  assert.equal(result.windowStatus, "ACTIVE"); assert.equal(result.breachStatus, "OBSERVED"); assert.equal(result.finalVerdict, "PENDING");
});
test("28 complete no-breach window is PROVEN only after verified finality", () => assert.equal(evaluation().finalVerdict, "PROVEN"));
test("29 breach followed by restoration remains NOT_PROVEN", () => {
  const result = evaluation({ events: [event(18, SUBJECT, OTHER, 85_000n * UNIT, 11n), event(19, OTHER, SUBJECT, 85_000n * UNIT, 12n)] });
  assert.equal(result.finalBalance, 100_000n * UNIT); assert.equal(result.finalVerdict, "NOT_PROVEN");
});
test("30 BigInt large values remain exact", () => {
  const huge = (2n ** 255n) - 1n; const result = reconstructPath({ subject: SUBJECT, startingBalance: huge, startBlock: 10n, endBlock: 20n, events: [event(20, SUBJECT, OTHER, huge - 7n)] });
  assert.equal(result.finalBalance, 7n);
});
test("31 unsupported token model is indeterminate", () => assert.equal(evaluation({ tokenModelStatus: "UNSUPPORTED" }).finalVerdict, "INDETERMINATE"));
test("32 receipt serialization and digest are deterministic", () => {
  const first = createTamperEvidentReceipt({ verifierFingerprint: "a", evidenceManifestDigest: "b", payload: { z: 1, a: 2 } });
  const second = createTamperEvidentReceipt({ verifierFingerprint: "a", evidenceManifestDigest: "b", payload: { a: 2, z: 1 } });
  assert.equal(first.receiptDigest, second.receiptDigest); assert.equal(verifyTamperEvidentReceipt(first), true);
});
test("33 evidence manifest tampering changes its digest", () => {
  const original = { ranges: [{ from: "1", to: "2", count: 1 }] }; const altered = { ranges: [{ from: "1", to: "2", count: 0 }] };
  assert.notEqual(sha256Canonical(original), sha256Canonical(altered));
});
test("34 receipt tampering is detected", () => {
  const receipt = createTamperEvidentReceipt({ verifierFingerprint: "a", evidenceManifestDigest: "b", payload: { verdict: "PROVEN" } });
  const altered = { ...receipt, payload: { verdict: "NOT_PROVEN" } };
  assert.equal(verifyTamperEvidentReceipt(altered), false);
});

function heads(number = 20n, hash: Hex = HASH_A) {
  return [{ provider: "hypedexer", blockNumber: number, blockHash: hash }, { provider: "conduit", blockNumber: number, blockHash: hash }];
}
function receipt(overrides: Record<string, unknown> = {}) {
  return createCompetitionReceiptV2({
    verifierVersion: "2.0.0", verifierFingerprint: "a".repeat(64), reconstructionCoreFingerprint: "b".repeat(64),
    chainId: "99801", registryAddress: TOKEN, commitmentId: "1", creator: SUBJECT, subject: SUBJECT, token: TOKEN,
    proofType: "MIN_BALANCE", minimumRequiredBaseUnits: "80", tokenDecimals: 18, startBlock: "10", startBlockHash: HASH_A,
    endBlock: "20", endBlockHash: HASH_A, startingBalanceBlock: "9", startingBalanceBlockHash: HASH_A, startingBalanceBaseUnits: "100", minimumObservedBaseUnits: "92",
    minimumCausingBlock: "15", minimumCausingBlockHash: HASH_A, minimumCausingTransactionHash: txHash(90),
    minimumCausingTransactionIndex: 0, minimumCausingLogIndex: 0, finalBalanceBaseUnits: "92", windowStatus: "COMPLETE",
    breachStatus: "NOT_OBSERVED", evidenceStatus: "COMPLETE", finalityStatus: "FINALIZED", finalVerdict: "PROVEN",
    reason: "Complete finalized evidence maintains the committed minimum.",
    providers: [{ id: "hypedexer", endpoint: "https://hypedexer.invalid" }, { id: "conduit", endpoint: "https://conduit.invalid" }],
    providerAgreement: { logQueryEvidence: true, receiptDerivedEvidence: true, crossChannelEvidence: true, startingBalance: true, endingBalance: true, criticalBlockHashes: true, finalizedHead: true },
    finalizedBlock: "20", finalizedBlockHash: HASH_A,
    orderedRelevantEvidence: [{ blockNumber: "15", blockHash: HASH_A, transactionHash: txHash(90), transactionIndex: 0, logIndex: 0, emitter: TOKEN, from: SUBJECT, to: OTHER, valueBaseUnits: "8" }],
    evidenceManifestDigest: "c".repeat(64), limitations: [SHARED_INFRASTRUCTURE_LIMITATION], ...overrides,
  });
}

test("35 endBlock above finalized head is PENDING", () => {
  const finality = assessFinalizedHeads(heads(19n), 20n);
  assert.equal(finality.status, "WAITING");
  assert.equal(evaluation({ finalityStatus: finality.status }).finalVerdict, "PENDING");
});
test("36 endBlock exactly at finalized head is eligible", () => {
  const finality = assessFinalizedHeads(heads(20n), 20n);
  assert.equal(finality.status, "FINALIZED"); assert.equal(evaluation({ finalityStatus: finality.status }).finalVerdict, "PROVEN");
});
test("37 finalized block number disagreement is indeterminate", () => {
  const finality = assessFinalizedHeads([heads(20n)[0], heads(21n)[1]], 20n);
  assert.equal(finality.status, "DISAGREEMENT"); assert.equal(evaluation({ finalityStatus: finality.status }).finalVerdict, "INDETERMINATE");
});
test("38 finalized block hash disagreement is indeterminate", () => {
  const finality = assessFinalizedHeads([heads(20n, HASH_A)[0], heads(20n, HASH_B)[1]], 20n);
  assert.equal(finality.status, "DISAGREEMENT"); assert.equal(evaluation({ finalityStatus: finality.status }).finalVerdict, "INDETERMINATE");
});
test("39 same end block number with different hashes is indeterminate", () => {
  const agreement = assessBlockHashAgreement([{ provider: "a", blockNumber: 20n, blockHash: HASH_A }, { provider: "b", blockNumber: 20n, blockHash: HASH_B }], 20n);
  assert.equal(agreement.agreement, false); assert.equal(evaluation({ boundaryHashConsensus: agreement.agreement }).finalVerdict, "INDETERMINATE");
});
test("40 same minimum-causing block number with different hashes is indeterminate", () => {
  const agreement = assessBlockHashAgreement([{ provider: "a", blockNumber: 15n, blockHash: HASH_A }, { provider: "b", blockNumber: 15n, blockHash: HASH_B }], 15n);
  assert.equal(agreement.agreement, false); assert.equal(evaluation({ boundaryHashConsensus: agreement.agreement }).finalVerdict, "INDETERMINATE");
});
test("41 historical starting balance disagreement is indeterminate", () => assert.equal(evaluation({ startingBalanceConsensus: false }).finalVerdict, "INDETERMINATE"));
test("42 accidental latest balance cannot affect block-pinned reconstruction", () => {
  const pinned = evaluation({ startingBalance: 100n, minimumBalance: 0n, events: [event(42, SUBJECT, OTHER, 8n)] });
  const unrelatedLatestBalance = 999_999n;
  assert.deepEqual(pinned.path, [100n, 92n]); assert.notEqual(pinned.finalBalance, unrelatedLatestBalance);
});
test("43 finalized head temporarily unavailable is indeterminate", () => {
  const finality = assessFinalizedHeads([{ provider: "a", error: "timeout" }, heads()[1]], 20n);
  assert.equal(finality.status, "DISAGREEMENT"); assert.equal(evaluation({ finalityStatus: finality.status }).finalVerdict, "INDETERMINATE");
});
test("44 malformed finalized block is indeterminate", () => {
  const finality = assessFinalizedHeads([{ provider: "a", blockNumber: 20n, blockHash: "0x12" as Hex }, heads()[1]], 20n);
  assert.equal(finality.status, "DISAGREEMENT"); assert.equal(evaluation({ finalityStatus: finality.status }).finalVerdict, "INDETERMINATE");
});
test("45 receipt digest changes if final verdict changes", () => {
  const original = receipt(); const { receiptDigest, ...unsigned } = original;
  assert.notEqual(receiptDigest, sha256Canonical({ ...unsigned, finalVerdict: "NOT_PROVEN" }));
});
test("46 receipt digest changes if evidence transaction changes", () => assert.notEqual(receipt().receiptDigest, receipt({ orderedRelevantEvidence: [{ blockNumber: "15", blockHash: HASH_A, transactionHash: txHash(91), transactionIndex: 0, logIndex: 0, emitter: TOKEN, from: SUBJECT, to: OTHER, valueBaseUnits: "8" }] }).receiptDigest));
test("47 receipt digest changes if minimum changes", () => assert.notEqual(receipt().receiptDigest, receipt({ minimumObservedBaseUnits: "91" }).receiptDigest));
test("48 competition receipt canonical serialization is stable", () => assert.equal(receipt().receiptDigest, receipt().receiptDigest));
test("49 provider ordering does not alter canonical receipt", () => {
  const forward = receipt({ providers: [{ id: "hypedexer", endpoint: "https://hypedexer.invalid" }, { id: "conduit", endpoint: "https://conduit.invalid" }] });
  const reverse = receipt({ providers: [{ id: "conduit", endpoint: "https://conduit.invalid" }, { id: "hypedexer", endpoint: "https://hypedexer.invalid" }] });
  assert.equal(forward.receiptDigest, reverse.receiptDigest);
});
test("50 shared-infrastructure limitation remains represented", () => {
  assert.match(SHARED_INFRASTRUCTURE_LIMITATION, /share Elysium sequencer/);
  assert.deepEqual(receipt().limitations, [SHARED_INFRASTRUCTURE_LIMITATION]);
});
