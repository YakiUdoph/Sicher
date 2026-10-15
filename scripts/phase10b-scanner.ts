import { STEST_ADDRESS } from "../frontend/src/chainConfig.js";
import type { RegistryCommitment, RegistrySnapshot } from "../frontend/src/registryDiscovery.ts";
import type { PublicResultIndex } from "./phase10b-publication.ts";
import { decodeFunctionResult, encodeFunctionData, getAddress } from "viem";
import { COMPETITION_CHAIN_ID, COMPETITION_REGISTRY } from "./phase6-evidence-core.ts";

const ABI = [
  { type: "function", name: "nextCommitmentId", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "commitments", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ name: "id", type: "uint256" }, { name: "creator", type: "address" }, { name: "subject", type: "address" }, { name: "token", type: "address" }, { name: "minimumBalance", type: "uint256" }, { name: "startBlock", type: "uint256" }, { name: "endBlock", type: "uint256" }] },
] as const;

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Registry scanner RPC HTTP ${response.status}.`);
  const body = await response.json() as { result?: unknown; error?: { message?: string } };
  if (body.error || body.result === undefined) throw new Error(`Registry scanner RPC failed: ${body.error?.message ?? "missing result"}.`);
  return body.result;
}

export async function scanFinalizedRegistry(providerUrls: readonly [string, string]): Promise<RegistrySnapshot> {
  if (providerUrls[0] === providerUrls[1]) throw new Error("Two distinct provider URLs are required.");
  const chains = await Promise.all(providerUrls.map((url) => rpc(url, "eth_chainId", [])));
  if (chains.some((value) => BigInt(String(value)) !== BigInt(COMPETITION_CHAIN_ID))) throw new Error("Registry scanner chain mismatch.");
  const blocks = await Promise.all(providerUrls.map((url) => rpc(url, "eth_getBlockByNumber", ["finalized", false]) as Promise<{ number: string; hash: string }>));
  if (!blocks[0] || !blocks[1] || blocks[0].number !== blocks[1].number || blocks[0].hash.toLowerCase() !== blocks[1].hash.toLowerCase()) throw new Error("Finalized head disagreement.");
  const tag = blocks[0].number;
  const callBoth = async (data: `0x${string}`) => Promise.all(providerUrls.map((url) => rpc(url, "eth_call", [{ to: COMPETITION_REGISTRY, data }, tag]) as Promise<`0x${string}`>));
  const nextData = encodeFunctionData({ abi: ABI, functionName: "nextCommitmentId" });
  const nextRaw = await callBoth(nextData); if (nextRaw[0] !== nextRaw[1]) throw new Error("Registry bound disagreement.");
  const next = decodeFunctionResult({ abi: ABI, functionName: "nextCommitmentId", data: nextRaw[0] });
  if (next < 1n || next - 1n > 10_000n) throw new Error("Registry bound is invalid or exceeds the scanner limit.");
  const commitments: RegistryCommitment[] = [];
  for (let id = 1n; id < next; id += 1n) {
    const data = encodeFunctionData({ abi: ABI, functionName: "commitments", args: [id] }); const raw = await callBoth(data); if (raw[0] !== raw[1]) throw new Error(`Registry commitment #${id} disagreement.`);
    const decoded = decodeFunctionResult({ abi: ABI, functionName: "commitments", data: raw[0] });
    if (decoded[0] !== id) throw new Error(`Registry commitment #${id} malformed.`);
    commitments.push(Object.freeze({ id: id.toString(), creator: getAddress(decoded[1]), subject: getAddress(decoded[2]), token: getAddress(decoded[3]), minimumBalanceBaseUnits: decoded[4].toString(), startBlock: decoded[5].toString(), endBlock: decoded[6].toString() }));
  }
  return Object.freeze({ chainId: Number(COMPETITION_CHAIN_ID), head: BigInt(tag), upperBound: next - 1n, commitments: Object.freeze(commitments) });
}

export function selectCompletedVerificationJobs(input: { snapshot: RegistrySnapshot; index: PublicResultIndex; limit: number }): readonly RegistryCommitment[] {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 25) throw new Error("Verification limit must be between 1 and 25.");
  return Object.freeze(input.snapshot.commitments
    .filter((item) => BigInt(item.endBlock) < input.snapshot.head)
    .filter((item) => item.token.toLowerCase() === STEST_ADDRESS.toLowerCase())
    .filter((item) => !input.index.results[item.id])
    .sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1)
    .slice(0, input.limit));
}
