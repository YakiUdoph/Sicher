import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  defineChain,
  getAddress,
  getContractAddress,
  http,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import {
  HELPER_RETURN_AMOUNT,
  HELPER_SUBJECT,
  HELPER_TOKEN,
  expectedHelperRuntime,
  helperCreationData,
  type HelperArtifact,
} from "./return-helper-build.ts";
import { rpcWithRetry, type RpcAttemptRecord, type RpcResult } from "./rpc-retry.ts";

const EXPECTED_CHAIN_ID = 99801;
type Outcome = "PASS" | "FAIL" | "INDETERMINATE";
const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();
const suppliedHash = process.env.HELPER_DEPLOYMENT_TX_HASH?.trim() as Hex | undefined;
if (!rpcUrl) { console.error("ELYSIUM_RPC_URL is required."); process.exit(1); }
if (!suppliedHash || !/^0x[0-9a-fA-F]{64}$/.test(suppliedHash)) {
  console.error("HELPER_DEPLOYMENT_TX_HASH is required and must be a 32-byte hash.");
  process.exit(1);
}
const artifact = JSON.parse(readFileSync("artifacts/SicherTestReturnHelper.json", "utf8")) as HelperArtifact;
const tokenArtifact = JSON.parse(readFileSync("artifacts/SicherTestToken.json", "utf8")) as { abi: Abi };
const predeployment = JSON.parse(readFileSync("phase5-tool/predeployment.json", "utf8")) as { pendingNonce: number | null; predictedAddress: Address | null };
const expectedCreationData = helperCreationData(artifact);
const expectedRuntime = expectedHelperRuntime(artifact);
const chain = defineChain({ id: EXPECTED_CHAIN_ID, name: "Kinetiq Elysium Testnet", nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } }, testnet: true });
const client = createPublicClient({ chain, transport: http(rpcUrl, { retryCount: 0, timeout: 12_000 }) });
const records: RpcAttemptRecord[] = [];
const labels = [
  "Chain ID = 99801", "Deployment transaction retrieved", "Receipt retrieved", "Receipt successful",
  "Deployment sender correct", "Contract address present", "CREATE address matches receipt",
  "Predeployment prediction matches if nonce unchanged", "Creation input exact match",
  "Runtime bytecode exact match after compiler-declared immutable substitution", "token() correct", "subject() correct",
  "RETURN_AMOUNT correct", "restored initially false", "Initial helper STEST balance = 0",
] as const;
const checks = new Map<string, Outcome>(labels.map((label) => [label, "INDETERMINATE"]));
const set = (label: typeof labels[number], value: Outcome) => checks.set(label, value);
const rpcOutcome = <T>(result: RpcResult<T>): Outcome => result.kind === "unavailable" ? "INDETERMINATE" : "FAIL";

let transaction: Awaited<ReturnType<typeof client.getTransaction>> | undefined;
let receipt: Awaited<ReturnType<typeof client.getTransactionReceipt>> | undefined;
let contractAddress: Address | undefined;
let calculatedAddress: Address | undefined;
let actualToken: unknown;
let actualSubject: unknown;
let actualReturnAmount: unknown;
let restored: unknown;
let helperBalance: unknown;
let predictionNote = "unavailable";
let actualRuntimeSha256 = "unavailable";
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const genericRuntimeSha256 = sha256(artifact.deployedBytecode);
const constructorSpecializedRuntimeSha256 = sha256(expectedRuntime);

const chainResult = await rpcWithRetry("eth_chainId", () => client.getChainId(), records);
if (chainResult.kind === "success") set("Chain ID = 99801", chainResult.value === EXPECTED_CHAIN_ID ? "PASS" : "FAIL");
else set("Chain ID = 99801", rpcOutcome(chainResult));

if (chainResult.kind === "success" && chainResult.value === EXPECTED_CHAIN_ID) {
  const txResult = await rpcWithRetry("eth_getTransactionByHash", () => client.getTransaction({ hash: suppliedHash }), records);
  if (txResult.kind === "success") {
    transaction = txResult.value;
    set("Deployment transaction retrieved", "PASS");
    set("Deployment sender correct", getAddress(transaction.from) === getAddress(HELPER_SUBJECT) ? "PASS" : "FAIL");
    set("Creation input exact match", transaction.input.toLowerCase() === expectedCreationData.toLowerCase() ? "PASS" : "FAIL");
    calculatedAddress = getContractAddress({ from: transaction.from, nonce: BigInt(transaction.nonce) });
  } else {
    const outcome = rpcOutcome(txResult);
    set("Deployment transaction retrieved", outcome); set("Deployment sender correct", outcome); set("Creation input exact match", outcome);
  }
  const receiptResult = await rpcWithRetry("eth_getTransactionReceipt", () => client.getTransactionReceipt({ hash: suppliedHash }), records);
  if (receiptResult.kind === "success") {
    receipt = receiptResult.value;
    contractAddress = receipt.contractAddress ?? undefined;
    set("Receipt retrieved", "PASS");
    set("Receipt successful", receipt.status === "success" ? "PASS" : "FAIL");
    set("Contract address present", contractAddress ? "PASS" : "FAIL");
  } else {
    const outcome = rpcOutcome(receiptResult);
    set("Receipt retrieved", outcome); set("Receipt successful", outcome); set("Contract address present", outcome);
  }
  if (calculatedAddress && contractAddress) {
    set("CREATE address matches receipt", getAddress(calculatedAddress) === getAddress(contractAddress) ? "PASS" : "FAIL");
  } else set("CREATE address matches receipt", checks.get("Contract address present") === "FAIL" ? "FAIL" : "INDETERMINATE");

  if (transaction && contractAddress) {
    if (predeployment.pendingNonce === transaction.nonce) {
      const match = predeployment.predictedAddress !== null && getAddress(predeployment.predictedAddress) === getAddress(contractAddress);
      set("Predeployment prediction matches if nonce unchanged", match ? "PASS" : "FAIL");
      predictionNote = `nonce unchanged (${transaction.nonce}); comparison required`;
    } else {
      set("Predeployment prediction matches if nonce unchanged", "PASS");
      predictionNote = `not applicable: predeployment nonce ${predeployment.pendingNonce ?? "unavailable"}, deployment nonce ${transaction.nonce}`;
    }
  }

  if (contractAddress) {
    const codeResult = await rpcWithRetry("eth_getCode", () => client.getCode({ address: contractAddress! }), records);
    if (codeResult.kind === "success") {
      actualRuntimeSha256 = codeResult.value === undefined ? "unavailable" : sha256(codeResult.value);
      set("Runtime bytecode exact match after compiler-declared immutable substitution", codeResult.value?.toLowerCase() === expectedRuntime.toLowerCase() ? "PASS" : "FAIL");
    } else set("Runtime bytecode exact match after compiler-declared immutable substitution", rpcOutcome(codeResult));
    const tokenResult = await rpcWithRetry("eth_call token()", () => client.readContract({ address: contractAddress!, abi: artifact.abi, functionName: "token" }), records);
    if (tokenResult.kind === "success") { actualToken = tokenResult.value; set("token() correct", getAddress(String(actualToken)) === getAddress(HELPER_TOKEN) ? "PASS" : "FAIL"); }
    else set("token() correct", rpcOutcome(tokenResult));
    const subjectResult = await rpcWithRetry("eth_call subject()", () => client.readContract({ address: contractAddress!, abi: artifact.abi, functionName: "subject" }), records);
    if (subjectResult.kind === "success") { actualSubject = subjectResult.value; set("subject() correct", getAddress(String(actualSubject)) === getAddress(HELPER_SUBJECT) ? "PASS" : "FAIL"); }
    else set("subject() correct", rpcOutcome(subjectResult));
    const amountResult = await rpcWithRetry("eth_call RETURN_AMOUNT()", () => client.readContract({ address: contractAddress!, abi: artifact.abi, functionName: "RETURN_AMOUNT" }), records);
    if (amountResult.kind === "success") { actualReturnAmount = amountResult.value; set("RETURN_AMOUNT correct", actualReturnAmount === HELPER_RETURN_AMOUNT ? "PASS" : "FAIL"); }
    else set("RETURN_AMOUNT correct", rpcOutcome(amountResult));
    const restoredResult = await rpcWithRetry("eth_call restored()", () => client.readContract({ address: contractAddress!, abi: artifact.abi, functionName: "restored" }), records);
    if (restoredResult.kind === "success") { restored = restoredResult.value; set("restored initially false", restored === false ? "PASS" : "FAIL"); }
    else set("restored initially false", rpcOutcome(restoredResult));
    const balanceResult = await rpcWithRetry("eth_call STEST balanceOf(helper)", () => client.readContract({ address: HELPER_TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [contractAddress!] }), records);
    if (balanceResult.kind === "success") { helperBalance = balanceResult.value; set("Initial helper STEST balance = 0", helperBalance === 0n ? "PASS" : "FAIL"); }
    else set("Initial helper STEST balance = 0", rpcOutcome(balanceResult));
  }
}

const results = labels.map((label) => ({ label, outcome: checks.get(label) ?? "INDETERMINATE" }));
const pass = results.filter(({ outcome }) => outcome === "PASS").length;
const fail = results.filter(({ outcome }) => outcome === "FAIL").length;
const indeterminate = results.filter(({ outcome }) => outcome === "INDETERMINATE").length;
const overall: Outcome = fail > 0 ? "FAIL" : indeterminate > 0 ? "INDETERMINATE" : "PASS";
console.log("SICHER ELYSIUM PHASE 5B — RETURN HELPER DEPLOYMENT VERIFICATION");
for (const result of results) console.log(`[${result.outcome}] ${result.label}`);
console.log(`TOTAL: ${pass} PASS / ${fail} FAIL / ${indeterminate} INDETERMINATE`);
console.log(`OVERALL VERDICT: ${overall}`);
console.log(`TRANSACTION HASH: ${transaction?.hash ?? suppliedHash}`);
console.log(`SENDER: ${transaction?.from ?? "unavailable"}`);
console.log(`DEPLOYMENT NONCE: ${transaction?.nonce ?? "unavailable"}`);
console.log(`CONTRACT ADDRESS: ${contractAddress ?? "unavailable"}`);
console.log(`CALCULATED CREATE ADDRESS: ${calculatedAddress ?? "unavailable"}`);
console.log(`PREDEPLOYMENT PREDICTED ADDRESS: ${predeployment.predictedAddress ?? "unavailable"}`);
console.log(`PREDICTION NOTE: ${predictionNote}`);
console.log(`GENERIC RUNTIME TEMPLATE SHA256: ${genericRuntimeSha256}`);
console.log(`CONSTRUCTOR-SPECIALIZED RUNTIME SHA256: ${constructorSpecializedRuntimeSha256}`);
console.log(`ACTUAL ON-CHAIN RUNTIME SHA256: ${actualRuntimeSha256}`);
console.log("RUNTIME VERIFICATION METHOD: patch only solc immutableReferences with verified constructor values, then require exact byte-for-byte equality");
console.log(`BLOCK: ${receipt?.blockNumber ?? "unavailable"}`);
console.log(`TOKEN: ${actualToken ?? "unavailable"}`);
console.log(`SUBJECT: ${actualSubject ?? "unavailable"}`);
console.log(`RETURN AMOUNT: ${actualReturnAmount ?? "unavailable"}`);
console.log(`RESTORED: ${restored ?? "unavailable"}`);
console.log(`HELPER STEST BALANCE: ${helperBalance ?? "unavailable"}`);
console.log("RPC ATTEMPTS:");
for (const record of records) console.log(`${record.method}: ${record.attempts} attempt(s), ${record.outcome}${record.error ? ` — ${record.error}` : ""}`);
console.log("TRANSACTION SIGNED BY CODEX: NO");
console.log("TRANSACTION BROADCAST BY CODEX: NO");
if (overall !== "PASS") process.exitCode = 1;
