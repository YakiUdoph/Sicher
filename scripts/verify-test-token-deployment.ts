import { readFileSync } from "node:fs";
import {
  createPublicClient,
  decodeEventLog,
  defineChain,
  formatEther,
  formatGwei,
  getAddress,
  getContractAddress,
  http,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { INTENDED_TEST_WALLET } from "./phase2-wallet-config.ts";

const EXPECTED_CHAIN_ID = 99801;
const EXPECTED_PREDICTED_ADDRESS = "0x14fc373Dce148766a3B8d9C2BF5f02F8dbe316a7" as Address;
const EXPECTED_SUPPLY = 1_000_000n * 10n ** 18n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const MAX_RPC_ATTEMPTS = 3;
const RPC_TIMEOUT_MS = 12_000;
const RETRY_DELAYS_MS = [400, 800] as const;

type Outcome = "PASS" | "FAIL" | "INDETERMINATE";
type RpcResult<T> =
  | { kind: "success"; value: T; attempts: number }
  | { kind: "error"; error: string; attempts: number }
  | { kind: "unavailable"; error: string; attempts: number };
type RpcRecord = { method: string; attempts: number; outcome: string; error?: string };

const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();
const suppliedHash = process.env.TOKEN_DEPLOYMENT_TX_HASH?.trim() as Hex | undefined;
if (!rpcUrl) {
  console.error("Error: ELYSIUM_RPC_URL is missing or empty.");
  process.exit(1);
}
if (!suppliedHash || !/^0x[0-9a-fA-F]{64}$/.test(suppliedHash)) {
  console.error("Error: TOKEN_DEPLOYMENT_TX_HASH is missing or invalid.");
  process.exit(1);
}

const artifact = JSON.parse(readFileSync("artifacts/SicherTestToken.json", "utf8")) as {
  abi: Abi;
  bytecode: Hex;
  deployedBytecode: Hex;
};
const chain = defineChain({
  id: EXPECTED_CHAIN_ID,
  name: "Kinetiq Elysium Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  testnet: true,
});
const client = createPublicClient({
  chain,
  transport: http(rpcUrl, { retryCount: 0, timeout: RPC_TIMEOUT_MS }),
});
const rpcRecords: RpcRecord[] = [];

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const details = error.message.replace(/\s+/g, " ").trim();
    return `${error.name}: ${details}`;
  }
  return String(error).replace(/\s+/g, " ").trim();
}

function isTransientRpcError(error: unknown): boolean {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      parts.push(current.name, current.message);
      current = (current as Error & { cause?: unknown }).cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  const text = parts.join(" ").toLowerCase();
  return [
    "timeout",
    "timed out",
    "fetch failed",
    "network",
    "econnreset",
    "econnrefused",
    "etimedout",
    "socket hang up",
    "http request failed",
    "status: 408",
    "status: 429",
    "status: 500",
    "status: 502",
    "status: 503",
    "status: 504",
  ].some((fragment) => text.includes(fragment));
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function rpcWithRetry<T>(method: string, operation: () => Promise<T>): Promise<RpcResult<T>> {
  for (let attempt = 1; attempt <= MAX_RPC_ATTEMPTS; attempt += 1) {
    try {
      const value = await operation();
      rpcRecords.push({ method, attempts: attempt, outcome: "success" });
      return { kind: "success", value, attempts: attempt };
    } catch (error) {
      const rendered = errorText(error);
      const transient = isTransientRpcError(error);
      if (!transient) {
        rpcRecords.push({ method, attempts: attempt, outcome: "non-retryable error", error: rendered });
        return { kind: "error", error: rendered, attempts: attempt };
      }
      if (attempt === MAX_RPC_ATTEMPTS) {
        rpcRecords.push({ method, attempts: attempt, outcome: "unavailable after retries", error: rendered });
        return { kind: "unavailable", error: rendered, attempts: attempt };
      }
      console.log(`RPC RETRY: ${method} attempt ${attempt + 1}/${MAX_RPC_ATTEMPTS} after ${rendered}`);
      await delay(RETRY_DELAYS_MS[attempt - 1]);
    }
  }
  throw new Error("Unreachable retry state.");
}

const labels = [
  "Chain ID = 99801",
  "Deployment transaction retrieved",
  "Receipt retrieved",
  "Receipt successful",
  "Deployment sender correct",
  "Contract address present",
  "CREATE address matches receipt",
  "Phase 4A prediction matches receipt",
  "Creation bytecode exact match",
  "Runtime bytecode exact match",
  "name correct",
  "symbol correct",
  "decimals correct",
  "totalSupply correct",
  "Initial deployer allocation correct",
  "Constructor Transfer event found",
  "Constructor mint sender = zero address",
  "Constructor mint recipient correct",
  "Constructor mint amount correct",
] as const;
const checks = new Map<string, Outcome>(labels.map((label) => [label, "INDETERMINATE"]));
const setCheck = (label: (typeof labels)[number], outcome: Outcome): void => {
  checks.set(label, outcome);
};
const outcomeForRpc = <T>(result: RpcResult<T>): Outcome =>
  result.kind === "unavailable" ? "INDETERMINATE" : "FAIL";

let transaction: Awaited<ReturnType<typeof client.getTransaction>> | undefined;
let receipt: Awaited<ReturnType<typeof client.getTransactionReceipt>> | undefined;
let contractAddress: Address | undefined;
let predictedAddress: Address | undefined;
let runtimeCode: Hex | undefined;
let tokenName: unknown;
let symbol: unknown;
let decimals: unknown;
let totalSupply: unknown;
let deployerBalance: unknown;

const chainResult = await rpcWithRetry("eth_chainId", () => client.getChainId());
if (chainResult.kind === "success") {
  setCheck("Chain ID = 99801", chainResult.value === EXPECTED_CHAIN_ID ? "PASS" : "FAIL");
}
if (chainResult.kind !== "success") {
  setCheck("Chain ID = 99801", outcomeForRpc(chainResult));
} else if (chainResult.value === EXPECTED_CHAIN_ID) {
  const transactionResult = await rpcWithRetry("eth_getTransactionByHash", () =>
    client.getTransaction({ hash: suppliedHash }),
  );
  if (transactionResult.kind === "success") {
    transaction = transactionResult.value;
    setCheck("Deployment transaction retrieved", "PASS");
    setCheck(
      "Deployment sender correct",
      getAddress(transaction.from) === getAddress(INTENDED_TEST_WALLET) ? "PASS" : "FAIL",
    );
    setCheck(
      "Creation bytecode exact match",
      transaction.input.toLowerCase() === artifact.bytecode.toLowerCase() ? "PASS" : "FAIL",
    );
    predictedAddress = getContractAddress({ from: transaction.from, nonce: BigInt(transaction.nonce) });
  } else {
    const outcome = outcomeForRpc(transactionResult);
    setCheck("Deployment transaction retrieved", outcome);
    setCheck("Deployment sender correct", outcome);
    setCheck("Creation bytecode exact match", outcome);
  }

  const receiptResult = await rpcWithRetry("eth_getTransactionReceipt", () =>
    client.getTransactionReceipt({ hash: suppliedHash }),
  );
  if (receiptResult.kind === "success") {
    receipt = receiptResult.value;
    setCheck("Receipt retrieved", "PASS");
    setCheck("Receipt successful", receipt.status === "success" ? "PASS" : "FAIL");
    contractAddress = receipt.contractAddress ?? undefined;
    setCheck("Contract address present", contractAddress ? "PASS" : "FAIL");
  } else {
    const outcome = outcomeForRpc(receiptResult);
    setCheck("Receipt retrieved", outcome);
    setCheck("Receipt successful", outcome);
    setCheck("Contract address present", outcome);
  }

  if (transaction && receipt && contractAddress && predictedAddress) {
    setCheck(
      "CREATE address matches receipt",
      getAddress(predictedAddress) === getAddress(contractAddress) ? "PASS" : "FAIL",
    );
    setCheck(
      "Phase 4A prediction matches receipt",
      getAddress(EXPECTED_PREDICTED_ADDRESS) === getAddress(contractAddress) ? "PASS" : "FAIL",
    );
  } else {
    const addressDependencyFailed =
      checks.get("Deployment transaction retrieved") === "FAIL" ||
      checks.get("Receipt retrieved") === "FAIL" ||
      checks.get("Contract address present") === "FAIL";
    const dependentOutcome: Outcome = addressDependencyFailed ? "FAIL" : "INDETERMINATE";
    setCheck("CREATE address matches receipt", dependentOutcome);
    setCheck("Phase 4A prediction matches receipt", dependentOutcome);
  }

  if (contractAddress) {
    const codeResult = await rpcWithRetry("eth_getCode", () => client.getCode({ address: contractAddress! }));
    if (codeResult.kind === "success") {
      runtimeCode = codeResult.value;
      setCheck(
        "Runtime bytecode exact match",
        runtimeCode !== undefined &&
          runtimeCode !== "0x" &&
          runtimeCode.toLowerCase() === artifact.deployedBytecode.toLowerCase()
          ? "PASS"
          : "FAIL",
      );
    } else {
      setCheck("Runtime bytecode exact match", outcomeForRpc(codeResult));
    }

    const nameResult = await rpcWithRetry("eth_call name()", () =>
      client.readContract({ address: contractAddress!, abi: artifact.abi, functionName: "name" }),
    );
    if (nameResult.kind === "success") {
      tokenName = nameResult.value;
      setCheck("name correct", tokenName === "Sicher Test Token" ? "PASS" : "FAIL");
    } else setCheck("name correct", outcomeForRpc(nameResult));

    const symbolResult = await rpcWithRetry("eth_call symbol()", () =>
      client.readContract({ address: contractAddress!, abi: artifact.abi, functionName: "symbol" }),
    );
    if (symbolResult.kind === "success") {
      symbol = symbolResult.value;
      setCheck("symbol correct", symbol === "STEST" ? "PASS" : "FAIL");
    } else setCheck("symbol correct", outcomeForRpc(symbolResult));

    const decimalsResult = await rpcWithRetry("eth_call decimals()", () =>
      client.readContract({ address: contractAddress!, abi: artifact.abi, functionName: "decimals" }),
    );
    if (decimalsResult.kind === "success") {
      decimals = decimalsResult.value;
      setCheck("decimals correct", decimals === 18 ? "PASS" : "FAIL");
    } else setCheck("decimals correct", outcomeForRpc(decimalsResult));

    const supplyResult = await rpcWithRetry("eth_call totalSupply()", () =>
      client.readContract({ address: contractAddress!, abi: artifact.abi, functionName: "totalSupply" }),
    );
    if (supplyResult.kind === "success") {
      totalSupply = supplyResult.value;
      setCheck("totalSupply correct", totalSupply === EXPECTED_SUPPLY ? "PASS" : "FAIL");
    } else setCheck("totalSupply correct", outcomeForRpc(supplyResult));

    const balanceResult = await rpcWithRetry("eth_call balanceOf(address)", () =>
      client.readContract({
        address: contractAddress!,
        abi: artifact.abi,
        functionName: "balanceOf",
        args: [INTENDED_TEST_WALLET],
      }),
    );
    if (balanceResult.kind === "success") {
      deployerBalance = balanceResult.value;
      setCheck(
        "Initial deployer allocation correct",
        deployerBalance === EXPECTED_SUPPLY ? "PASS" : "FAIL",
      );
    } else setCheck("Initial deployer allocation correct", outcomeForRpc(balanceResult));
  } else {
    const dependentOutcome: Outcome = checks.get("Contract address present") === "FAIL" ? "FAIL" : "INDETERMINATE";
    for (const label of [
      "Runtime bytecode exact match",
      "name correct",
      "symbol correct",
      "decimals correct",
      "totalSupply correct",
      "Initial deployer allocation correct",
    ] as const) {
      setCheck(label, dependentOutcome);
    }
  }

  if (receipt && contractAddress) {
    let mintEvent: { from: Address; to: Address; value: bigint } | undefined;
    for (const log of receipt.logs) {
      if (getAddress(log.address) !== getAddress(contractAddress)) continue;
      try {
        const decoded = decodeEventLog({
          abi: artifact.abi,
          eventName: "Transfer",
          data: log.data,
          topics: log.topics,
        });
        const args = decoded.args as unknown as { from: Address; to: Address; value: bigint };
        if (getAddress(args.from) === getAddress(ZERO_ADDRESS)) {
          mintEvent = args;
          break;
        }
      } catch {
        // Non-Transfer logs are irrelevant; the required Transfer is checked below.
      }
    }
    setCheck("Constructor Transfer event found", mintEvent ? "PASS" : "FAIL");
    setCheck(
      "Constructor mint sender = zero address",
      mintEvent && getAddress(mintEvent.from) === getAddress(ZERO_ADDRESS) ? "PASS" : "FAIL",
    );
    setCheck(
      "Constructor mint recipient correct",
      mintEvent && getAddress(mintEvent.to) === getAddress(INTENDED_TEST_WALLET) ? "PASS" : "FAIL",
    );
    setCheck("Constructor mint amount correct", mintEvent?.value === EXPECTED_SUPPLY ? "PASS" : "FAIL");
  } else {
    const dependentOutcome: Outcome =
      checks.get("Receipt retrieved") === "FAIL" || checks.get("Contract address present") === "FAIL"
        ? "FAIL"
        : "INDETERMINATE";
    setCheck("Constructor Transfer event found", dependentOutcome);
    setCheck("Constructor mint sender = zero address", dependentOutcome);
    setCheck("Constructor mint recipient correct", dependentOutcome);
    setCheck("Constructor mint amount correct", dependentOutcome);
  }
}

const results = labels.map((label) => ({ label, outcome: checks.get(label) ?? "INDETERMINATE" }));
const passCount = results.filter(({ outcome }) => outcome === "PASS").length;
const failCount = results.filter(({ outcome }) => outcome === "FAIL").length;
const indeterminateCount = results.filter(({ outcome }) => outcome === "INDETERMINATE").length;
const overall: Outcome = failCount > 0 ? "FAIL" : indeterminateCount > 0 ? "INDETERMINATE" : "PASS";
const effectiveGasPrice = receipt?.effectiveGasPrice;
const actualFee = receipt && effectiveGasPrice !== undefined ? receipt.gasUsed * effectiveGasPrice : undefined;
const rpcFailures = rpcRecords.filter(({ outcome }) => outcome !== "success");

console.log("SICHER ELYSIUM PHASE 4B — TOKEN DEPLOYMENT VERIFICATION");
for (const { label, outcome } of results) console.log(`[${outcome}] ${label}`);
console.log("\nTOTAL:");
console.log(`${passCount} PASS / ${failCount} FAIL / ${indeterminateCount} INDETERMINATE`);
console.log("\nOVERALL VERDICT:");
console.log(overall);
console.log("\nTRANSACTION HASH:");
console.log(transaction?.hash ?? suppliedHash);
console.log("\nCONTRACT ADDRESS:");
console.log(contractAddress ?? "unavailable");
console.log("\nDEPLOYMENT NONCE:");
console.log(transaction?.nonce ?? "unavailable");
console.log("\nBLOCK:");
console.log(receipt?.blockNumber ?? "unavailable");
console.log("\nGAS USED:");
console.log(receipt?.gasUsed ?? "unavailable");
console.log("\nEFFECTIVE GAS PRICE:");
console.log(
  effectiveGasPrice === undefined
    ? "unavailable"
    : `${formatGwei(effectiveGasPrice)} gwei (${effectiveGasPrice} wei)`,
);
console.log("\nACTUAL DEPLOYMENT FEE:");
console.log(actualFee === undefined ? "unavailable" : `${formatEther(actualFee)} HYPE (${actualFee} wei)`);
console.log("\nTOKEN NAME:");
console.log(tokenName ?? "unavailable");
console.log("\nSYMBOL:");
console.log(symbol ?? "unavailable");
console.log("\nDECIMALS:");
console.log(decimals ?? "unavailable");
console.log("\nTOTAL SUPPLY:");
console.log(totalSupply ?? "unavailable");
console.log("\nDEPLOYER TOKEN BALANCE:");
console.log(deployerBalance ?? "unavailable");
console.log("\nRPC RETRIES:");
for (const record of rpcRecords) {
  console.log(`${record.method}: ${record.attempts} attempt(s), ${record.outcome}`);
}
console.log("\nRPC FAILURES AFTER RETRIES:");
if (rpcFailures.length === 0) console.log("NONE");
else {
  for (const failure of rpcFailures) {
    console.log(`${failure.method}: ${failure.outcome}: ${failure.error ?? "unknown error"}`);
  }
}
console.log("\nSECURITY FINDINGS:");
console.log("Read-only public client used; no signing account, private key, transaction send, or token transfer.");

if (overall !== "PASS") process.exitCode = 1;
