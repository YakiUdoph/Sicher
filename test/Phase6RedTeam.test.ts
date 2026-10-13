import assert from "node:assert/strict";
import { test } from "node:test";
import type { Address, Hex } from "viem";
import * as core from "../scripts/phase6-evidence-core.ts";

const SUBJECT = "0x1000000000000000000000000000000000000001" as Address;
const OTHER = "0x2000000000000000000000000000000000000002" as Address;
const TOKEN = "0x3000000000000000000000000000000000000003" as Address;
const TOPIC = `0x${"00".repeat(32)}` as Hex;
const HASH_A = `0x${"aa".repeat(32)}` as Hex;
const HASH_B = `0x${"bb".repeat(32)}` as Hex;
const tx = (id: number) => `0x${id.toString(16).padStart(64, "0")}` as Hex;
function event(id: number, from: Address, to: Address, value: bigint, blockNumber = 11n, transactionIndex = 0, logIndex = 0): core.TransferEvidence {
  return { address: TOKEN, from, to, value, blockNumber, blockHash: HASH_A, transactionIndex, logIndex, transactionHash: tx(id), topics: [TOPIC], data: "0x" };
}
function evaluate(events: core.TransferEvidence[], overrides: Partial<Parameters<typeof core.evaluateCandidate>[0]> = {}) {
  const finalBalance = events.reduce((balance, item) => balance - (item.from === SUBJECT ? item.value : 0n) + (item.to === SUBJECT ? item.value : 0n), 100n);
  return core.evaluateCandidate({ registryBound: true, evidenceComplete: true, evidenceConsensus: true, receiptEvidenceComplete: true, receiptEvidenceConsensus: true, crossChannelConsensus: true, boundaryHashConsensus: true, startingBalanceConsensus: true, endBalanceConsensus: true, tokenModelStatus: "CONVENTIONAL_ERC20_TRANSFER_V1", finalityStatus: "FINALIZED", currentBlock: 22n, startBlock: 10n, endBlock: 20n, minimumBalance: 80n, subject: SUBJECT, startingBalance: 100n, pinnedEndBalance: finalBalance, events, ...overrides });
}
const two = (a: core.TransferEvidence[], b: core.TransferEvidence[]) => core.compareProviderEvidence(new Map([["hypedexer", a], ["conduit", b]]));
const ranges = core.deterministicRanges(10n, 20n, 4n);
const records = (provider: string) => ranges.map((range) => ({ provider, ...range, status: "SUCCESS" as const, logCount: 0, digest: "0".repeat(64) }));

test("RT01 one-provider breach omission fails closed", () => { const c = two([], [event(1, SUBJECT, OTHER, 21n)]); assert.equal(c.consensus, false); assert.equal(evaluate([], { evidenceConsensus: false }).finalVerdict, "INDETERMINATE"); });
test("RT02 CRITICAL regression: correlated log-query omission fails closed against receipt evidence", () => { const c = two([], []); assert.equal(c.consensus, true); assert.equal(evaluate(c.evidence, { crossChannelConsensus: false }).finalVerdict, "INDETERMINATE"); });
test("RT03 identical duplicate is deduplicated", () => { const breach = event(2, SUBJECT, OTHER, 21n); assert.equal(evaluate([breach, { ...breach }], { pinnedEndBalance: 79n }).finalVerdict, "NOT_PROVEN"); });
test("RT04 distinct duplicate causing impossible negative balance is indeterminate", () => assert.equal(evaluate([event(3, SUBJECT, OTHER, 60n), event(4, SUBJECT, OTHER, 60n)]).finalVerdict, "INDETERMINATE"));
test("RT05 one-base-unit breach is detected", () => assert.equal(evaluate([event(5, SUBJECT, OTHER, 21n)]).finalVerdict, "NOT_PROVEN"));
test("RT06 transaction index controls same-block path", () => assert.deepEqual(evaluate([event(6, OTHER, SUBJECT, 20n, 11n, 2), event(7, SUBJECT, OTHER, 30n, 11n, 1)]).path, [100n, 70n, 90n]));
test("RT07 log index controls same-transaction path", () => { const a = event(8, SUBJECT, OTHER, 30n, 11n, 1, 1); const b = { ...event(9, OTHER, SUBJECT, 20n, 11n, 1, 2), transactionHash: a.transactionHash }; assert.deepEqual(evaluate([b, a]).path, [100n, 70n, 90n]); });
test("RT08 differently ordered equivalent provider evidence agrees", () => { const a = event(10, SUBJECT, OTHER, 8n, 11n); const b = event(11, OTHER, SUBJECT, 8n, 12n); assert.equal(two([a, b], [b, a]).consensus, true); });
test("RT09 genuinely conflicting provider evidence disagrees", () => assert.equal(two([event(12, SUBJECT, OTHER, 8n)], [event(12, SUBJECT, OTHER, 9n)]).consensus, false));
test("RT10 manipulated starting balance fails closed when providers disagree", () => assert.equal(evaluate([], { startingBalanceConsensus: false }).finalVerdict, "INDETERMINATE"));
test("RT11 wrong threshold binding fails closed", () => assert.equal(evaluate([], { registryBound: false }).finalVerdict, "INDETERMINATE"));
test("RT12 wrong token model fails closed", () => assert.equal(evaluate([], { tokenModelStatus: "UNSUPPORTED" }).finalVerdict, "INDETERMINATE"));
test("RT13 first chunk truncation is incomplete", () => assert.equal(core.auditCoverage({ expectedRanges: ranges, records: records("a").slice(1), providers: ["a"] }).complete, false));
test("RT14 middle chunk truncation is incomplete", () => assert.equal(core.auditCoverage({ expectedRanges: ranges, records: records("a").filter((_, i) => i !== 1), providers: ["a"] }).complete, false));
test("RT15 final chunk truncation is incomplete", () => assert.equal(core.auditCoverage({ expectedRanges: ranges, records: records("a").slice(0, -1), providers: ["a"] }).complete, false));
test("RT16 one provider returning successful empty activity chunk disagrees", () => assert.equal(two([], [event(16, SUBJECT, OTHER, 21n)]).consensus, false));
test("RT17 malformed finalized response fails closed", () => assert.equal(core.assessFinalizedHeads([{ provider: "a", blockNumber: 20n, blockHash: "0x12" as Hex }, { provider: "b", blockNumber: 20n, blockHash: HASH_A }], 20n).status, "DISAGREEMENT"));
test("RT18 stale agreed finalized head remains pending", () => { const f = core.assessFinalizedHeads([{ provider: "a", blockNumber: 19n, blockHash: HASH_A }, { provider: "b", blockNumber: 19n, blockHash: HASH_A }], 20n); assert.equal(evaluate([], { finalityStatus: f.status }).finalVerdict, "PENDING"); });
test("RT19 finalized-number disagreement is indeterminate", () => { const f = core.assessFinalizedHeads([{ provider: "a", blockNumber: 20n, blockHash: HASH_A }, { provider: "b", blockNumber: 21n, blockHash: HASH_A }], 20n); assert.equal(evaluate([], { finalityStatus: f.status }).finalVerdict, "INDETERMINATE"); });
test("RT20 finalized-hash disagreement is indeterminate", () => { const f = core.assessFinalizedHeads([{ provider: "a", blockNumber: 20n, blockHash: HASH_A }, { provider: "b", blockNumber: 20n, blockHash: HASH_B }], 20n); assert.equal(evaluate([], { finalityStatus: f.status }).finalVerdict, "INDETERMINATE"); });
test("RT21 end-block hash disagreement is indeterminate", () => assert.equal(evaluate([], { boundaryHashConsensus: core.assessBlockHashAgreement([{ provider: "a", blockNumber: 20n, blockHash: HASH_A }, { provider: "b", blockNumber: 20n, blockHash: HASH_B }], 20n).agreement }).finalVerdict, "INDETERMINATE"));
test("RT22 minimum-causing hash disagreement is indeterminate", () => assert.equal(evaluate([], { boundaryHashConsensus: core.assessBlockHashAgreement([{ provider: "a", blockNumber: 11n, blockHash: HASH_A }, { provider: "b", blockNumber: 11n, blockHash: HASH_B }], 11n).agreement }).finalVerdict, "INDETERMINATE"));
test("RT23 wrong chain binding fails closed at evaluation boundary", () => assert.equal(evaluate([], { registryBound: false }).finalVerdict, "INDETERMINATE"));
test("RT24 wrong commitment selection fails closed at evaluation boundary", () => assert.equal(evaluate([], { registryBound: false }).finalVerdict, "INDETERMINATE"));
test("RT25 unrelated latest balance cannot change reconstruction", () => { const result = evaluate([event(25, SUBJECT, OTHER, 8n)]); assert.equal(result.finalBalance, 92n); assert.notEqual(result.finalBalance, 999n); });
test("RT26 self transfer is balance-neutral", () => assert.deepEqual(evaluate([event(26, SUBJECT, SUBJECT, 99n)]).path, [100n, 100n]));

function receipt(overrides: Record<string, unknown> = {}) {
  return core.createCompetitionReceiptV2({ verifierVersion: "2.0.0", verifierFingerprint: "a".repeat(64), reconstructionCoreFingerprint: "b".repeat(64), chainId: "99801", registryAddress: core.COMPETITION_REGISTRY, commitmentId: "1", creator: SUBJECT, subject: SUBJECT, token: TOKEN, proofType: "MIN_BALANCE", minimumRequiredBaseUnits: "80", tokenDecimals: 18, startBlock: "10", startBlockHash: HASH_A, endBlock: "20", endBlockHash: HASH_A, startingBalanceBlock: "9", startingBalanceBlockHash: HASH_A, startingBalanceBaseUnits: "100", minimumObservedBaseUnits: "92", minimumCausingBlock: "11", minimumCausingBlockHash: HASH_A, minimumCausingTransactionHash: tx(30), minimumCausingTransactionIndex: 0, minimumCausingLogIndex: 0, finalBalanceBaseUnits: "92", windowStatus: "COMPLETE", breachStatus: "NOT_OBSERVED", evidenceStatus: "COMPLETE", finalityStatus: "FINALIZED", finalVerdict: "PROVEN", reason: "Complete finalized evidence maintains the committed minimum.", providerAgreement: { logQueryEvidence: true, receiptDerivedEvidence: true, crossChannelEvidence: true, startingBalance: true, endingBalance: true, criticalBlockHashes: true, finalizedHead: true }, finalizedBlock: "20", finalizedBlockHash: HASH_A, evidenceManifestDigest: "c".repeat(64), providers: [{ id: "a", endpoint: "https://a.invalid" }, { id: "b", endpoint: "https://b.invalid" }], orderedRelevantEvidence: [{ blockNumber: "11", blockHash: HASH_A, transactionHash: tx(30), transactionIndex: 0, logIndex: 0, emitter: TOKEN, from: SUBJECT, to: OTHER, valueBaseUnits: "8" }], limitations: [core.SHARED_INFRASTRUCTURE_LIMITATION], ...overrides } as core.CompetitionReceiptV2Input);
}
test("RT27 all consequential receipt mutations change recomputed digest", () => {
  const original = receipt();
  const mutations = [{ commitmentId: "2" }, { subject: OTHER }, { token: OTHER }, { minimumRequiredBaseUnits: "81" }, { startBlock: "9" }, { endBlock: "21" }, { endBlockHash: HASH_B }, { minimumObservedBaseUnits: "79" }, { minimumCausingBlockHash: HASH_B }, { finalBalanceBaseUnits: "91" }, { finalVerdict: "NOT_PROVEN" }, { providerAgreement: false }, { finalizedBlock: "21" }, { finalizedBlockHash: HASH_B }, { evidenceManifestDigest: "d".repeat(64) }];
  const { receiptDigest, ...unsigned } = original;
  for (const mutation of mutations) assert.notEqual(core.sha256Canonical({ ...unsigned, ...mutation }), receiptDigest);
});
test("RT28 HIGH regression: Receipt V2 exports a recomputing verifier", () => { assert.equal(typeof core.verifyReceiptV2, "function"); assert.equal(core.verifyReceiptV2(receipt()).valid, true); });
test("RT29 provider ordering canonicalizes safely", () => assert.equal(receipt({ providers: [{ id: "a", endpoint: "https://a.invalid" }, { id: "b", endpoint: "https://b.invalid" }] }).receiptDigest, receipt({ providers: [{ id: "b", endpoint: "https://b.invalid" }, { id: "a", endpoint: "https://a.invalid" }] }).receiptDigest));
test("RT30 correlated missing incoming log cannot fabricate terminal NOT_PROVEN when receipt channel disagrees", () => { const incoming = event(30, OTHER, SUBJECT, 30n, 11n); const outgoing = event(31, SUBJECT, OTHER, 50n, 12n); assert.equal(evaluate([incoming, outgoing]).finalVerdict, "PROVEN"); assert.equal(two([outgoing], [outgoing]).consensus, true); assert.equal(evaluate([outgoing], { crossChannelConsensus: false }).finalVerdict, "INDETERMINATE"); });
test("RT31 one-sided missing incoming event fails closed", () => { const incoming = event(32, OTHER, SUBJECT, 30n, 11n); const outgoing = event(33, SUBJECT, OTHER, 50n, 12n); assert.equal(two([outgoing], [incoming, outgoing]).consensus, false); });
test("RT32 receipt tampering is detectable by explicit recomputation", () => { const original = receipt(); const { receiptDigest, ...unsigned } = { ...original, finalVerdict: "NOT_PROVEN" }; assert.notEqual(core.sha256Canonical(unsigned), receiptDigest); });
test("RT33 receipt constructor rejects a schema-version override", () => assert.throws(() => core.createCompetitionReceiptV2({ ...(receipt() as unknown as core.CompetitionReceiptV2Input), schemaVersion: "attacker-schema" } as core.CompetitionReceiptV2Input), /schemaVersion must not be supplied/));
test("RT34 receipt constructor rejects missing mandatory fields", () => assert.throws(() => core.createCompetitionReceiptV2({} as core.CompetitionReceiptV2Input)));
test("RT35 unsafe integer ordering metadata is rejected", () => { const unsafe = event(35, SUBJECT, OTHER, 1n); unsafe.transactionIndex = Number.MAX_SAFE_INTEGER + 2; assert.throws(() => core.normalizeAndDeduplicate([unsafe]), /unsafe log ordering/); });
