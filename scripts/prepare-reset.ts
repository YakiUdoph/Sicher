import "dotenv/config";
import { readFileSync } from "node:fs";
import { createPublicClient, defineChain, encodeFunctionData, formatUnits, getAddress, http, parseAbiItem, type Abi, type Address } from "viem";
import { rpcWithRetry, type RpcAttemptRecord, type RpcResult } from "./rpc-retry.ts";

const CHAIN_ID = 99801;
const SUBJECT = getAddress("0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086");
const TOKEN = getAddress("0x14fc373Dce148766a3B8d9C2BF5f02F8dbe316a7");
const HELPER = getAddress("0x9A39b6B2D458212b3f0d3247C98130b2192068D0");
const COMMITMENT_END = 8_141_584n;
const STEP1_BLOCK = 8_128_179n;
const SUBJECT_BEFORE = 92_000n * 10n ** 18n;
const HELPER_BEFORE = 8_000n * 10n ** 18n;
const RESET_AMOUNT = 77_000n * 10n ** 18n;
const SUBJECT_AFTER = 15_000n * 10n ** 18n;
const HELPER_AFTER = 85_000n * 10n ** 18n;
type Outcome = "PASS" | "FAIL" | "INDETERMINATE";
const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();
if (!rpcUrl) { console.error("ELYSIUM_RPC_URL is required."); process.exit(1); }
const tokenArtifact = JSON.parse(readFileSync("artifacts/SicherTestToken.json", "utf8")) as { abi: Abi };
const helperArtifact = JSON.parse(readFileSync("artifacts/SicherTestReturnHelper.json", "utf8")) as { abi: Abi };
const finalEvidence = JSON.parse(readFileSync("phase5-tool/commitment1-final.json", "utf8")) as { verified: boolean; verdict: string; endBlock: string };
const chain = defineChain({ id: CHAIN_ID, name: "Kinetiq Elysium Testnet", nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } }, testnet: true });
const client = createPublicClient({ chain, transport: http(rpcUrl, { retryCount: 0, timeout: 12_000 }) });
const records: RpcAttemptRecord[] = [];
const rpcOutcome = <T>(result: RpcResult<T>): Outcome => result.kind === "unavailable" ? "INDETERMINATE" : "FAIL";
const chainId = await rpcWithRetry("eth_chainId", () => client.getChainId(), records);
const latest = await rpcWithRetry("eth_blockNumber", () => client.getBlockNumber(), records);
const snapshot = latest.kind === "success" ? latest.value : undefined;
const [subjectBalance, helperBalance, restored] = await Promise.all([
  rpcWithRetry("eth_call subject balance", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [SUBJECT], blockNumber: snapshot }) as Promise<bigint>, records),
  rpcWithRetry("eth_call helper balance", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [HELPER], blockNumber: snapshot }) as Promise<bigint>, records),
  rpcWithRetry("eth_call helper restored", () => client.readContract({ address: HELPER, abi: helperArtifact.abi, functionName: "restored", blockNumber: snapshot }) as Promise<boolean>, records),
]);
const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
let unexpectedStatus: Outcome = snapshot === undefined ? "INDETERMINATE" : "PASS";
let unexpectedCount = 0;
if (snapshot !== undefined) {
  for (let fromBlock = STEP1_BLOCK + 1n; fromBlock <= snapshot; fromBlock += 2_000n) {
    const toBlock = fromBlock + 1_999n < snapshot ? fromBlock + 1_999n : snapshot;
    const logs = await rpcWithRetry(`eth_getLogs ${fromBlock}-${toBlock}`, () => client.getLogs({ address: TOKEN, event: transferEvent, fromBlock, toBlock }), records);
    if (logs.kind !== "success") { unexpectedStatus = logs.kind === "unavailable" ? "INDETERMINATE" : "FAIL"; break; }
    for (const log of logs.value) {
      const from = getAddress(String(log.args.from));
      const to = getAddress(String(log.args.to));
      if (from === SUBJECT || from === HELPER || to === SUBJECT || to === HELPER) unexpectedCount += 1;
    }
  }
  if (unexpectedStatus === "PASS" && unexpectedCount !== 0) unexpectedStatus = "FAIL";
}
const data = encodeFunctionData({ abi: tokenArtifact.abi, functionName: "transfer", args: [HELPER, RESET_AMOUNT] });
let simulation: RpcResult<unknown> | undefined;
let gas: RpcResult<bigint> | undefined;
if (chainId.kind === "success" && chainId.value === CHAIN_ID && latest.kind === "success" && latest.value > COMMITMENT_END && subjectBalance.kind === "success" && subjectBalance.value === SUBJECT_BEFORE && helperBalance.kind === "success" && helperBalance.value === HELPER_BEFORE && restored.kind === "success" && restored.value === false && unexpectedStatus === "PASS") {
  [simulation, gas] = await Promise.all([
    rpcWithRetry("eth_call exact reset transfer", () => client.simulateContract({ account: SUBJECT, address: TOKEN, abi: tokenArtifact.abi, functionName: "transfer", args: [HELPER, RESET_AMOUNT] }), records),
    rpcWithRetry("eth_estimateGas exact reset transfer", () => client.estimateGas({ account: SUBJECT, to: TOKEN, data }), records),
  ]);
}
const chainStatus: Outcome = chainId.kind === "success" ? (chainId.value === CHAIN_ID ? "PASS" : "FAIL") : rpcOutcome(chainId);
const outsideStatus: Outcome = latest.kind === "success" ? (latest.value > COMMITMENT_END ? "PASS" : "FAIL") : rpcOutcome(latest);
const finalStatus: Outcome = finalEvidence.verified && finalEvidence.verdict === "PASS" && BigInt(finalEvidence.endBlock) === COMMITMENT_END ? "PASS" : "FAIL";
const subjectStatus: Outcome = subjectBalance.kind === "success" ? (subjectBalance.value === SUBJECT_BEFORE ? "PASS" : "FAIL") : rpcOutcome(subjectBalance);
const helperStatus: Outcome = helperBalance.kind === "success" ? (helperBalance.value === HELPER_BEFORE ? "PASS" : "FAIL") : rpcOutcome(helperBalance);
const restoredStatus: Outcome = restored.kind === "success" ? (restored.value === false ? "PASS" : "FAIL") : rpcOutcome(restored);
const arithmeticStatus: Outcome = SUBJECT_BEFORE - RESET_AMOUNT === SUBJECT_AFTER && HELPER_BEFORE + RESET_AMOUNT === HELPER_AFTER ? "PASS" : "FAIL";
const simulationStatus: Outcome = simulation?.kind === "success" && gas?.kind === "success" ? "PASS" : simulation?.kind === "unavailable" || gas?.kind === "unavailable" ? "INDETERMINATE" : "FAIL";
const statuses = [chainStatus, outsideStatus, finalStatus, subjectStatus, helperStatus, restoredStatus, unexpectedStatus, arithmeticStatus, simulationStatus];
const ready = statuses.every((status) => status === "PASS");
const display = (value: bigint) => `${formatUnits(value, 18)} STEST (${value} base units)`;
console.log("SICHER PHASE 5H — RESET TRANSACTION 1 PREFLIGHT");
console.log(`[${chainStatus}] Chain ID = 99801`);
console.log(`[${outsideStatus}] Current block is after Commitment #1`);
console.log(`[${finalStatus}] Commitment #1 final verifier result PASS`);
console.log(`[${subjectStatus}] Subject balance = 92,000 STEST`);
console.log(`[${helperStatus}] Helper balance = 8,000 STEST`);
console.log(`[${restoredStatus}] Helper restored = false`);
console.log(`[${unexpectedStatus}] No unexpected subject/helper transfers after Step 1`);
console.log(`[${arithmeticStatus}] Exact reset amount and post-balances`);
console.log(`[${simulationStatus}] Exact reset transfer simulation and gas estimate`);
console.log(`\nPREFLIGHT:\n${ready ? "PASS" : statuses.includes("INDETERMINATE") ? "INDETERMINATE" : "FAIL"}`);
console.log(`\nCURRENT BLOCK:\n${latest.kind === "success" ? latest.value : "unavailable"}`);
console.log(`\nCOMMITMENT #1 END BLOCK:\n${COMMITMENT_END}`);
console.log(`\nOUTSIDE COMMITMENT #1 WINDOW:\n${outsideStatus === "PASS" ? "YES" : "NO"}`);
console.log(`\nCOMMITMENT #1 FINAL VERDICT:\n${finalEvidence.verdict}`);
console.log(`\nSUBJECT BEFORE:\n${subjectBalance.kind === "success" ? display(subjectBalance.value) : "unavailable"}`);
console.log(`\nHELPER BEFORE:\n${helperBalance.kind === "success" ? display(helperBalance.value) : "unavailable"}`);
console.log(`\nRESET AMOUNT:\n${display(RESET_AMOUNT)}`);
console.log(`\nEXPECTED SUBJECT AFTER:\n${display(SUBJECT_AFTER)}`);
console.log(`\nEXPECTED HELPER AFTER:\n${display(HELPER_AFTER)}`);
console.log(`\nRESTORED BEFORE:\n${restored.kind === "success" ? restored.value : "unavailable"}`);
console.log(`\nUNEXPECTED TRANSFERS:\n${unexpectedStatus === "PASS" ? unexpectedCount : "unavailable"}`);
console.log(`\nSIMULATION:\n${simulationStatus}${gas?.kind === "success" ? ` — estimated gas ${gas.value}` : ""}`);
console.log(`\nRESET TX 1 READY:\n${ready ? "YES" : "NO"}`);
console.log("\nAUTOMATIC TRANSACTIONS SENT:\n0");
console.log(`\nBLOCKERS:\n${ready ? "NONE" : "One or more fail-closed preconditions did not pass."}`);
if (!ready) process.exitCode = 1;
