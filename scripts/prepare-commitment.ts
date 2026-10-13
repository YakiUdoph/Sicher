import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  defineChain,
  encodeFunctionData,
  formatEther,
  formatUnits,
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
const SETUP_TX = "0x77e9247f84e4bc22a69ba466548cf7b952e762d1705c47a5c04f743e2b2f768a" as Hex;
const SETUP_BLOCK = 8_110_482n;
const SUBJECT_BALANCE = 100_000n * 10n ** 18n;
const MINIMUM = 80_000n * 10n ** 18n;
const SAMPLE_INTERVALS = 120n;
const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();
if (!rpcUrl) { console.error("ELYSIUM_RPC_URL is required."); process.exit(1); }

const tokenArtifact = JSON.parse(readFileSync("artifacts/SicherTestToken.json", "utf8")) as { abi: Abi };
const sicherArtifact = JSON.parse(readFileSync("artifacts/SicherCommitmentProof.json", "utf8")) as { abi: Abi };
const helperArtifact = JSON.parse(readFileSync("artifacts/SicherTestReturnHelper.json", "utf8")) as { abi: Abi };
const chain = defineChain({ id: EXPECTED_CHAIN_ID, name: "Kinetiq Elysium Testnet", nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } }, testnet: true });
const client = createPublicClient({ chain, transport: http(rpcUrl, { retryCount: 0, timeout: 12_000 }) });
const records: RpcAttemptRecord[] = [];
type Outcome = "PASS" | "FAIL" | "INDETERMINATE";
const rpcOutcome = <T>(result: RpcResult<T>): Outcome => result.kind === "unavailable" ? "INDETERMINATE" : "FAIL";
const assess = <T>(result: RpcResult<T>, predicate: (value: T) => boolean): Outcome => result.kind === "success" ? (predicate(result.value) ? "PASS" : "FAIL") : rpcOutcome(result);
const round = (value: number) => Math.round(value * 1000) / 1000;

const chainId = await rpcWithRetry("eth_chainId", () => client.getChainId(), records);
const latest = await rpcWithRetry("eth_blockNumber", () => client.getBlockNumber(), records);
const snapshot = latest.kind === "success" ? latest.value : undefined;
const [subjectBalance, helperBalance, restored, nextId, commitmentOne, setupReceipt, hypeBalance, nonce] = await Promise.all([
  rpcWithRetry("eth_call subject balance", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [SUBJECT], blockNumber: snapshot }) as Promise<bigint>, records),
  rpcWithRetry("eth_call helper balance", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [HELPER], blockNumber: snapshot }) as Promise<bigint>, records),
  rpcWithRetry("eth_call helper restored", () => client.readContract({ address: HELPER, abi: helperArtifact.abi, functionName: "restored", blockNumber: snapshot }) as Promise<boolean>, records),
  rpcWithRetry("eth_call nextCommitmentId", () => client.readContract({ address: SICHER, abi: sicherArtifact.abi, functionName: "nextCommitmentId", blockNumber: snapshot }) as Promise<bigint>, records),
  rpcWithRetry("eth_call commitments(1)", () => client.readContract({ address: SICHER, abi: sicherArtifact.abi, functionName: "commitments", args: [1n], blockNumber: snapshot }) as Promise<readonly [bigint, Address, Address, Address, bigint, bigint, bigint]>, records),
  rpcWithRetry("eth_getTransactionReceipt setup", () => client.getTransactionReceipt({ hash: SETUP_TX }), records),
  rpcWithRetry("eth_getBalance subject", () => client.getBalance({ address: SUBJECT, blockNumber: snapshot }), records),
  rpcWithRetry("eth_getTransactionCount pending", () => client.getTransactionCount({ address: SUBJECT, blockTag: "pending" }), records),
]);

const statuses = {
  chain: assess(chainId, (value) => value === EXPECTED_CHAIN_ID),
  subject: assess(subjectBalance, (value) => value === SUBJECT_BALANCE),
  helper: assess(helperBalance, (value) => value === 0n),
  restored: assess(restored, (value) => value === false),
  nextId: assess(nextId, (value) => value === 1n),
  absent: assess(commitmentOne, (value) => value[0] === 0n),
  setupBefore: latest.kind === "success" && setupReceipt.kind === "success"
    ? (setupReceipt.value.blockNumber === SETUP_BLOCK && SETUP_BLOCK < latest.value ? "PASS" : "FAIL")
    : latest.kind === "unavailable" || setupReceipt.kind === "unavailable" ? "INDETERMINATE" : "FAIL",
} satisfies Record<string, Outcome>;
const preconditionsPass = Object.values(statuses).every((value) => value === "PASS");

let cadenceStatus: Outcome = preconditionsPass ? "INDETERMINATE" : "INDETERMINATE";
let sampleStart: bigint | undefined;
let timestamps: bigint[] = [];
if (preconditionsPass && latest.kind === "success" && latest.value >= SAMPLE_INTERVALS) {
  sampleStart = latest.value - SAMPLE_INTERVALS;
  const blockNumbers = Array.from({ length: Number(SAMPLE_INTERVALS + 1n) }, (_, index) => sampleStart! + BigInt(index));
  const results: RpcResult<bigint>[] = [];
  for (let index = 0; index < blockNumbers.length; index += 12) {
    const group = blockNumbers.slice(index, index + 12);
    results.push(...await Promise.all(group.map((blockNumber) => rpcWithRetry(`eth_getBlockByNumber ${blockNumber}`, async () => (await client.getBlock({ blockNumber })).timestamp, records))));
  }
  cadenceStatus = results.every((result) => result.kind === "success") ? "PASS" : results.some((result) => result.kind === "unavailable") ? "INDETERMINATE" : "FAIL";
  if (cadenceStatus === "PASS") timestamps = results.map((result) => (result as { kind: "success"; value: bigint }).value);
}

const intervals = timestamps.slice(1).map((timestamp, index) => Number(timestamp - timestamps[index]));
const sorted = [...intervals].sort((a, b) => a - b);
const average = intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : undefined;
const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : undefined;
const minimum = sorted.at(0);
const maximum = sorted.at(-1);
const positiveMinimum = sorted.find((value) => value > 0);
const designSecondsPerBlock = average !== undefined && median !== undefined && positiveMinimum !== undefined ? Math.min(average, median > 0 ? median : average, positiveMinimum) : undefined;
const startDelayBlocks = designSecondsPerBlock ? BigInt(Math.ceil((600 / designSecondsPerBlock) * 1.25)) : undefined;
const proofWindowBlocks = designSecondsPerBlock ? BigInt(Math.ceil((1800 / designSecondsPerBlock) * 1.25)) : undefined;
const minimumRemainingDelayBlocks = designSecondsPerBlock ? BigInt(Math.ceil(600 / designSecondsPerBlock)) : undefined;
const proposedStart = latest.kind === "success" && startDelayBlocks !== undefined ? latest.value + startDelayBlocks : undefined;
const proposedEnd = proposedStart !== undefined && proofWindowBlocks !== undefined ? proposedStart + proofWindowBlocks : undefined;
const startStatus: Outcome = proposedStart !== undefined && latest.kind === "success" && proposedStart > latest.value ? "PASS" : cadenceStatus === "PASS" ? "FAIL" : cadenceStatus;
const endStatus: Outcome = proposedEnd !== undefined && proposedStart !== undefined && proposedEnd > proposedStart ? "PASS" : cadenceStatus === "PASS" ? "FAIL" : cadenceStatus;

let gasEstimate: RpcResult<bigint> | undefined;
let gasPrice: RpcResult<bigint> | undefined;
if (preconditionsPass && proposedStart !== undefined && proposedEnd !== undefined) {
  const data = encodeFunctionData({ abi: sicherArtifact.abi, functionName: "createCommitment", args: [SUBJECT, TOKEN, MINIMUM, proposedStart, proposedEnd] });
  [gasEstimate, gasPrice] = await Promise.all([
    rpcWithRetry("eth_estimateGas exact createCommitment", () => client.estimateGas({ account: SUBJECT, to: SICHER, data }), records),
    rpcWithRetry("eth_gasPrice", () => client.getGasPrice(), records),
  ]);
}
const gasStatus: Outcome = gasEstimate?.kind === "success" && gasPrice?.kind === "success" ? "PASS" : gasEstimate?.kind === "unavailable" || gasPrice?.kind === "unavailable" ? "INDETERMINATE" : "FAIL";
const conservativeGas = gasEstimate?.kind === "success" ? (gasEstimate.value * 120n + 99n) / 100n : undefined;
const feeRate = gasPrice?.kind === "success" ? (gasPrice.value * 120n + 99n) / 100n : undefined;
const maximumFee = conservativeGas !== undefined && feeRate !== undefined ? conservativeGas * feeRate : undefined;
const costStatus: Outcome = maximumFee !== undefined && hypeBalance.kind === "success" ? (hypeBalance.value > 0n && maximumFee * 100n <= hypeBalance.value ? "PASS" : "FAIL") : hypeBalance.kind === "unavailable" || gasStatus === "INDETERMINATE" ? "INDETERMINATE" : "FAIL";
const percentage = maximumFee !== undefined && hypeBalance.kind === "success" && hypeBalance.value > 0n ? Number(maximumFee * 1_000_000n / hypeBalance.value) / 10_000 : undefined;

const allPass = [...Object.values(statuses), cadenceStatus, startStatus, endStatus, gasStatus, costStatus].every((value) => value === "PASS");
if (allPass && latest.kind === "success" && sampleStart !== undefined && average !== undefined && median !== undefined && minimum !== undefined && maximum !== undefined && designSecondsPerBlock !== undefined && startDelayBlocks !== undefined && proofWindowBlocks !== undefined && minimumRemainingDelayBlocks !== undefined) {
  const preparation = {
    generatedAt: new Date().toISOString(),
    sample: { firstBlock: sampleStart.toString(), lastBlock: latest.value.toString(), intervalCount: intervals.length, firstTimestamp: timestamps[0].toString(), lastTimestamp: timestamps.at(-1)!.toString() },
    cadence: { medianSecondsPerBlock: round(median), averageSecondsPerBlock: round(average), minimumSecondsPerBlock: minimum, maximumSecondsPerBlock: maximum, designSecondsPerBlock: round(designSecondsPerBlock) },
    policy: { targetStartDelaySeconds: 600, targetProofWindowSeconds: 1800, safetyMarginPercent: 25, startDelayBlocks: startDelayBlocks.toString(), proofWindowBlocks: proofWindowBlocks.toString(), minimumRemainingDelayBlocks: minimumRemainingDelayBlocks.toString() },
  };
  writeFileSync("phase5-tool/commitment-preparation.json", `${JSON.stringify(preparation, null, 2)}\n`, "utf8");
}

const sampleText = sampleStart !== undefined && latest.kind === "success" && timestamps.length
  ? `blocks ${sampleStart}-${latest.value}; ${new Date(Number(timestamps[0]) * 1000).toISOString()} to ${new Date(Number(timestamps.at(-1)!) * 1000).toISOString()}; ${intervals.length} intervals`
  : "unavailable";
console.log("SICHER ELYSIUM PHASE 5D — COMMITMENT PREPARATION");
console.log(`[${statuses.chain}] Chain ID`);
console.log(`[${statuses.subject}] Subject balance = 100,000 STEST`);
console.log(`[${statuses.helper}] Helper balance = 0`);
console.log(`[${statuses.restored}] Helper restored = false`);
console.log(`[${statuses.nextId}] nextCommitmentId = 1`);
console.log(`[${statuses.absent}] Commitment #1 absent`);
console.log(`[${statuses.setupBefore}] Setup block precedes current block`);
console.log(`[${cadenceStatus}] Block cadence measured`);
console.log(`[${startStatus}] Proposed start block safely future`);
console.log(`[${endStatus}] Proposed end block after start`);
console.log(`[${gasStatus}] Gas estimated`);
console.log(`[${costStatus}] Cost below 1%`);
console.log(`\nSETUP BLOCK:\n${SETUP_BLOCK}`);
console.log(`\nLATEST BLOCK:\n${latest.kind === "success" ? latest.value : "unavailable"}`);
console.log(`\nBLOCK CADENCE SAMPLE:\n${sampleText}`);
console.log(`\nMEDIAN SECONDS/BLOCK:\n${median === undefined ? "unavailable" : round(median)}`);
console.log(`\nAVERAGE SECONDS/BLOCK:\n${average === undefined ? "unavailable" : round(average)}`);
console.log(`\nMINIMUM SECONDS/BLOCK:\n${minimum ?? "unavailable"}`);
console.log(`\nMAXIMUM SECONDS/BLOCK:\n${maximum ?? "unavailable"}`);
console.log(`\nSTART DELAY BLOCKS:\n${startDelayBlocks ?? "unavailable"}`);
console.log(`\nPROOF WINDOW BLOCKS:\n${proofWindowBlocks ?? "unavailable"}`);
console.log(`\nPROPOSED START BLOCK:\n${proposedStart ?? "unavailable"}`);
console.log(`\nPROPOSED END BLOCK:\n${proposedEnd ?? "unavailable"}`);
console.log("\nIMPORTANT:\nProposal is provisional and must be recalculated immediately before signing.");
console.log(`\nMINIMUM:\n${formatUnits(MINIMUM, 18)} STEST`);
console.log(`\nCURRENT SUBJECT BALANCE:\n${subjectBalance.kind === "success" ? `${formatUnits(subjectBalance.value, 18)} STEST (${subjectBalance.value} base units)` : "unavailable"}`);
console.log(`\nPENDING NONCE:\n${nonce.kind === "success" ? nonce.value : "unavailable"}`);
console.log(`\nESTIMATED GAS:\n${gasEstimate?.kind === "success" ? gasEstimate.value : "unavailable"}`);
console.log(`\nCONSERVATIVE GAS LIMIT:\n${conservativeGas ?? "unavailable"}`);
console.log(`\nFEE RATE:\n${feeRate !== undefined ? `${feeRate} wei/gas` : "unavailable"}`);
console.log(`\nCONSERVATIVE MAX FEE:\n${maximumFee !== undefined ? `${formatEther(maximumFee)} HYPE (${maximumFee} wei; ${percentage}% of current balance)` : "unavailable"}`);
console.log("\nLOCAL COMMITMENT URL:\nhttp://127.0.0.1:4175/commitment.html");
console.log("\nPOST-COMMITMENT VERIFIER:\nscripts/verify-commitment.ts");
console.log("\nTRANSACTION SIGNED:\nNO");
console.log("\nTRANSACTION BROADCAST:\nNO");
if (!allPass) process.exitCode = 1;
