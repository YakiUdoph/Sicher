import "dotenv/config";
import {
  createPublicClient,
  defineChain,
  formatEther,
  formatGwei,
  http,
  parseEther,
} from "viem";
import { INTENDED_TEST_WALLET } from "./phase2-wallet-config.ts";

const EXPECTED_CHAIN_ID = 99801;
const TRANSFER_VALUE = parseEther("0.000001");
const SAFETY_THRESHOLD_BPS = 100n;
const GAS_LIMIT_HEADROOM_PERCENT = 20n;
const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();
const failedMethods: string[] = [];

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

function compactError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim();
}

async function optionalRpc<T>(method: string, request: Promise<T>): Promise<T | undefined> {
  try {
    return await request;
  } catch (error) {
    failedMethods.push(`${method}: ${compactError(error)}`);
    return undefined;
  }
}

function formatFee(value: bigint | undefined): string {
  return value === undefined
    ? "unavailable"
    : `${formatGwei(value)} gwei (${value} wei)`;
}

console.log("SICHER PHASE 2 — TRANSACTION SAFETY CHECK");

const chainId = await optionalRpc("eth_chainId", client.getChainId());
const chainMatches = chainId === EXPECTED_CHAIN_ID;

if (!chainMatches) {
  console.log(`\nCHAIN ID:\n${chainId ?? "unavailable"}`);
  console.log("\nCHAIN:\nFAIL");
  console.log(`\nWALLET:\n${INTENDED_TEST_WALLET}`);
  console.log("\nLIVE BALANCE:\nunavailable");
  console.log("\nSAFETY CHECK:\nINDETERMINATE");
  console.log("\nTRANSACTION SIGNED:\nNO");
  console.log("\nTRANSACTION BROADCAST:\nNO");
  console.log("\nRPC METHODS THAT FAILED OR WERE UNSUPPORTED:");
  console.log(failedMethods.length === 0 ? "NONE" : failedMethods.join("\n"));
  process.exit(1);
}

const balance = await optionalRpc(
  "eth_getBalance",
  client.getBalance({ address: INTENDED_TEST_WALLET }),
);

const [nonce, estimatedGas, gasPrice, feeEstimate, latestBlock] =
  await Promise.all([
    optionalRpc(
      "eth_getTransactionCount (pending)",
      client.getTransactionCount({
        address: INTENDED_TEST_WALLET,
        blockTag: "pending",
      }),
    ),
    optionalRpc(
      "eth_estimateGas",
      client.estimateGas({
        account: INTENDED_TEST_WALLET,
        to: INTENDED_TEST_WALLET,
        value: TRANSFER_VALUE,
      }),
    ),
    optionalRpc("eth_gasPrice", client.getGasPrice()),
    optionalRpc(
      "EIP-1559 fee estimation (eth_maxPriorityFeePerGas/fee data)",
      client.estimateFeesPerGas(),
    ),
    optionalRpc(
      "eth_getBlockByNumber (latest)",
      client.getBlock({ blockTag: "latest" }),
    ),
  ]);

const maxFeePerGas = feeEstimate?.maxFeePerGas;
const maxPriorityFeePerGas = feeEstimate?.maxPriorityFeePerGas;
const availableFeeValues = [gasPrice, maxFeePerGas].filter(
  (value): value is bigint => value !== undefined,
);
const conservativeFeePerGas =
  availableFeeValues.length === 0
    ? undefined
    : availableFeeValues.reduce((highest, value) =>
        value > highest ? value : highest,
      );
const conservativeGasLimit =
  estimatedGas === undefined
    ? undefined
    : (estimatedGas * (100n + GAS_LIMIT_HEADROOM_PERCENT) + 99n) / 100n;
const conservativeMaxFee =
  conservativeGasLimit === undefined || conservativeFeePerGas === undefined
    ? undefined
    : conservativeGasLimit * conservativeFeePerGas;
const conservativeTotalCost =
  conservativeMaxFee === undefined
    ? undefined
    : TRANSFER_VALUE + conservativeMaxFee;
const percentageMillionths =
  balance === undefined || balance === 0n || conservativeTotalCost === undefined
    ? undefined
    : (conservativeTotalCost * 100_000_000n + balance - 1n) / balance;
const safetyPass =
  balance === undefined || balance === 0n || conservativeTotalCost === undefined
    ? undefined
    : conservativeTotalCost * 10_000n <= balance * SAFETY_THRESHOLD_BPS;

const percentageDisplay =
  percentageMillionths === undefined
    ? "indeterminate"
    : `${percentageMillionths / 1_000_000n}.${(percentageMillionths % 1_000_000n).toString().padStart(6, "0")}% (rounded up to 0.000001%)`;

console.log(`\nCHAIN ID:\n${chainId}`);
console.log("\nCHAIN:\nPASS");
console.log(`\nWALLET:\n${INTENDED_TEST_WALLET}`);
console.log(
  `\nLIVE BALANCE:\n${balance === undefined ? "unavailable" : `${formatEther(balance)} HYPE (${balance} wei)`}`,
);
console.log("\nPROPOSED VALUE:\n0.000001 HYPE (1000000000000 wei)");
console.log(`\nPENDING NONCE:\n${nonce ?? "unsupported"}`);
console.log(`\nESTIMATED GAS:\n${estimatedGas ?? "unavailable"}`);
console.log(`\nCONSERVATIVE GAS LIMIT (+20%):\n${conservativeGasLimit ?? "unavailable"}`);
console.log(`\nGAS PRICE:\n${formatFee(gasPrice)}`);
console.log(`\nMAX FEE PER GAS:\n${formatFee(maxFeePerGas)}`);
console.log(`\nMAX PRIORITY FEE:\n${formatFee(maxPriorityFeePerGas)}`);
console.log(`\nLATEST BLOCK:\n${latestBlock?.number ?? "unavailable"}`);
console.log(
  `\nBASE FEE:\n${formatFee(latestBlock?.baseFeePerGas ?? undefined)}`,
);
console.log(
  `\nCONSERVATIVE FEE RATE USED:\n${formatFee(conservativeFeePerGas)}`,
);
console.log(
  `\nCONSERVATIVE ESTIMATED MAX FEE:\n${conservativeMaxFee === undefined ? "indeterminate" : `${formatEther(conservativeMaxFee)} HYPE (${conservativeMaxFee} wei)`}`,
);
console.log(
  `\nCONSERVATIVE TOTAL COST:\n${conservativeTotalCost === undefined ? "indeterminate" : `${formatEther(conservativeTotalCost)} HYPE (${conservativeTotalCost} wei)`}`,
);
console.log(
  `\nPERCENTAGE OF WALLET BALANCE:\n${percentageDisplay}`,
);
console.log("\nSAFETY THRESHOLD:\n1%");
console.log(
  `\nSAFETY CHECK:\n${safetyPass === undefined ? "INDETERMINATE" : safetyPass ? "PASS" : "FAIL"}`,
);
console.log("\nTRANSACTION SIGNED:\nNO");
console.log("\nTRANSACTION BROADCAST:\nNO");
console.log("\nRPC METHODS THAT FAILED OR WERE UNSUPPORTED:");
console.log(failedMethods.length === 0 ? "NONE" : failedMethods.join("\n"));

if (safetyPass !== true) {
  process.exitCode = 1;
}
