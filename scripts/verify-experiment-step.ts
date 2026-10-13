import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, decodeEventLog, decodeFunctionData, defineChain, getAddress, http, type Abi, type Address, type Hex } from "viem";
import { rpcWithRetry, type RpcAttemptRecord, type RpcResult } from "./rpc-retry.ts";

const CHAIN_ID = 99801;
const SUBJECT = getAddress("0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086");
const TOKEN = getAddress("0x14fc373Dce148766a3B8d9C2BF5f02F8dbe316a7");
const SICHER = getAddress("0x4e4887e28a8370678A9a37C08A85c65450b510c0");
const HELPER = getAddress("0x9A39b6B2D458212b3f0d3247C98130b2192068D0");
const START = 8_126_584n;
const END = 8_141_584n;
const MINIMUM = 80_000n * 10n ** 18n;
type Outcome = "PASS" | "FAIL" | "INDETERMINATE";
type StepName = "step1" | "step2" | "step3";
const inputs = [
  { step: "step1" as StepName, value: process.env.EXPERIMENT_STEP1_TX_HASH?.trim() },
  { step: "step2" as StepName, value: process.env.EXPERIMENT_STEP2_TX_HASH?.trim() },
  { step: "step3" as StepName, value: process.env.EXPERIMENT_STEP3_TX_HASH?.trim() },
].filter((entry) => entry.value);
const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();
if (!rpcUrl) { console.error("ELYSIUM_RPC_URL is required."); process.exit(1); }
if (inputs.length !== 1 || !/^0x[0-9a-fA-F]{64}$/.test(inputs[0]?.value ?? "")) { console.error("Set exactly one valid EXPERIMENT_STEP1_TX_HASH, EXPERIMENT_STEP2_TX_HASH, or EXPERIMENT_STEP3_TX_HASH."); process.exit(1); }
const step = inputs[0].step;
const hash = inputs[0].value as Hex;
const units = 10n ** 18n;
const definitions = {
  step1: { sequence: 1, amount: 8_000n * units, preSubject: 100_000n * units, postSubject: 92_000n * units, preHelper: 0n, postHelper: 8_000n * units, preRestored: false, postRestored: false, destination: TOKEN, eventFrom: SUBJECT, eventTo: HELPER, functionName: "transfer", prior: undefined },
  step2: { sequence: 2, amount: 77_000n * units, preSubject: 92_000n * units, postSubject: 15_000n * units, preHelper: 8_000n * units, postHelper: 85_000n * units, preRestored: false, postRestored: false, destination: TOKEN, eventFrom: SUBJECT, eventTo: HELPER, functionName: "transfer", prior: "step1" as StepName },
  step3: { sequence: 3, amount: 85_000n * units, preSubject: 15_000n * units, postSubject: 100_000n * units, preHelper: 85_000n * units, postHelper: 0n, preRestored: false, postRestored: true, destination: HELPER, eventFrom: HELPER, eventTo: SUBJECT, functionName: "restore", prior: "step2" as StepName },
} as const;
const definition = definitions[step];
const tokenArtifact = JSON.parse(readFileSync("artifacts/SicherTestToken.json", "utf8")) as { abi: Abi };
const sicherArtifact = JSON.parse(readFileSync("artifacts/SicherCommitmentProof.json", "utf8")) as { abi: Abi };
const helperArtifact = JSON.parse(readFileSync("artifacts/SicherTestReturnHelper.json", "utf8")) as { abi: Abi };
const statePath = "phase5-tool/experiment-state.json";
const state = JSON.parse(readFileSync(statePath, "utf8")) as Record<StepName, { verified: boolean; transaction: string | null; block: string | null }>;
const chain = defineChain({ id: CHAIN_ID, name: "Kinetiq Elysium Testnet", nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } }, testnet: true });
const client = createPublicClient({ chain, transport: http(rpcUrl, { retryCount: 0, timeout: 12_000 }) });
const records: RpcAttemptRecord[] = [];
const labels = ["Chain ID = 99801", "Prior step independently verified", "Transaction exists", "Receipt exists", "Receipt successful", "Sender correct", "Destination correct", "Exact calldata", "Exactly one exact Transfer event", "Receipt block inside inclusive window", "Pre-block subject balance exact", "Post-block subject balance exact", "Pre-block helper balance exact", "Post-block helper balance exact", "Pre-block restored state exact", "Post-block restored state exact", "Commitment #1 unchanged"] as const;
const checks = new Map<string, Outcome>(labels.map((label) => [label, "INDETERMINATE"]));
const set = (label: typeof labels[number], outcome: Outcome) => checks.set(label, outcome);
const rpcOutcome = <T>(result: RpcResult<T>): Outcome => result.kind === "unavailable" ? "INDETERMINATE" : "FAIL";
const priorVerified = step === "step1" ? true : step === "step2" ? state.step1.verified : state.step1.verified && state.step2.verified;
set("Prior step independently verified", priorVerified ? "PASS" : "FAIL");

const chainResult = await rpcWithRetry("eth_chainId", () => client.getChainId(), records);
set("Chain ID = 99801", chainResult.kind === "success" ? (chainResult.value === CHAIN_ID ? "PASS" : "FAIL") : rpcOutcome(chainResult));
let transaction: Awaited<ReturnType<typeof client.getTransaction>> | undefined;
let receipt: Awaited<ReturnType<typeof client.getTransactionReceipt>> | undefined;
if (checks.get("Chain ID = 99801") === "PASS") {
  const [txResult, receiptResult] = await Promise.all([
    rpcWithRetry("eth_getTransactionByHash", () => client.getTransaction({ hash }), records),
    rpcWithRetry("eth_getTransactionReceipt", () => client.getTransactionReceipt({ hash }), records),
  ]);
  if (txResult.kind === "success") {
    transaction = txResult.value;
    set("Transaction exists", "PASS");
    set("Sender correct", getAddress(transaction.from) === SUBJECT ? "PASS" : "FAIL");
    set("Destination correct", transaction.to !== null && getAddress(transaction.to) === definition.destination ? "PASS" : "FAIL");
    try {
      const abi = step === "step3" ? helperArtifact.abi : tokenArtifact.abi;
      const decoded = decodeFunctionData({ abi, data: transaction.input });
      if (step === "step3") set("Exact calldata", decoded.functionName === "restore" && (decoded.args?.length ?? 0) === 0 ? "PASS" : "FAIL");
      else {
        const args = decoded.args as readonly [Address, bigint] | undefined;
        set("Exact calldata", decoded.functionName === "transfer" && args !== undefined && getAddress(args[0]) === HELPER && args[1] === definition.amount ? "PASS" : "FAIL");
      }
    } catch { set("Exact calldata", "FAIL"); }
  } else {
    const outcome = rpcOutcome(txResult);
    for (const label of ["Transaction exists", "Sender correct", "Destination correct", "Exact calldata"] as const) set(label, outcome);
  }
  if (receiptResult.kind === "success") {
    receipt = receiptResult.value;
    set("Receipt exists", "PASS");
    set("Receipt successful", receipt.status === "success" ? "PASS" : "FAIL");
    set("Receipt block inside inclusive window", receipt.blockNumber >= START && receipt.blockNumber <= END ? "PASS" : "FAIL");
    const transfers = receipt.logs.filter((log) => getAddress(log.address) === TOKEN).flatMap((log) => {
      try {
        const decoded = decodeEventLog({ abi: tokenArtifact.abi, eventName: "Transfer", data: log.data, topics: log.topics });
        return [decoded.args as unknown as { from: Address; to: Address; value: bigint }];
      } catch { return []; }
    });
    const exact = transfers.filter((event) => getAddress(event.from) === definition.eventFrom && getAddress(event.to) === definition.eventTo && event.value === definition.amount);
    set("Exactly one exact Transfer event", transfers.length === 1 && exact.length === 1 ? "PASS" : "FAIL");
  } else {
    const outcome = rpcOutcome(receiptResult);
    for (const label of ["Receipt exists", "Receipt successful", "Receipt block inside inclusive window", "Exactly one exact Transfer event"] as const) set(label, outcome);
  }
}

if (receipt) {
  const before = receipt.blockNumber - 1n;
  const at = receipt.blockNumber;
  const [subjectBefore, subjectAfter, helperBefore, helperAfter, restoredBefore, restoredAfter, commitment] = await Promise.all([
    rpcWithRetry("eth_call subject balance before", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [SUBJECT], blockNumber: before }) as Promise<bigint>, records),
    rpcWithRetry("eth_call subject balance after", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [SUBJECT], blockNumber: at }) as Promise<bigint>, records),
    rpcWithRetry("eth_call helper balance before", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [HELPER], blockNumber: before }) as Promise<bigint>, records),
    rpcWithRetry("eth_call helper balance after", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [HELPER], blockNumber: at }) as Promise<bigint>, records),
    rpcWithRetry("eth_call restored before", () => client.readContract({ address: HELPER, abi: helperArtifact.abi, functionName: "restored", blockNumber: before }) as Promise<boolean>, records),
    rpcWithRetry("eth_call restored after", () => client.readContract({ address: HELPER, abi: helperArtifact.abi, functionName: "restored", blockNumber: at }) as Promise<boolean>, records),
    rpcWithRetry("eth_call commitment at receipt", () => client.readContract({ address: SICHER, abi: sicherArtifact.abi, functionName: "commitments", args: [1n], blockNumber: at }) as Promise<readonly [bigint, Address, Address, Address, bigint, bigint, bigint]>, records),
  ]);
  const exact = <T>(result: RpcResult<T>, expected: T): Outcome => result.kind === "success" ? (result.value === expected ? "PASS" : "FAIL") : rpcOutcome(result);
  set("Pre-block subject balance exact", exact(subjectBefore, definition.preSubject));
  set("Post-block subject balance exact", exact(subjectAfter, definition.postSubject));
  set("Pre-block helper balance exact", exact(helperBefore, definition.preHelper));
  set("Post-block helper balance exact", exact(helperAfter, definition.postHelper));
  set("Pre-block restored state exact", exact(restoredBefore, definition.preRestored));
  set("Post-block restored state exact", exact(restoredAfter, definition.postRestored));
  if (commitment.kind === "success") {
    const [id, creator, subject, token, minimum, start, end] = commitment.value;
    set("Commitment #1 unchanged", id === 1n && getAddress(creator) === SUBJECT && getAddress(subject) === SUBJECT && getAddress(token) === TOKEN && minimum === MINIMUM && start === START && end === END ? "PASS" : "FAIL");
  } else set("Commitment #1 unchanged", rpcOutcome(commitment));
}

const results = labels.map((label) => ({ label, outcome: checks.get(label) ?? "INDETERMINATE" }));
const pass = results.filter((result) => result.outcome === "PASS").length;
const fail = results.filter((result) => result.outcome === "FAIL").length;
const indeterminate = results.filter((result) => result.outcome === "INDETERMINATE").length;
const overall: Outcome = fail ? "FAIL" : indeterminate ? "INDETERMINATE" : "PASS";
if (overall === "PASS" && receipt) {
  state[step] = { verified: true, transaction: hash, block: receipt.blockNumber.toString() };
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  const manifestPath = "evidence/phase5-min-balance.manifest.json";
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, any>;
  manifest.experimentTransfers[definition.sequence - 1].transaction = hash;
  manifest.experimentTransfers[definition.sequence - 1].block = receipt.blockNumber.toString();
  manifest.experimentTransfers[definition.sequence - 1].verification = { pass, fail, indeterminate, verdict: overall };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
console.log(`SICHER ELYSIUM PHASE 5E — ${step.toUpperCase()} VERIFICATION`);
for (const result of results) console.log(`[${result.outcome}] ${result.label}`);
console.log(`TOTAL: ${pass} PASS / ${fail} FAIL / ${indeterminate} INDETERMINATE`);
console.log(`OVERALL VERDICT: ${overall}`);
console.log(`TRANSACTION: ${transaction?.hash ?? hash}`);
console.log(`RECEIPT BLOCK: ${receipt?.blockNumber ?? "unavailable"}`);
console.log(`NEXT STEP UNLOCKED: ${overall === "PASS" && step !== "step3" ? "YES — refresh experiment.html" : "NO"}`);
if (overall !== "PASS") process.exitCode = 1;
