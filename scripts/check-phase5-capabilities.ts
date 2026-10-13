import { readFileSync } from "node:fs";
import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
  padHex,
  toEventSelector,
  toHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { rpcWithRetry, type RpcAttemptRecord, type RpcResult } from "./rpc-retry.ts";

const EXPECTED_CHAIN_ID = 99801;
const SUBJECT = "0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086" as Address;
const TOKEN = "0x14fc373Dce148766a3B8d9C2BF5f02F8dbe316a7" as Address;
const SICHER = "0x4e4887e28a8370678a9a37c08a85c65450b510c0" as Address;
const KNOWN_TOKEN_DEPLOYMENT_BLOCK = 6_936_642n;
const TRANSFER_TOPIC = toEventSelector("Transfer(address,address,uint256)");
const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();
if (!rpcUrl) {
  console.error("ELYSIUM_RPC_URL is required.");
  process.exit(1);
}
const tokenArtifact = JSON.parse(readFileSync("artifacts/SicherTestToken.json", "utf8")) as { abi: Abi };
const commitmentArtifact = JSON.parse(readFileSync("artifacts/SicherCommitmentProof.json", "utf8")) as { abi: Abi };
const chain = defineChain({ id: EXPECTED_CHAIN_ID, name: "Kinetiq Elysium Testnet", nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } }, testnet: true });
const client = createPublicClient({ chain, transport: http(rpcUrl, { retryCount: 0, timeout: 12_000 }) });
const records: RpcAttemptRecord[] = [];
type RawLog = { blockNumber: Hex | null; transactionHash: Hex | null; transactionIndex: Hex | null; logIndex: Hex | null; topics: Hex[]; data: Hex };
const rawClient = client as unknown as { request(args: { method: "eth_getLogs"; params: [unknown] }): Promise<RawLog[]> };
const subjectTopic = padHex(getAddress(SUBJECT), { size: 32 });
const filter = (topics: Array<Hex | null>) => ({ address: getAddress(TOKEN), fromBlock: toHex(KNOWN_TOKEN_DEPLOYMENT_BLOCK), toBlock: toHex(KNOWN_TOKEN_DEPLOYMENT_BLOCK), topics });

const [chainId, historicalBalance, outgoing, incoming, nextId, commitmentOne] = await Promise.all([
  rpcWithRetry("eth_chainId", () => client.getChainId(), records),
  rpcWithRetry(`eth_call balanceOf at ${KNOWN_TOKEN_DEPLOYMENT_BLOCK}`, () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [SUBJECT], blockNumber: KNOWN_TOKEN_DEPLOYMENT_BLOCK }) as Promise<bigint>, records),
  rpcWithRetry("eth_getLogs outgoing", () => rawClient.request({ method: "eth_getLogs", params: [filter([TRANSFER_TOPIC, subjectTopic])] }), records),
  rpcWithRetry("eth_getLogs incoming", () => rawClient.request({ method: "eth_getLogs", params: [filter([TRANSFER_TOPIC, null, subjectTopic])] }), records),
  rpcWithRetry("eth_call nextCommitmentId()", () => client.readContract({ address: SICHER, abi: commitmentArtifact.abi, functionName: "nextCommitmentId" }) as Promise<bigint>, records),
  rpcWithRetry("eth_call commitments(1)", () => client.readContract({ address: SICHER, abi: commitmentArtifact.abi, functionName: "commitments", args: [1n] }) as Promise<readonly [bigint, Address, Address, Address, bigint, bigint, bigint]>, records),
]);

const rpcStatus = <T>(result: RpcResult<T>): "PASS" | "FAIL" | "INDETERMINATE" =>
  result.kind === "success" ? "PASS" : result.kind === "unavailable" ? "INDETERMINATE" : "FAIL";
const hasOrdering = (logs: RawLog[]) => logs.every((log) => log.blockNumber !== null && log.transactionHash !== null && log.transactionIndex !== null && log.logIndex !== null);
const orderingStatus = incoming.kind === "success" && outgoing.kind === "success"
  ? (hasOrdering([...incoming.value, ...outgoing.value]) && incoming.value.length > 0 ? "PASS" : "FAIL")
  : incoming.kind === "unavailable" || outgoing.kind === "unavailable" ? "INDETERMINATE" : "FAIL";
const existingCommitment = commitmentOne.kind === "success" ? (commitmentOne.value[0] === 0n ? "NO" : "YES") : "UNDETERMINED";
const chainStatus = chainId.kind === "success" ? (chainId.value === EXPECTED_CHAIN_ID ? "PASS" : "FAIL") : rpcStatus(chainId);

console.log("SICHER ELYSIUM PHASE 5A — LIVE READ-ONLY CAPABILITY CHECK");
console.log(`[${chainStatus}] Chain ID = 99801`);
console.log(`[${rpcStatus(historicalBalance)}] Historical balanceOf at specific block`);
console.log(`[${incoming.kind === "success" && outgoing.kind === "success" ? "PASS" : incoming.kind === "unavailable" || outgoing.kind === "unavailable" ? "INDETERMINATE" : "FAIL"}] Transfer logs retrievable`);
console.log(`[${rpcStatus(outgoing)}] Outgoing logs retrievable`);
console.log(`[${rpcStatus(incoming)}] Incoming logs retrievable`);
console.log(`[${orderingStatus}] Deterministic event ordering fields available`);
console.log(`HISTORICAL BLOCK: ${KNOWN_TOKEN_DEPLOYMENT_BLOCK}`);
console.log(`HISTORICAL SUBJECT BALANCE: ${historicalBalance.kind === "success" ? historicalBalance.value : "unavailable"}`);
console.log(`OUTGOING LOG COUNT AT BLOCK: ${outgoing.kind === "success" ? outgoing.value.length : "unavailable"}`);
console.log(`INCOMING LOG COUNT AT BLOCK: ${incoming.kind === "success" ? incoming.value.length : "unavailable"}`);
if (incoming.kind === "success") {
  for (const log of incoming.value) console.log(`INCOMING LOG: block=${log.blockNumber} txIndex=${log.transactionIndex} logIndex=${log.logIndex} tx=${log.transactionHash}`);
}
console.log(`nextCommitmentId: ${nextId.kind === "success" ? nextId.value : "unavailable"}`);
console.log(`EXISTING COMMITMENT #1: ${existingCommitment}`);
console.log("RPC ATTEMPTS:");
for (const record of records) console.log(`${record.method}: ${record.attempts} attempt(s), ${record.outcome}${record.error ? ` — ${record.error}` : ""}`);

const requiredStatuses = [chainStatus, rpcStatus(historicalBalance), rpcStatus(outgoing), rpcStatus(incoming), orderingStatus];
if (requiredStatuses.some((status) => status !== "PASS") || nextId.kind !== "success" || commitmentOne.kind !== "success") process.exitCode = 1;
