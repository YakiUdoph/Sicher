import "dotenv/config";
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  decodeEventLog,
  decodeFunctionData,
  defineChain,
  encodeFunctionData,
  formatUnits,
  getAddress,
  http,
  parseAbiItem,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { rpcWithRetry, type RpcAttemptRecord, type RpcResult } from "./rpc-retry.ts";

const CHAIN_ID = 99801;
const SUBJECT = getAddress("0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086");
const TOKEN = getAddress("0x14fc373Dce148766a3B8d9C2BF5f02F8dbe316a7");
const HELPER = getAddress("0x9A39b6B2D458212b3f0d3247C98130b2192068D0");
const RESET_TX_1 = "0x774f1d1ca3805aa0e24411724efcee03cfd9982351d87325cea60b3c8cc6ae65" as Hex;
const RESET_TX_1_BLOCK = 8_145_742n;
const COMMITMENT_END = 8_141_584n;
const SUBJECT_BEFORE = 15_000n * 10n ** 18n;
const HELPER_BEFORE = 85_000n * 10n ** 18n;
const RESTORE_AMOUNT = 85_000n * 10n ** 18n;
const SUBJECT_AFTER = 100_000n * 10n ** 18n;
const HELPER_AFTER = 0n;
type Outcome = "PASS" | "FAIL" | "INDETERMINATE";

const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();
if (!rpcUrl) { console.error("ELYSIUM_RPC_URL is required."); process.exit(1); }
const tokenArtifact = JSON.parse(readFileSync("artifacts/SicherTestToken.json", "utf8")) as { abi: Abi };
const helperArtifact = JSON.parse(readFileSync("artifacts/SicherTestReturnHelper.json", "utf8")) as { abi: Abi };
const finalEvidence = JSON.parse(readFileSync("phase5-tool/commitment1-final.json", "utf8")) as { verified: boolean; verdict: string; endBlock: string; minimumObserved: string };
const chain = defineChain({ id: CHAIN_ID, name: "Kinetiq Elysium Testnet", nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } }, testnet: true });
const client = createPublicClient({ chain, transport: http(rpcUrl, { retryCount: 0, timeout: 12_000 }) });
const records: RpcAttemptRecord[] = [];
const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const rpcOutcome = <T>(result: RpcResult<T>): Outcome => result.kind === "unavailable" ? "INDETERMINATE" : "FAIL";
const exact = <T>(result: RpcResult<T>, expected: T): Outcome => result.kind === "success" ? (result.value === expected ? "PASS" : "FAIL") : rpcOutcome(result);

const chainId = await rpcWithRetry("eth_chainId", () => client.getChainId(), records);
const latest = await rpcWithRetry("eth_blockNumber", () => client.getBlockNumber(), records);
const snapshot = latest.kind === "success" ? latest.value : undefined;
const [transaction, receipt, subjectBalance, helperBalance, restored, fixedSubject, fixedToken, fixedAmount] = await Promise.all([
  rpcWithRetry("eth_getTransactionByHash reset transaction 1", () => client.getTransaction({ hash: RESET_TX_1 }), records),
  rpcWithRetry("eth_getTransactionReceipt reset transaction 1", () => client.getTransactionReceipt({ hash: RESET_TX_1 }), records),
  rpcWithRetry("eth_call subject balance", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [SUBJECT], blockNumber: snapshot }) as Promise<bigint>, records),
  rpcWithRetry("eth_call helper balance", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [HELPER], blockNumber: snapshot }) as Promise<bigint>, records),
  rpcWithRetry("eth_call helper restored", () => client.readContract({ address: HELPER, abi: helperArtifact.abi, functionName: "restored", blockNumber: snapshot }) as Promise<boolean>, records),
  rpcWithRetry("eth_call helper subject", () => client.readContract({ address: HELPER, abi: helperArtifact.abi, functionName: "subject", blockNumber: snapshot }) as Promise<Address>, records),
  rpcWithRetry("eth_call helper token", () => client.readContract({ address: HELPER, abi: helperArtifact.abi, functionName: "token", blockNumber: snapshot }) as Promise<Address>, records),
  rpcWithRetry("eth_call helper RETURN_AMOUNT", () => client.readContract({ address: HELPER, abi: helperArtifact.abi, functionName: "RETURN_AMOUNT", blockNumber: snapshot }) as Promise<bigint>, records),
]);

let resetTxStatus: Outcome = "INDETERMINATE";
let resetTxIndex: number | undefined;
if (transaction.kind === "success" && receipt.kind === "success") {
  try {
    const decoded = decodeFunctionData({ abi: tokenArtifact.abi, data: transaction.value.input });
    const args = decoded.args as readonly [Address, bigint] | undefined;
    const transfers = receipt.value.logs.filter((log) => getAddress(log.address) === TOKEN).flatMap((log) => {
      try {
        const event = decodeEventLog({ abi: tokenArtifact.abi, eventName: "Transfer", data: log.data, topics: log.topics, strict: true });
        return [{ log, args: event.args as unknown as { from: Address; to: Address; value: bigint } }];
      } catch { return []; }
    });
    const transferExact = transfers.length === 1 && getAddress(transfers[0].args.from) === SUBJECT && getAddress(transfers[0].args.to) === HELPER && transfers[0].args.value === 77_000n * 10n ** 18n;
    const [subjectPre, subjectPost, helperPre, helperPost] = await Promise.all([
      rpcWithRetry("eth_call reset1 subject pre", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [SUBJECT], blockNumber: RESET_TX_1_BLOCK - 1n }) as Promise<bigint>, records),
      rpcWithRetry("eth_call reset1 subject post", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [SUBJECT], blockNumber: RESET_TX_1_BLOCK }) as Promise<bigint>, records),
      rpcWithRetry("eth_call reset1 helper pre", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [HELPER], blockNumber: RESET_TX_1_BLOCK - 1n }) as Promise<bigint>, records),
      rpcWithRetry("eth_call reset1 helper post", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [HELPER], blockNumber: RESET_TX_1_BLOCK }) as Promise<bigint>, records),
    ]);
    const calldataExact = decoded.functionName === "transfer" && args !== undefined && getAddress(args[0]) === HELPER && args[1] === 77_000n * 10n ** 18n;
    resetTxIndex = receipt.value.transactionIndex;
    resetTxStatus = transaction.value.hash === RESET_TX_1 && getAddress(transaction.value.from) === SUBJECT && transaction.value.to !== null && getAddress(transaction.value.to) === TOKEN && calldataExact && receipt.value.status === "success" && receipt.value.blockNumber === RESET_TX_1_BLOCK && transferExact && exact(subjectPre, 92_000n * 10n ** 18n) === "PASS" && exact(subjectPost, SUBJECT_BEFORE) === "PASS" && exact(helperPre, 8_000n * 10n ** 18n) === "PASS" && exact(helperPost, HELPER_BEFORE) === "PASS" ? "PASS" : "FAIL";
  } catch { resetTxStatus = "FAIL"; }
} else if (transaction.kind === "deterministic-error" || receipt.kind === "deterministic-error") resetTxStatus = "FAIL";

let unexpectedStatus: Outcome = snapshot === undefined || resetTxIndex === undefined ? "INDETERMINATE" : "PASS";
let unexpectedCount = 0;
if (snapshot !== undefined && resetTxIndex !== undefined) {
  for (let fromBlock = RESET_TX_1_BLOCK; fromBlock <= snapshot; fromBlock += 2_000n) {
    const toBlock = fromBlock + 1_999n < snapshot ? fromBlock + 1_999n : snapshot;
    const logs = await rpcWithRetry(`eth_getLogs ${fromBlock}-${toBlock}`, () => client.getLogs({ address: TOKEN, event: transferEvent, fromBlock, toBlock }), records);
    if (logs.kind !== "success") { unexpectedStatus = logs.kind === "unavailable" ? "INDETERMINATE" : "FAIL"; break; }
    for (const log of logs.value) {
      const from = getAddress(String(log.args.from));
      const to = getAddress(String(log.args.to));
      const isRelevant = from === SUBJECT || from === HELPER || to === SUBJECT || to === HELPER;
      const isAfterReset1 = log.blockNumber > RESET_TX_1_BLOCK || (log.blockNumber === RESET_TX_1_BLOCK && log.transactionIndex > resetTxIndex);
      if (isRelevant && isAfterReset1) unexpectedCount += 1;
    }
  }
  if (unexpectedStatus === "PASS" && unexpectedCount !== 0) unexpectedStatus = "FAIL";
}

const chainStatus = exact(chainId, CHAIN_ID);
const outsideStatus: Outcome = latest.kind === "success" ? (latest.value > COMMITMENT_END ? "PASS" : "FAIL") : rpcOutcome(latest);
const subjectStatus = exact(subjectBalance, SUBJECT_BEFORE);
const helperStatus = exact(helperBalance, HELPER_BEFORE);
const restoredStatus = exact(restored, false);
const fixedSubjectStatus: Outcome = fixedSubject.kind === "success" ? (getAddress(fixedSubject.value) === SUBJECT ? "PASS" : "FAIL") : rpcOutcome(fixedSubject);
const fixedTokenStatus: Outcome = fixedToken.kind === "success" ? (getAddress(fixedToken.value) === TOKEN ? "PASS" : "FAIL") : rpcOutcome(fixedToken);
const fixedAmountStatus = exact(fixedAmount, RESTORE_AMOUNT);
const finalStatus: Outcome = finalEvidence.verified && finalEvidence.verdict === "PASS" && BigInt(finalEvidence.endBlock) === COMMITMENT_END && BigInt(finalEvidence.minimumObserved) === 92_000n * 10n ** 18n && RESET_TX_1_BLOCK > COMMITMENT_END ? "PASS" : "FAIL";
const arithmeticStatus: Outcome = SUBJECT_BEFORE + RESTORE_AMOUNT === SUBJECT_AFTER && HELPER_BEFORE - RESTORE_AMOUNT === HELPER_AFTER ? "PASS" : "FAIL";

let simulation: RpcResult<unknown> | undefined;
let gas: RpcResult<bigint> | undefined;
const preSimulation = [chainStatus, outsideStatus, resetTxStatus, subjectStatus, helperStatus, restoredStatus, unexpectedStatus, fixedSubjectStatus, fixedTokenStatus, fixedAmountStatus, finalStatus, arithmeticStatus];
if (preSimulation.every((status) => status === "PASS")) {
  const data = encodeFunctionData({ abi: helperArtifact.abi, functionName: "restore" });
  [simulation, gas] = await Promise.all([
    rpcWithRetry("eth_call helper restore", () => client.simulateContract({ account: SUBJECT, address: HELPER, abi: helperArtifact.abi, functionName: "restore" }), records),
    rpcWithRetry("eth_estimateGas helper restore", () => client.estimateGas({ account: SUBJECT, to: HELPER, data }), records),
  ]);
}
const simulationStatus: Outcome = simulation?.kind === "success" && gas?.kind === "success" ? "PASS" : simulation?.kind === "unavailable" || gas?.kind === "unavailable" ? "INDETERMINATE" : "FAIL";
const statuses = [...preSimulation, simulationStatus];
const ready = statuses.every((status) => status === "PASS");
const display = (value: bigint) => `${formatUnits(value, 18)} STEST (${value} base units)`;

console.log("SICHER PHASE 5I — RESET TRANSACTION 2 PREFLIGHT");
console.log(`[${chainStatus}] Chain ID = 99801`);
console.log(`[${outsideStatus}] Current block is after Commitment #1`);
console.log(`[${resetTxStatus}] Reset Transaction 1 independently verified`);
console.log(`[${subjectStatus}] Subject balance = 15,000 STEST`);
console.log(`[${helperStatus}] Helper balance = 85,000 STEST`);
console.log(`[${restoredStatus}] Helper restored = false`);
console.log(`[${unexpectedStatus}] No unexpected relevant transfers after Reset Transaction 1`);
console.log(`[${fixedSubjectStatus}] Helper fixed subject exact`);
console.log(`[${fixedTokenStatus}] Helper fixed token exact`);
console.log(`[${fixedAmountStatus}] Helper fixed restoration amount exact`);
console.log(`[${finalStatus}] Commitment #1 PASS evidence unaffected`);
console.log(`[${arithmeticStatus}] Expected post-state arithmetic exact`);
console.log(`[${simulationStatus}] restore() simulation and gas estimate`);
console.log(`\nPREFLIGHT:\n${ready ? "PASS" : statuses.includes("INDETERMINATE") ? "INDETERMINATE" : "FAIL"}`);
console.log(`\nCURRENT BLOCK:\n${latest.kind === "success" ? latest.value : "unavailable"}`);
console.log(`\nCOMMITMENT #1 END BLOCK:\n${COMMITMENT_END}`);
console.log(`\nOUTSIDE COMMITMENT #1 WINDOW:\n${outsideStatus === "PASS" ? "YES" : "NO"}`);
console.log(`\nSUBJECT BEFORE:\n${subjectBalance.kind === "success" ? display(subjectBalance.value) : "unavailable"}`);
console.log(`\nHELPER BEFORE:\n${helperBalance.kind === "success" ? display(helperBalance.value) : "unavailable"}`);
console.log(`\nRESTORED BEFORE:\n${restored.kind === "success" ? restored.value : "unavailable"}`);
console.log(`\nRESTORE AMOUNT:\n${display(RESTORE_AMOUNT)}`);
console.log(`\nEXPECTED SUBJECT AFTER:\n${display(SUBJECT_AFTER)}`);
console.log(`\nEXPECTED HELPER AFTER:\n${display(HELPER_AFTER)}`);
console.log("\nEXPECTED RESTORED AFTER:\ntrue");
console.log(`\nFIXED SUBJECT:\n${fixedSubject.kind === "success" ? getAddress(fixedSubject.value) : "unavailable"}`);
console.log(`\nFIXED TOKEN:\n${fixedToken.kind === "success" ? getAddress(fixedToken.value) : "unavailable"}`);
console.log(`\nUNEXPECTED TRANSFERS:\n${unexpectedStatus === "PASS" ? unexpectedCount : "unavailable"}`);
console.log(`\nSIMULATION:\n${simulationStatus}${gas?.kind === "success" ? ` — estimated gas ${gas.value}` : ""}`);
console.log(`\nRESET TX 2 READY:\n${ready ? "YES" : "NO"}`);
console.log("\nAUTOMATIC TRANSACTIONS SENT:\n0");
console.log(`\nBLOCKERS:\n${ready ? "NONE" : "One or more fail-closed preconditions did not pass."}`);
if (!ready) process.exitCode = 1;
