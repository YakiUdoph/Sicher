import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Address, Hex } from "viem";
import { reconstructMinimum, type TransferEvidence as Phase5TransferEvidence } from "./min-balance-core.ts";
import { sha256Canonical } from "./phase6-evidence-core.ts";
import { verifyReceiptV3, type ReceiptV3 } from "./phase6-assurance-core.ts";
import {
  VERIFIED_COMMITMENT_SCHEMA,
  VERIFIED_COMMITMENTS_SCHEMA,
  type VerifiedCommitmentView,
  type VerifiedCommitmentsDocument,
} from "../frontend/src/verifiedCommitments.ts";

export const FROZEN_BACKEND_COMMIT = "8110370f95384691bd379d55207a20e73677609f";
export const FRONTEND_DATA_OUTPUT = "frontend/public/data/commitments.json";
const FREEZE_MANIFEST = "evidence/phase6-competition-freeze.json";
const CROSSCHECK = "evidence/phase6b2-phase5-phase6-crosscheck.json";

type JsonRecord = Record<string, unknown>;
type ReceiptEnvelope = { evidenceManifest: JsonRecord; receipt: ReceiptV3 };
type FreezeManifest = JsonRecord & {
  freezeVersion: string;
  freezeStatus: string;
  chainId: string;
  registryAddress: string;
  receiptSchemaVersion: string;
  verifierFingerprint: string;
  combinedCoreFingerprint: string;
  criticalFileFingerprints: Record<string, string>;
  phase5FrozenFingerprints: Record<string, string>;
  tokenModelBoundary: { token: string; symbol: string };
  commitment1: { commitmentId: string; proofResult: string; assuranceLevel: string; receiptDigest: string; artifact: string };
  commitment2: { commitmentId: string; proofResult: string; assuranceLevel: string; receiptDigest: string; artifact: string };
  phase5CrossCheck: { status: string; agreement: boolean; mismatchCount: number; artifact: string };
};

const record = (value: unknown): value is JsonRecord => value !== null && typeof value === "object" && !Array.isArray(value);
const decimal = /^(0|[1-9][0-9]*)$/;

export class FrontendDataPreparationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrontendDataPreparationError";
  }
}

export function readJsonArtifact(path: string): unknown {
  let source: string;
  try { source = readFileSync(path, "utf8"); }
  catch { throw new FrontendDataPreparationError(`Required artifact is unavailable: ${path}`); }
  try { return JSON.parse(source) as unknown; }
  catch { throw new FrontendDataPreparationError(`Required artifact is malformed JSON: ${path}`); }
}

function requireEnvelope(value: unknown, artifact: string): ReceiptEnvelope {
  if (!record(value) || !record(value.evidenceManifest) || !record(value.receipt)) {
    throw new FrontendDataPreparationError(`Receipt envelope is malformed: ${artifact}`);
  }
  return value as unknown as ReceiptEnvelope;
}

function requireFreezeManifest(value: unknown): FreezeManifest {
  if (!record(value) || value.freezeStatus !== "FROZEN" || typeof value.freezeVersion !== "string" || typeof value.chainId !== "string" || typeof value.registryAddress !== "string" || typeof value.receiptSchemaVersion !== "string" || typeof value.verifierFingerprint !== "string" || typeof value.combinedCoreFingerprint !== "string" || !record(value.criticalFileFingerprints) || !record(value.phase5FrozenFingerprints) || !record(value.tokenModelBoundary) || !record(value.commitment1) || !record(value.commitment2) || !record(value.phase5CrossCheck)) {
    throw new FrontendDataPreparationError("Competition freeze manifest is malformed or not frozen.");
  }
  return value as unknown as FreezeManifest;
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function verifyFrozenPackage(rootDir: string, freeze: FreezeManifest): void {
  for (const [path, expected] of Object.entries({ ...freeze.criticalFileFingerprints, ...freeze.phase5FrozenFingerprints })) {
    let actual: string;
    try { actual = sha256File(resolve(rootDir, path)); }
    catch { throw new FrontendDataPreparationError(`Frozen file is unavailable: ${path}`); }
    if (actual !== expected) throw new FrontendDataPreparationError(`Frozen file fingerprint mismatch: ${path}`);
  }
}

function formatBaseUnits(value: string, decimals: number, symbol: string): string {
  if (!decimal.test(value) || !Number.isSafeInteger(decimals) || decimals < 0) throw new FrontendDataPreparationError("Cannot format malformed token units.");
  const units = BigInt(value);
  const scale = 10n ** BigInt(decimals);
  const whole = units / scale;
  const fraction = (units % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""} ${symbol}`;
}

function proofLabel(result: ReceiptV3["proofResult"]): string {
  return ({ PROVEN: "Proven", NOT_PROVEN: "Not proven", PENDING: "Proof running", INDETERMINATE: "Checking" })[result];
}

function assuranceLabel(level: ReceiptV3["assuranceLevel"]): string {
  return level === "CORROBORATED" ? "Corroborated" : "Exhaustive";
}

function evidenceEvents(manifest: JsonRecord): Phase5TransferEvidence[] {
  if (!Array.isArray(manifest.orderedRelevantEvidence)) throw new FrontendDataPreparationError("Evidence manifest has no ordered relevant evidence.");
  return manifest.orderedRelevantEvidence.map((raw, index) => {
    if (!record(raw) || typeof raw.from !== "string" || typeof raw.to !== "string" || typeof raw.valueBaseUnits !== "string" || !decimal.test(raw.valueBaseUnits) || typeof raw.blockNumber !== "string" || !decimal.test(raw.blockNumber) || typeof raw.transactionHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(raw.transactionHash) || !Number.isSafeInteger(raw.transactionIndex) || !Number.isSafeInteger(raw.logIndex)) {
      throw new FrontendDataPreparationError(`Evidence manifest event ${index} is malformed.`);
    }
    return {
      from: raw.from as Address,
      to: raw.to as Address,
      value: BigInt(raw.valueBaseUnits),
      blockNumber: BigInt(raw.blockNumber),
      transactionIndex: raw.transactionIndex as number,
      logIndex: raw.logIndex as number,
      transactionHash: raw.transactionHash as Hex,
    };
  });
}

function reconstructBoundPath(envelope: ReceiptEnvelope): string[] {
  const receipt = envelope.receipt;
  if (sha256Canonical(envelope.evidenceManifest) !== receipt.evidenceManifestDigest) {
    throw new FrontendDataPreparationError("Evidence manifest digest mismatch.");
  }
  const result = reconstructMinimum({
    subject: receipt.subject,
    startBlock: BigInt(receipt.startBlock),
    endBlock: BigInt(receipt.endBlock),
    currentBlock: BigInt(receipt.endBlock),
    minimumBalance: BigInt(receipt.minimumRequiredBaseUnits),
    startingBalance: BigInt(receipt.startingBalanceBaseUnits),
    events: evidenceEvents(envelope.evidenceManifest),
    evidenceComplete: true,
  });
  const expectedVerdict = receipt.proofResult === "PROVEN" ? "PASS" : receipt.proofResult === "NOT_PROVEN" ? "FAIL" : null;
  if (expectedVerdict === null || result.verdict !== expectedVerdict || result.minimum?.balance.toString() !== receipt.minimumObservedBaseUnits || result.finalBalance?.toString() !== receipt.finalBalanceBaseUnits) {
    throw new FrontendDataPreparationError("Frozen reconstruction does not match the validated Receipt V3 result.");
  }
  return result.balances.map((point) => point.balance.toString());
}

function validateCrosscheck(value: unknown, receipt: ReceiptV3, receiptArtifact: string, reconstructedPath: string[], freeze: FreezeManifest): string[] {
  if (!record(value) || value.schemaVersion !== "sicher.phase5-phase6-crosscheck/1.0" || value.agreement !== true || !Array.isArray(value.mismatches) || value.mismatches.length !== 0 || value.phase6Path !== receiptArtifact || !record(value.phase6)) {
    throw new FrontendDataPreparationError("Phase 5/Phase 6 cross-check is invalid.");
  }
  if (freeze.phase5CrossCheck.status !== "PASS" || freeze.phase5CrossCheck.agreement !== true || freeze.phase5CrossCheck.mismatchCount !== 0 || freeze.phase5CrossCheck.artifact !== CROSSCHECK) {
    throw new FrontendDataPreparationError("Freeze manifest does not bind the expected Phase 5/Phase 6 cross-check.");
  }
  const phase6 = value.phase6;
  const comparisons: Array<[unknown, unknown]> = [
    [phase6.commitmentId, receipt.commitmentId], [phase6.subject, receipt.subject], [phase6.token, receipt.token],
    [phase6.minimumRequiredBaseUnits, receipt.minimumRequiredBaseUnits], [phase6.startBlock, receipt.startBlock],
    [phase6.endBlock, receipt.endBlock], [phase6.startingBalanceBaseUnits, receipt.startingBalanceBaseUnits],
    [phase6.minimumObservedBaseUnits, receipt.minimumObservedBaseUnits], [phase6.finalBalanceBaseUnits, receipt.finalBalanceBaseUnits],
    [phase6.proofResult, receipt.proofResult], [phase6.minimumCausingBlock, receipt.minimumCausingEvidence.blockNumber],
    [phase6.minimumCausingTransactionHash, receipt.minimumCausingEvidence.transactionHash],
  ];
  if (comparisons.some(([left, right]) => left !== right) || !Array.isArray(phase6.pathBaseUnits) || phase6.pathBaseUnits.some((item) => typeof item !== "string" || !decimal.test(item)) || JSON.stringify(phase6.pathBaseUnits) !== JSON.stringify(reconstructedPath)) {
    throw new FrontendDataPreparationError("Cross-check path is not bound to the validated receipt and frozen reconstruction.");
  }
  return phase6.pathBaseUnits as string[];
}

export function prepareVerifiedCommitment(input: {
  envelopeValue: unknown;
  freezeValue: unknown;
  receiptArtifact: string;
  crosscheckValue?: unknown;
}): VerifiedCommitmentView {
  const envelope = requireEnvelope(input.envelopeValue, input.receiptArtifact);
  const freeze = requireFreezeManifest(input.freezeValue);
  const validation = verifyReceiptV3(envelope.receipt);
  if (!validation.valid) throw new FrontendDataPreparationError(`Receipt V3 validation failed: ${validation.errors.join(" ")}`);
  const receipt = envelope.receipt;
  const frozenCommitment = receipt.commitmentId === "1" ? freeze.commitment1 : receipt.commitmentId === "2" ? freeze.commitment2 : null;
  if (!frozenCommitment || frozenCommitment.artifact !== input.receiptArtifact || frozenCommitment.commitmentId !== receipt.commitmentId || frozenCommitment.receiptDigest !== receipt.receiptDigest || frozenCommitment.proofResult !== receipt.proofResult || frozenCommitment.assuranceLevel !== receipt.assuranceLevel) {
    throw new FrontendDataPreparationError("Receipt is not the commitment artifact bound by the freeze manifest.");
  }
  if (receipt.schemaVersion !== freeze.receiptSchemaVersion || receipt.chainId !== freeze.chainId || receipt.registryAddress.toLowerCase() !== freeze.registryAddress.toLowerCase() || receipt.verifierFingerprint !== freeze.verifierFingerprint || receipt.coreFingerprint !== freeze.combinedCoreFingerprint || receipt.token.toLowerCase() !== freeze.tokenModelBoundary.token.toLowerCase()) {
    throw new FrontendDataPreparationError("Receipt identity or frozen implementation fingerprint mismatch.");
  }
  const reconstructedPath = reconstructBoundPath(envelope);
  const path = receipt.commitmentId === "2"
    ? validateCrosscheck(input.crosscheckValue, receipt, input.receiptArtifact, reconstructedPath, freeze)
    : reconstructedPath;
  const symbol = freeze.tokenModelBoundary.symbol;
  return {
    schemaVersion: VERIFIED_COMMITMENT_SCHEMA,
    id: receipt.commitmentId,
    proofResult: receipt.proofResult,
    proofStatusLabel: proofLabel(receipt.proofResult),
    assuranceLevel: receipt.assuranceLevel,
    assuranceLabel: assuranceLabel(receipt.assuranceLevel),
    creator: receipt.creator,
    subject: receipt.subject,
    token: receipt.token,
    tokenSymbol: symbol,
    tokenDecimals: receipt.tokenDecimals,
    proofType: receipt.proofType,
    minimumRequiredBaseUnits: receipt.minimumRequiredBaseUnits,
    minimumRequiredFormatted: formatBaseUnits(receipt.minimumRequiredBaseUnits, receipt.tokenDecimals, symbol),
    minimumObservedBaseUnits: receipt.minimumObservedBaseUnits,
    minimumObservedFormatted: formatBaseUnits(receipt.minimumObservedBaseUnits, receipt.tokenDecimals, symbol),
    startingBalanceBaseUnits: receipt.startingBalanceBaseUnits,
    startingBalanceFormatted: formatBaseUnits(receipt.startingBalanceBaseUnits, receipt.tokenDecimals, symbol),
    finalBalanceBaseUnits: receipt.finalBalanceBaseUnits,
    finalBalanceFormatted: formatBaseUnits(receipt.finalBalanceBaseUnits, receipt.tokenDecimals, symbol),
    startBlock: receipt.startBlock,
    startBlockHash: receipt.startBlockHash,
    endBlock: receipt.endBlock,
    endBlockHash: receipt.endBlockHash,
    windowStatus: receipt.windowStatus,
    breachStatus: receipt.breachStatus,
    evidenceStatus: receipt.evidenceStatus,
    finalityStatus: receipt.finalityStatus,
    minimumCausingEvidence: receipt.minimumCausingEvidence,
    receiptDigest: receipt.receiptDigest,
    limitations: receipt.limitations,
    providers: receipt.providers.map((provider) => provider.id),
    pathBaseUnits: path,
    pathFormatted: path.map((value) => formatBaseUnits(value, receipt.tokenDecimals, symbol)),
    pathProvenance: {
      validated: true,
      method: receipt.commitmentId === "2" ? "FROZEN_PHASE5_PHASE6_CROSSCHECK" : "FROZEN_RECONSTRUCTION_CORE",
      sources: receipt.commitmentId === "2"
        ? [input.receiptArtifact, CROSSCHECK, "scripts/min-balance-core.ts"]
        : [input.receiptArtifact, "scripts/min-balance-core.ts"],
    },
    provenance: {
      frozenBackendCommit: FROZEN_BACKEND_COMMIT,
      freezeVersion: freeze.freezeVersion,
      receiptArtifact: input.receiptArtifact,
      evidenceManifestDigest: receipt.evidenceManifestDigest,
      verifierFingerprint: receipt.verifierFingerprint,
      coreFingerprint: receipt.coreFingerprint,
    },
  };
}

export function prepareVerifiedCommitments(rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)))): VerifiedCommitmentsDocument {
  const freeze = requireFreezeManifest(readJsonArtifact(resolve(rootDir, FREEZE_MANIFEST)));
  verifyFrozenPackage(rootDir, freeze);
  const crosscheck = readJsonArtifact(resolve(rootDir, CROSSCHECK));
  const commitments = Object.fromEntries([freeze.commitment1, freeze.commitment2].map((item) => {
    const view = prepareVerifiedCommitment({
      envelopeValue: readJsonArtifact(resolve(rootDir, item.artifact)),
      freezeValue: freeze,
      receiptArtifact: item.artifact,
      crosscheckValue: item.commitmentId === "2" ? crosscheck : undefined,
    });
    return [view.id, view];
  }));
  return { schemaVersion: VERIFIED_COMMITMENTS_SCHEMA, commitments };
}

export function writeVerifiedCommitments(rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)))): string {
  const output = resolve(rootDir, FRONTEND_DATA_OUTPUT);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(prepareVerifiedCommitments(rootDir), null, 2)}\n`, "utf8");
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = writeVerifiedCommitments();
  console.log(`Verified frontend commitment data prepared: ${output}`);
}
