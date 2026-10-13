import { getAddress, isAddress, type Address, type Hex } from "viem";
import {
  COMPETITION_CHAIN_ID,
  COMPETITION_REGISTRY,
  RECEIPT_V2_CANONICALIZATION,
  canonicalJson,
  evaluateCandidate,
  normalizeAndDeduplicate,
  sha256Canonical,
  type BreachStatus,
  type EvidenceStatus,
  type FinalityStatus,
  type FinalVerdict,
  type ReceiptProvider,
  type TokenModelStatus,
  type TransferEvidence,
  type WindowStatus,
} from "./phase6-evidence-core.ts";

export type AssuranceLevel = "CORROBORATED" | "EXHAUSTIVE";
export const CORROBORATED_LIMITATION = "Historical event evidence was corroborated across configured operators. Correlated omission across shared upstream infrastructure cannot be mathematically excluded.";
export const RECEIPT_V3_SCHEMA = "sicher.competition-receipt/3.0" as const;
export const RECEIPT_V3_CANONICALIZATION = RECEIPT_V2_CANONICALIZATION;

export type AssuranceEvaluationInput = {
  requestedAssuranceLevel: AssuranceLevel;
  acceptCorroboratedFallback?: boolean;
  registryBound: boolean;
  logRangeCoverageComplete: boolean;
  logProviderAgreement: boolean;
  discoveredEventReceiptChecksComplete: boolean;
  exhaustiveReceiptVerificationCompleted: boolean;
  exhaustiveReceiptAgreement: boolean;
  boundaryHashConsensus: boolean;
  startingBalanceConsensus: boolean;
  endingBalanceConsensus: boolean;
  tokenModelStatus: TokenModelStatus;
  finalityStatus: FinalityStatus;
  currentBlock: bigint;
  startBlock: bigint;
  endBlock: bigint;
  minimumBalance: bigint;
  subject: Address;
  startingBalance?: bigint;
  pinnedEndBalance?: bigint;
  events?: TransferEvidence[];
};
export type AssuranceEvaluation = ReturnType<typeof evaluateCandidate> & { proofResult: FinalVerdict; assuranceLevel: AssuranceLevel | null; requestedAssuranceLevel: AssuranceLevel };

export function evaluateAssuranceCandidate(input: AssuranceEvaluationInput): AssuranceEvaluation {
  const exhaustiveSatisfied = input.exhaustiveReceiptVerificationCompleted && input.exhaustiveReceiptAgreement;
  const canFallback = input.requestedAssuranceLevel === "EXHAUSTIVE" && input.acceptCorroboratedFallback === true;
  const assuranceLevel: AssuranceLevel | null = input.requestedAssuranceLevel === "EXHAUSTIVE" ? (exhaustiveSatisfied ? "EXHAUSTIVE" : canFallback ? "CORROBORATED" : null) : "CORROBORATED";
  const correlatedReady = input.logRangeCoverageComplete && input.logProviderAgreement && input.discoveredEventReceiptChecksComplete;
  const result = evaluateCandidate({
    registryBound: input.registryBound,
    evidenceComplete: correlatedReady,
    evidenceConsensus: input.logProviderAgreement,
    receiptEvidenceComplete: assuranceLevel === "EXHAUSTIVE" ? input.exhaustiveReceiptVerificationCompleted : input.discoveredEventReceiptChecksComplete,
    receiptEvidenceConsensus: assuranceLevel === "EXHAUSTIVE" ? input.exhaustiveReceiptAgreement : input.discoveredEventReceiptChecksComplete,
    crossChannelConsensus: assuranceLevel === "EXHAUSTIVE" ? input.exhaustiveReceiptAgreement : input.discoveredEventReceiptChecksComplete,
    boundaryHashConsensus: input.boundaryHashConsensus,
    startingBalanceConsensus: input.startingBalanceConsensus,
    endBalanceConsensus: input.endingBalanceConsensus,
    tokenModelStatus: input.tokenModelStatus,
    finalityStatus: input.finalityStatus,
    currentBlock: input.currentBlock,
    startBlock: input.startBlock,
    endBlock: input.endBlock,
    minimumBalance: input.minimumBalance,
    subject: input.subject,
    startingBalance: input.startingBalance,
    pinnedEndBalance: input.pinnedEndBalance,
    events: input.events,
  });
  if (assuranceLevel === null) return { ...result, evidenceStatus: "INCOMPLETE", finalVerdict: "INDETERMINATE", proofResult: "INDETERMINATE", assuranceLevel, requestedAssuranceLevel: input.requestedAssuranceLevel, reason: "EXHAUSTIVE assurance was requested but exhaustive receipt verification is incomplete." };
  return { ...result, proofResult: result.finalVerdict, assuranceLevel, requestedAssuranceLevel: input.requestedAssuranceLevel };
}

export type DiscoveredReceiptCheck = { provider: string; queried: TransferEvidence; receipt: TransferEvidence | null };
function eventComparable(event: TransferEvidence): Record<string, unknown> {
  return { blockNumber: event.blockNumber, blockHash: event.blockHash.toLowerCase(), transactionHash: event.transactionHash.toLowerCase(), transactionIndex: event.transactionIndex, logIndex: event.logIndex, emitter: getAddress(event.address), topics: event.topics.map((topic) => topic.toLowerCase()), data: event.data.toLowerCase(), from: getAddress(event.from), to: getAddress(event.to), value: event.value };
}
export function assessDiscoveredReceiptChecks(logEvents: TransferEvidence[], checks: DiscoveredReceiptCheck[], requiredProviders: string[]): { complete: boolean; reason: string; eventsChecked: number; checksPerformed: number; digest: string } {
  let normalized: TransferEvidence[];
  try { normalized = normalizeAndDeduplicate(logEvents); } catch (error) { return { complete: false, reason: error instanceof Error ? error.message : String(error), eventsChecked: 0, checksPerformed: checks.length, digest: sha256Canonical(checks) }; }
  const providers = [...new Set(requiredProviders)].sort();
  if (providers.length < 2 || providers.length !== requiredProviders.length) return { complete: false, reason: "At least two distinct required providers are necessary.", eventsChecked: normalized.length, checksPerformed: checks.length, digest: sha256Canonical(checks) };
  for (const event of normalized) for (const provider of providers) {
    const matching = checks.filter((check) => check.provider === provider && canonicalJson(eventComparable(check.queried)) === canonicalJson(eventComparable(event)));
    if (matching.length !== 1 || matching[0].receipt === null) return { complete: false, reason: `Discovered event is absent or not checked exactly once by ${provider}.`, eventsChecked: normalized.length, checksPerformed: checks.length, digest: sha256Canonical(checks) };
    if (canonicalJson(eventComparable(matching[0].receipt!)) !== canonicalJson(eventComparable(event))) return { complete: false, reason: `Receipt metadata differs from log-query evidence for ${provider}.`, eventsChecked: normalized.length, checksPerformed: checks.length, digest: sha256Canonical(checks) };
  }
  return { complete: true, reason: "Every discovered event is present with identical metadata in each configured provider's transaction receipt.", eventsChecked: normalized.length, checksPerformed: checks.length, digest: sha256Canonical(checks) };
}

export type ExhaustiveRangeCheckpoint = { fromBlock: string; toBlock: string; evidenceDigest: string; previousCheckpointDigest: string | null; checkpointDigest: string };
export type ExhaustiveProgress = { schemaVersion: "sicher.exhaustive-progress/1.0"; chainId: string; token: Address; startBlock: string; endBlock: string; nextBlock: string; ranges: ExhaustiveRangeCheckpoint[]; progressDigest: string };
const decimal = /^(0|[1-9][0-9]*)$/;
const digest64 = /^[0-9a-f]{64}$/;
const hash32 = /^0x[0-9a-fA-F]{64}$/;
const safeIndex = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

export function createExhaustiveProgress(input: { chainId: string; token: Address; startBlock: string; endBlock: string }): ExhaustiveProgress {
  if (!decimal.test(input.chainId) || !isAddress(input.token) || !decimal.test(input.startBlock) || !decimal.test(input.endBlock) || BigInt(input.startBlock) > BigInt(input.endBlock)) throw new Error("Invalid exhaustive progress context.");
  const unsigned = { schemaVersion: "sicher.exhaustive-progress/1.0" as const, ...input, token: getAddress(input.token), nextBlock: input.startBlock, ranges: [] as ExhaustiveRangeCheckpoint[] };
  return { ...unsigned, progressDigest: sha256Canonical(unsigned) };
}
export function verifyExhaustiveProgress(value: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!record(value)) return { valid: false, errors: ["Progress must be an object."] };
  if (value.schemaVersion !== "sicher.exhaustive-progress/1.0") errors.push("Unsupported progress schemaVersion.");
  if (typeof value.chainId !== "string" || !decimal.test(value.chainId) || typeof value.token !== "string" || !isAddress(value.token) || typeof value.startBlock !== "string" || !decimal.test(value.startBlock) || typeof value.endBlock !== "string" || !decimal.test(value.endBlock) || typeof value.nextBlock !== "string" || !decimal.test(value.nextBlock)) errors.push("Malformed exhaustive progress context.");
  if (!Array.isArray(value.ranges)) errors.push("Progress ranges must be an array.");
  if (typeof value.progressDigest !== "string" || !digest64.test(value.progressDigest)) errors.push("Malformed progressDigest.");
  if (!errors.length) {
    let expected = BigInt(value.startBlock as string); let previous: string | null = null;
    for (const raw of value.ranges as unknown[]) {
      if (!record(raw) || typeof raw.fromBlock !== "string" || !decimal.test(raw.fromBlock) || typeof raw.toBlock !== "string" || !decimal.test(raw.toBlock) || typeof raw.evidenceDigest !== "string" || !digest64.test(raw.evidenceDigest) || (raw.previousCheckpointDigest !== null && (typeof raw.previousCheckpointDigest !== "string" || !digest64.test(raw.previousCheckpointDigest))) || typeof raw.checkpointDigest !== "string" || !digest64.test(raw.checkpointDigest)) { errors.push("Malformed exhaustive range checkpoint."); break; }
      const { checkpointDigest, ...unsigned } = raw;
      if (BigInt(raw.fromBlock) !== expected || BigInt(raw.toBlock) < expected || raw.previousCheckpointDigest !== previous || sha256Canonical(unsigned) !== checkpointDigest) { errors.push("Exhaustive range checkpoint chain is invalid."); break; }
      expected = BigInt(raw.toBlock) + 1n; previous = checkpointDigest;
    }
    if (BigInt(value.nextBlock as string) !== expected) errors.push("nextBlock does not follow verified ranges.");
    const { progressDigest, ...unsigned } = value; if (sha256Canonical(unsigned) !== progressDigest) errors.push("progressDigest mismatch.");
  }
  return { valid: errors.length === 0, errors };
}
export function appendExhaustiveProgress(progress: ExhaustiveProgress, input: { fromBlock: string; toBlock: string; evidenceDigest: string }): ExhaustiveProgress {
  const validation = verifyExhaustiveProgress(progress); if (!validation.valid) throw new Error(`Invalid prior progress: ${validation.errors.join(" ")}`);
  if (!decimal.test(input.fromBlock) || !decimal.test(input.toBlock) || !digest64.test(input.evidenceDigest) || input.fromBlock !== progress.nextBlock || BigInt(input.toBlock) < BigInt(input.fromBlock) || BigInt(input.toBlock) > BigInt(progress.endBlock)) throw new Error("Invalid exhaustive range append.");
  const checkpointUnsigned = { ...input, previousCheckpointDigest: progress.ranges.at(-1)?.checkpointDigest ?? null };
  const checkpoint = { ...checkpointUnsigned, checkpointDigest: sha256Canonical(checkpointUnsigned) };
  const unsigned = { ...progress, nextBlock: (BigInt(input.toBlock) + 1n).toString(), ranges: [...progress.ranges, checkpoint] };
  const { progressDigest: _old, ...withoutDigest } = unsigned;
  return { ...withoutDigest, progressDigest: sha256Canonical(withoutDigest) };
}

export async function runExhaustiveProgress(input: {
  progress: ExhaustiveProgress;
  concurrency: number;
  checkpointBlocks: number;
  scanBlock: (blockNumber: bigint) => Promise<unknown>;
  persist: (progress: ExhaustiveProgress) => Promise<void> | void;
}): Promise<ExhaustiveProgress> {
  const validation = verifyExhaustiveProgress(input.progress); if (!validation.valid) throw new Error(`Invalid prior progress: ${validation.errors.join(" ")}`);
  if (!Number.isSafeInteger(input.concurrency) || input.concurrency < 1 || input.concurrency > 32 || !Number.isSafeInteger(input.checkpointBlocks) || input.checkpointBlocks < 1) throw new Error("Invalid bounded exhaustive runner configuration.");
  let progress = input.progress;
  const end = BigInt(progress.endBlock);
  while (BigInt(progress.nextBlock) <= end) {
    const from = BigInt(progress.nextBlock);
    const to = from + BigInt(input.checkpointBlocks - 1) < end ? from + BigInt(input.checkpointBlocks - 1) : end;
    const results: Array<{ blockNumber: string; evidence: unknown }> = [];
    for (let cursor = from; cursor <= to; cursor += BigInt(input.concurrency)) {
      const blocks: bigint[] = [];
      for (let offset = 0; offset < input.concurrency && cursor + BigInt(offset) <= to; offset += 1) blocks.push(cursor + BigInt(offset));
      const batch = await Promise.all(blocks.map(async (blockNumber) => ({ blockNumber: blockNumber.toString(), evidence: await input.scanBlock(blockNumber) })));
      results.push(...batch);
    }
    progress = appendExhaustiveProgress(progress, { fromBlock: from.toString(), toBlock: to.toString(), evidenceDigest: sha256Canonical(results) });
    await input.persist(progress);
  }
  return progress;
}

export type MinimumCausingEvidenceV3 = { blockNumber: string; blockHash: Hex; transactionHash: Hex | null; transactionIndex: number | null; logIndex: number | null };
export type ProviderAgreementV3 = { logEvidence: boolean; discoveredReceiptChecks: boolean; exhaustiveReceiptEvidence: boolean | null; startingBalance: boolean; endingBalance: boolean; criticalBlockHashes: boolean; finalizedHead: boolean };
export type ReceiptV3Input = {
  proofResult: FinalVerdict; assuranceLevel: AssuranceLevel; verifierVersion: string; verifierFingerprint: string; coreFingerprint: string;
  chainId: string; registryAddress: Address; commitmentId: string; creator: Address; subject: Address; token: Address; proofType: "MIN_BALANCE";
  minimumRequiredBaseUnits: string; tokenDecimals: number; startBlock: string; startBlockHash: Hex; endBlock: string; endBlockHash: Hex;
  startingBalanceBaseUnits: string; minimumObservedBaseUnits: string; finalBalanceBaseUnits: string; minimumCausingEvidence: MinimumCausingEvidenceV3;
  windowStatus: WindowStatus; breachStatus: BreachStatus; evidenceStatus: EvidenceStatus; finalityStatus: FinalityStatus;
  providers: ReceiptProvider[]; providerAgreement: ProviderAgreementV3;
  logRangeCoverage: { complete: boolean; chunks: number; successfulChunks: number; fromBlock: string; toBlock: string; retries: number };
  discoveredEventReceiptChecks: { complete: boolean; eventsChecked: number; checksPerformed: number; digest: string };
  exhaustiveReceiptVerification: { requested: boolean; completed: boolean; blocksVerified: string; totalBlocks: string; progressDigest: string | null };
  finalizedBlock: string; finalizedBlockHash: Hex; evidenceManifestDigest: string; limitations: string[];
};
export type ReceiptV3 = ReceiptV3Input & { schemaVersion: typeof RECEIPT_V3_SCHEMA; canonicalSerialization: typeof RECEIPT_V3_CANONICALIZATION; receiptDigest: string };
export type ReceiptV3VerificationResult = { valid: boolean; errors: string[]; recomputedDigest?: string };
const receiptV3Keys = new Set(["schemaVersion", "canonicalSerialization", "proofResult", "assuranceLevel", "verifierVersion", "verifierFingerprint", "coreFingerprint", "chainId", "registryAddress", "commitmentId", "creator", "subject", "token", "proofType", "minimumRequiredBaseUnits", "tokenDecimals", "startBlock", "startBlockHash", "endBlock", "endBlockHash", "startingBalanceBaseUnits", "minimumObservedBaseUnits", "finalBalanceBaseUnits", "minimumCausingEvidence", "windowStatus", "breachStatus", "evidenceStatus", "finalityStatus", "providers", "providerAgreement", "logRangeCoverage", "discoveredEventReceiptChecks", "exhaustiveReceiptVerification", "finalizedBlock", "finalizedBlockHash", "evidenceManifestDigest", "limitations", "receiptDigest"]);

function validateReceiptV3(value: unknown, checkDigest: boolean): ReceiptV3VerificationResult {
  const errors: string[] = [];
  if (!record(value)) return { valid: false, errors: ["Receipt must be an object."] };
  for (const key of receiptV3Keys) if (!(key in value)) errors.push(`Missing mandatory field: ${key}.`);
  for (const key of Object.keys(value)) if (!receiptV3Keys.has(key)) errors.push(`Unknown receipt field: ${key}.`);
  if (value.schemaVersion !== RECEIPT_V3_SCHEMA) errors.push("Unsupported schemaVersion.");
  if (value.canonicalSerialization !== RECEIPT_V3_CANONICALIZATION) errors.push("Unsupported canonicalSerialization.");
  if (!(value.proofResult === "PROVEN" || value.proofResult === "NOT_PROVEN" || value.proofResult === "PENDING" || value.proofResult === "INDETERMINATE")) errors.push("Invalid proofResult.");
  if (!(value.assuranceLevel === "CORROBORATED" || value.assuranceLevel === "EXHAUSTIVE")) errors.push("Invalid assuranceLevel.");
  for (const key of ["verifierFingerprint", "coreFingerprint", "evidenceManifestDigest", "receiptDigest"]) if (typeof value[key] !== "string" || !digest64.test(value[key] as string)) errors.push(`${key} must be a lowercase SHA256 digest.`);
  for (const key of ["chainId", "commitmentId", "minimumRequiredBaseUnits", "startBlock", "endBlock", "startingBalanceBaseUnits", "minimumObservedBaseUnits", "finalBalanceBaseUnits", "finalizedBlock"]) if (typeof value[key] !== "string" || !decimal.test(value[key] as string)) errors.push(`${key} must be a canonical non-negative integer string.`);
  for (const key of ["registryAddress", "creator", "subject", "token"]) if (typeof value[key] !== "string" || !isAddress(value[key] as string)) errors.push(`${key} must be a valid address.`);
  for (const key of ["startBlockHash", "endBlockHash", "finalizedBlockHash"]) if (typeof value[key] !== "string" || !hash32.test(value[key] as string)) errors.push(`${key} must be a 32-byte hash.`);
  if (value.chainId !== COMPETITION_CHAIN_ID || typeof value.registryAddress !== "string" || !isAddress(value.registryAddress) || getAddress(value.registryAddress) !== COMPETITION_REGISTRY) errors.push("Receipt is not bound to the competition chain and registry.");
  if (typeof value.verifierVersion !== "string" || !value.verifierVersion || value.proofType !== "MIN_BALANCE" || !safeIndex(value.tokenDecimals) || (value.tokenDecimals as number) > 255) errors.push("Malformed verifierVersion, proofType, or tokenDecimals.");
  if (!record(value.minimumCausingEvidence) || Object.keys(value.minimumCausingEvidence).sort().join() !== ["blockHash", "blockNumber", "logIndex", "transactionHash", "transactionIndex"].sort().join() || typeof value.minimumCausingEvidence.blockNumber !== "string" || !decimal.test(value.minimumCausingEvidence.blockNumber) || typeof value.minimumCausingEvidence.blockHash !== "string" || !hash32.test(value.minimumCausingEvidence.blockHash) || (value.minimumCausingEvidence.transactionHash !== null && (typeof value.minimumCausingEvidence.transactionHash !== "string" || !hash32.test(value.minimumCausingEvidence.transactionHash))) || (value.minimumCausingEvidence.transactionIndex !== null && !safeIndex(value.minimumCausingEvidence.transactionIndex)) || (value.minimumCausingEvidence.logIndex !== null && !safeIndex(value.minimumCausingEvidence.logIndex))) errors.push("Malformed minimumCausingEvidence.");
  if (!(value.windowStatus === "ACTIVE" || value.windowStatus === "COMPLETE") || !(value.breachStatus === "OBSERVED" || value.breachStatus === "NOT_OBSERVED") || !(value.evidenceStatus === "COMPLETE" || value.evidenceStatus === "INCOMPLETE" || value.evidenceStatus === "DISAGREEMENT") || !(value.finalityStatus === "WAITING" || value.finalityStatus === "FINALIZED" || value.finalityStatus === "DISAGREEMENT")) errors.push("Invalid state enum.");
  if (!Array.isArray(value.providers) || value.providers.length < 2 || value.providers.some((provider) => !record(provider) || Object.keys(provider).sort().join() !== "endpoint,id" || typeof provider.id !== "string" || !provider.id || typeof provider.endpoint !== "string" || !provider.endpoint)) errors.push("Malformed providers.");
  else if (new Set(value.providers.map((provider) => (provider as Record<string, unknown>).id)).size !== value.providers.length || new Set(value.providers.map((provider) => (provider as Record<string, unknown>).endpoint)).size !== value.providers.length) errors.push("Provider ids and endpoints must be unique.");
  if (!record(value.providerAgreement)) errors.push("Malformed providerAgreement.");
  else {
    const agreement = value.providerAgreement as Record<string, unknown>;
    const keys = ["criticalBlockHashes", "discoveredReceiptChecks", "endingBalance", "exhaustiveReceiptEvidence", "finalizedHead", "logEvidence", "startingBalance"];
    if (Object.keys(agreement).sort().join() !== keys.sort().join() || typeof agreement.logEvidence !== "boolean" || typeof agreement.discoveredReceiptChecks !== "boolean" || !(typeof agreement.exhaustiveReceiptEvidence === "boolean" || agreement.exhaustiveReceiptEvidence === null) || ["startingBalance", "endingBalance", "criticalBlockHashes", "finalizedHead"].some((key) => typeof agreement[key] !== "boolean")) errors.push("Malformed providerAgreement.");
  }
  if (!record(value.logRangeCoverage) || Object.keys(value.logRangeCoverage).sort().join() !== ["chunks", "complete", "fromBlock", "retries", "successfulChunks", "toBlock"].sort().join() || typeof value.logRangeCoverage.complete !== "boolean" || !safeIndex(value.logRangeCoverage.chunks) || !safeIndex(value.logRangeCoverage.successfulChunks) || !safeIndex(value.logRangeCoverage.retries) || typeof value.logRangeCoverage.fromBlock !== "string" || !decimal.test(value.logRangeCoverage.fromBlock) || typeof value.logRangeCoverage.toBlock !== "string" || !decimal.test(value.logRangeCoverage.toBlock)) errors.push("Malformed logRangeCoverage.");
  if (!record(value.discoveredEventReceiptChecks) || Object.keys(value.discoveredEventReceiptChecks).sort().join() !== ["checksPerformed", "complete", "digest", "eventsChecked"].sort().join() || typeof value.discoveredEventReceiptChecks.complete !== "boolean" || !safeIndex(value.discoveredEventReceiptChecks.eventsChecked) || !safeIndex(value.discoveredEventReceiptChecks.checksPerformed) || typeof value.discoveredEventReceiptChecks.digest !== "string" || !digest64.test(value.discoveredEventReceiptChecks.digest)) errors.push("Malformed discoveredEventReceiptChecks.");
  if (!record(value.exhaustiveReceiptVerification) || Object.keys(value.exhaustiveReceiptVerification).sort().join() !== ["blocksVerified", "completed", "progressDigest", "requested", "totalBlocks"].sort().join() || typeof value.exhaustiveReceiptVerification.requested !== "boolean" || typeof value.exhaustiveReceiptVerification.completed !== "boolean" || typeof value.exhaustiveReceiptVerification.blocksVerified !== "string" || !decimal.test(value.exhaustiveReceiptVerification.blocksVerified) || typeof value.exhaustiveReceiptVerification.totalBlocks !== "string" || !decimal.test(value.exhaustiveReceiptVerification.totalBlocks) || (value.exhaustiveReceiptVerification.progressDigest !== null && (typeof value.exhaustiveReceiptVerification.progressDigest !== "string" || !digest64.test(value.exhaustiveReceiptVerification.progressDigest)))) errors.push("Malformed exhaustiveReceiptVerification.");
  if (!Array.isArray(value.limitations) || value.limitations.some((item) => typeof item !== "string" || !item)) errors.push("limitations must contain non-empty strings.");
  const terminal = value.proofResult === "PROVEN" || value.proofResult === "NOT_PROVEN";
  if (terminal && (value.windowStatus !== "COMPLETE" || value.evidenceStatus !== "COMPLETE" || value.finalityStatus !== "FINALIZED")) errors.push("Terminal result requires complete finalized evidence.");
  if (value.proofResult === "PROVEN" && value.breachStatus === "OBSERVED") errors.push("Observed breach cannot be PROVEN.");
  if (value.proofResult === "NOT_PROVEN" && value.breachStatus !== "OBSERVED") errors.push("NOT_PROVEN requires an observed breach.");
  if (value.windowStatus === "ACTIVE" && terminal) errors.push("ACTIVE window cannot have a terminal result.");
  if (value.finalityStatus === "WAITING" && terminal) errors.push("WAITING finality cannot have a terminal result.");
  if (value.evidenceStatus !== "COMPLETE" && terminal) errors.push("Incomplete or disagreeing evidence cannot have a terminal result.");
  if (typeof value.minimumObservedBaseUnits === "string" && decimal.test(value.minimumObservedBaseUnits) && typeof value.minimumRequiredBaseUnits === "string" && decimal.test(value.minimumRequiredBaseUnits)) {
    if (value.breachStatus === "OBSERVED" && BigInt(value.minimumObservedBaseUnits) >= BigInt(value.minimumRequiredBaseUnits)) errors.push("Observed breach conflicts with recorded minimum.");
    if (value.breachStatus === "NOT_OBSERVED" && BigInt(value.minimumObservedBaseUnits) < BigInt(value.minimumRequiredBaseUnits)) errors.push("NOT_OBSERVED conflicts with recorded minimum.");
  }
  if (typeof value.startBlock === "string" && decimal.test(value.startBlock) && typeof value.endBlock === "string" && decimal.test(value.endBlock) && BigInt(value.startBlock) > BigInt(value.endBlock)) errors.push("startBlock must not exceed endBlock.");
  if (value.finalityStatus === "FINALIZED" && typeof value.finalizedBlock === "string" && decimal.test(value.finalizedBlock) && typeof value.endBlock === "string" && decimal.test(value.endBlock) && BigInt(value.finalizedBlock) < BigInt(value.endBlock)) errors.push("FINALIZED requires finalizedBlock at or above endBlock.");
  if (value.assuranceLevel === "CORROBORATED" && (!Array.isArray(value.limitations) || !value.limitations.includes(CORROBORATED_LIMITATION))) errors.push("CORROBORATED receipt must disclose the correlated-omission limitation.");
  if (terminal && record(value.logRangeCoverage) && value.logRangeCoverage.complete !== true) errors.push("Terminal result requires complete log-range coverage.");
  if (terminal && record(value.discoveredEventReceiptChecks) && value.discoveredEventReceiptChecks.complete !== true) errors.push("Terminal result requires complete discovered-event receipt checks.");
  if (terminal && record(value.providerAgreement)) {
    const agreement = value.providerAgreement as Record<string, unknown>;
    if (["logEvidence", "discoveredReceiptChecks", "startingBalance", "endingBalance", "criticalBlockHashes", "finalizedHead"].some((key) => agreement[key] !== true)) errors.push("Terminal result requires every CORROBORATED provider agreement.");
  }
  if (terminal && record(value.logRangeCoverage) && value.logRangeCoverage.chunks !== value.logRangeCoverage.successfulChunks) errors.push("Terminal result requires every log chunk to succeed.");
  if (value.assuranceLevel === "EXHAUSTIVE" && (!record(value.exhaustiveReceiptVerification) || value.exhaustiveReceiptVerification.requested !== true || value.exhaustiveReceiptVerification.completed !== true || value.exhaustiveReceiptVerification.blocksVerified !== value.exhaustiveReceiptVerification.totalBlocks || !record(value.providerAgreement) || value.providerAgreement.exhaustiveReceiptEvidence !== true)) errors.push("EXHAUSTIVE assurance requires complete full-window receipt verification and agreement.");
  let recomputedDigest: string | undefined;
  if (checkDigest && typeof value.receiptDigest === "string") { const { receiptDigest: _stored, ...unsigned } = value; recomputedDigest = sha256Canonical(unsigned); if (recomputedDigest !== value.receiptDigest) errors.push("receiptDigest mismatch."); }
  return { valid: errors.length === 0, errors, recomputedDigest };
}

export function createReceiptV3(input: ReceiptV3Input): ReceiptV3 {
  const raw = input as unknown as Record<string, unknown>;
  for (const key of ["schemaVersion", "canonicalSerialization", "receiptDigest"]) if (Object.prototype.hasOwnProperty.call(raw, key)) throw new Error(`${key} must not be supplied to the Receipt V3 constructor.`);
  const providers = [...input.providers].sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
  const unsigned = { ...input, providers, schemaVersion: RECEIPT_V3_SCHEMA, canonicalSerialization: RECEIPT_V3_CANONICALIZATION };
  const receipt = { ...unsigned, receiptDigest: sha256Canonical(unsigned) } as ReceiptV3;
  const validation = validateReceiptV3(receipt, true); if (!validation.valid) throw new Error(`Invalid Receipt V3: ${validation.errors.join(" ")}`);
  return receipt;
}
export function verifyReceiptV3(value: unknown): ReceiptV3VerificationResult { return validateReceiptV3(value, true); }

export type Phase5Comparable = { commitmentId: string; subject: string; token: string; minimumRequiredBaseUnits: string; startBlock: string; endBlock: string; startingBalanceBaseUnits: string; pathBaseUnits: string[]; minimumObservedBaseUnits: string; minimumCausingBlock: string; minimumCausingTransactionHash: string; finalBalanceBaseUnits: string; proofResult: string };
export function comparePhase5AndPhase6(phase5: Phase5Comparable, phase6: Phase5Comparable): { agreement: boolean; mismatches: string[] } {
  const mismatches = Object.keys(phase5).filter((key) => canonicalJson(phase5[key as keyof Phase5Comparable]) !== canonicalJson(phase6[key as keyof Phase5Comparable]));
  return { agreement: mismatches.length === 0, mismatches };
}
