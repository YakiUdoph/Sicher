import { getAddress, isAddress, type Address, type Hex } from "viem";
import { canonicalJson, sha256Canonical } from "./phase6-evidence-core.ts";

export type EvidenceCacheContext = {
  chainId: string;
  token: Address;
  fromBlock: string;
  fromBlockHash: Hex;
  toBlock: string;
  toBlockHash: Hex;
  finalizedBlock: string;
  finalizedBlockHash: Hex;
  provider: string;
};
export type EvidenceCacheEntry = EvidenceCacheContext & { schemaVersion: "sicher.evidence-cache/1.0"; evidenceDigest: string; cacheDigest: string };
const decimal = /^(0|[1-9][0-9]*)$/;
const hash = /^0x[0-9a-fA-F]{64}$/;
const digest = /^[0-9a-f]{64}$/;

export function createEvidenceCacheEntry(context: EvidenceCacheContext, evidence: unknown): EvidenceCacheEntry {
  if (!decimal.test(context.chainId) || !isAddress(context.token) || !decimal.test(context.fromBlock) || !decimal.test(context.toBlock) || BigInt(context.fromBlock) > BigInt(context.toBlock) || !hash.test(context.fromBlockHash) || !hash.test(context.toBlockHash) || !decimal.test(context.finalizedBlock) || !hash.test(context.finalizedBlockHash) || !context.provider) throw new Error("Invalid evidence-cache context.");
  const unsigned = { schemaVersion: "sicher.evidence-cache/1.0" as const, ...context, token: getAddress(context.token), evidenceDigest: sha256Canonical(evidence) };
  return { ...unsigned, cacheDigest: sha256Canonical(unsigned) };
}
export function verifyEvidenceCacheEntry(value: unknown, expected: EvidenceCacheContext): { usable: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { usable: false, errors: ["Cache entry must be an object."] };
  const entry = value as Record<string, unknown>;
  if (entry.schemaVersion !== "sicher.evidence-cache/1.0") errors.push("Unsupported cache schemaVersion.");
  if (typeof entry.evidenceDigest !== "string" || !digest.test(entry.evidenceDigest) || typeof entry.cacheDigest !== "string" || !digest.test(entry.cacheDigest)) errors.push("Malformed cache digest.");
  for (const key of Object.keys(expected) as Array<keyof EvidenceCacheContext>) {
    const actual = key === "token" && typeof entry[key] === "string" && isAddress(entry[key] as string) ? getAddress(entry[key] as string) : entry[key];
    const wanted = key === "token" ? getAddress(expected[key]) : expected[key];
    if (canonicalJson(actual) !== canonicalJson(wanted)) errors.push(`Cache context mismatch: ${key}.`);
  }
  if (typeof entry.cacheDigest === "string") { const { cacheDigest, ...unsigned } = entry; if (sha256Canonical(unsigned) !== cacheDigest) errors.push("cacheDigest mismatch."); }
  return { usable: errors.length === 0, errors };
}
