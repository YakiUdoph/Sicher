import { readFileSync } from "node:fs";
import { createPublicClient, defineChain, getAddress, http, type Abi, type Address } from "viem";
import { rpcWithRetry, type RpcAttemptRecord } from "./rpc-retry.ts";

const EXPECTED_CHAIN_ID = 99801;
const CONTRACT = "0x4e4887e28a8370678a9a37c08a85c65450b510c0" as Address;
const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();
const commitmentId = BigInt(process.env.COMMITMENT_ID?.trim() ?? "1");
if (!rpcUrl) {
  console.error("ELYSIUM_RPC_URL is required.");
  process.exit(1);
}
if (commitmentId <= 0n) {
  console.error("COMMITMENT_ID must be greater than zero.");
  process.exit(1);
}
const artifact = JSON.parse(readFileSync("artifacts/SicherCommitmentProof.json", "utf8")) as { abi: Abi };
const chain = defineChain({ id: EXPECTED_CHAIN_ID, name: "Kinetiq Elysium Testnet", nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } }, testnet: true });
const client = createPublicClient({ chain, transport: http(rpcUrl, { retryCount: 0, timeout: 12_000 }) });
const records: RpcAttemptRecord[] = [];
const chainResult = await rpcWithRetry("eth_chainId", () => client.getChainId(), records);
if (chainResult.kind !== "success" || chainResult.value !== EXPECTED_CHAIN_ID) {
  console.log(`CHAIN: ${chainResult.kind === "unavailable" ? "INDETERMINATE" : "FAIL"}`);
  process.exit(1);
}
const nextResult = await rpcWithRetry("eth_call nextCommitmentId()", () => client.readContract({ address: CONTRACT, abi: artifact.abi, functionName: "nextCommitmentId" }) as Promise<bigint>, records);
const commitmentResult = await rpcWithRetry(`eth_call commitments(${commitmentId})`, () => client.readContract({ address: CONTRACT, abi: artifact.abi, functionName: "commitments", args: [commitmentId] }) as Promise<readonly [bigint, Address, Address, Address, bigint, bigint, bigint]>, records);
console.log("SICHER ON-CHAIN COMMITMENT READER");
console.log(`CHAIN ID: ${chainResult.value}`);
console.log(`CONTRACT: ${getAddress(CONTRACT)}`);
console.log(`nextCommitmentId: ${nextResult.kind === "success" ? nextResult.value : "unavailable"}`);
if (commitmentResult.kind !== "success") {
  console.log(`COMMITMENT ${commitmentId}: UNDETERMINED`);
  console.log(`ERROR: ${commitmentResult.error}`);
  process.exitCode = 1;
} else {
  const [id, creator, subject, token, minimumBalance, startBlock, endBlock] = commitmentResult.value;
  if (id === 0n) console.log(`COMMITMENT ${commitmentId}: DOES NOT EXIST`);
  else {
    console.log(`COMMITMENT ${commitmentId}: EXISTS`);
    console.log(`ID: ${id}`);
    console.log(`CREATOR: ${creator}`);
    console.log(`SUBJECT: ${subject}`);
    console.log(`TOKEN: ${token}`);
    console.log(`MINIMUM BALANCE: ${minimumBalance}`);
    console.log(`START BLOCK: ${startBlock}`);
    console.log(`END BLOCK: ${endBlock}`);
    console.log(`VERIFIER INPUTS: TOKEN_ADDRESS=${token} SUBJECT_ADDRESS=${subject} START_BLOCK=${startBlock} END_BLOCK=${endBlock} MINIMUM_BALANCE=${minimumBalance}`);
  }
}
console.log("RPC ATTEMPTS:");
for (const record of records) console.log(`${record.method}: ${record.attempts} attempt(s), ${record.outcome}`);
