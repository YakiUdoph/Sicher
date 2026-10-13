import { readFileSync } from "node:fs";
import {
  createPublicClient,
  defineChain,
  formatEther,
  formatGwei,
  getAddress,
  getContractAddress,
  http,
  type Abi,
  type Hex,
} from "viem";
import { INTENDED_TEST_WALLET } from "./phase2-wallet-config.ts";

const EXPECTED_CHAIN_ID = 99801;
const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();
const deploymentHash = process.env.DEPLOYMENT_TX_HASH?.trim() as Hex | undefined;

if (!rpcUrl) {
  console.error("Error: ELYSIUM_RPC_URL is missing or empty.");
  process.exit(1);
}
if (!deploymentHash || !/^0x[0-9a-fA-F]{64}$/.test(deploymentHash)) {
  console.error("Error: DEPLOYMENT_TX_HASH is missing or invalid.");
  process.exit(1);
}

const artifact = JSON.parse(
  readFileSync("artifacts/SicherCommitmentProof.json", "utf8"),
) as { abi: Abi; bytecode: Hex; deployedBytecode: Hex };
const chain = defineChain({
  id: EXPECTED_CHAIN_ID,
  name: "Kinetiq Elysium Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  testnet: true,
});
const client = createPublicClient({ chain, transport: http(rpcUrl) });

const chainId = await client.getChainId();
if (chainId !== EXPECTED_CHAIN_ID) {
  console.error(`Wrong chain: received ${chainId}, expected ${EXPECTED_CHAIN_ID}.`);
  process.exit(1);
}

const [transaction, receipt] = await Promise.all([
  client.getTransaction({ hash: deploymentHash }),
  client.getTransactionReceipt({ hash: deploymentHash }),
]);
const contractAddress = receipt.contractAddress;
if (!contractAddress) {
  console.error("Receipt does not contain a contract address.");
  process.exit(1);
}

const [deployedCode, nextCommitmentId] = await Promise.all([
  client.getCode({ address: contractAddress }),
  client.readContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "nextCommitmentId",
  }),
]);
const predictedAddress = getContractAddress({
  from: transaction.from,
  nonce: BigInt(transaction.nonce),
});
const runtimeMatches =
  deployedCode?.toLowerCase() === artifact.deployedBytecode.toLowerCase();
const creationBytecodeMatches =
  transaction.input.toLowerCase() === artifact.bytecode.toLowerCase();
const senderMatches =
  getAddress(transaction.from) === getAddress(INTENDED_TEST_WALLET);
const addressMatches =
  getAddress(contractAddress) === getAddress(predictedAddress);
const statusSuccessful = receipt.status === "success";
const initialIdMatches = nextCommitmentId === 1n;
const effectiveGasPrice = receipt.effectiveGasPrice;
const actualFee = receipt.gasUsed * effectiveGasPrice;
const checks = [
  ["Chain ID = 99801", true],
  ["Deployment transaction retrieved", true],
  ["Receipt retrieved", true],
  ["Deployment sender matches", senderMatches],
  ["Receipt status successful", statusSuccessful],
  ["Contract address present", true],
  ["Predicted contract address matches", addressMatches],
  ["Creation bytecode matches reviewed build", creationBytecodeMatches],
  ["Runtime bytecode exactly matches reviewed build", runtimeMatches],
  ["nextCommitmentId() = 1", initialIdMatches],
] as const;

console.log("SICHER ELYSIUM PHASE 3B — DEPLOYMENT VERIFICATION");
for (const [label, passed] of checks) {
  console.log(`[${passed ? "PASS" : "FAIL"}] ${label}`);
}
console.log(`CHAIN ID: ${chainId}`);
console.log(`TRANSACTION HASH: ${transaction.hash}`);
console.log(`DEPLOYMENT SENDER: ${transaction.from}`);
console.log(`DEPLOYMENT NONCE: ${transaction.nonce}`);
console.log(`CONTRACT ADDRESS: ${contractAddress}`);
console.log(`PREDICTED ADDRESS: ${predictedAddress}`);
console.log(`STATUS: ${receipt.status}`);
console.log(`BLOCK NUMBER: ${receipt.blockNumber}`);
console.log(`GAS USED: ${receipt.gasUsed}`);
console.log(
  `EFFECTIVE GAS PRICE: ${formatGwei(effectiveGasPrice)} gwei (${effectiveGasPrice} wei)`,
);
console.log(`ACTUAL FEE: ${formatEther(actualFee)} HYPE (${actualFee} wei)`);
console.log(`DEPLOYED RUNTIME BYTES: ${(deployedCode?.length ?? 2) / 2 - 1}`);
console.log(`NEXT COMMITMENT ID: ${nextCommitmentId}`);

if (checks.some(([, passed]) => !passed)) {
  process.exitCode = 1;
}
