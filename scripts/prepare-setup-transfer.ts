import "dotenv/config";
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  defineChain,
  encodeFunctionData,
  formatEther,
  formatUnits,
  getAddress,
  http,
  type Abi,
  type Address,
} from "viem";
import { rpcWithRetry, type RpcAttemptRecord, type RpcResult } from "./rpc-retry.ts";

const EXPECTED_CHAIN_ID = 99801;
const SUBJECT = getAddress("0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086");
const TOKEN = getAddress("0x14fc373Dce148766a3B8d9C2BF5f02F8dbe316a7");
const SICHER = getAddress("0x4e4887e28a8370678a9a37c08a85c65450b510c0");
const HELPER = getAddress("0x9A39b6B2D458212b3f0d3247C98130b2192068D0");
const SINK = getAddress("0x000000000000000000000000000000000000dEaD");
const SETUP_AMOUNT = 900_000n * 10n ** 18n;
const REQUIRED_SUBJECT_BALANCE = 1_000_000n * 10n ** 18n;
const EXPECTED_POST_BALANCE = 100_000n * 10n ** 18n;
const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();
if (!rpcUrl) { console.error("ELYSIUM_RPC_URL is required."); process.exit(1); }

const tokenArtifact = JSON.parse(readFileSync("artifacts/SicherTestToken.json", "utf8")) as { abi: Abi };
const sicherArtifact = JSON.parse(readFileSync("artifacts/SicherCommitmentProof.json", "utf8")) as { abi: Abi };
const helperArtifact = JSON.parse(readFileSync("artifacts/SicherTestReturnHelper.json", "utf8")) as { abi: Abi };
const chain = defineChain({ id: EXPECTED_CHAIN_ID, name: "Kinetiq Elysium Testnet", nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } }, testnet: true });
const client = createPublicClient({ chain, transport: http(rpcUrl, { retryCount: 0, timeout: 12_000 }) });
const records: RpcAttemptRecord[] = [];
type Outcome = "PASS" | "FAIL" | "INDETERMINATE";
const unavailable = <T>(result: RpcResult<T>): Outcome => result.kind === "unavailable" ? "INDETERMINATE" : "FAIL";
const assess = <T>(result: RpcResult<T>, predicate: (value: T) => boolean): Outcome => result.kind === "success" ? (predicate(result.value) ? "PASS" : "FAIL") : unavailable(result);
const display = (value: bigint) => `${formatUnits(value, 18)} STEST (${value} base units)`;

const chainId = await rpcWithRetry("eth_chainId", () => client.getChainId(), records);
const block = await rpcWithRetry("eth_blockNumber", () => client.getBlockNumber(), records);
const snapshotBlock = block.kind === "success" ? block.value : undefined;
const subjectBalance = await rpcWithRetry("eth_call STEST balanceOf(subject)", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [SUBJECT], blockNumber: snapshotBlock }) as Promise<bigint>, records);
const helperBalance = await rpcWithRetry("eth_call STEST balanceOf(helper)", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [HELPER], blockNumber: snapshotBlock }) as Promise<bigint>, records);
const restored = await rpcWithRetry("eth_call helper restored()", () => client.readContract({ address: HELPER, abi: helperArtifact.abi, functionName: "restored", blockNumber: snapshotBlock }) as Promise<boolean>, records);
const nextId = await rpcWithRetry("eth_call nextCommitmentId()", () => client.readContract({ address: SICHER, abi: sicherArtifact.abi, functionName: "nextCommitmentId", blockNumber: snapshotBlock }) as Promise<bigint>, records);
const commitmentOne = await rpcWithRetry("eth_call commitments(1)", () => client.readContract({ address: SICHER, abi: sicherArtifact.abi, functionName: "commitments", args: [1n], blockNumber: snapshotBlock }) as Promise<readonly [bigint, Address, Address, Address, bigint, bigint, bigint]>, records);
const hypeBalance = await rpcWithRetry("eth_getBalance subject", () => client.getBalance({ address: SUBJECT, blockNumber: snapshotBlock }), records);
const nonce = await rpcWithRetry("eth_getTransactionCount pending", () => client.getTransactionCount({ address: SUBJECT, blockTag: "pending" }), records);

const chainStatus = assess(chainId, (value) => value === EXPECTED_CHAIN_ID);
const subjectStatus = assess(subjectBalance, (value) => value === REQUIRED_SUBJECT_BALANCE);
const helperBalanceStatus = assess(helperBalance, (value) => value === 0n);
const restoredStatus = assess(restored, (value) => value === false);
const nextIdStatus = assess(nextId, (value) => value === 1n);
const commitmentStatus = assess(commitmentOne, (value) => value[0] === 0n);
const prerequisitesPass = [chainStatus, subjectStatus, helperBalanceStatus, restoredStatus, nextIdStatus, commitmentStatus].every((value) => value === "PASS");

let gasEstimate: RpcResult<bigint> | undefined;
let gasPrice: RpcResult<bigint> | undefined;
if (prerequisitesPass) {
  const data = encodeFunctionData({ abi: tokenArtifact.abi, functionName: "transfer", args: [SINK, SETUP_AMOUNT] });
  gasEstimate = await rpcWithRetry("eth_estimateGas exact setup transfer", () => client.estimateGas({ account: SUBJECT, to: TOKEN, data }), records);
  gasPrice = await rpcWithRetry("eth_gasPrice", () => client.getGasPrice(), records);
}
const gasStatus: Outcome = !prerequisitesPass ? "INDETERMINATE" : gasEstimate?.kind === "success" && gasPrice?.kind === "success" ? "PASS" : (gasEstimate?.kind === "unavailable" || gasPrice?.kind === "unavailable") ? "INDETERMINATE" : "FAIL";
const conservativeGas = gasEstimate?.kind === "success" ? (gasEstimate.value * 120n + 99n) / 100n : undefined;
const feeRate = gasPrice?.kind === "success" ? (gasPrice.value * 120n + 99n) / 100n : undefined;
const maximumFee = conservativeGas !== undefined && feeRate !== undefined ? conservativeGas * feeRate : undefined;
const costStatus: Outcome = maximumFee === undefined || hypeBalance.kind !== "success" ? (gasStatus === "INDETERMINATE" || hypeBalance.kind === "unavailable" ? "INDETERMINATE" : "FAIL") : hypeBalance.value > 0n && maximumFee * 100n <= hypeBalance.value ? "PASS" : "FAIL";
const percentage = maximumFee !== undefined && hypeBalance.kind === "success" && hypeBalance.value > 0n
  ? `${Number(maximumFee * 1_000_000n / hypeBalance.value) / 10_000}%`
  : "unavailable";

console.log("SICHER ELYSIUM PHASE 5C — SETUP TRANSFER PREPARATION");
console.log(`[${chainStatus}] Chain ID`);
console.log(`[${subjectStatus}] Subject owns exactly 1,000,000 STEST`);
console.log(`[${helperBalanceStatus}] Helper balance = 0`);
console.log(`[${restoredStatus}] Helper restored = false`);
console.log(`[${nextIdStatus}] nextCommitmentId = 1`);
console.log(`[${commitmentStatus}] Commitment #1 does not exist`);
console.log(`[${gasStatus}] Gas estimate`);
console.log(`[${costStatus}] Cost below 1%`);
console.log(`\nVERIFIED HELPER:\n${HELPER}`);
console.log(`\nCURRENT SUBJECT BALANCE:\n${subjectBalance.kind === "success" ? display(subjectBalance.value) : "unavailable"}`);
console.log(`\nSETUP RECIPIENT:\n${SINK}`);
console.log(`\nSETUP AMOUNT:\n${display(SETUP_AMOUNT)}`);
console.log(`\nEXPECTED POST-SETUP BALANCE:\n${display(EXPECTED_POST_BALANCE)}`);
console.log(`\nCURRENT BLOCK:\n${block.kind === "success" ? block.value : "unavailable"}`);
console.log(`\nPENDING NONCE:\n${nonce.kind === "success" ? nonce.value : "unavailable"}`);
console.log(`\nCURRENT HYPE BALANCE:\n${hypeBalance.kind === "success" ? `${formatEther(hypeBalance.value)} HYPE (${hypeBalance.value} wei)` : "unavailable"}`);
console.log(`\nESTIMATED GAS:\n${gasEstimate?.kind === "success" ? gasEstimate.value : "unavailable"}`);
console.log(`\nCONSERVATIVE GAS LIMIT:\n${conservativeGas ?? "unavailable"}`);
console.log(`\nFEE RATE:\n${feeRate !== undefined ? `${feeRate} wei/gas` : "unavailable"}`);
console.log(`\nCONSERVATIVE MAX FEE:\n${maximumFee !== undefined ? `${formatEther(maximumFee)} HYPE (${maximumFee} wei; ${percentage} of current balance)` : "unavailable"}`);
console.log("\nLOCAL SETUP URL:\nhttp://127.0.0.1:4175/setup-transfer.html");
console.log("\nPOST-SETUP VERIFIER:\nscripts/verify-setup-transfer.ts");
console.log("\nTRANSACTION SIGNED:\nNO");
console.log("\nTRANSACTION BROADCAST:\nNO");
console.log("\nRPC ATTEMPTS:");
for (const record of records) console.log(`${record.method}: ${record.attempts} attempt(s), ${record.outcome}${record.error ? ` — ${record.error}` : ""}`);
if ([chainStatus, subjectStatus, helperBalanceStatus, restoredStatus, nextIdStatus, commitmentStatus, gasStatus, costStatus].some((value) => value !== "PASS")) process.exitCode = 1;
