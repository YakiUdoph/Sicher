import { readFileSync } from "node:fs";
import {
  createPublicClient,
  defineChain,
  formatEther,
  formatGwei,
  getContractAddress,
  http,
  type Hex,
} from "viem";
import { INTENDED_TEST_WALLET } from "./phase2-wallet-config.ts";

const EXPECTED_CHAIN_ID = 99801;
const SAFETY_THRESHOLD_BPS = 100n;
const GAS_LIMIT_HEADROOM_PERCENT = 20n;
const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();
const failedMethods: string[] = [];

if (!rpcUrl) {
  console.error("Error: ELYSIUM_RPC_URL is missing or empty.");
  process.exit(1);
}

const artifact = JSON.parse(
  readFileSync("artifacts/SicherCommitmentProof.json", "utf8"),
) as { bytecode: Hex };
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
  return (error instanceof Error ? error.message : String(error))
    .replace(/\s+/g, " ")
    .trim();
}

async function optionalRpc<T>(method: string, request: Promise<T>): Promise<T | undefined> {
  try {
    return await request;
  } catch (error) {
    failedMethods.push(`${method}: ${compactError(error)}`);
    return undefined;
  }
}

function formatFeeRate(value: bigint | undefined): string {
  return value === undefined
    ? "unavailable"
    : `${formatGwei(value)} gwei (${value} wei)`;
}

console.log("SICHER ELYSIUM PHASE 3A — PRE-DEPLOYMENT CHECK");

const chainId = await optionalRpc("eth_chainId", client.getChainId());
if (chainId !== EXPECTED_CHAIN_ID) {
  console.log(`CHAIN ID: ${chainId ?? "unavailable"}`);
  console.log("PRE-DEPLOYMENT SAFETY: FAIL");
  console.log("TRANSACTION SIGNED: NO");
  console.log("TRANSACTION BROADCAST: NO");
  console.log("RPC METHODS THAT FAILED OR WERE UNSUPPORTED:");
  console.log(failedMethods.length === 0 ? "NONE" : failedMethods.join("\n"));
  process.exit(1);
}

const [latestBlock, balance, nonce, estimatedGas, gasPrice, feeEstimate] =
  await Promise.all([
    optionalRpc("eth_getBlockByNumber (latest)", client.getBlock({ blockTag: "latest" })),
    optionalRpc("eth_getBalance", client.getBalance({ address: INTENDED_TEST_WALLET })),
    optionalRpc(
      "eth_getTransactionCount (pending)",
      client.getTransactionCount({ address: INTENDED_TEST_WALLET, blockTag: "pending" }),
    ),
    optionalRpc(
      "eth_estimateGas (contract creation)",
      client.estimateGas({ account: INTENDED_TEST_WALLET, data: artifact.bytecode }),
    ),
    optionalRpc("eth_gasPrice", client.getGasPrice()),
    optionalRpc(
      "EIP-1559 fee estimation (eth_maxPriorityFeePerGas/fee data)",
      client.estimateFeesPerGas(),
    ),
  ]);

const feeCandidates = [gasPrice, feeEstimate?.maxFeePerGas].filter(
  (value): value is bigint => value !== undefined,
);
const feeRateUsed =
  feeCandidates.length === 0
    ? undefined
    : feeCandidates.reduce((highest, value) =>
        value > highest ? value : highest,
      );
const conservativeGasLimit =
  estimatedGas === undefined
    ? undefined
    : (estimatedGas * (100n + GAS_LIMIT_HEADROOM_PERCENT) + 99n) / 100n;
const conservativeMaxFee =
  conservativeGasLimit === undefined || feeRateUsed === undefined
    ? undefined
    : conservativeGasLimit * feeRateUsed;
const safetyPass =
  balance === undefined || balance === 0n || conservativeMaxFee === undefined
    ? undefined
    : conservativeMaxFee * 10_000n <= balance * SAFETY_THRESHOLD_BPS;
const predictedContractAddress =
  nonce === undefined
    ? undefined
    : getContractAddress({ from: INTENDED_TEST_WALLET, nonce: BigInt(nonce) });

console.log(`CHAIN ID: ${chainId}`);
console.log(`LATEST BLOCK: ${latestBlock?.number ?? "unavailable"}`);
console.log(`DEPLOYER: ${INTENDED_TEST_WALLET}`);
console.log(
  `LIVE BALANCE: ${balance === undefined ? "unavailable" : `${formatEther(balance)} HYPE (${balance} wei)`}`,
);
console.log(`PENDING NONCE: ${nonce ?? "unavailable"}`);
console.log(`ESTIMATED DEPLOYMENT GAS: ${estimatedGas ?? "unavailable"}`);
console.log(`CONSERVATIVE GAS LIMIT: ${conservativeGasLimit ?? "unavailable"}`);
console.log(`RPC GAS PRICE: ${formatFeeRate(gasPrice)}`);
console.log(`MAX FEE PER GAS: ${formatFeeRate(feeEstimate?.maxFeePerGas)}`);
console.log(
  `MAX PRIORITY FEE: ${formatFeeRate(feeEstimate?.maxPriorityFeePerGas)}`,
);
console.log(
  `LATEST BLOCK BASE FEE: ${formatFeeRate(latestBlock?.baseFeePerGas ?? undefined)}`,
);
console.log(`FEE RATE USED: ${formatFeeRate(feeRateUsed)}`);
console.log(
  `CONSERVATIVE MAX DEPLOYMENT FEE: ${conservativeMaxFee === undefined ? "indeterminate" : `${formatEther(conservativeMaxFee)} HYPE (${conservativeMaxFee} wei)`}`,
);
console.log("SAFETY THRESHOLD: 1% of live testnet balance");
console.log(
  `PRE-DEPLOYMENT SAFETY: ${safetyPass === undefined ? "INDETERMINATE" : safetyPass ? "PASS" : "FAIL"}`,
);
console.log(
  `PREDICTED CONTRACT ADDRESS — NOT YET DEPLOYED: ${predictedContractAddress ?? "unavailable"}`,
);
console.log("TRANSACTION SIGNED: NO");
console.log("TRANSACTION BROADCAST: NO");
console.log("RPC METHODS THAT FAILED OR WERE UNSUPPORTED:");
console.log(failedMethods.length === 0 ? "NONE" : failedMethods.join("\n"));

if (safetyPass !== true) {
  process.exitCode = 1;
}
