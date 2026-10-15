import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAddress, isAddress } from "viem";

import { verifyReceiptV3, type ReceiptV3 } from "./phase6-assurance-core.ts";
import { COMPETITION_CHAIN_ID, COMPETITION_REGISTRY, canonicalJson, sha256Canonical } from "./phase6-evidence-core.ts";

export const PHASE10B_INDEX_SCHEMA = "sicher.public-result-index/1.0" as const;
export const PHASE10B_DOCUMENT_SCHEMA = "sicher.public-result/1.0" as const;
export const FROZEN_VERIFIER_FINGERPRINT = "681a77d7253a969c99d69f23b33bdbf87a2d026e3849e72fc6625e29e9a58379";
export const FROZEN_CORE_FINGERPRINT = "2c7ed9c6624db964a247d28c327afc9a4633a6699e2d9d05ad35cf21859649a6";

export type RegistryTerms = Readonly<{ id: string; creator: string; subject: string; token: string; minimumBalanceBaseUnits: string; startBlock: string; endBlock: string }>;
export type VerifierEnvelope = Readonly<{ evidenceManifest: Record<string, unknown>; receipt: ReceiptV3 }>;
export type PublicResultDocument = Readonly<{ schemaVersion: typeof PHASE10B_DOCUMENT_SCHEMA; envelope: VerifierEnvelope; pathBaseUnits: readonly string[]; documentDigest: string }>;
export type PublicResultEntry = Readonly<{ chainId: string; registryAddress: string; commitmentId: string; receiptDigest: string; documentDigest: string; receiptPath: string; proofResult: "PROVEN" | "NOT_PROVEN"; assuranceLevel: "CORROBORATED" | "EXHAUSTIVE"; verifierFingerprint: string; publishedAt: string }>;
export type PublicResultIndex = Readonly<{ schemaVersion: typeof PHASE10B_INDEX_SCHEMA; chainId: string; registryAddress: string; automation: Readonly<{ operational: boolean }>; results: Readonly<Record<string, PublicResultEntry>> }>;

const trusted = new WeakSet<object>();
export type ValidatedVerifierResult = Readonly<{ document: PublicResultDocument; entry: Omit<PublicResultEntry, "publishedAt" | "receiptPath"> }>;
const decimal = /^(0|[1-9][0-9]*)$/;
const digest = /^[0-9a-f]{64}$/;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const sameAddress = (a: string, b: string) => isAddress(a) && isAddress(b) && getAddress(a) === getAddress(b);

function documentHash(unsigned: Omit<PublicResultDocument, "documentDigest">): string {
  return createHash("sha256").update(canonicalJson(unsigned)).digest("hex");
}

export function validateVerifierResult(input: { envelope: unknown; pathBaseUnits: unknown; terms: RegistryTerms; transcript?: string }): ValidatedVerifierResult {
  if (!record(input.envelope) || !record(input.envelope.evidenceManifest) || !record(input.envelope.receipt)) throw new Error("Verifier output envelope is malformed.");
  const receiptCheck = verifyReceiptV3(input.envelope.receipt);
  if (!receiptCheck.valid) throw new Error(`Receipt V3 validation failed: ${receiptCheck.errors.join(" ")}`);
  const receipt = input.envelope.receipt as ReceiptV3;
  if (receipt.proofResult !== "PROVEN" && receipt.proofResult !== "NOT_PROVEN") throw new Error("Only terminal receipts may be published.");
  if (receipt.verifierFingerprint !== FROZEN_VERIFIER_FINGERPRINT || receipt.coreFingerprint !== FROZEN_CORE_FINGERPRINT) throw new Error("Receipt was not produced by the frozen verifier boundary.");
  if (receipt.chainId !== COMPETITION_CHAIN_ID || !sameAddress(receipt.registryAddress, COMPETITION_REGISTRY)) throw new Error("Receipt is bound to the wrong chain or registry.");
  const manifestDigest = sha256Canonical(input.envelope.evidenceManifest);
  if (manifestDigest !== receipt.evidenceManifestDigest) throw new Error("Evidence manifest digest mismatch.");
  const manifest = input.envelope.evidenceManifest;
  if (manifest.chainId !== receipt.chainId || manifest.commitmentId !== receipt.commitmentId || typeof manifest.registryAddress !== "string" || !sameAddress(manifest.registryAddress, receipt.registryAddress)) throw new Error("Evidence manifest binding mismatch.");
  const terms = input.terms;
  if (receipt.commitmentId !== terms.id || !sameAddress(receipt.creator, terms.creator) || !sameAddress(receipt.subject, terms.subject) || !sameAddress(receipt.token, terms.token) || receipt.minimumRequiredBaseUnits !== terms.minimumBalanceBaseUnits || receipt.startBlock !== terms.startBlock || receipt.endBlock !== terms.endBlock) throw new Error("Receipt immutable terms do not match the registry.");
  if (!Array.isArray(input.pathBaseUnits) || input.pathBaseUnits.length === 0 || input.pathBaseUnits.some((value) => typeof value !== "string" || !decimal.test(value))) throw new Error("Verifier path is malformed.");
  const path = input.pathBaseUnits as string[];
  if (path[0] !== receipt.startingBalanceBaseUnits || path.at(-1) !== receipt.finalBalanceBaseUnits || path.reduce((a, b) => BigInt(a) <= BigInt(b) ? a : b) !== receipt.minimumObservedBaseUnits) throw new Error("Verifier path does not agree with the receipt.");
  if (input.transcript && (!input.transcript.includes(`RECEIPT DIGEST: ${receipt.receiptDigest}`) || !input.transcript.includes(`PROOF RESULT: ${receipt.proofResult}`) || !input.transcript.includes(`EVIDENCE MANIFEST DIGEST: ${receipt.evidenceManifestDigest}`))) throw new Error("Verifier transcript does not bind the publication candidate.");
  const unsigned = { schemaVersion: PHASE10B_DOCUMENT_SCHEMA, envelope: input.envelope as VerifierEnvelope, pathBaseUnits: Object.freeze([...path]) };
  const document = Object.freeze({ ...unsigned, documentDigest: documentHash(unsigned) });
  const candidate = Object.freeze({ document, entry: Object.freeze({ chainId: receipt.chainId, registryAddress: receipt.registryAddress, commitmentId: receipt.commitmentId, receiptDigest: receipt.receiptDigest, documentDigest: document.documentDigest, proofResult: receipt.proofResult, assuranceLevel: receipt.assuranceLevel, verifierFingerprint: receipt.verifierFingerprint }) });
  trusted.add(candidate);
  return candidate;
}

export function verifyPublicResultDocument(value: unknown): PublicResultDocument {
  if (!record(value) || value.schemaVersion !== PHASE10B_DOCUMENT_SCHEMA || !record(value.envelope) || !Array.isArray(value.pathBaseUnits) || typeof value.documentDigest !== "string" || !digest.test(value.documentDigest)) throw new Error("Published result document is malformed.");
  const { documentDigest, ...unsigned } = value;
  if (documentHash(unsigned as Omit<PublicResultDocument, "documentDigest">) !== documentDigest) throw new Error("Published result document digest mismatch.");
  const terms = value.envelope.receipt as ReceiptV3;
  validateVerifierResult({ envelope: value.envelope, pathBaseUnits: value.pathBaseUnits, terms: { id: terms.commitmentId, creator: terms.creator, subject: terms.subject, token: terms.token, minimumBalanceBaseUnits: terms.minimumRequiredBaseUnits, startBlock: terms.startBlock, endBlock: terms.endBlock } });
  return value as unknown as PublicResultDocument;
}

export function emptyPublicResultIndex(operational = true): PublicResultIndex {
  return Object.freeze({ schemaVersion: PHASE10B_INDEX_SCHEMA, chainId: COMPETITION_CHAIN_ID, registryAddress: COMPETITION_REGISTRY, automation: Object.freeze({ operational }), results: Object.freeze({}) });
}

export function validatePublicResultIndex(value: unknown): PublicResultIndex {
  if (!record(value) || value.schemaVersion !== PHASE10B_INDEX_SCHEMA || value.chainId !== COMPETITION_CHAIN_ID || typeof value.registryAddress !== "string" || !sameAddress(value.registryAddress, COMPETITION_REGISTRY) || !record(value.automation) || typeof value.automation.operational !== "boolean" || !record(value.results)) throw new Error("Published result index is malformed.");
  for (const [id, raw] of Object.entries(value.results)) {
    if (!/^[1-9][0-9]*$/.test(id) || !record(raw) || raw.commitmentId !== id || raw.chainId !== COMPETITION_CHAIN_ID || typeof raw.registryAddress !== "string" || !sameAddress(raw.registryAddress, COMPETITION_REGISTRY) || typeof raw.receiptDigest !== "string" || !digest.test(raw.receiptDigest) || typeof raw.documentDigest !== "string" || !digest.test(raw.documentDigest) || raw.receiptPath !== `receipts/${COMPETITION_CHAIN_ID}/${COMPETITION_REGISTRY.toLowerCase()}/${id}/${raw.receiptDigest}.json` || !["PROVEN", "NOT_PROVEN"].includes(String(raw.proofResult)) || !["CORROBORATED", "EXHAUSTIVE"].includes(String(raw.assuranceLevel)) || raw.verifierFingerprint !== FROZEN_VERIFIER_FINGERPRINT || typeof raw.publishedAt !== "string" || Number.isNaN(Date.parse(raw.publishedAt))) throw new Error(`Published result index entry #${id} is malformed.`);
  }
  return value as unknown as PublicResultIndex;
}

export async function publishValidatedResult(input: { candidate: ValidatedVerifierResult; storeRoot: string; publishedAt: string; initialOperational?: boolean }): Promise<"published" | "idempotent"> {
  if (!trusted.has(input.candidate)) throw new Error("Publication requires an in-process validated verifier result.");
  if (Number.isNaN(Date.parse(input.publishedAt))) throw new Error("Publication timestamp is invalid.");
  await mkdir(input.storeRoot, { recursive: true });
  const lockPath = join(input.storeRoot, ".phase10b-publish.lock");
  let lock;
  try { lock = await open(lockPath, "wx"); } catch { throw new Error("Another publication is in progress."); }
  try {
    const indexPath = join(input.storeRoot, "index.json");
    let index = emptyPublicResultIndex(input.initialOperational ?? true);
    try { index = validatePublicResultIndex(JSON.parse(await readFile(indexPath, "utf8"))); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const base = input.candidate.entry;
    const receiptPath = `receipts/${COMPETITION_CHAIN_ID}/${COMPETITION_REGISTRY.toLowerCase()}/${base.commitmentId}/${base.receiptDigest}.json`;
    const existing = index.results[base.commitmentId];
    if (existing) {
      if (existing.receiptDigest !== base.receiptDigest || existing.documentDigest !== base.documentDigest) throw new Error(`Conflicting terminal result for commitment #${base.commitmentId}.`);
      const stored = verifyPublicResultDocument(JSON.parse(await readFile(join(input.storeRoot, existing.receiptPath), "utf8")));
      if (stored.documentDigest !== base.documentDigest) throw new Error("Existing content-addressed result differs from the index.");
      return "idempotent";
    }
    const target = join(input.storeRoot, receiptPath); await mkdir(dirname(target), { recursive: true });
    try { await writeFile(target, `${JSON.stringify(input.candidate.document, null, 2)}\n`, { encoding: "utf8", flag: "wx" }); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existingDocument = verifyPublicResultDocument(JSON.parse(await readFile(target, "utf8")));
      if (existingDocument.documentDigest !== base.documentDigest) throw new Error("Content-addressed result path already contains different content.");
    }
    const entry = Object.freeze({ ...base, receiptPath, publishedAt: input.publishedAt });
    const entries: Array<[string, PublicResultEntry]> = [...Object.entries(index.results), [base.commitmentId, entry]];
    const next = { ...index, results: Object.fromEntries(entries.sort(([a], [b]) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0)) };
    const temp = `${indexPath}.${process.pid}.tmp`; await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, "utf8"); await rename(temp, indexPath);
    return "published";
  } finally { await lock.close(); await unlink(lockPath).catch(() => undefined); }
}

export async function activatePublicResultStore(storeRoot: string): Promise<void> {
  const indexPath = join(storeRoot, "index.json");
  const index = validatePublicResultIndex(JSON.parse(await readFile(indexPath, "utf8")));
  if (index.results["1"]?.receiptDigest !== "2b1fa85d2dbd00729218bbe09d327cfc2349f20df02921185d8a2ec3c43fbece" || index.results["2"]?.receiptDigest !== "bd8e5cfa63ff862d4e0b1efc93c6ae2ac0800b01b6806a5ea5146880ce1b67f7") throw new Error("Exact frozen #1/#2 bootstrap receipts are required before activation.");
  for (const entry of Object.values(index.results)) {
    const document = verifyPublicResultDocument(JSON.parse(await readFile(join(storeRoot, entry.receiptPath), "utf8")));
    if (document.documentDigest !== entry.documentDigest) throw new Error(`Stored result #${entry.commitmentId} does not match its index entry.`);
  }
  const next = { ...index, automation: { operational: true } };
  const temp = `${indexPath}.${process.pid}.activate.tmp`; await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, "utf8"); await rename(temp, indexPath);
}
