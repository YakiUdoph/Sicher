import { createHash } from "node:crypto";
import { getAddress, isAddress, type Address, type Hex } from "viem";

export type BlockRange = { fromBlock: bigint; toBlock: bigint };
export type ChunkStatus = "SUCCESS" | "FAILED";
export type WindowStatus = "ACTIVE" | "COMPLETE";
export type BreachStatus = "NOT_OBSERVED" | "OBSERVED";
export type EvidenceStatus = "COMPLETE" | "INCOMPLETE" | "DISAGREEMENT";
export type FinalityStatus = "WAITING" | "FINALIZED" | "DISAGREEMENT";
export type FinalVerdict = "PROVEN" | "NOT_PROVEN" | "INDETERMINATE" | "PENDING";
export type TokenModelStatus = "CONVENTIONAL_ERC20_TRANSFER_V1" | "UNVERIFIED" | "UNSUPPORTED";

export type RawTransferLog = { address: Address; blockNumber: bigint; blockHash: Hex; transactionHash: Hex; transactionIndex: number; logIndex: number; topics: Hex[]; data: Hex };
export type TransferEvidence = RawTransferLog & { from: Address; to: Address; value: bigint };
export type CoverageRecord = { provider: string; fromBlock: bigint; toBlock: bigint; status: ChunkStatus; logCount: number | null; digest: string | null; error?: string };
export type CoverageResult = { complete: boolean; reason: string; missing: Array<{ provider: string; fromBlock: bigint; toBlock: bigint }>; unexpectedOrOverlapping: CoverageRecord[] };
export type ConsensusResult = { consensus: boolean; redundancy: "NONE" | "SINGLE_PROVIDER" | "MULTI_PROVIDER"; reason: string; evidence: TransferEvidence[] };
export type FinalizedHeadObservation = { provider: string; blockNumber?: bigint; blockHash?: Hex; error?: string };
export type FinalityAssessment = { status: FinalityStatus; agreedBlock?: bigint; agreedHash?: Hex; reason: string };
export type HashObservation = { provider: string; blockNumber: bigint; blockHash?: Hex; error?: string };
export type HashAgreement = { agreement: boolean; blockNumber: bigint; blockHash?: Hex; reason: string };
export type MinimumPoint = { balance: bigint; blockNumber: bigint; transactionHash?: Hex; transactionIndex?: number; logIndex?: number };
export type CandidateEvaluation = {
  evidenceComplete: boolean; evidenceConsensus: boolean; registryBound: boolean; tokenModelStatus: TokenModelStatus;
  windowStatus: WindowStatus; breachStatus: BreachStatus; evidenceStatus: EvidenceStatus; finalityStatus: FinalityStatus;
  finalVerdict: FinalVerdict; reason: string; path: bigint[]; minimumObserved?: bigint; minimumPoint?: MinimumPoint; finalBalance?: bigint;
};

const hex64 = /^0x[0-9a-fA-F]{64}$/;
const hexData = /^0x(?:[0-9a-fA-F]{2})*$/;

export function deterministicRanges(startBlock: bigint, endBlock: bigint, chunkSize: bigint): BlockRange[] {
  if (startBlock < 0n || endBlock < startBlock) throw new Error("Invalid inclusive block interval.");
  if (chunkSize <= 0n) throw new Error("chunkSize must be positive.");
  const ranges: BlockRange[] = [];
  for (let fromBlock = startBlock; fromBlock <= endBlock; fromBlock += chunkSize) {
    const candidate = fromBlock + chunkSize - 1n;
    ranges.push({ fromBlock, toBlock: candidate < endBlock ? candidate : endBlock });
  }
  return ranges;
}

function rangeKey(fromBlock: bigint, toBlock: bigint): string { return `${fromBlock}:${toBlock}`; }

export function auditCoverage(input: { expectedRanges: BlockRange[]; records: CoverageRecord[]; providers: string[] }): CoverageResult {
  if (!input.providers.length) return { complete: false, reason: "No evidence provider configured.", missing: [], unexpectedOrOverlapping: [] };
  const expected = new Map(input.expectedRanges.map((range) => [rangeKey(range.fromBlock, range.toBlock), range]));
  const missing: CoverageResult["missing"] = [];
  const unexpectedOrOverlapping: CoverageRecord[] = [];
  for (const provider of input.providers) {
    const records = input.records.filter((record) => record.provider === provider);
    for (const record of records) if (!expected.has(rangeKey(record.fromBlock, record.toBlock))) unexpectedOrOverlapping.push(record);
    for (const [key, range] of expected) {
      const matching = records.filter((record) => rangeKey(record.fromBlock, record.toBlock) === key);
      if (matching.length !== 1 || matching[0].status !== "SUCCESS") missing.push({ provider, ...range });
      if (matching.length > 1) unexpectedOrOverlapping.push(...matching);
    }
  }
  if (unexpectedOrOverlapping.length) return { complete: false, reason: "Unexpected, duplicate, or overlapping chunk ranges exist.", missing, unexpectedOrOverlapping };
  if (missing.length) return { complete: false, reason: "At least one required inclusive chunk is missing or failed.", missing, unexpectedOrOverlapping };
  return { complete: true, reason: "Every provider covers every deterministic inclusive chunk exactly once.", missing, unexpectedOrOverlapping };
}

function assertRawLog(log: RawTransferLog): void {
  if (!isAddress(log.address)) throw new Error("Malformed log emitter address.");
  if (log.blockNumber < 0n || !Number.isSafeInteger(log.transactionIndex) || log.transactionIndex < 0 || !Number.isSafeInteger(log.logIndex) || log.logIndex < 0) throw new Error("Malformed or unsafe log ordering fields.");
  if (!hex64.test(log.blockHash)) throw new Error("Malformed block hash.");
  if (!hex64.test(log.transactionHash)) throw new Error("Malformed transaction hash.");
  if (!Array.isArray(log.topics) || log.topics.some((topic) => !hex64.test(topic))) throw new Error("Malformed log topics.");
  if (!hexData.test(log.data)) throw new Error("Malformed log data.");
}

function rawIdentity(log: RawTransferLog): string { return `${log.transactionHash.toLowerCase()}:${log.logIndex}`; }

export function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (typeof item === "bigint") return item.toString();
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item as Record<string, unknown>).filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)]));
    return item;
  };
  return JSON.stringify(normalize(value));
}

export function sha256Canonical(value: unknown): string { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }

function rawComparable(log: RawTransferLog): Record<string, unknown> {
  return { address: getAddress(log.address), blockNumber: log.blockNumber, blockHash: log.blockHash.toLowerCase(), transactionHash: log.transactionHash.toLowerCase(), transactionIndex: log.transactionIndex, logIndex: log.logIndex, topics: log.topics.map((topic) => topic.toLowerCase()), data: log.data.toLowerCase() };
}

export function normalizeAndDeduplicate(events: TransferEvidence[]): TransferEvidence[] {
  const unique = new Map<string, TransferEvidence>();
  for (const event of events) {
    assertRawLog(event);
    if (!isAddress(event.from) || !isAddress(event.to) || event.value < 0n) throw new Error("Malformed decoded Transfer evidence.");
    const normalized = { ...event, address: getAddress(event.address), from: getAddress(event.from), to: getAddress(event.to) };
    const key = rawIdentity(normalized);
    const existing = unique.get(key);
    if (existing && canonicalJson({ ...rawComparable(existing), from: existing.from, to: existing.to, value: existing.value }) !== canonicalJson({ ...rawComparable(normalized), from: normalized.from, to: normalized.to, value: normalized.value })) throw new Error(`Conflicting duplicate evidence ${key}.`);
    unique.set(key, normalized);
  }
  return [...unique.values()].sort((a, b) => a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : a.transactionIndex - b.transactionIndex || a.logIndex - b.logIndex);
}

export function digestRawLogs(logs: RawTransferLog[]): string {
  const normalized = [...logs].map((log) => { assertRawLog(log); return rawComparable(log); }).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
  return sha256Canonical(normalized);
}

export function compareProviderEvidence(providerEvidence: Map<string, TransferEvidence[]>): ConsensusResult {
  const entries = [...providerEvidence.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return { consensus: false, redundancy: "NONE", reason: "No usable provider evidence.", evidence: [] };
  let normalized: TransferEvidence[][];
  try { normalized = entries.map(([, events]) => normalizeAndDeduplicate(events)); }
  catch (error) { return { consensus: false, redundancy: entries.length === 1 ? "SINGLE_PROVIDER" : "MULTI_PROVIDER", reason: error instanceof Error ? error.message : String(error), evidence: [] }; }
  if (entries.length === 1) return { consensus: false, redundancy: "SINGLE_PROVIDER", reason: "Only one usable evidence provider; cross-provider completeness is not established.", evidence: normalized[0] };
  const comparable = (events: TransferEvidence[]) => canonicalJson(events.map((event) => ({ ...rawComparable(event), from: event.from, to: event.to, value: event.value })));
  const baseline = comparable(normalized[0]);
  for (let i = 1; i < normalized.length; i += 1) if (comparable(normalized[i]) !== baseline) return { consensus: false, redundancy: "MULTI_PROVIDER", reason: `Provider evidence disagrees: ${entries[0][0]} vs ${entries[i][0]}.`, evidence: [] };
  return { consensus: true, redundancy: "MULTI_PROVIDER", reason: `${entries.length} providers returned identical normalized relevant evidence.`, evidence: normalized[0] };
}

export function compareEvidenceChannels(logQueryEvidence: TransferEvidence[], receiptDerivedEvidence: TransferEvidence[]): ConsensusResult {
  const result = compareProviderEvidence(new Map([
    ["log-query", logQueryEvidence],
    ["receipt-derived", receiptDerivedEvidence],
  ]));
  return result.consensus ? { ...result, reason: "Log-query and receipt-derived evidence agree exactly." } : { ...result, reason: `Evidence-channel disagreement: ${result.reason}` };
}

export function assessFinalizedHeads(observations: FinalizedHeadObservation[], endBlock: bigint): FinalityAssessment {
  if (observations.length < 2) return { status: "DISAGREEMENT", reason: "At least two finalized-head observations are required." };
  for (const item of observations) if (item.error || item.blockNumber === undefined || item.blockNumber < 0n || !item.blockHash || !hex64.test(item.blockHash)) return { status: "DISAGREEMENT", reason: `Finalized head from ${item.provider} is unavailable or malformed.` };
  const baseline = observations[0];
  if (observations.some((item) => item.blockNumber !== baseline.blockNumber)) return { status: "DISAGREEMENT", reason: "Configured providers disagree on finalized block number." };
  if (observations.some((item) => item.blockHash!.toLowerCase() !== baseline.blockHash!.toLowerCase())) return { status: "DISAGREEMENT", reason: "Configured providers disagree on finalized block hash." };
  const agreed = { agreedBlock: baseline.blockNumber!, agreedHash: baseline.blockHash! };
  return baseline.blockNumber! >= endBlock ? { status: "FINALIZED", reason: "The inclusive end block is at or below the mutually agreed finalized head.", ...agreed } : { status: "WAITING", reason: "The mutually agreed finalized head has not reached the inclusive end block.", ...agreed };
}

export function assessBlockHashAgreement(observations: HashObservation[], expectedBlock: bigint): HashAgreement {
  if (observations.length < 2) return { agreement: false, blockNumber: expectedBlock, reason: "At least two block-hash observations are required." };
  for (const item of observations) if (item.error || item.blockNumber !== expectedBlock || !item.blockHash || !hex64.test(item.blockHash)) return { agreement: false, blockNumber: expectedBlock, reason: `Block hash from ${item.provider} is unavailable, malformed, or for the wrong block.` };
  const hash = observations[0].blockHash!;
  if (observations.some((item) => item.blockHash!.toLowerCase() !== hash.toLowerCase())) return { agreement: false, blockNumber: expectedBlock, reason: `Configured providers disagree on block ${expectedBlock} hash.` };
  return { agreement: true, blockNumber: expectedBlock, blockHash: hash, reason: `Configured providers agree on block ${expectedBlock} hash.` };
}

export function reconstructPath(input: { subject: Address; startingBalance: bigint; startBlock: bigint; endBlock: bigint; events: TransferEvidence[] }): { path: bigint[]; minimum: bigint; minimumPoint: MinimumPoint; finalBalance: bigint; events: TransferEvidence[] } {
  if (input.startingBalance < 0n || input.startBlock > input.endBlock) throw new Error("Invalid reconstruction input.");
  const events = normalizeAndDeduplicate(input.events);
  let balance = input.startingBalance;
  let minimumPoint: MinimumPoint = { balance, blockNumber: input.startBlock - 1n };
  const path = [balance];
  for (const event of events) {
    if (event.blockNumber < input.startBlock || event.blockNumber > input.endBlock) throw new Error("Transfer lies outside the evaluated interval.");
    if (getAddress(event.from) === getAddress(input.subject)) balance -= event.value;
    if (getAddress(event.to) === getAddress(input.subject)) balance += event.value;
    if (balance < 0n) throw new Error("Reconstruction produced a negative balance.");
    path.push(balance);
    if (balance < minimumPoint.balance) minimumPoint = { balance, blockNumber: event.blockNumber, transactionHash: event.transactionHash, transactionIndex: event.transactionIndex, logIndex: event.logIndex };
  }
  return { path, minimum: minimumPoint.balance, minimumPoint, finalBalance: balance, events };
}

export function evaluateCandidate(input: { registryBound: boolean; evidenceComplete: boolean; evidenceConsensus: boolean; receiptEvidenceComplete: boolean; receiptEvidenceConsensus: boolean; crossChannelConsensus: boolean; boundaryHashConsensus: boolean; startingBalanceConsensus: boolean; endBalanceConsensus: boolean; tokenModelStatus: TokenModelStatus; finalityStatus: FinalityStatus; currentBlock: bigint; startBlock: bigint; endBlock: bigint; minimumBalance: bigint; subject: Address; startingBalance?: bigint; pinnedEndBalance?: bigint; events?: TransferEvidence[] }): CandidateEvaluation {
  const windowStatus: WindowStatus = input.currentBlock <= input.endBlock ? "ACTIVE" : "COMPLETE";
  const evidenceStatus: EvidenceStatus = !input.evidenceComplete || !input.receiptEvidenceComplete || (windowStatus === "COMPLETE" && input.pinnedEndBalance === undefined)
    ? "INCOMPLETE"
    : !input.evidenceConsensus || !input.receiptEvidenceConsensus || !input.crossChannelConsensus || !input.boundaryHashConsensus || !input.startingBalanceConsensus || !input.endBalanceConsensus
      ? "DISAGREEMENT" : "COMPLETE";
  const common = { evidenceComplete: input.evidenceComplete, evidenceConsensus: input.evidenceConsensus, registryBound: input.registryBound, tokenModelStatus: input.tokenModelStatus, windowStatus, evidenceStatus, finalityStatus: input.finalityStatus };
  const problem = !input.registryBound ? "Registry binding failed." : evidenceStatus === "INCOMPLETE" ? "Required evidence-channel coverage is incomplete." : evidenceStatus === "DISAGREEMENT" ? "Configured evidence providers or channels disagree." : input.finalityStatus === "DISAGREEMENT" ? "Configured providers disagree on finality evidence." : input.tokenModelStatus !== "CONVENTIONAL_ERC20_TRANSFER_V1" ? "Token model is unsupported or unverified." : input.startingBalance === undefined || input.events === undefined ? "Historical starting balance or events are unavailable." : undefined;
  if (input.startingBalance === undefined || input.events === undefined) return { ...common, breachStatus: "NOT_OBSERVED", finalVerdict: "INDETERMINATE", reason: problem ?? "Historical starting balance or events are unavailable.", path: [] };
  let reconstruction: ReturnType<typeof reconstructPath>;
  try { reconstruction = reconstructPath({ subject: input.subject, startingBalance: input.startingBalance!, startBlock: input.startBlock, endBlock: input.currentBlock <= input.endBlock ? input.currentBlock : input.endBlock, events: input.events! }); }
  catch (error) { return { ...common, evidenceComplete: false, evidenceStatus: "INCOMPLETE", breachStatus: "NOT_OBSERVED", finalVerdict: "INDETERMINATE", reason: error instanceof Error ? error.message : String(error), path: [] }; }
  const breachStatus: BreachStatus = reconstruction.minimum < input.minimumBalance ? "OBSERVED" : "NOT_OBSERVED";
  const reconstructed = { ...common, breachStatus, path: reconstruction.path, minimumObserved: reconstruction.minimum, minimumPoint: reconstruction.minimumPoint, finalBalance: reconstruction.finalBalance };
  if (problem) return { ...reconstructed, finalVerdict: "INDETERMINATE", reason: problem };
  if (windowStatus === "COMPLETE" && reconstruction.finalBalance !== input.pinnedEndBalance) return { ...reconstructed, evidenceStatus: "DISAGREEMENT", finalVerdict: "INDETERMINATE", reason: "Reconstructed final balance disagrees with the block-pinned end balance." };
  if (windowStatus === "ACTIVE") return { ...reconstructed, finalVerdict: "PENDING", reason: breachStatus === "OBSERVED" ? "Historical breach observed, but the inclusive commitment window is active." : "No breach observed so far; the inclusive commitment window is active." };
  if (input.finalityStatus === "WAITING") return { ...reconstructed, finalVerdict: "PENDING", reason: "The latest window is complete, but its inclusive end block is not finalized by the agreed finalized head." };
  return breachStatus === "OBSERVED" ? { ...reconstructed, finalVerdict: "NOT_PROVEN", reason: "Complete finalized evidence contains a balance below the committed minimum." } : { ...reconstructed, finalVerdict: "PROVEN", reason: "Complete finalized evidence maintains the committed minimum." };
}

export type TamperEvidentReceipt = { schema: "sicher.phase6.verification-record/1.0"; canonicalSerialization: string; verifierFingerprint: string; evidenceManifestDigest: string; payload: Record<string, unknown>; receiptDigest: string };
export function createTamperEvidentReceipt(input: Omit<TamperEvidentReceipt, "schema" | "canonicalSerialization" | "receiptDigest">): TamperEvidentReceipt {
  const unsigned = { schema: "sicher.phase6.verification-record/1.0" as const, canonicalSerialization: "Lexicographic JSON object keys; arrays preserved; BigInt as base-10 strings; UTF-8; receiptDigest omitted while hashing", ...input };
  return { ...unsigned, receiptDigest: sha256Canonical(unsigned) };
}
export function verifyTamperEvidentReceipt(receipt: TamperEvidentReceipt): boolean { const { receiptDigest, ...unsigned } = receipt; return /^[0-9a-f]{64}$/.test(receiptDigest) && sha256Canonical(unsigned) === receiptDigest; }

export const SHARED_INFRASTRUCTURE_LIMITATION = "Hypedexer and Conduit are separately operated RPC services but share Elysium sequencer, AnyTrust data-availability, HyperEVM settlement, and Nitro lineage dependencies; corroboration does not guarantee history completeness.";
export const RECEIPT_V2_SCHEMA = "sicher.competition-receipt/2.0" as const;
export const RECEIPT_V2_CANONICALIZATION = "Lexicographic JSON object keys; provider/evidence arrays normalized; integers encoded as base-10 strings; UTF-8; receiptDigest omitted while hashing" as const;
export const COMPETITION_CHAIN_ID = "99801";
export const COMPETITION_REGISTRY = getAddress("0x4e4887e28a8370678A9a37C08A85c65450b510c0");

export type ReceiptProvider = { id: string; endpoint: string };
export type ReceiptEvidence = { blockNumber: string; blockHash: Hex; transactionHash: Hex; transactionIndex: number; logIndex: number; emitter: Address; from: Address; to: Address; valueBaseUnits: string };
export type ProviderAgreement = { logQueryEvidence: boolean; receiptDerivedEvidence: boolean; crossChannelEvidence: boolean; startingBalance: boolean; endingBalance: boolean; criticalBlockHashes: boolean; finalizedHead: boolean };
export type CompetitionReceiptV2Input = {
  verifierVersion: string; verifierFingerprint: string; reconstructionCoreFingerprint: string;
  chainId: string; registryAddress: Address; commitmentId: string; creator: Address; subject: Address; token: Address; proofType: "MIN_BALANCE";
  minimumRequiredBaseUnits: string; tokenDecimals: number; startBlock: string; startBlockHash: Hex; endBlock: string; endBlockHash: Hex;
  startingBalanceBlock: string; startingBalanceBlockHash: Hex; startingBalanceBaseUnits: string; minimumObservedBaseUnits: string;
  minimumCausingBlock: string; minimumCausingBlockHash: Hex; minimumCausingTransactionHash: Hex | null; minimumCausingTransactionIndex: number | null; minimumCausingLogIndex: number | null;
  finalBalanceBaseUnits: string; windowStatus: WindowStatus; breachStatus: BreachStatus; evidenceStatus: EvidenceStatus; finalityStatus: FinalityStatus; finalVerdict: FinalVerdict; reason: string;
  providers: ReceiptProvider[]; providerAgreement: ProviderAgreement; finalizedBlock: string; finalizedBlockHash: Hex; orderedRelevantEvidence: ReceiptEvidence[];
  evidenceManifestDigest: string; limitations: string[];
};
export type CompetitionReceiptV2 = CompetitionReceiptV2Input & { schemaVersion: typeof RECEIPT_V2_SCHEMA; canonicalSerialization: typeof RECEIPT_V2_CANONICALIZATION; receiptDigest: string };
export type ReceiptVerificationOptions = { mode?: "competition" | "development"; expectedChainId?: string; expectedRegistryAddress?: Address };
export type ReceiptVerificationResult = { valid: boolean; errors: string[]; recomputedDigest?: string };

const receiptKeys = new Set(["schemaVersion", "canonicalSerialization", "verifierVersion", "verifierFingerprint", "reconstructionCoreFingerprint", "chainId", "registryAddress", "commitmentId", "creator", "subject", "token", "proofType", "minimumRequiredBaseUnits", "tokenDecimals", "startBlock", "startBlockHash", "endBlock", "endBlockHash", "startingBalanceBlock", "startingBalanceBlockHash", "startingBalanceBaseUnits", "minimumObservedBaseUnits", "minimumCausingBlock", "minimumCausingBlockHash", "minimumCausingTransactionHash", "minimumCausingTransactionIndex", "minimumCausingLogIndex", "finalBalanceBaseUnits", "windowStatus", "breachStatus", "evidenceStatus", "finalityStatus", "finalVerdict", "reason", "providers", "providerAgreement", "finalizedBlock", "finalizedBlockHash", "orderedRelevantEvidence", "evidenceManifestDigest", "limitations", "receiptDigest"]);
const decimal = /^(0|[1-9][0-9]*)$/;
const sha256 = /^[0-9a-f]{64}$/;
const hash = /^0x[0-9a-fA-F]{64}$/;
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function safeIndex(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function compareEvidenceOrder(a: ReceiptEvidence, b: ReceiptEvidence): number {
  const block = BigInt(a.blockNumber) < BigInt(b.blockNumber) ? -1 : BigInt(a.blockNumber) > BigInt(b.blockNumber) ? 1 : 0;
  return block || a.transactionIndex - b.transactionIndex || a.logIndex - b.logIndex;
}

function validateReceipt(value: unknown, options: ReceiptVerificationOptions, checkDigest: boolean): ReceiptVerificationResult {
  const errors: string[] = [];
  if (!record(value)) return { valid: false, errors: ["Receipt must be an object."] };
  for (const key of receiptKeys) if (!(key in value)) errors.push(`Missing mandatory field: ${key}.`);
  for (const key of Object.keys(value)) if (!receiptKeys.has(key)) errors.push(`Unknown receipt field: ${key}.`);
  if (value.schemaVersion !== RECEIPT_V2_SCHEMA) errors.push("Unsupported schemaVersion.");
  if (value.canonicalSerialization !== RECEIPT_V2_CANONICALIZATION) errors.push("Unsupported canonicalSerialization.");
  for (const key of ["verifierFingerprint", "reconstructionCoreFingerprint", "evidenceManifestDigest", "receiptDigest"]) if (typeof value[key] !== "string" || !sha256.test(value[key] as string)) errors.push(`${key} must be a lowercase SHA256 digest.`);
  for (const key of ["chainId", "commitmentId", "minimumRequiredBaseUnits", "startBlock", "endBlock", "startingBalanceBlock", "startingBalanceBaseUnits", "minimumObservedBaseUnits", "minimumCausingBlock", "finalBalanceBaseUnits", "finalizedBlock"]) if (typeof value[key] !== "string" || !decimal.test(value[key] as string)) errors.push(`${key} must be a canonical non-negative integer string.`);
  for (const key of ["registryAddress", "creator", "subject", "token"]) if (typeof value[key] !== "string" || !isAddress(value[key] as string)) errors.push(`${key} must be a valid address.`);
  for (const key of ["startBlockHash", "endBlockHash", "startingBalanceBlockHash", "minimumCausingBlockHash", "finalizedBlockHash"]) if (typeof value[key] !== "string" || !hash.test(value[key] as string)) errors.push(`${key} must be a 32-byte hash.`);
  if (value.minimumCausingTransactionHash !== null && (typeof value.minimumCausingTransactionHash !== "string" || !hash.test(value.minimumCausingTransactionHash))) errors.push("minimumCausingTransactionHash must be null or a 32-byte hash.");
  for (const key of ["minimumCausingTransactionIndex", "minimumCausingLogIndex"]) if (value[key] !== null && !safeIndex(value[key])) errors.push(`${key} must be null or a non-negative safe integer.`);
  if (typeof value.verifierVersion !== "string" || !value.verifierVersion) errors.push("verifierVersion must be a non-empty string.");
  if (value.proofType !== "MIN_BALANCE") errors.push("proofType must be MIN_BALANCE.");
  if (!safeIndex(value.tokenDecimals) || (value.tokenDecimals as number) > 255) errors.push("tokenDecimals must be a safe integer from 0 through 255.");
  if (typeof value.reason !== "string" || !value.reason) errors.push("reason must be a non-empty string.");
  if (!(["ACTIVE", "COMPLETE"] as unknown[]).includes(value.windowStatus)) errors.push("Invalid windowStatus.");
  if (!(["NOT_OBSERVED", "OBSERVED"] as unknown[]).includes(value.breachStatus)) errors.push("Invalid breachStatus.");
  if (!(["COMPLETE", "INCOMPLETE", "DISAGREEMENT"] as unknown[]).includes(value.evidenceStatus)) errors.push("Invalid evidenceStatus.");
  if (!(["WAITING", "FINALIZED", "DISAGREEMENT"] as unknown[]).includes(value.finalityStatus)) errors.push("Invalid finalityStatus.");
  if (!(["PENDING", "PROVEN", "NOT_PROVEN", "INDETERMINATE"] as unknown[]).includes(value.finalVerdict)) errors.push("Invalid finalVerdict.");
  if (!Array.isArray(value.providers) || value.providers.length < 2) errors.push("providers must contain at least two entries.");
  else {
    for (const provider of value.providers) if (!record(provider) || Object.keys(provider).sort().join() !== "endpoint,id" || typeof provider.id !== "string" || !provider.id || typeof provider.endpoint !== "string" || !provider.endpoint) errors.push("Malformed provider entry.");
    const ids = value.providers.filter(record).map((provider) => provider.id);
    const endpoints = value.providers.filter(record).map((provider) => provider.endpoint);
    if (new Set(ids).size !== ids.length) errors.push("Provider ids must be unique.");
    if (new Set(endpoints).size !== endpoints.length) errors.push("Provider endpoints must be unique.");
  }
  const agreementKeys = ["criticalBlockHashes", "crossChannelEvidence", "endingBalance", "finalizedHead", "logQueryEvidence", "receiptDerivedEvidence", "startingBalance"];
  if (!record(value.providerAgreement) || Object.keys(value.providerAgreement).sort().join() !== agreementKeys.sort().join() || agreementKeys.some((key) => typeof (value.providerAgreement as Record<string, unknown>)[key] !== "boolean")) errors.push("Malformed providerAgreement.");
  if (!Array.isArray(value.orderedRelevantEvidence)) errors.push("orderedRelevantEvidence must be an array.");
  else {
    for (const item of value.orderedRelevantEvidence) {
      if (!record(item) || typeof item.blockNumber !== "string" || !decimal.test(item.blockNumber) || typeof item.blockHash !== "string" || !hash.test(item.blockHash) || typeof item.transactionHash !== "string" || !hash.test(item.transactionHash) || !safeIndex(item.transactionIndex) || !safeIndex(item.logIndex) || typeof item.emitter !== "string" || !isAddress(item.emitter) || typeof item.from !== "string" || !isAddress(item.from) || typeof item.to !== "string" || !isAddress(item.to) || typeof item.valueBaseUnits !== "string" || !decimal.test(item.valueBaseUnits)) errors.push("Malformed orderedRelevantEvidence entry.");
    }
    const sorted = [...value.orderedRelevantEvidence] as ReceiptEvidence[]; sorted.sort(compareEvidenceOrder);
    if (canonicalJson(sorted) !== canonicalJson(value.orderedRelevantEvidence)) errors.push("orderedRelevantEvidence is not canonically ordered.");
  }
  if (!Array.isArray(value.limitations) || value.limitations.some((item) => typeof item !== "string" || !item)) errors.push("limitations must be non-empty strings.");
  const terminal = value.finalVerdict === "PROVEN" || value.finalVerdict === "NOT_PROVEN";
  if (terminal && (value.windowStatus !== "COMPLETE" || value.finalityStatus !== "FINALIZED" || value.evidenceStatus !== "COMPLETE")) errors.push("Terminal verdict requires COMPLETE window/evidence and FINALIZED finality.");
  if (terminal && record(value.providerAgreement) && Object.values(value.providerAgreement).some((item) => item !== true)) errors.push("Terminal verdict requires every provider/channel agreement flag.");
  if (value.windowStatus === "ACTIVE" && terminal) errors.push("ACTIVE window cannot have a terminal verdict.");
  if (value.finalityStatus === "WAITING" && terminal) errors.push("WAITING finality cannot have a terminal verdict.");
  if (value.evidenceStatus !== "COMPLETE" && terminal) errors.push("Incomplete or disagreeing evidence cannot have a terminal verdict.");
  if (value.breachStatus === "OBSERVED" && value.finalVerdict === "PROVEN") errors.push("Observed breach cannot be PROVEN.");
  if (value.breachStatus === "NOT_OBSERVED" && value.finalVerdict === "NOT_PROVEN") errors.push("NOT_PROVEN requires an observed breach.");
  if (value.finalVerdict === "PENDING" && value.windowStatus !== "ACTIVE" && value.finalityStatus !== "WAITING") errors.push("PENDING requires an active window or waiting finality.");
  if (typeof value.startBlock === "string" && decimal.test(value.startBlock) && typeof value.endBlock === "string" && decimal.test(value.endBlock) && BigInt(value.startBlock) > BigInt(value.endBlock)) errors.push("startBlock must not exceed endBlock.");
  if (typeof value.startBlock === "string" && decimal.test(value.startBlock) && typeof value.startingBalanceBlock === "string" && decimal.test(value.startingBalanceBlock) && BigInt(value.startingBalanceBlock) + 1n !== BigInt(value.startBlock)) errors.push("startingBalanceBlock must immediately precede startBlock.");
  if (value.finalityStatus === "FINALIZED" && typeof value.finalizedBlock === "string" && decimal.test(value.finalizedBlock) && typeof value.endBlock === "string" && decimal.test(value.endBlock) && BigInt(value.finalizedBlock) < BigInt(value.endBlock)) errors.push("FINALIZED requires finalizedBlock at or above endBlock.");
  const minimumTransactionFields = [value.minimumCausingTransactionHash, value.minimumCausingTransactionIndex, value.minimumCausingLogIndex];
  if (!minimumTransactionFields.every((item) => item === null) && minimumTransactionFields.some((item) => item === null)) errors.push("Minimum-causing transaction metadata must be entirely null or entirely present.");
  if (typeof value.minimumObservedBaseUnits === "string" && decimal.test(value.minimumObservedBaseUnits) && typeof value.minimumRequiredBaseUnits === "string" && decimal.test(value.minimumRequiredBaseUnits)) {
    const observed = BigInt(value.minimumObservedBaseUnits); const required = BigInt(value.minimumRequiredBaseUnits);
    if (value.breachStatus === "OBSERVED" && observed >= required) errors.push("Observed breach requires minimumObserved below minimumRequired.");
    if (value.breachStatus === "NOT_OBSERVED" && observed < required) errors.push("NOT_OBSERVED conflicts with the recorded minimum.");
  }
  const mode = options.mode ?? "competition";
  const expectedChain = options.expectedChainId ?? (mode === "competition" ? COMPETITION_CHAIN_ID : undefined);
  const expectedRegistry = options.expectedRegistryAddress ?? (mode === "competition" ? COMPETITION_REGISTRY : undefined);
  if (expectedChain && value.chainId !== expectedChain) errors.push("Receipt chainId does not match the pinned verifier configuration.");
  if (expectedRegistry && (typeof value.registryAddress !== "string" || !isAddress(value.registryAddress) || getAddress(value.registryAddress) !== getAddress(expectedRegistry))) errors.push("Receipt registryAddress does not match the pinned verifier configuration.");
  let recomputedDigest: string | undefined;
  if (checkDigest && typeof value.receiptDigest === "string") { const { receiptDigest: _stored, ...unsigned } = value; recomputedDigest = sha256Canonical(unsigned); if (recomputedDigest !== value.receiptDigest) errors.push("receiptDigest mismatch."); }
  return { valid: errors.length === 0, errors, recomputedDigest };
}

export function createCompetitionReceiptV2(input: CompetitionReceiptV2Input): CompetitionReceiptV2 {
  const raw = input as unknown as Record<string, unknown>;
  for (const forbidden of ["schemaVersion", "canonicalSerialization", "receiptDigest"]) if (Object.prototype.hasOwnProperty.call(raw, forbidden)) throw new Error(`${forbidden} must not be supplied to the Receipt V2 constructor.`);
  const providers = [...input.providers].sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
  const orderedRelevantEvidence = [...input.orderedRelevantEvidence].sort(compareEvidenceOrder);
  const unsigned = { ...input, providers, orderedRelevantEvidence, schemaVersion: RECEIPT_V2_SCHEMA, canonicalSerialization: RECEIPT_V2_CANONICALIZATION };
  const receipt = { ...unsigned, receiptDigest: sha256Canonical(unsigned) } as CompetitionReceiptV2;
  const validation = validateReceipt(receipt, { mode: "development", expectedChainId: input.chainId, expectedRegistryAddress: input.registryAddress }, true);
  if (!validation.valid) throw new Error(`Invalid Receipt V2: ${validation.errors.join(" ")}`);
  return receipt;
}

export function verifyReceiptV2(value: unknown, options: ReceiptVerificationOptions = {}): ReceiptVerificationResult { return validateReceipt(value, options, true); }
