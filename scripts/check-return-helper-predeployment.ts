import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  defineChain,
  formatEther,
  formatGwei,
  getContractAddress,
  http,
} from "viem";
import { HELPER_RETURN_AMOUNT, HELPER_SUBJECT, HELPER_TOKEN, helperConstructorArguments, helperCreationData, type HelperArtifact } from "./return-helper-build.ts";
import { rpcWithRetry, type RpcAttemptRecord } from "./rpc-retry.ts";

const EXPECTED_CHAIN_ID = 99801;
const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();
if (!rpcUrl) { console.error("ELYSIUM_RPC_URL is required."); process.exit(1); }
const artifact = JSON.parse(readFileSync("artifacts/SicherTestReturnHelper.json", "utf8")) as HelperArtifact;
const creationData = helperCreationData(artifact);
const chain = defineChain({ id: EXPECTED_CHAIN_ID, name: "Kinetiq Elysium Testnet", nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } }, testnet: true });
const client = createPublicClient({ chain, transport: http(rpcUrl, { retryCount: 0, timeout: 12_000 }) });
const records: RpcAttemptRecord[] = [];
const chainResult = await rpcWithRetry("eth_chainId", () => client.getChainId(), records);
if (chainResult.kind !== "success" || chainResult.value !== EXPECTED_CHAIN_ID) {
  console.log(`CHAIN: ${chainResult.kind === "unavailable" ? "INDETERMINATE" : "FAIL"}`);
  process.exit(1);
}
const [blockResult, balanceResult, nonceResult, gasResult, gasPriceResult, feeResult] = await Promise.all([
  rpcWithRetry("eth_getBlockByNumber latest", () => client.getBlock({ blockTag: "latest" }), records),
  rpcWithRetry("eth_getBalance", () => client.getBalance({ address: HELPER_SUBJECT }), records),
  rpcWithRetry("eth_getTransactionCount pending", () => client.getTransactionCount({ address: HELPER_SUBJECT, blockTag: "pending" }), records),
  rpcWithRetry("eth_estimateGas helper deployment", () => client.estimateGas({ account: HELPER_SUBJECT, data: creationData }), records),
  rpcWithRetry("eth_gasPrice", () => client.getGasPrice(), records),
  rpcWithRetry("EIP-1559 fee estimation", () => client.estimateFeesPerGas(), records),
]);
const gasEstimate = gasResult.kind === "success" ? gasResult.value : undefined;
const gasLimit = gasEstimate === undefined ? undefined : (gasEstimate * 120n + 99n) / 100n;
const gasPrice = gasPriceResult.kind === "success" ? gasPriceResult.value : undefined;
const maxFeePerGas = feeResult.kind === "success" ? feeResult.value.maxFeePerGas : undefined;
const feeCandidates = [gasPrice, maxFeePerGas].filter((value): value is bigint => value !== undefined);
const feeRate = feeCandidates.reduce<bigint | undefined>((highest, value) => highest === undefined || value > highest ? value : highest, undefined);
const conservativeFee = gasLimit === undefined || feeRate === undefined ? undefined : gasLimit * feeRate;
const balance = balanceResult.kind === "success" ? balanceResult.value : undefined;
const safety = conservativeFee === undefined || balance === undefined || balance === 0n ? undefined : conservativeFee * 100n <= balance;
const percentageMillionths = conservativeFee === undefined || balance === undefined || balance === 0n ? undefined : conservativeFee * 100_000_000n / balance;
const percentage = percentageMillionths === undefined ? "indeterminate" : `${percentageMillionths / 1_000_000n}.${(percentageMillionths % 1_000_000n).toString().padStart(6, "0")}%`;
const nonce = nonceResult.kind === "success" ? nonceResult.value : undefined;
const predicted = nonce === undefined ? undefined : getContractAddress({ from: HELPER_SUBJECT, nonce: BigInt(nonce) });
const latestBlock = blockResult.kind === "success" ? blockResult.value.number : undefined;
const evidence = {
  generatedAt: new Date().toISOString(), chainId: chainResult.value, latestBlock: latestBlock?.toString() ?? null,
  pendingNonce: nonce ?? null, predictedAddress: predicted ?? null, predictionStatus: "NOT YET DEPLOYED",
  walletBalanceWei: balance?.toString() ?? null, estimatedGas: gasEstimate?.toString() ?? null,
  conservativeGasLimit: gasLimit?.toString() ?? null, gasPriceWei: gasPrice?.toString() ?? null,
  maxFeePerGasWei: maxFeePerGas?.toString() ?? null, feeRateUsedWei: feeRate?.toString() ?? null,
  conservativeMaxFeeWei: conservativeFee?.toString() ?? null, percentageOfWalletBalance: percentage,
  belowOnePercent: safety ?? null,
};
writeFileSync("phase5-tool/predeployment.json", `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log("SICHER ELYSIUM PHASE 5B — RETURN HELPER LIVE PREDEPLOYMENT");
console.log(`[PASS] Chain ID = ${chainResult.value}`);
console.log(`[${gasEstimate === undefined ? "INDETERMINATE" : "PASS"}] Deployment gas estimated`);
console.log(`[${safety === undefined ? "INDETERMINATE" : safety ? "PASS" : "FAIL"}] Deployment cost below 1%`);
console.log(`TOKEN: ${HELPER_TOKEN}`);
console.log(`SUBJECT: ${HELPER_SUBJECT}`);
console.log(`RETURN AMOUNT: ${HELPER_RETURN_AMOUNT} base units (85000 STEST)`);
console.log(`CONSTRUCTOR ARGUMENTS: token=${HELPER_TOKEN}, subject=${HELPER_SUBJECT}`);
console.log(`ABI-ENCODED CONSTRUCTOR ARGUMENTS: ${helperConstructorArguments()}`);
console.log(`LATEST BLOCK: ${latestBlock ?? "unavailable"}`);
console.log(`WALLET BALANCE: ${balance === undefined ? "unavailable" : `${formatEther(balance)} HYPE (${balance} wei)`}`);
console.log(`PENDING NONCE: ${nonce ?? "unavailable"}`);
console.log(`PREDICTED HELPER ADDRESS: ${predicted ?? "unavailable"}`);
console.log("PREDICTION STATUS: NOT YET DEPLOYED");
console.log(`ESTIMATED GAS: ${gasEstimate ?? "unavailable"}`);
console.log(`CONSERVATIVE GAS LIMIT: ${gasLimit ?? "unavailable"}`);
console.log(`GAS PRICE: ${gasPrice === undefined ? "unavailable" : `${formatGwei(gasPrice)} gwei (${gasPrice} wei)`}`);
console.log(`MAX FEE PER GAS: ${maxFeePerGas === undefined ? "unavailable" : `${formatGwei(maxFeePerGas)} gwei (${maxFeePerGas} wei)`}`);
console.log(`FEE RATE USED: ${feeRate === undefined ? "unavailable" : `${formatGwei(feeRate)} gwei (${feeRate} wei)`}`);
console.log(`CONSERVATIVE MAX FEE: ${conservativeFee === undefined ? "indeterminate" : `${formatEther(conservativeFee)} HYPE (${conservativeFee} wei)`}`);
console.log(`PERCENTAGE OF WALLET BALANCE: ${percentage}`);
console.log("TRANSACTION SIGNED: NO");
console.log("TRANSACTION BROADCAST: NO");
console.log("RPC ATTEMPTS:");
for (const record of records) console.log(`${record.method}: ${record.attempts} attempt(s), ${record.outcome}${record.error ? ` — ${record.error}` : ""}`);
if (safety !== true || gasEstimate === undefined) process.exitCode = 1;
