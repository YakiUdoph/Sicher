import { VERIFIED_COMMITMENTS_SCHEMA, VERIFIED_COMMITMENT_SCHEMA, validateVerifiedCommitmentsDocument, type VerifiedCommitmentsDocument, type VerifiedCommitmentView } from "./verifiedCommitments.ts";
import { formatUnits } from "viem";

const INDEX_SCHEMA = "sicher.public-result-index/1.0";
const DOCUMENT_SCHEMA = "sicher.public-result/1.0";
const CHAIN_ID = "99801";
const REGISTRY = "0x4e4887e28a8370678a9a37c08a85c65450b510c0";
const VERIFIER = "681a77d7253a969c99d69f23b33bdbf87a2d026e3849e72fc6625e29e9a58379";
const CORE = "2c7ed9c6624db964a247d28c327afc9a4633a6699e2d9d05ad35cf21859649a6";
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const decimal = /^(0|[1-9][0-9]*)$/;
const digest = /^[0-9a-f]{64}$/;
const formatted = (value: unknown, decimals: unknown) => `${formatUnits(BigInt(String(value)), Number(decimals))} STEST`;

function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("Non-finite JSON number."); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  throw new Error("Unsupported canonical JSON value.");
}
async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type RuntimeResultLoad = Readonly<{ state: "unconfigured" | "operational" | "delayed"; commitments: VerifiedCommitmentsDocument }>;

export async function loadRuntimeResults(input: { baseUrl?: string; fetchImpl?: typeof fetch }): Promise<RuntimeResultLoad> {
  const empty = validateVerifiedCommitmentsDocument({ schemaVersion: VERIFIED_COMMITMENTS_SCHEMA, commitments: {} });
  const baseUrl = input.baseUrl?.replace(/\/$/, "");
  if (!baseUrl) return Object.freeze({ state: "unconfigured", commitments: empty });
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const indexResponse = await fetchImpl(`${baseUrl}/index.json`, { cache: "no-store" });
    if (!indexResponse.ok) throw new Error("index unavailable");
    const index = await indexResponse.json() as unknown;
    if (!record(index) || index.schemaVersion !== INDEX_SCHEMA || index.chainId !== CHAIN_ID || String(index.registryAddress).toLowerCase() !== REGISTRY || !record(index.automation) || index.automation.operational !== true || !record(index.results)) throw new Error("index malformed");
    const views: Record<string, VerifiedCommitmentView> = {};
    for (const [id, rawEntry] of Object.entries(index.results)) {
      if (!record(rawEntry) || !/^[1-9][0-9]*$/.test(id) || rawEntry.commitmentId !== id || rawEntry.chainId !== CHAIN_ID || String(rawEntry.registryAddress).toLowerCase() !== REGISTRY || typeof rawEntry.receiptDigest !== "string" || !digest.test(rawEntry.receiptDigest) || typeof rawEntry.documentDigest !== "string" || !digest.test(rawEntry.documentDigest) || rawEntry.receiptPath !== `receipts/${CHAIN_ID}/${REGISTRY}/${id}/${rawEntry.receiptDigest}.json` || !["PROVEN", "NOT_PROVEN"].includes(String(rawEntry.proofResult)) || !["CORROBORATED", "EXHAUSTIVE"].includes(String(rawEntry.assuranceLevel)) || rawEntry.verifierFingerprint !== VERIFIER || typeof rawEntry.publishedAt !== "string" || Number.isNaN(Date.parse(rawEntry.publishedAt))) throw new Error("entry malformed");
      const response = await fetchImpl(`${baseUrl}/${rawEntry.receiptPath}`, { cache: "no-store" }); if (!response.ok) throw new Error("result unavailable");
      const document = await response.json() as unknown;
      if (!record(document) || document.schemaVersion !== DOCUMENT_SCHEMA || !record(document.envelope) || !record(document.envelope.receipt) || !Array.isArray(document.pathBaseUnits) || typeof document.documentDigest !== "string") throw new Error("result malformed");
      const { documentDigest, ...unsigned } = document;
      if (await sha256(unsigned) !== documentDigest || documentDigest !== rawEntry.documentDigest) throw new Error("result document digest mismatch");
      const receipt = document.envelope.receipt;
      const { receiptDigest, ...unsignedReceipt } = receipt;
      if (await sha256(unsignedReceipt) !== receiptDigest || receiptDigest !== rawEntry.receiptDigest || receipt.verifierFingerprint !== VERIFIER || receipt.coreFingerprint !== CORE || receipt.chainId !== CHAIN_ID || String(receipt.registryAddress).toLowerCase() !== REGISTRY || receipt.commitmentId !== id || receipt.proofResult !== rawEntry.proofResult || receipt.assuranceLevel !== rawEntry.assuranceLevel || !["PROVEN", "NOT_PROVEN"].includes(String(receipt.proofResult)) || !document.pathBaseUnits.every((item) => typeof item === "string" && decimal.test(item))) throw new Error("receipt validation failed");
      const path = document.pathBaseUnits as string[];
      if (path.length === 0 || path[0] !== receipt.startingBalanceBaseUnits || path.at(-1) !== receipt.finalBalanceBaseUnits || path.reduce((minimum, value) => BigInt(minimum) <= BigInt(value) ? minimum : value) !== receipt.minimumObservedBaseUnits) throw new Error("receipt path mismatch");
      if (!record(document.envelope.evidenceManifest) || await sha256(document.envelope.evidenceManifest) !== receipt.evidenceManifestDigest) throw new Error("manifest digest mismatch");
      const view = {
        schemaVersion: VERIFIED_COMMITMENT_SCHEMA, id, proofResult: receipt.proofResult, proofStatusLabel: receipt.proofResult === "PROVEN" ? "Proven" : "Not proven", assuranceLevel: receipt.assuranceLevel, assuranceLabel: receipt.assuranceLevel === "CORROBORATED" ? "Corroborated" : "Exhaustive",
        creator: receipt.creator, subject: receipt.subject, token: receipt.token, tokenSymbol: "STEST", tokenDecimals: receipt.tokenDecimals, proofType: "MIN_BALANCE",
        minimumRequiredBaseUnits: receipt.minimumRequiredBaseUnits, minimumRequiredFormatted: formatted(receipt.minimumRequiredBaseUnits, receipt.tokenDecimals),
        minimumObservedBaseUnits: receipt.minimumObservedBaseUnits, minimumObservedFormatted: formatted(receipt.minimumObservedBaseUnits, receipt.tokenDecimals),
        startingBalanceBaseUnits: receipt.startingBalanceBaseUnits, startingBalanceFormatted: formatted(receipt.startingBalanceBaseUnits, receipt.tokenDecimals),
        finalBalanceBaseUnits: receipt.finalBalanceBaseUnits, finalBalanceFormatted: formatted(receipt.finalBalanceBaseUnits, receipt.tokenDecimals),
        startBlock: receipt.startBlock, startBlockHash: receipt.startBlockHash, endBlock: receipt.endBlock, endBlockHash: receipt.endBlockHash,
        windowStatus: receipt.windowStatus, breachStatus: receipt.breachStatus, evidenceStatus: receipt.evidenceStatus, finalityStatus: receipt.finalityStatus,
        receiptDigest, minimumCausingEvidence: receipt.minimumCausingEvidence, limitations: receipt.limitations, providers: (receipt.providers as Array<{ id: string }>).map((provider) => provider.id),
        pathBaseUnits: document.pathBaseUnits, pathFormatted: document.pathBaseUnits.map((value) => formatted(value, receipt.tokenDecimals)), pathProvenance: { validated: true, method: "FROZEN_RECONSTRUCTION_CORE", sources: [rawEntry.receiptPath] },
        provenance: { frozenBackendCommit: "runtime-publication", freezeVersion: "phase10b", receiptArtifact: rawEntry.receiptPath, evidenceManifestDigest: receipt.evidenceManifestDigest, verifierFingerprint: receipt.verifierFingerprint, coreFingerprint: receipt.coreFingerprint },
      };
      views[id] = validateVerifiedCommitmentsDocument({ schemaVersion: VERIFIED_COMMITMENTS_SCHEMA, commitments: { [id]: view } }).commitments[id];
    }
    return Object.freeze({ state: "operational", commitments: validateVerifiedCommitmentsDocument({ schemaVersion: VERIFIED_COMMITMENTS_SCHEMA, commitments: views }) });
  } catch { return Object.freeze({ state: "delayed", commitments: empty }); }
}
