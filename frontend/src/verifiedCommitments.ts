export const VERIFIED_COMMITMENT_SCHEMA = "sicher.frontend.verified-commitment/1.0" as const;
export const VERIFIED_COMMITMENTS_SCHEMA = "sicher.frontend.verified-commitments/1.0" as const;

export type ProofResult = "PROVEN" | "NOT_PROVEN" | "PENDING" | "INDETERMINATE";
export type AssuranceLevel = "CORROBORATED" | "EXHAUSTIVE";

export type VerifiedCommitmentView = Readonly<{
  schemaVersion: typeof VERIFIED_COMMITMENT_SCHEMA;
  id: string;
  proofResult: ProofResult;
  proofStatusLabel: string;
  assuranceLevel: AssuranceLevel;
  assuranceLabel: string;
  creator: `0x${string}`;
  subject: `0x${string}`;
  token: `0x${string}`;
  tokenSymbol: string;
  tokenDecimals: number;
  proofType: string;
  minimumRequiredBaseUnits: string;
  minimumRequiredFormatted: string;
  minimumObservedBaseUnits: string;
  minimumObservedFormatted: string;
  startingBalanceBaseUnits: string;
  startingBalanceFormatted: string;
  finalBalanceBaseUnits: string;
  finalBalanceFormatted: string;
  startBlock: string;
  startBlockHash: `0x${string}`;
  endBlock: string;
  endBlockHash: `0x${string}`;
  windowStatus: string;
  breachStatus: string;
  evidenceStatus: string;
  finalityStatus: string;
  minimumCausingEvidence: Readonly<{
    blockNumber: string;
    blockHash: `0x${string}`;
    transactionHash: `0x${string}` | null;
    transactionIndex: number | null;
    logIndex: number | null;
  }>;
  receiptDigest: string;
  limitations: readonly string[];
  providers: readonly string[];
  pathBaseUnits?: readonly string[];
  pathFormatted?: readonly string[];
  pathProvenance?: Readonly<{
    validated: true;
    method: "FROZEN_RECONSTRUCTION_CORE" | "FROZEN_PHASE5_PHASE6_CROSSCHECK";
    sources: readonly string[];
  }>;
  provenance: Readonly<{
    frozenBackendCommit: string;
    freezeVersion: string;
    receiptArtifact: string;
    evidenceManifestDigest: string;
    verifierFingerprint: string;
    coreFingerprint: string;
  }>;
}>;

export type VerifiedCommitmentsDocument = Readonly<{
  schemaVersion: typeof VERIFIED_COMMITMENTS_SCHEMA;
  commitments: Readonly<Record<string, VerifiedCommitmentView>>;
}>;

export type VerifiedCommitmentErrorCode =
  | "NOT_FOUND"
  | "UNAVAILABLE"
  | "MALFORMED"
  | "UNSUPPORTED_SCHEMA";

export class VerifiedCommitmentDataError extends Error {
  readonly code: VerifiedCommitmentErrorCode;

  constructor(code: VerifiedCommitmentErrorCode, message: string) {
    super(message);
    this.name = "VerifiedCommitmentDataError";
    this.code = code;
  }
}

const decimal = /^(0|[1-9][0-9]*)$/;
const address = /^0x[0-9a-fA-F]{40}$/;
const hash = /^0x[0-9a-fA-F]{64}$/;
const digest = /^[0-9a-f]{64}$/;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function requireString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new VerifiedCommitmentDataError("MALFORMED", `${field} must be a non-empty string.`);
  }
}

function validateView(value: unknown): VerifiedCommitmentView {
  if (!record(value)) throw new VerifiedCommitmentDataError("MALFORMED", "Commitment view must be an object.");
  if (value.schemaVersion !== VERIFIED_COMMITMENT_SCHEMA) {
    throw new VerifiedCommitmentDataError("UNSUPPORTED_SCHEMA", "Unsupported commitment view schema.");
  }
  for (const field of [
    "id", "proofStatusLabel", "assuranceLabel", "tokenSymbol", "proofType",
    "minimumRequiredBaseUnits", "minimumRequiredFormatted", "minimumObservedBaseUnits",
    "minimumObservedFormatted", "startingBalanceBaseUnits", "startingBalanceFormatted",
    "finalBalanceBaseUnits", "finalBalanceFormatted", "startBlock", "startBlockHash", "endBlock", "endBlockHash",
    "windowStatus", "breachStatus", "evidenceStatus", "finalityStatus", "receiptDigest",
  ]) requireString(value[field], field);
  if (!["PROVEN", "NOT_PROVEN", "PENDING", "INDETERMINATE"].includes(value.proofResult as string)) {
    throw new VerifiedCommitmentDataError("MALFORMED", "Unsupported proofResult.");
  }
  if (!["CORROBORATED", "EXHAUSTIVE"].includes(value.assuranceLevel as string)) {
    throw new VerifiedCommitmentDataError("MALFORMED", "Unsupported assuranceLevel.");
  }
  for (const field of ["creator", "subject", "token"]) {
    if (typeof value[field] !== "string" || !address.test(value[field])) {
      throw new VerifiedCommitmentDataError("MALFORMED", `${field} must be an address.`);
    }
  }
  if (!Number.isSafeInteger(value.tokenDecimals) || (value.tokenDecimals as number) < 0) {
    throw new VerifiedCommitmentDataError("MALFORMED", "tokenDecimals must be a non-negative safe integer.");
  }
  for (const field of ["minimumRequiredBaseUnits", "minimumObservedBaseUnits", "startingBalanceBaseUnits", "finalBalanceBaseUnits", "startBlock", "endBlock"]) {
    if (!decimal.test(value[field] as string)) throw new VerifiedCommitmentDataError("MALFORMED", `${field} must be a decimal string.`);
  }
  if (!digest.test(value.receiptDigest as string)) throw new VerifiedCommitmentDataError("MALFORMED", "receiptDigest must be a SHA-256 digest.");
  for (const field of ["startBlockHash", "endBlockHash"]) if (!hash.test(value[field] as string)) throw new VerifiedCommitmentDataError("MALFORMED", `${field} must be a block hash.`);
  if (!Array.isArray(value.limitations) || value.limitations.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new VerifiedCommitmentDataError("MALFORMED", "limitations must be non-empty strings.");
  }
  if (!Array.isArray(value.providers) || value.providers.length === 0 || value.providers.some((item) => typeof item !== "string" || item.length === 0)) throw new VerifiedCommitmentDataError("MALFORMED", "providers must contain public provider identifiers.");
  if (!record(value.minimumCausingEvidence)) throw new VerifiedCommitmentDataError("MALFORMED", "minimumCausingEvidence is required.");
  const evidence = value.minimumCausingEvidence;
  if (typeof evidence.blockNumber !== "string" || !decimal.test(evidence.blockNumber) || typeof evidence.blockHash !== "string" || !hash.test(evidence.blockHash)) {
    throw new VerifiedCommitmentDataError("MALFORMED", "minimumCausingEvidence block context is malformed.");
  }
  if (evidence.transactionHash !== null && (typeof evidence.transactionHash !== "string" || !hash.test(evidence.transactionHash))) {
    throw new VerifiedCommitmentDataError("MALFORMED", "minimumCausingEvidence transactionHash is malformed.");
  }
  for (const field of ["transactionIndex", "logIndex"]) {
    if (evidence[field] !== null && (!Number.isSafeInteger(evidence[field]) || (evidence[field] as number) < 0)) {
      throw new VerifiedCommitmentDataError("MALFORMED", `minimumCausingEvidence ${field} is malformed.`);
    }
  }
  const hasPath = value.pathBaseUnits !== undefined || value.pathFormatted !== undefined || value.pathProvenance !== undefined;
  if (hasPath) {
    if (!Array.isArray(value.pathBaseUnits) || value.pathBaseUnits.length === 0 || value.pathBaseUnits.some((item) => typeof item !== "string" || !decimal.test(item))) {
      throw new VerifiedCommitmentDataError("MALFORMED", "pathBaseUnits is malformed.");
    }
    if (!Array.isArray(value.pathFormatted) || value.pathFormatted.length !== value.pathBaseUnits.length || value.pathFormatted.some((item) => typeof item !== "string" || item.length === 0)) {
      throw new VerifiedCommitmentDataError("MALFORMED", "pathFormatted is malformed.");
    }
    if (!record(value.pathProvenance) || value.pathProvenance.validated !== true || !["FROZEN_RECONSTRUCTION_CORE", "FROZEN_PHASE5_PHASE6_CROSSCHECK"].includes(value.pathProvenance.method as string) || !Array.isArray(value.pathProvenance.sources) || value.pathProvenance.sources.length === 0 || value.pathProvenance.sources.some((item) => typeof item !== "string" || item.length === 0)) {
      throw new VerifiedCommitmentDataError("MALFORMED", "Validated path provenance is required whenever a path is exposed.");
    }
  }
  if (!record(value.provenance)) throw new VerifiedCommitmentDataError("MALFORMED", "provenance is required.");
  for (const field of ["frozenBackendCommit", "freezeVersion", "receiptArtifact", "evidenceManifestDigest", "verifierFingerprint", "coreFingerprint"]) requireString(value.provenance[field], `provenance.${field}`);
  return value as unknown as VerifiedCommitmentView;
}

export function validateVerifiedCommitmentsDocument(value: unknown): VerifiedCommitmentsDocument {
  if (!record(value)) throw new VerifiedCommitmentDataError("MALFORMED", "Prepared commitment data must be an object.");
  if (value.schemaVersion !== VERIFIED_COMMITMENTS_SCHEMA) {
    throw new VerifiedCommitmentDataError("UNSUPPORTED_SCHEMA", "Unsupported prepared commitment data schema.");
  }
  if (!record(value.commitments)) throw new VerifiedCommitmentDataError("MALFORMED", "Prepared commitments map is required.");
  const commitments = Object.fromEntries(Object.entries(value.commitments).map(([id, item]) => {
    const view = validateView(item);
    if (view.id !== id) throw new VerifiedCommitmentDataError("MALFORMED", "Commitment map key does not match its view ID.");
    return [id, view];
  }));
  return deepFreeze({ schemaVersion: VERIFIED_COMMITMENTS_SCHEMA, commitments });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export async function getVerifiedCommitment(
  id: string,
  options: { fetchImpl?: typeof fetch; url?: string } = {},
): Promise<VerifiedCommitmentView> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(options.url ?? "/data/commitments.json", { cache: "no-store" });
  } catch {
    throw new VerifiedCommitmentDataError("UNAVAILABLE", "Verified commitment data is unavailable.");
  }
  if (!response.ok) throw new VerifiedCommitmentDataError("UNAVAILABLE", "Verified commitment data is unavailable.");
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new VerifiedCommitmentDataError("MALFORMED", "Verified commitment data is malformed.");
  }
  const document = validateVerifiedCommitmentsDocument(raw);
  const commitment = document.commitments[id];
  if (!commitment) throw new VerifiedCommitmentDataError("NOT_FOUND", `Verified commitment ${id} was not found.`);
  return commitment;
}
