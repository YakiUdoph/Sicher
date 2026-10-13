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
const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();
const failures: string[] = [];
if (!rpcUrl) {
  console.error("Error: ELYSIUM_RPC_URL is missing or empty.");
  process.exit(1);
}

const artifact = JSON.parse(readFileSync("artifacts/SicherTestToken.json", "utf8")) as {
  bytecode: Hex;
};
const chain = defineChain({
  id: EXPECTED_CHAIN_ID,
  name: "Kinetiq Elysium Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  testnet: true,
});
const client = createPublicClient({ chain, transport: http(rpcUrl) });

async function optional<T>(method: string, request: Promise<T>): Promise<T | undefined> {
  try {
    return await request;
  } catch (error) {
    failures.push(
      `${method}: ${(error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").trim()}`,
    );
    return undefined;
  }
}

function feeRate(value: bigint | undefined): string {
  return value === undefined
    ? "unavailable"
    : `${formatGwei(value)} gwei (${value} wei)`;
}

console.log("SICHER TEST TOKEN — ELYSIUM PRE-DEPLOYMENT");
const chainId = await optional("eth_chainId", client.getChainId());
if (chainId !== EXPECTED_CHAIN_ID) {
  console.log(`CHAIN ID: ${chainId ?? "unavailable"}`);
  console.log("SAFETY: FAIL");
  console.log(failures.length === 0 ? "Wrong chain ID" : failures.join("\n"));
  process.exit(1);
}

const [block, balance, nonce, gasEstimate, gasPrice, fees] = await Promise.all([
  optional("eth_getBlockByNumber (latest)", client.getBlock({ blockTag: "latest" })),
  optional("eth_getBalance", client.getBalance({ address: INTENDED_TEST_WALLET })),
  optional(
    "eth_getTransactionCount (pending)",
    client.getTransactionCount({ address: INTENDED_TEST_WALLET, blockTag: "pending" }),
  ),
  optional(
    "eth_estimateGas (token contract creation)",
    client.estimateGas({ account: INTENDED_TEST_WALLET, data: artifact.bytecode }),
  ),
  optional("eth_gasPrice", client.getGasPrice()),
  optional("EIP-1559 fee estimation", client.estimateFeesPerGas()),
]);

const rates = [gasPrice, fees?.maxFeePerGas].filter(
  (value): value is bigint => value !== undefined,
);
const selectedRate =
  rates.length === 0
    ? undefined
    : rates.reduce((highest, value) => (value > highest ? value : highest));
const gasLimit =
  gasEstimate === undefined ? undefined : (gasEstimate * 120n + 99n) / 100n;
const maxFee =
  gasLimit === undefined || selectedRate === undefined
    ? undefined
    : gasLimit * selectedRate;
const safety =
  maxFee === undefined || balance === undefined || balance === 0n
    ? undefined
    : maxFee * 10_000n <= balance * SAFETY_THRESHOLD_BPS;
const percentageMillionths =
  maxFee === undefined || balance === undefined || balance === 0n
    ? undefined
    : (maxFee * 100_000_000n + balance - 1n) / balance;
const percentage =
  percentageMillionths === undefined
    ? "indeterminate"
    : `${percentageMillionths / 1_000_000n}.${(percentageMillionths % 1_000_000n).toString().padStart(6, "0")}%`;
const predicted =
  nonce === undefined
    ? undefined
    : getContractAddress({ from: INTENDED_TEST_WALLET, nonce: BigInt(nonce) });

console.log(`CHAIN ID: ${chainId}`);
console.log(`LATEST BLOCK: ${block?.number ?? "unavailable"}`);
console.log(`DEPLOYER: ${INTENDED_TEST_WALLET}`);
console.log(
  `LIVE HYPE BALANCE: ${balance === undefined ? "unavailable" : `${formatEther(balance)} HYPE (${balance} wei)`}`,
);
console.log(`PENDING NONCE: ${nonce ?? "unavailable"}`);
console.log(`ESTIMATED DEPLOYMENT GAS: ${gasEstimate ?? "unavailable"}`);
console.log(`CONSERVATIVE GAS LIMIT: ${gasLimit ?? "unavailable"}`);
console.log(`RPC GAS PRICE: ${feeRate(gasPrice)}`);
console.log(`MAX FEE PER GAS: ${feeRate(fees?.maxFeePerGas)}`);
console.log(`MAX PRIORITY FEE: ${feeRate(fees?.maxPriorityFeePerGas)}`);
console.log(`LATEST BASE FEE: ${feeRate(block?.baseFeePerGas ?? undefined)}`);
console.log(`FEE RATE USED: ${feeRate(selectedRate)}`);
console.log(
  `CONSERVATIVE MAX DEPLOYMENT FEE: ${maxFee === undefined ? "indeterminate" : `${formatEther(maxFee)} HYPE (${maxFee} wei)`}`,
);
console.log(`PERCENTAGE OF WALLET BALANCE: ${percentage}`);
console.log(`SAFETY: ${safety === undefined ? "INDETERMINATE" : safety ? "PASS" : "FAIL"}`);
console.log(`PREDICTED TOKEN ADDRESS — NOT YET DEPLOYED: ${predicted ?? "unavailable"}`);
console.log("TRANSACTION SIGNED: NO");
console.log("TRANSACTION BROADCAST: NO");
console.log("RPC METHODS THAT FAILED OR WERE UNSUPPORTED:");
console.log(failures.length === 0 ? "NONE" : failures.join("\n"));

if (safety !== true) process.exitCode = 1;
