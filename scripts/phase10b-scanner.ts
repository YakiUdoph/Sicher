import { STEST_ADDRESS } from "../frontend/src/chainConfig.js";
import type { RegistryCommitment, RegistrySnapshot } from "../frontend/src/registryDiscovery.ts";
import type { PublicResultIndex } from "./phase10b-publication.ts";
import { decodeFunctionResult, encodeFunctionData, getAddress } from "viem";
import { COMPETITION_CHAIN_ID, COMPETITION_REGISTRY } from "./phase6-evidence-core.ts";
import type { IsolatedRegistrySnapshot, IsolatedScanIssue } from "./phase10b-scheduler.ts";

const ABI = [
  { type: "function", name: "nextCommitmentId", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "commitments", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ name: "id", type: "uint256" }, { name: "creator", type: "address" }, { name: "subject", type: "address" }, { name: "token", type: "address" }, { name: "minimumBalance", type: "uint256" }, { name: "startBlock", type: "uint256" }, { name: "endBlock", type: "uint256" }] },
] as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Registry scanner RPC HTTP ${response.status}.`);
  const body = await response.json() as { result?: unknown; error?: { message?: string } };
  if (body.error || body.result === undefined) throw new Error(`Registry scanner RPC failed: ${body.error?.message ?? "missing result"}.`);
  return body.result;
}

export async function scanFinalizedRegistry(providerUrls: readonly [string, string]): Promise<IsolatedRegistrySnapshot> {
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
  const issues: IsolatedScanIssue[] = [];
  for (let id = 1n; id < next; id += 1n) {
    const data = encodeFunctionData({ abi: ABI, functionName: "commitments", args: [id] });
    let raw: readonly [`0x${string}`, `0x${string}`];
    try { raw = await callBoth(data) as [`0x${string}`, `0x${string}`]; }
    catch { issues.push(Object.freeze({ id: id.toString(), classification: "TRANSIENT", code: "RECORD_RPC_UNAVAILABLE" })); continue; }
    if (raw[0] !== raw[1]) { issues.push(Object.freeze({ id: id.toString(), classification: "UNRESOLVED", code: "RECORD_PROVIDER_DISAGREEMENT" })); continue; }
    try {
      const decoded = decodeFunctionResult({ abi: ABI, functionName: "commitments", data: raw[0] });
      if (decoded[0] !== id || decoded[4] <= 0n || decoded[6] <= decoded[5]) throw new Error("invalid record");
      const creator = getAddress(decoded[1]); const subject = getAddress(decoded[2]); const token = getAddress(decoded[3]);
      if ([creator, subject, token].some((value) => value.toLowerCase() === ZERO_ADDRESS)) throw new Error("zero address");
      commitments.push(Object.freeze({ id: id.toString(), creator, subject, token, minimumBalanceBaseUnits: decoded[4].toString(), startBlock: decoded[5].toString(), endBlock: decoded[6].toString() }));
    } catch { issues.push(Object.freeze({ id: id.toString(), classification: "UNRESOLVED", code: "RECORD_MALFORMED" })); }
  }
  return Object.freeze({ chainId: Number(COMPETITION_CHAIN_ID), head: BigInt(tag), upperBound: next - 1n, commitments: Object.freeze(commitments), issues: Object.freeze(issues) });
}

export function selectCompletedVerificationJobs(input: { snapshot: RegistrySnapshot; index: PublicResultIndex; limit: number; manualCommitmentId?: string }): readonly RegistryCommitment[] {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 25) throw new Error("Verification limit must be between 1 and 25.");
  const eligible = (item: RegistryCommitment) => BigInt(item.endBlock) < input.snapshot.head && item.token.toLowerCase() === STEST_ADDRESS.toLowerCase() && !input.index.results[item.id];
  if (input.manualCommitmentId !== undefined && input.manualCommitmentId !== "") {
    if (!/^[1-9][0-9]*$/.test(input.manualCommitmentId)) throw new Error("Manual commitment ID must be a canonical positive integer.");
    const selected = input.snapshot.commitments.find((item) => item.id === input.manualCommitmentId);
    if (!selected) throw new Error(`Manual commitment #${input.manualCommitmentId} does not exist in the finalized registry snapshot.`);
    if (input.index.results[selected.id]) throw new Error(`Manual commitment #${selected.id} is already published.`);
    if (selected.token.toLowerCase() !== STEST_ADDRESS.toLowerCase()) throw new Error(`Manual commitment #${selected.id} uses an unsupported token.`);
    if (BigInt(selected.endBlock) >= input.snapshot.head) throw new Error(`Manual commitment #${selected.id} has not ended at the finalized head.`);
    return Object.freeze([selected]);
  }
  return Object.freeze(input.snapshot.commitments.filter(eligible).sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0).slice(0, input.limit));
}
