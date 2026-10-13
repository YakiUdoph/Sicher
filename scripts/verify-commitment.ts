import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
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
const SETUP_BLOCK = 8_110_482n;
const EXPECTED_BALANCE = 100_000n * 10n ** 18n;
const MINIMUM = 80_000n * 10n ** 18n;
type Outcome = "PASS" | "FAIL" | "INDETERMINATE";
const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();
const suppliedHash = process.env.COMMITMENT_TX_HASH?.trim() as Hex | undefined;
if (!rpcUrl) { console.error("ELYSIUM_RPC_URL is required."); process.exit(1); }
if (!suppliedHash || !/^0x[0-9a-fA-F]{64}$/.test(suppliedHash)) { console.error("COMMITMENT_TX_HASH is required and must be a 32-byte hash."); process.exit(1); }

const tokenArtifact = JSON.parse(readFileSync("artifacts/SicherTestToken.json", "utf8")) as { abi: Abi };
const sicherArtifact = JSON.parse(readFileSync("artifacts/SicherCommitmentProof.json", "utf8")) as { abi: Abi };
const helperArtifact = JSON.parse(readFileSync("artifacts/SicherTestReturnHelper.json", "utf8")) as { abi: Abi };
const chain = defineChain({ id: EXPECTED_CHAIN_ID, name: "Kinetiq Elysium Testnet", nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } }, testnet: true });
const client = createPublicClient({ chain, transport: http(rpcUrl, { retryCount: 0, timeout: 12_000 }) });
const records: RpcAttemptRecord[] = [];
const labels = [
  "Chain ID = 99801", "Transaction exists", "Receipt exists", "Receipt successful", "Sender is subject A086", "Destination is Sicher contract",
  "Calldata invokes createCommitment", "Calldata subject correct", "Calldata token correct", "Calldata minimum correct",
  "Setup block precedes commitment creation", "Commitment creation precedes startBlock", "startBlock precedes endBlock",
  "Exactly one CommitmentCreated event", "Expected commitment ID = 1", "Commitment #1 exists after receipt",
  "Stored creator correct", "Stored subject correct", "Stored token correct", "Stored minimum correct", "Stored startBlock matches calldata", "Stored endBlock matches calldata",
  "nextCommitmentId becomes 2", "Subject balance remains 100,000 STEST", "Helper balance remains 0", "Helper restored remains false",
] as const;
const checks = new Map<string, Outcome>(labels.map((label) => [label, "INDETERMINATE"]));
const set = (label: typeof labels[number], outcome: Outcome) => checks.set(label, outcome);
const rpcOutcome = <T>(result: RpcResult<T>): Outcome => result.kind === "unavailable" ? "INDETERMINATE" : "FAIL";

let transaction: Awaited<ReturnType<typeof client.getTransaction>> | undefined;
let receipt: Awaited<ReturnType<typeof client.getTransactionReceipt>> | undefined;
let decodedTerms: { subject: Address; token: Address; minimum: bigint; start: bigint; end: bigint } | undefined;
const chainResult = await rpcWithRetry("eth_chainId", () => client.getChainId(), records);
if (chainResult.kind === "success") set("Chain ID = 99801", chainResult.value === EXPECTED_CHAIN_ID ? "PASS" : "FAIL");
else set("Chain ID = 99801", rpcOutcome(chainResult));

if (checks.get("Chain ID = 99801") === "PASS") {
  const [txResult, receiptResult] = await Promise.all([
    rpcWithRetry("eth_getTransactionByHash", () => client.getTransaction({ hash: suppliedHash }), records),
    rpcWithRetry("eth_getTransactionReceipt", () => client.getTransactionReceipt({ hash: suppliedHash }), records),
  ]);
  if (txResult.kind === "success") {
    transaction = txResult.value;
    set("Transaction exists", "PASS");
    set("Sender is subject A086", getAddress(transaction.from) === SUBJECT ? "PASS" : "FAIL");
    set("Destination is Sicher contract", transaction.to !== null && getAddress(transaction.to) === SICHER ? "PASS" : "FAIL");
    try {
      const decoded = decodeFunctionData({ abi: sicherArtifact.abi, data: transaction.input });
      const args = decoded.args as readonly [Address, Address, bigint, bigint, bigint] | undefined;
      set("Calldata invokes createCommitment", decoded.functionName === "createCommitment" && args !== undefined ? "PASS" : "FAIL");
      if (decoded.functionName === "createCommitment" && args) {
        decodedTerms = { subject: getAddress(args[0]), token: getAddress(args[1]), minimum: args[2], start: args[3], end: args[4] };
        set("Calldata subject correct", decodedTerms.subject === SUBJECT ? "PASS" : "FAIL");
        set("Calldata token correct", decodedTerms.token === TOKEN ? "PASS" : "FAIL");
        set("Calldata minimum correct", decodedTerms.minimum === MINIMUM ? "PASS" : "FAIL");
        set("startBlock precedes endBlock", decodedTerms.start < decodedTerms.end ? "PASS" : "FAIL");
      }
    } catch { set("Calldata invokes createCommitment", "FAIL"); set("Calldata subject correct", "FAIL"); set("Calldata token correct", "FAIL"); set("Calldata minimum correct", "FAIL"); set("startBlock precedes endBlock", "FAIL"); }
  } else {
    const value = rpcOutcome(txResult);
    for (const label of ["Transaction exists", "Sender is subject A086", "Destination is Sicher contract", "Calldata invokes createCommitment", "Calldata subject correct", "Calldata token correct", "Calldata minimum correct", "startBlock precedes endBlock"] as const) set(label, value);
  }
  if (receiptResult.kind === "success") {
    receipt = receiptResult.value;
    set("Receipt exists", "PASS");
    set("Receipt successful", receipt.status === "success" ? "PASS" : "FAIL");
    set("Setup block precedes commitment creation", SETUP_BLOCK < receipt.blockNumber ? "PASS" : "FAIL");
    if (decodedTerms) set("Commitment creation precedes startBlock", receipt.blockNumber < decodedTerms.start ? "PASS" : "FAIL");
    const events = receipt.logs.filter((log) => getAddress(log.address) === SICHER).flatMap((log) => {
      try {
        const decoded = decodeEventLog({ abi: sicherArtifact.abi, eventName: "CommitmentCreated", data: log.data, topics: log.topics });
        return [decoded.args as unknown as { id: bigint; creator: Address; subject: Address; token: Address; minimumBalance: bigint; startBlock: bigint; endBlock: bigint }];
      } catch { return []; }
    });
    set("Exactly one CommitmentCreated event", events.length === 1 ? "PASS" : "FAIL");
    set("Expected commitment ID = 1", events.length === 1 && events[0].id === 1n ? "PASS" : "FAIL");
  } else {
    const value = rpcOutcome(receiptResult);
    for (const label of ["Receipt exists", "Receipt successful", "Setup block precedes commitment creation", "Commitment creation precedes startBlock", "Exactly one CommitmentCreated event", "Expected commitment ID = 1"] as const) set(label, value);
  }
}

if (receipt && decodedTerms) {
  const at = receipt.blockNumber;
  const [commitment, nextId, subjectBalance, helperBalance, restored] = await Promise.all([
    rpcWithRetry("eth_call commitments(1) at receipt block", () => client.readContract({ address: SICHER, abi: sicherArtifact.abi, functionName: "commitments", args: [1n], blockNumber: at }) as Promise<readonly [bigint, Address, Address, Address, bigint, bigint, bigint]>, records),
    rpcWithRetry("eth_call nextCommitmentId at receipt block", () => client.readContract({ address: SICHER, abi: sicherArtifact.abi, functionName: "nextCommitmentId", blockNumber: at }) as Promise<bigint>, records),
    rpcWithRetry("eth_call subject balance at receipt block", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [SUBJECT], blockNumber: at }) as Promise<bigint>, records),
    rpcWithRetry("eth_call helper balance at receipt block", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [HELPER], blockNumber: at }) as Promise<bigint>, records),
    rpcWithRetry("eth_call helper restored at receipt block", () => client.readContract({ address: HELPER, abi: helperArtifact.abi, functionName: "restored", blockNumber: at }) as Promise<boolean>, records),
  ]);
  if (commitment.kind === "success") {
    const [id, creator, subject, token, minimum, start, end] = commitment.value;
    set("Commitment #1 exists after receipt", id === 1n ? "PASS" : "FAIL");
    set("Stored creator correct", getAddress(creator) === SUBJECT ? "PASS" : "FAIL");
    set("Stored subject correct", getAddress(subject) === SUBJECT ? "PASS" : "FAIL");
    set("Stored token correct", getAddress(token) === TOKEN ? "PASS" : "FAIL");
    set("Stored minimum correct", minimum === MINIMUM ? "PASS" : "FAIL");
    set("Stored startBlock matches calldata", start === decodedTerms.start ? "PASS" : "FAIL");
    set("Stored endBlock matches calldata", end === decodedTerms.end ? "PASS" : "FAIL");
  } else {
    const value = rpcOutcome(commitment);
    for (const label of ["Commitment #1 exists after receipt", "Stored creator correct", "Stored subject correct", "Stored token correct", "Stored minimum correct", "Stored startBlock matches calldata", "Stored endBlock matches calldata"] as const) set(label, value);
  }
  set("nextCommitmentId becomes 2", nextId.kind === "success" ? (nextId.value === 2n ? "PASS" : "FAIL") : rpcOutcome(nextId));
  set("Subject balance remains 100,000 STEST", subjectBalance.kind === "success" ? (subjectBalance.value === EXPECTED_BALANCE ? "PASS" : "FAIL") : rpcOutcome(subjectBalance));
  set("Helper balance remains 0", helperBalance.kind === "success" ? (helperBalance.value === 0n ? "PASS" : "FAIL") : rpcOutcome(helperBalance));
  set("Helper restored remains false", restored.kind === "success" ? (restored.value === false ? "PASS" : "FAIL") : rpcOutcome(restored));
}

const results = labels.map((label) => ({ label, outcome: checks.get(label) ?? "INDETERMINATE" }));
const pass = results.filter(({ outcome }) => outcome === "PASS").length;
const fail = results.filter(({ outcome }) => outcome === "FAIL").length;
const indeterminate = results.filter(({ outcome }) => outcome === "INDETERMINATE").length;
const overall: Outcome = fail > 0 ? "FAIL" : indeterminate > 0 ? "INDETERMINATE" : "PASS";
if (overall === "PASS" && receipt && decodedTerms) {
  const manifestPath = "evidence/phase5-min-balance.manifest.json";
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, any>;
  manifest.terms.startBlock = decodedTerms.start.toString();
  manifest.terms.endBlock = decodedTerms.end.toString();
  manifest.commitment = { id: "1", creationTransaction: suppliedHash, creationBlock: receipt.blockNumber.toString(), verification: { pass, fail, indeterminate, verdict: overall } };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync("phase5-tool/verified-commitment.json", `${JSON.stringify({ verified: true, transaction: suppliedHash, creationBlock: receipt.blockNumber.toString(), id: "1", startBlock: decodedTerms.start.toString(), endBlock: decodedTerms.end.toString() }, null, 2)}\n`, "utf8");
}

console.log("SICHER ELYSIUM PHASE 5D — POST-COMMITMENT VERIFICATION");
for (const result of results) console.log(`[${result.outcome}] ${result.label}`);
console.log(`TOTAL: ${pass} PASS / ${fail} FAIL / ${indeterminate} INDETERMINATE`);
console.log(`OVERALL VERDICT: ${overall}`);
console.log(`COMMITMENT TRANSACTION: ${transaction?.hash ?? suppliedHash}`);
console.log(`COMMITMENT CREATION BLOCK: ${receipt?.blockNumber ?? "unavailable"}`);
console.log(`AUTHORITATIVE START BLOCK FROM CALLDATA: ${decodedTerms?.start ?? "unavailable"}`);
console.log(`AUTHORITATIVE END BLOCK FROM CALLDATA: ${decodedTerms?.end ?? "unavailable"}`);
console.log(`EVIDENCE MANIFEST UPDATED: ${overall === "PASS" ? "YES" : "NO"}`);
console.log("RPC ATTEMPTS:");
for (const record of records) console.log(`${record.method}: ${record.attempts} attempt(s), ${record.outcome}${record.error ? ` — ${record.error}` : ""}`);
if (overall !== "PASS") process.exitCode = 1;
