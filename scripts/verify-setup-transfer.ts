import "dotenv/config";
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  decodeEventLog,
  decodeFunctionData,
  defineChain,
  getAddress,
  http,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { rpcWithRetry, type RpcAttemptRecord, type RpcResult } from "./rpc-retry.ts";

const EXPECTED_CHAIN_ID = 99801;
const SUBJECT = getAddress("0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086");
const TOKEN = getAddress("0x14fc373Dce148766a3B8d9C2BF5f02F8dbe316a7");
const SICHER = getAddress("0x4e4887e28a8370678a9a37c08a85c65450b510c0");
const HELPER = getAddress("0x9A39b6B2D458212b3f0d3247C98130b2192068D0");
const SINK = getAddress("0x000000000000000000000000000000000000dEaD");
const AMOUNT = 900_000n * 10n ** 18n;
const POST_BALANCE = 100_000n * 10n ** 18n;
type Outcome = "PASS" | "FAIL" | "INDETERMINATE";
const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();
const suppliedHash = process.env.SETUP_TRANSFER_TX_HASH?.trim() as Hex | undefined;
if (!rpcUrl) { console.error("ELYSIUM_RPC_URL is required."); process.exit(1); }
if (!suppliedHash || !/^0x[0-9a-fA-F]{64}$/.test(suppliedHash)) { console.error("SETUP_TRANSFER_TX_HASH is required and must be a 32-byte hash."); process.exit(1); }

const tokenArtifact = JSON.parse(readFileSync("artifacts/SicherTestToken.json", "utf8")) as { abi: Abi };
const sicherArtifact = JSON.parse(readFileSync("artifacts/SicherCommitmentProof.json", "utf8")) as { abi: Abi };
const helperArtifact = JSON.parse(readFileSync("artifacts/SicherTestReturnHelper.json", "utf8")) as { abi: Abi };
const chain = defineChain({ id: EXPECTED_CHAIN_ID, name: "Kinetiq Elysium Testnet", nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } }, testnet: true });
const client = createPublicClient({ chain, transport: http(rpcUrl, { retryCount: 0, timeout: 12_000 }) });
const records: RpcAttemptRecord[] = [];
const labels = [
  "Chain ID = 99801", "Transaction exists", "Receipt exists", "Receipt successful", "Sender is subject A086",
  "Destination is STEST contract", "Calldata is exact setup transfer", "Exactly one STEST Transfer event",
  "Event from is subject A086", "Event to is dEaD", "Event amount is 900,000 STEST",
  "Post-transaction subject balance is 100,000 STEST", "Sink balance increased by exactly 900,000 STEST",
  "Helper balance remains 0", "Helper restored remains false", "nextCommitmentId remains 1", "Commitment #1 still does not exist",
] as const;
const checks = new Map<string, Outcome>(labels.map((label) => [label, "INDETERMINATE"]));
const set = (label: typeof labels[number], value: Outcome) => checks.set(label, value);
const rpcOutcome = <T>(result: RpcResult<T>): Outcome => result.kind === "unavailable" ? "INDETERMINATE" : "FAIL";

const chainResult = await rpcWithRetry("eth_chainId", () => client.getChainId(), records);
if (chainResult.kind === "success") set("Chain ID = 99801", chainResult.value === EXPECTED_CHAIN_ID ? "PASS" : "FAIL");
else set("Chain ID = 99801", rpcOutcome(chainResult));

let transaction: Awaited<ReturnType<typeof client.getTransaction>> | undefined;
let receipt: Awaited<ReturnType<typeof client.getTransactionReceipt>> | undefined;
if (checks.get("Chain ID = 99801") === "PASS") {
  const txResult = await rpcWithRetry("eth_getTransactionByHash", () => client.getTransaction({ hash: suppliedHash }), records);
  if (txResult.kind === "success") {
    transaction = txResult.value;
    set("Transaction exists", "PASS");
    set("Sender is subject A086", getAddress(transaction.from) === SUBJECT ? "PASS" : "FAIL");
    set("Destination is STEST contract", transaction.to !== null && getAddress(transaction.to) === TOKEN ? "PASS" : "FAIL");
    try {
      const decoded = decodeFunctionData({ abi: tokenArtifact.abi, data: transaction.input });
      const args = decoded.args as readonly [Address, bigint] | undefined;
      set("Calldata is exact setup transfer", decoded.functionName === "transfer" && args !== undefined && getAddress(args[0]) === SINK && args[1] === AMOUNT ? "PASS" : "FAIL");
    } catch { set("Calldata is exact setup transfer", "FAIL"); }
  } else {
    const value = rpcOutcome(txResult);
    set("Transaction exists", value); set("Sender is subject A086", value); set("Destination is STEST contract", value); set("Calldata is exact setup transfer", value);
  }
  const receiptResult = await rpcWithRetry("eth_getTransactionReceipt", () => client.getTransactionReceipt({ hash: suppliedHash }), records);
  if (receiptResult.kind === "success") {
    receipt = receiptResult.value;
    set("Receipt exists", "PASS");
    set("Receipt successful", receipt.status === "success" ? "PASS" : "FAIL");
    const transferLogs = receipt.logs.filter((log) => getAddress(log.address) === TOKEN).flatMap((log) => {
      try {
        const decoded = decodeEventLog({ abi: tokenArtifact.abi, eventName: "Transfer", data: log.data, topics: log.topics });
        return [{ args: decoded.args as unknown as { from: Address; to: Address; value: bigint } }];
      } catch { return []; }
    });
    set("Exactly one STEST Transfer event", transferLogs.length === 1 ? "PASS" : "FAIL");
    if (transferLogs.length === 1) {
      set("Event from is subject A086", getAddress(transferLogs[0].args.from) === SUBJECT ? "PASS" : "FAIL");
      set("Event to is dEaD", getAddress(transferLogs[0].args.to) === SINK ? "PASS" : "FAIL");
      set("Event amount is 900,000 STEST", transferLogs[0].args.value === AMOUNT ? "PASS" : "FAIL");
    } else {
      set("Event from is subject A086", "FAIL"); set("Event to is dEaD", "FAIL"); set("Event amount is 900,000 STEST", "FAIL");
    }
  } else {
    const value = rpcOutcome(receiptResult);
    set("Receipt exists", value); set("Receipt successful", value); set("Exactly one STEST Transfer event", value); set("Event from is subject A086", value); set("Event to is dEaD", value); set("Event amount is 900,000 STEST", value);
  }
}

if (receipt) {
  const at = receipt.blockNumber;
  const before = at > 0n ? at - 1n : 0n;
  const calls = await Promise.all([
    rpcWithRetry("eth_call subject balance at receipt block", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [SUBJECT], blockNumber: at }) as Promise<bigint>, records),
    rpcWithRetry("eth_call sink balance before receipt block", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [SINK], blockNumber: before }) as Promise<bigint>, records),
    rpcWithRetry("eth_call sink balance at receipt block", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [SINK], blockNumber: at }) as Promise<bigint>, records),
    rpcWithRetry("eth_call helper balance at receipt block", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [HELPER], blockNumber: at }) as Promise<bigint>, records),
    rpcWithRetry("eth_call helper restored at receipt block", () => client.readContract({ address: HELPER, abi: helperArtifact.abi, functionName: "restored", blockNumber: at }) as Promise<boolean>, records),
    rpcWithRetry("eth_call nextCommitmentId at receipt block", () => client.readContract({ address: SICHER, abi: sicherArtifact.abi, functionName: "nextCommitmentId", blockNumber: at }) as Promise<bigint>, records),
    rpcWithRetry("eth_call commitments(1) at receipt block", () => client.readContract({ address: SICHER, abi: sicherArtifact.abi, functionName: "commitments", args: [1n], blockNumber: at }) as Promise<readonly [bigint, Address, Address, Address, bigint, bigint, bigint]>, records),
  ]);
  const [subjectAfter, sinkBefore, sinkAfter, helperBalance, restored, nextId, commitment] = calls;
  set("Post-transaction subject balance is 100,000 STEST", subjectAfter.kind === "success" ? (subjectAfter.value === POST_BALANCE ? "PASS" : "FAIL") : rpcOutcome(subjectAfter));
  set("Sink balance increased by exactly 900,000 STEST", sinkBefore.kind === "success" && sinkAfter.kind === "success" ? (sinkAfter.value - sinkBefore.value === AMOUNT ? "PASS" : "FAIL") : sinkBefore.kind === "unavailable" || sinkAfter.kind === "unavailable" ? "INDETERMINATE" : "FAIL");
  set("Helper balance remains 0", helperBalance.kind === "success" ? (helperBalance.value === 0n ? "PASS" : "FAIL") : rpcOutcome(helperBalance));
  set("Helper restored remains false", restored.kind === "success" ? (restored.value === false ? "PASS" : "FAIL") : rpcOutcome(restored));
  set("nextCommitmentId remains 1", nextId.kind === "success" ? (nextId.value === 1n ? "PASS" : "FAIL") : rpcOutcome(nextId));
  set("Commitment #1 still does not exist", commitment.kind === "success" ? (commitment.value[0] === 0n ? "PASS" : "FAIL") : rpcOutcome(commitment));
}

const results = labels.map((label) => ({ label, outcome: checks.get(label) ?? "INDETERMINATE" }));
const pass = results.filter(({ outcome }) => outcome === "PASS").length;
const fail = results.filter(({ outcome }) => outcome === "FAIL").length;
const indeterminate = results.filter(({ outcome }) => outcome === "INDETERMINATE").length;
const overall: Outcome = fail > 0 ? "FAIL" : indeterminate > 0 ? "INDETERMINATE" : "PASS";
console.log("SICHER ELYSIUM PHASE 5C — POST-SETUP TRANSFER VERIFICATION");
for (const result of results) console.log(`[${result.outcome}] ${result.label}`);
console.log(`TOTAL: ${pass} PASS / ${fail} FAIL / ${indeterminate} INDETERMINATE`);
console.log(`OVERALL VERDICT: ${overall}`);
console.log(`SETUP TRANSACTION: ${transaction?.hash ?? suppliedHash}`);
console.log(`SETUP TRANSACTION BLOCK: ${receipt?.blockNumber ?? "unavailable"}`);
console.log("ORDERING REQUIREMENT: this block must later be strictly less than commitment creation block and startBlock");
console.log("RPC ATTEMPTS:");
for (const record of records) console.log(`${record.method}: ${record.attempts} attempt(s), ${record.outcome}${record.error ? ` — ${record.error}` : ""}`);
if (overall !== "PASS") process.exitCode = 1;
