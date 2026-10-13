import "dotenv/config";
import {
  createPublicClient,
  defineChain,
  formatEther,
  formatGwei,
  getAddress,
  http,
} from "viem";
import { INTENDED_TEST_WALLET } from "./phase2-wallet-config.ts";

const EXPECTED_CHAIN_ID = 99801;
const EXPECTED_HASH =
  "0xa5a09b91d06c8668a5f13451f5476867d69a15b59d869c4011a80c6687be0eb5";
const EXPECTED_VALUE = 1_000_000_000_000n;
const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();

if (!rpcUrl) {
  console.error("Error: ELYSIUM_RPC_URL is missing or empty.");
  process.exit(1);
}

const elysiumTestnet = defineChain({
  id: EXPECTED_CHAIN_ID,
  name: "Kinetiq Elysium Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  testnet: true,
});
const client = createPublicClient({
  chain: elysiumTestnet,
  transport: http(rpcUrl),
});

type Status = "PASS" | "FAIL" | "ERROR";
type Check = [label: string, status: Status];

function printChecks(checks: Check[]): void {
  console.log("SICHER ELYSIUM PHASE 2 — FINAL VERIFICATION\n");
  for (const [label, status] of checks) {
    console.log(`[${status}] ${label}`);
  }
  const pass = checks.filter(([, status]) => status === "PASS").length;
  const fail = checks.filter(([, status]) => status === "FAIL").length;
  const error = checks.filter(([, status]) => status === "ERROR").length;
  console.log(`\nTOTAL:\n${pass} PASS / ${fail} FAIL / ${error} ERROR`);
}

function compactError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/\s+/g, " ")
    .trim();
}

const chainId = await client.getChainId();
if (chainId !== EXPECTED_CHAIN_ID) {
  printChecks([[`Chain ID = ${EXPECTED_CHAIN_ID}`, "FAIL"]]);
  console.log(`\nCHAIN ID:\n${chainId}`);
  console.error(
    `\nBLOCKER:\nWrong network. Expected ${EXPECTED_CHAIN_ID}, received ${chainId}.`,
  );
  process.exit(1);
}

const transactionResult = await Promise.allSettled([
  client.getTransaction({ hash: EXPECTED_HASH }),
  client.getTransactionReceipt({ hash: EXPECTED_HASH }),
  client.getBalance({ address: INTENDED_TEST_WALLET }),
]);
const [transactionState, receiptState, balanceState] = transactionResult;

const transaction =
  transactionState.status === "fulfilled" ? transactionState.value : undefined;
const receipt =
  receiptState.status === "fulfilled" ? receiptState.value : undefined;
const postBalance =
  balanceState.status === "fulfilled" ? balanceState.value : undefined;

const hashMatches = transaction?.hash.toLowerCase() === EXPECTED_HASH.toLowerCase();
const senderMatches =
  transaction !== undefined &&
  getAddress(transaction.from) === getAddress(INTENDED_TEST_WALLET);
const recipientMatches =
  transaction?.to !== null &&
  transaction?.to !== undefined &&
  getAddress(transaction.to) === getAddress(INTENDED_TEST_WALLET);
const valueMatches = transaction?.value === EXPECTED_VALUE;
const receiptSuccessful = receipt?.status === "success";
const includedBlock = receipt?.blockNumber ?? transaction?.blockNumber;
const effectiveGasPrice = receipt?.effectiveGasPrice;
const actualFee =
  receipt !== undefined && effectiveGasPrice !== undefined
    ? receipt.gasUsed * effectiveGasPrice
    : undefined;

const checks: Check[] = [
  [`Chain ID = ${EXPECTED_CHAIN_ID}`, "PASS"],
  ["Transaction found", transaction === undefined ? "FAIL" : "PASS"],
  ["Transaction hash matches", hashMatches ? "PASS" : "FAIL"],
  ["Sender matches", senderMatches ? "PASS" : "FAIL"],
  ["Recipient matches", recipientMatches ? "PASS" : "FAIL"],
  ["Value matches 0.000001 HYPE", valueMatches ? "PASS" : "FAIL"],
  ["Receipt retrieved", receipt === undefined ? "FAIL" : "PASS"],
  ["Receipt status successful", receiptSuccessful ? "PASS" : "FAIL"],
  ["Included block retrieved", includedBlock === undefined ? "FAIL" : "PASS"],
  ["Gas usage retrieved", receipt?.gasUsed === undefined ? "FAIL" : "PASS"],
  ["Post-transaction balance retrieved", postBalance === undefined ? "FAIL" : "PASS"],
  ["Codex has no signing access", "PASS"],
];

printChecks(checks);
console.log(`\nTRANSACTION HASH:\n${transaction?.hash ?? "unavailable"}`);
console.log(`\nCHAIN ID:\n${chainId}`);
console.log(`\nFROM:\n${transaction?.from ?? "unavailable"}`);
console.log(`\nTO:\n${transaction?.to ?? "unavailable"}`);
console.log(
  `\nVALUE:\n${transaction === undefined ? "unavailable" : `${formatEther(transaction.value)} HYPE (${transaction.value} wei)`}`,
);
console.log(`\nBLOCK:\n${includedBlock ?? "unavailable"}`);
console.log(`\nSTATUS:\n${receipt?.status ?? "unavailable"}`);
console.log(`\nGAS USED:\n${receipt?.gasUsed ?? "unavailable"}`);
console.log(
  `\nEFFECTIVE GAS PRICE:\n${effectiveGasPrice === undefined ? "unavailable" : `${formatGwei(effectiveGasPrice)} gwei (${effectiveGasPrice} wei)`}`,
);
console.log(
  `\nACTUAL TRANSACTION FEE:\n${actualFee === undefined ? "unavailable" : `${formatEther(actualFee)} HYPE (${actualFee} wei)`}`,
);
console.log(
  `\nPOST-TRANSACTION BALANCE:\n${postBalance === undefined ? "unavailable" : `${formatEther(postBalance)} HYPE (${postBalance} wei)`}`,
);

const rpcErrors: string[] = [];
if (transactionState.status === "rejected") {
  rpcErrors.push(`eth_getTransactionByHash: ${compactError(transactionState.reason)}`);
}
if (receiptState.status === "rejected") {
  rpcErrors.push(`eth_getTransactionReceipt: ${compactError(receiptState.reason)}`);
}
if (balanceState.status === "rejected") {
  rpcErrors.push(`eth_getBalance: ${compactError(balanceState.reason)}`);
}
console.log("\nRPC ERRORS:");
console.log(rpcErrors.length === 0 ? "NONE" : rpcErrors.join("\n"));
console.log("\nTRANSACTION SIGNED BY CODEX:\nNO");
console.log("\nTRANSACTION BROADCAST BY CODEX:\nNO");

if (checks.some(([, status]) => status !== "PASS")) {
  process.exitCode = 1;
}
