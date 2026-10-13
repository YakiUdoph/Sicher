import assert from "node:assert/strict";
import { test } from "node:test";
import type { Address, Hex } from "viem";
import {
  COMPETITION_REGISTRY,
  RECEIPT_V2_SCHEMA,
  SHARED_INFRASTRUCTURE_LIMITATION,
  compareEvidenceChannels,
  createCompetitionReceiptV2,
  evaluateCandidate,
  normalizeAndDeduplicate,
  sha256Canonical,
  verifyReceiptV2,
  type CompetitionReceiptV2,
  type CompetitionReceiptV2Input,
  type TransferEvidence,
} from "../scripts/phase6-evidence-core.ts";

const SUBJECT = "0x1000000000000000000000000000000000000001" as Address;
const OTHER = "0x2000000000000000000000000000000000000002" as Address;
const TOKEN = "0x3000000000000000000000000000000000000003" as Address;
const HASH = `0x${"aa".repeat(32)}` as Hex;
const TOPIC = `0x${"11".repeat(32)}` as Hex;
const tx = (id: number) => `0x${id.toString(16).padStart(64, "0")}` as Hex;
function event(id: number, from: Address, to: Address, value: bigint, blockNumber = 11n): TransferEvidence {
  return { address: TOKEN, from, to, value, blockNumber, blockHash: HASH, transactionHash: tx(id), transactionIndex: 0, logIndex: id, topics: [TOPIC], data: "0x" };
}
function evaluate(events: TransferEvidence[], crossChannelConsensus = true, pinnedEndBalance?: bigint) {
  const finalBalance = events.reduce((balance, item) => balance - (item.from === SUBJECT ? item.value : 0n) + (item.to === SUBJECT ? item.value : 0n), 100n);
  return evaluateCandidate({
    registryBound: true, evidenceComplete: true, evidenceConsensus: true,
    receiptEvidenceComplete: true, receiptEvidenceConsensus: true, crossChannelConsensus,
    boundaryHashConsensus: true, startingBalanceConsensus: true, endBalanceConsensus: true,
    tokenModelStatus: "CONVENTIONAL_ERC20_TRANSFER_V1", finalityStatus: "FINALIZED",
    currentBlock: 21n, startBlock: 10n, endBlock: 20n, minimumBalance: 80n,
    subject: SUBJECT, startingBalance: 100n, pinnedEndBalance: pinnedEndBalance ?? finalBalance, events,
  });
}
function receipt(): CompetitionReceiptV2 {
  return createCompetitionReceiptV2({
    verifierVersion: "sicher-phase6-competition-verifier/2.0.0", verifierFingerprint: "a".repeat(64), reconstructionCoreFingerprint: "b".repeat(64),
    chainId: "99801", registryAddress: COMPETITION_REGISTRY, commitmentId: "1", creator: SUBJECT, subject: SUBJECT, token: TOKEN, proofType: "MIN_BALANCE",
    minimumRequiredBaseUnits: "80", tokenDecimals: 18, startBlock: "10", startBlockHash: HASH, endBlock: "20", endBlockHash: HASH,
    startingBalanceBlock: "9", startingBalanceBlockHash: HASH, startingBalanceBaseUnits: "100", minimumObservedBaseUnits: "92",
    minimumCausingBlock: "11", minimumCausingBlockHash: HASH, minimumCausingTransactionHash: tx(1), minimumCausingTransactionIndex: 0, minimumCausingLogIndex: 1,
    finalBalanceBaseUnits: "92", windowStatus: "COMPLETE", breachStatus: "NOT_OBSERVED", evidenceStatus: "COMPLETE", finalityStatus: "FINALIZED", finalVerdict: "PROVEN",
    reason: "Complete finalized evidence maintains the committed minimum.", providers: [{ id: "a", endpoint: "https://a.invalid" }, { id: "b", endpoint: "https://b.invalid" }],
    providerAgreement: { logQueryEvidence: true, receiptDerivedEvidence: true, crossChannelEvidence: true, startingBalance: true, endingBalance: true, criticalBlockHashes: true, finalizedHead: true },
    finalizedBlock: "20", finalizedBlockHash: HASH,
    orderedRelevantEvidence: [{ blockNumber: "11", blockHash: HASH, transactionHash: tx(1), transactionIndex: 0, logIndex: 1, emitter: TOKEN, from: SUBJECT, to: OTHER, valueBaseUnits: "8" }],
    evidenceManifestDigest: "c".repeat(64), limitations: [SHARED_INFRASTRUCTURE_LIMITATION],
  });
}
function resign(base: CompetitionReceiptV2, mutation: Record<string, unknown>): CompetitionReceiptV2 {
  const { receiptDigest: _old, ...unsigned } = { ...base, ...mutation };
  return { ...unsigned, receiptDigest: sha256Canonical(unsigned) } as CompetitionReceiptV2;
}

test("1 log query omits breach but receipt-derived evidence contains it", () => { const breach = event(1, SUBJECT, OTHER, 21n); assert.equal(compareEvidenceChannels([], [breach]).consensus, false); assert.equal(evaluate([], false).finalVerdict, "INDETERMINATE"); });
test("2 receipt evidence omits breach but log query contains it", () => { const breach = event(2, SUBJECT, OTHER, 21n); assert.equal(compareEvidenceChannels([breach], []).consensus, false); assert.equal(evaluate([breach], false).finalVerdict, "INDETERMINATE"); });
test("3 both evidence channels agree on breach", () => { const breach = event(3, SUBJECT, OTHER, 21n); assert.equal(compareEvidenceChannels([breach], [breach]).consensus, true); assert.equal(evaluate([breach]).finalVerdict, "NOT_PROVEN"); });
test("4 both evidence channels agree on no breach", () => { assert.equal(compareEvidenceChannels([], []).consensus, true); assert.equal(evaluate([]).finalVerdict, "PROVEN"); });
test("5 reconstructed final balance differs from pinned end balance", () => assert.equal(evaluate([event(5, SUBJECT, OTHER, 8n)], true, 93n).finalVerdict, "INDETERMINATE"));
test("6 reconstructed final balance equals pinned end balance", () => assert.equal(evaluate([event(6, SUBJECT, OTHER, 8n)], true, 92n).finalVerdict, "PROVEN"));
test("7 equal start/end balances do not hide a temporary breach from complete events", () => assert.equal(evaluate([event(7, SUBJECT, OTHER, 30n, 11n), event(8, OTHER, SUBJECT, 30n, 12n)], true, 100n).finalVerdict, "NOT_PROVEN"));
test("8 sparse balance checkpoints are not treated as completeness proof", () => {
  const result = evaluateCandidate({ registryBound: true, evidenceComplete: true, evidenceConsensus: true, receiptEvidenceComplete: false, receiptEvidenceConsensus: false, crossChannelConsensus: false, boundaryHashConsensus: true, startingBalanceConsensus: true, endBalanceConsensus: true, tokenModelStatus: "CONVENTIONAL_ERC20_TRANSFER_V1", finalityStatus: "FINALIZED", currentBlock: 21n, startBlock: 10n, endBlock: 20n, minimumBalance: 80n, subject: SUBJECT, startingBalance: 100n, pinnedEndBalance: 100n, events: [] });
  assert.equal(result.finalVerdict, "INDETERMINATE");
});
test("9 missing Receipt V2 mandatory field", () => { const { token: _token, ...missing } = receipt(); assert.match(verifyReceiptV2(missing).errors.join(" "), /Missing mandatory field: token/); });
test("10 schemaVersion override is rejected by constructor", () => { const { schemaVersion: _schema, canonicalSerialization: _canonical, receiptDigest: _digest, ...input } = receipt(); assert.throws(() => createCompetitionReceiptV2({ ...input, schemaVersion: "attacker" } as CompetitionReceiptV2Input), /schemaVersion must not be supplied/); });
test("11 unsupported schemaVersion is rejected", () => assert.match(verifyReceiptV2(resign(receipt(), { schemaVersion: "sicher.competition-receipt/99.0" })).errors.join(" "), /Unsupported schemaVersion/));
test("12 receipt digest mismatch", () => assert.match(verifyReceiptV2({ ...receipt(), finalBalanceBaseUnits: "91" }).errors.join(" "), /receiptDigest mismatch/));
test("13 evidence manifest digest malformed", () => assert.match(verifyReceiptV2(resign(receipt(), { evidenceManifestDigest: "0x12" })).errors.join(" "), /evidenceManifestDigest/));
test("14 verifier fingerprint malformed", () => assert.match(verifyReceiptV2(resign(receipt(), { verifierFingerprint: "0x12" })).errors.join(" "), /verifierFingerprint/));
test("15 ACTIVE plus PROVEN receipt", () => assert.match(verifyReceiptV2(resign(receipt(), { windowStatus: "ACTIVE" })).errors.join(" "), /ACTIVE window cannot|Terminal verdict requires/));
test("16 WAITING plus NOT_PROVEN receipt", () => assert.match(verifyReceiptV2(resign(receipt(), { finalityStatus: "WAITING", finalVerdict: "NOT_PROVEN", breachStatus: "OBSERVED", minimumObservedBaseUnits: "70" })).errors.join(" "), /WAITING finality cannot|Terminal verdict requires/));
test("17 INCOMPLETE plus PROVEN receipt", () => assert.match(verifyReceiptV2(resign(receipt(), { evidenceStatus: "INCOMPLETE" })).errors.join(" "), /Incomplete or disagreeing evidence cannot|Terminal verdict requires/));
test("18 breach OBSERVED plus PROVEN receipt", () => assert.match(verifyReceiptV2(resign(receipt(), { breachStatus: "OBSERVED", minimumObservedBaseUnits: "70" })).errors.join(" "), /Observed breach cannot be PROVEN/));
test("19 unsafe transactionIndex", () => { const item = event(19, SUBJECT, OTHER, 1n); item.transactionIndex = Number.MAX_SAFE_INTEGER + 1; assert.throws(() => normalizeAndDeduplicate([item]), /unsafe log ordering/); });
test("20 unsafe logIndex", () => { const item = event(20, SUBJECT, OTHER, 1n); item.logIndex = Number.MAX_SAFE_INTEGER + 1; assert.throws(() => normalizeAndDeduplicate([item]), /unsafe log ordering/); });
test("21 negative transactionIndex", () => { const item = event(21, SUBJECT, OTHER, 1n); item.transactionIndex = -1; assert.throws(() => normalizeAndDeduplicate([item]), /unsafe log ordering/); });
test("22 negative logIndex", () => { const item = event(22, SUBJECT, OTHER, 1n); item.logIndex = -1; assert.throws(() => normalizeAndDeduplicate([item]), /unsafe log ordering/); });
test("23 arbitrary registry substituted in competition mode", () => assert.match(verifyReceiptV2(resign(receipt(), { registryAddress: TOKEN })).errors.join(" "), /pinned verifier configuration/));
test("24 correct pinned registry accepted", () => assert.equal(verifyReceiptV2(receipt()).valid, true));
test("25 receipt recomputation from clean serialized data", () => { const clean = JSON.parse(JSON.stringify(receipt())); assert.equal(clean.schemaVersion, RECEIPT_V2_SCHEMA); assert.equal(verifyReceiptV2(clean).valid, true); });
