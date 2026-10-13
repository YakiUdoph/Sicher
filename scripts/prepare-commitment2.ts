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
  parseAbiItem,
  type Abi,
  type Address,
} from "viem";
import { rpcWithRetry, type RpcAttemptRecord, type RpcResult } from "./rpc-retry.ts";

const CHAIN_ID = 99801;
const SICHER = getAddress("0x4e4887e28a8370678A9a37C08A85c65450b510c0");
const SUBJECT = getAddress("0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086");
const TOKEN = getAddress("0x14fc373Dce148766a3B8d9C2BF5f02F8dbe316a7");
const FRESH_HELPER = getAddress("0x266bcaac497BaE5450B7aD3721376B3081DEc63c");
const RESET_COMPLETE_BLOCK = 8_155_203n;
const RESET_TX_2 = "0x9885a6b4cfb328084ad0d5097f5ed1bc03cc27a5b1eef69f00e425e1a7da7696" as const;
const RESTORE_AMOUNT = 85_000n * 10n ** 18n;
const SUBJECT_BALANCE = 100_000n * 10n ** 18n;
const MINIMUM = 80_000n * 10n ** 18n;
const START_OFFSET = 50_000n;
const WINDOW_LENGTH = 300_000n;
const CADENCE_INTERVALS = 60n;
const OBSERVATION_MS = 10_000;
type Outcome = "PASS" | "FAIL" | "INDETERMINATE";

const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();
if (!rpcUrl) { console.error("ELYSIUM_RPC_URL is required."); process.exit(1); }
const tokenArtifact = JSON.parse(readFileSync("artifacts/SicherTestToken.json", "utf8")) as { abi: Abi };
const sicherArtifact = JSON.parse(readFileSync("artifacts/SicherCommitmentProof.json", "utf8")) as { abi: Abi };
const helperArtifact = JSON.parse(readFileSync("artifacts/SicherTestReturnHelper.json", "utf8")) as { abi: Abi };
const finalCommitmentOne = JSON.parse(readFileSync("phase5-tool/commitment1-final.json", "utf8")) as { verified: boolean; verdict: string; minimumObserved: string };
const freshEvidence = JSON.parse(readFileSync("phase5-tool/verified-fresh-helper.json", "utf8")) as { verified: boolean; verdict: string; address: string; token: string; subject: string; returnAmount: string };
const chain = defineChain({ id: CHAIN_ID, name: "Kinetiq Elysium Testnet", nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } }, testnet: true });
const client = createPublicClient({ chain, transport: http(rpcUrl, { retryCount: 2, timeout: 30_000 }) });
const records: RpcAttemptRecord[] = [];
const rpcOutcome = <T>(result: RpcResult<T>): Outcome => result.kind === "unavailable" ? "INDETERMINATE" : "FAIL";
const exact = <T>(result: RpcResult<T>, expected: T): Outcome => result.kind === "success" ? (result.value === expected ? "PASS" : "FAIL") : rpcOutcome(result);
const round = (value: number) => Math.round(value * 1000) / 1000;

const observationStartTime = Date.now();
const observationStart = await rpcWithRetry("eth_blockNumber observation start", () => client.getBlockNumber(), records);
await new Promise((resolve) => setTimeout(resolve, OBSERVATION_MS));
const observationEnd = await rpcWithRetry("eth_blockNumber observation end", () => client.getBlockNumber(), records);
const observationSeconds = (Date.now() - observationStartTime) / 1000;
const liveBlocks = observationStart.kind === "success" && observationEnd.kind === "success" ? observationEnd.value - observationStart.value : undefined;
const liveSecondsPerBlock = liveBlocks !== undefined && liveBlocks > 0n ? observationSeconds / Number(liveBlocks) : undefined;
const snapshot = observationEnd.kind === "success" ? observationEnd.value : undefined;

const chainId = await rpcWithRetry("eth_chainId", () => client.getChainId(), records);
const sicherCode = await rpcWithRetry("eth_getCode Sicher", () => client.getBytecode({ address: SICHER, blockNumber: snapshot }), records);
const nextId = await rpcWithRetry("eth_call nextCommitmentId", () => client.readContract({ address: SICHER, abi: sicherArtifact.abi, functionName: "nextCommitmentId", blockNumber: snapshot }) as Promise<bigint>, records);
const commitmentTwo = await rpcWithRetry("eth_call commitments(2)", () => client.readContract({ address: SICHER, abi: sicherArtifact.abi, functionName: "commitments", args: [2n], blockNumber: snapshot }) as Promise<readonly [bigint, Address, Address, Address, bigint, bigint, bigint]>, records);
const subjectBalance = await rpcWithRetry("eth_call subject STEST balance", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [SUBJECT], blockNumber: snapshot }) as Promise<bigint>, records);
const helperBalance = await rpcWithRetry("eth_call fresh helper balance", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [FRESH_HELPER], blockNumber: snapshot }) as Promise<bigint>, records);
const helperRestored = await rpcWithRetry("eth_call fresh helper restored", () => client.readContract({ address: FRESH_HELPER, abi: helperArtifact.abi, functionName: "restored", blockNumber: snapshot }) as Promise<boolean>, records);
const helperToken = await rpcWithRetry("eth_call fresh helper token", () => client.readContract({ address: FRESH_HELPER, abi: helperArtifact.abi, functionName: "token", blockNumber: snapshot }) as Promise<Address>, records);
const helperSubject = await rpcWithRetry("eth_call fresh helper subject", () => client.readContract({ address: FRESH_HELPER, abi: helperArtifact.abi, functionName: "subject", blockNumber: snapshot }) as Promise<Address>, records);
const helperAmount = await rpcWithRetry("eth_call fresh helper RETURN_AMOUNT", () => client.readContract({ address: FRESH_HELPER, abi: helperArtifact.abi, functionName: "RETURN_AMOUNT", blockNumber: snapshot }) as Promise<bigint>, records);
const hypeBalance = await rpcWithRetry("eth_getBalance subject", () => client.getBalance({ address: SUBJECT, blockNumber: snapshot }), records);
const gasPrice = await rpcWithRetry("eth_gasPrice", () => client.getGasPrice(), records);
const feeEstimate = await rpcWithRetry("EIP-1559 fee estimate", () => client.estimateFeesPerGas(), records);
const resetReceipt = await rpcWithRetry("eth_getTransactionReceipt reset 2", () => client.getTransactionReceipt({ hash: RESET_TX_2 }), records);

let historicalAverage: number | undefined;
let historicalMedian: number | undefined;
let historicalMinimum: number | undefined;
let historicalMaximum: number | undefined;
let cadenceFirstBlock: bigint | undefined;
if (snapshot !== undefined && snapshot > CADENCE_INTERVALS) {
  cadenceFirstBlock = snapshot - CADENCE_INTERVALS;
  const timestamps: bigint[] = [];
  for (let index = 0n; index <= CADENCE_INTERVALS; index += 10n) {
    const numbers = Array.from({ length: Number(index + 9n <= CADENCE_INTERVALS ? 10n : CADENCE_INTERVALS - index + 1n) }, (_, offset) => cadenceFirstBlock! + index + BigInt(offset));
    const batch = await Promise.all(numbers.map((blockNumber) => rpcWithRetry(`eth_getBlockByNumber ${blockNumber}`, async () => (await client.getBlock({ blockNumber })).timestamp, records)));
    if (batch.some((result) => result.kind !== "success")) { timestamps.length = 0; break; }
    timestamps.push(...batch.map((result) => (result as { kind: "success"; value: bigint }).value));
  }
  if (timestamps.length === Number(CADENCE_INTERVALS + 1n)) {
    const intervals = timestamps.slice(1).map((timestamp, index) => Number(timestamp - timestamps[index]));
    const sorted = [...intervals].sort((a, b) => a - b);
    historicalAverage = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    historicalMedian = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    historicalMinimum = sorted[0];
    historicalMaximum = sorted.at(-1);
  }
}

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
let unexpectedStatus: Outcome = snapshot === undefined ? "INDETERMINATE" : "PASS";
let unexpectedTransfers = 0;
if (snapshot !== undefined) {
  for (let fromBlock = RESET_COMPLETE_BLOCK + 1n; fromBlock <= snapshot; fromBlock += 2_000n) {
    const toBlock = fromBlock + 1_999n < snapshot ? fromBlock + 1_999n : snapshot;
    const logs = await rpcWithRetry(`eth_getLogs ${fromBlock}-${toBlock}`, () => client.getLogs({ address: TOKEN, event: transferEvent, fromBlock, toBlock }), records);
    if (logs.kind !== "success") { unexpectedStatus = logs.kind === "unavailable" ? "INDETERMINATE" : "FAIL"; break; }
    for (const log of logs.value) {
      const from = getAddress(String(log.args.from));
      const to = getAddress(String(log.args.to));
      if (from === SUBJECT || to === SUBJECT || from === FRESH_HELPER || to === FRESH_HELPER) unexpectedTransfers += 1;
    }
  }
  if (unexpectedStatus === "PASS" && unexpectedTransfers !== 0) unexpectedStatus = "FAIL";
}

const proposedStart = snapshot === undefined ? undefined : snapshot + START_OFFSET;
const proposedEnd = proposedStart === undefined ? undefined : proposedStart + WINDOW_LENGTH;
const createData = proposedStart === undefined || proposedEnd === undefined ? undefined : encodeFunctionData({ abi: sicherArtifact.abi, functionName: "createCommitment", args: [SUBJECT, TOKEN, MINIMUM, proposedStart, proposedEnd] });
const transfer8Data = encodeFunctionData({ abi: tokenArtifact.abi, functionName: "transfer", args: [FRESH_HELPER, 8_000n * 10n ** 18n] });
const transfer77Data = encodeFunctionData({ abi: tokenArtifact.abi, functionName: "transfer", args: [FRESH_HELPER, 77_000n * 10n ** 18n] });
let createSimulation: RpcResult<unknown> | undefined;
let createGas: RpcResult<bigint> | undefined;
let step1Gas: RpcResult<bigint> | undefined;
let step2Gas: RpcResult<bigint> | undefined;
if (createData !== undefined) {
  createSimulation = await rpcWithRetry("eth_call exact createCommitment #2", () => client.simulateContract({ account: SUBJECT, address: SICHER, abi: sicherArtifact.abi, functionName: "createCommitment", args: [SUBJECT, TOKEN, MINIMUM, proposedStart!, proposedEnd!] }), records);
  createGas = await rpcWithRetry("eth_estimateGas exact createCommitment #2", () => client.estimateGas({ account: SUBJECT, to: SICHER, data: createData }), records);
  step1Gas = await rpcWithRetry("eth_estimateGas Step 1", () => client.estimateGas({ account: SUBJECT, to: TOKEN, data: transfer8Data }), records);
  step2Gas = await rpcWithRetry("eth_estimateGas Step 2", () => client.estimateGas({ account: SUBJECT, to: TOKEN, data: transfer77Data }), records);
}
const restoreBaselineGas = resetReceipt.kind === "success" && resetReceipt.value.status === "success" ? resetReceipt.value.gasUsed : undefined;
const conservativeGas = (value: bigint) => (value * 150n + 99n) / 100n;
const gasValues = [createGas?.kind === "success" ? createGas.value : undefined, step1Gas?.kind === "success" ? step1Gas.value : undefined, step2Gas?.kind === "success" ? step2Gas.value : undefined, restoreBaselineGas];
const totalConservativeGas = gasValues.every((value) => value !== undefined) ? gasValues.reduce((sum, value) => sum + conservativeGas(value!), 0n) : undefined;
const baseFeeCandidates = [gasPrice.kind === "success" ? gasPrice.value : undefined, feeEstimate.kind === "success" ? feeEstimate.value.maxFeePerGas : undefined].filter((value): value is bigint => value !== undefined);
const baseFeeRate = baseFeeCandidates.reduce<bigint | undefined>((highest, value) => highest === undefined || value > highest ? value : highest, undefined);
const conservativeFeeRate = baseFeeRate === undefined ? undefined : (baseFeeRate * 150n + 99n) / 100n;
const totalCost = totalConservativeGas === undefined || conservativeFeeRate === undefined ? undefined : totalConservativeGas * conservativeFeeRate;
const hype = hypeBalance.kind === "success" ? hypeBalance.value : undefined;
const safetyReserve = totalCost === undefined || hype === undefined ? undefined : hype - totalCost;
const costStatus: Outcome = totalCost === undefined || hype === undefined ? "INDETERMINATE" : hype > totalCost * 10n ? "PASS" : "FAIL";

const freshEvidenceStatus: Outcome = freshEvidence.verified && freshEvidence.verdict === "PASS" && getAddress(freshEvidence.address) === FRESH_HELPER && getAddress(freshEvidence.token) === TOKEN && getAddress(freshEvidence.subject) === SUBJECT && BigInt(freshEvidence.returnAmount) === RESTORE_AMOUNT ? "PASS" : "FAIL";
const statuses = {
  chain: exact(chainId, CHAIN_ID),
  sicherRuntime: sicherCode.kind === "success" ? (sicherCode.value !== undefined && sicherCode.value !== "0x" ? "PASS" : "FAIL") : rpcOutcome(sicherCode),
  nextId: exact(nextId, 2n),
  commitmentTwoAbsent: commitmentTwo.kind === "success" ? (commitmentTwo.value[0] === 0n ? "PASS" : "FAIL") : rpcOutcome(commitmentTwo),
  commitmentOne: finalCommitmentOne.verified && finalCommitmentOne.verdict === "PASS" && BigInt(finalCommitmentOne.minimumObserved) === 92_000n * 10n ** 18n ? "PASS" : "FAIL",
  freshEvidence: freshEvidenceStatus,
  subjectBalance: exact(subjectBalance, SUBJECT_BALANCE),
  helperBalance: exact(helperBalance, 0n),
  helperRestored: exact(helperRestored, false),
  helperToken: helperToken.kind === "success" ? (getAddress(helperToken.value) === TOKEN ? "PASS" : "FAIL") : rpcOutcome(helperToken),
  helperSubject: helperSubject.kind === "success" ? (getAddress(helperSubject.value) === SUBJECT ? "PASS" : "FAIL") : rpcOutcome(helperSubject),
  helperAmount: exact(helperAmount, RESTORE_AMOUNT),
  unexpectedTransfers: unexpectedStatus,
  cadence: liveSecondsPerBlock !== undefined && historicalAverage !== undefined ? "PASS" : "INDETERMINATE",
  window: START_OFFSET >= 40_000n && WINDOW_LENGTH >= 240_000n && proposedEnd !== undefined && proposedStart !== undefined && proposedEnd > proposedStart ? "PASS" : "FAIL",
  simulation: createSimulation?.kind === "success" && createGas?.kind === "success" ? "PASS" : createSimulation?.kind === "unavailable" || createGas?.kind === "unavailable" ? "INDETERMINATE" : "FAIL",
  cost: costStatus,
} satisfies Record<string, Outcome>;
const ready = Object.values(statuses).every((status) => status === "PASS");
const cadenceForEstimate = liveSecondsPerBlock ?? historicalAverage;
const approximatePreStartSeconds = cadenceForEstimate === undefined ? undefined : Number(START_OFFSET) * cadenceForEstimate;
const approximateWindowSeconds = cadenceForEstimate === undefined ? undefined : Number(WINDOW_LENGTH) * cadenceForEstimate;
const preparation = {
  generatedAt: new Date().toISOString(), ready, commitmentId: "2", currentBlock: snapshot?.toString() ?? null,
  freshHelper: FRESH_HELPER, unexpectedTransfers, hypeBalanceWei: hype?.toString() ?? null,
  cadence: { observationSeconds: round(observationSeconds), observationStartBlock: observationStart.kind === "success" ? observationStart.value.toString() : null, observationEndBlock: snapshot?.toString() ?? null, observedBlocks: liveBlocks?.toString() ?? null, liveSecondsPerBlock: liveSecondsPerBlock === undefined ? null : round(liveSecondsPerBlock), historicalFirstBlock: cadenceFirstBlock?.toString() ?? null, historicalLastBlock: snapshot?.toString() ?? null, historicalIntervals: Number(CADENCE_INTERVALS), historicalAverageSecondsPerBlock: historicalAverage === undefined ? null : round(historicalAverage), historicalMedianSecondsPerBlock: historicalMedian === undefined ? null : round(historicalMedian), historicalMinimumSecondsPerBlock: historicalMinimum ?? null, historicalMaximumSecondsPerBlock: historicalMaximum ?? null, designSecondsPerBlock: cadenceForEstimate === undefined ? null : round(cadenceForEstimate) },
  policy: { startDelayBlocks: START_OFFSET.toString(), proofWindowBlocks: WINDOW_LENGTH.toString(), minimumRemainingDelayBlocks: "40000" },
  proposal: { subject: SUBJECT, token: TOKEN, minimumBalance: MINIMUM.toString(), startBlock: proposedStart?.toString() ?? null, endBlock: proposedEnd?.toString() ?? null },
  costs: { createGas: createGas?.kind === "success" ? createGas.value.toString() : null, step1Gas: step1Gas?.kind === "success" ? step1Gas.value.toString() : null, step2Gas: step2Gas?.kind === "success" ? step2Gas.value.toString() : null, restoreBaselineGas: restoreBaselineGas?.toString() ?? null, conservativeGasMultiplierPercent: 150, conservativeFeeRateWei: conservativeFeeRate?.toString() ?? null, estimatedTotalWei: totalCost?.toString() ?? null, safetyReserveWei: safetyReserve?.toString() ?? null, requiredCoverageMultiple: 10 },
};
writeFileSync("phase5-tool/commitment2-preparation.json", `${JSON.stringify(preparation, null, 2)}\n`, "utf8");
const displayToken = (value: bigint) => `${formatUnits(value, 18)} STEST (${value} base units)`;
const duration = (seconds: number | undefined) => seconds === undefined ? "unavailable" : `${round(seconds / 3600)} hours (${round(seconds / 60)} minutes; approximate)`;
console.log("SICHER PHASE 5L — COMMITMENT #2 CREATION PREFLIGHT");
for (const [label, status] of Object.entries(statuses)) console.log(`[${status}] ${label}`);
console.log(`\nPREFLIGHT:\n${ready ? "PASS" : Object.values(statuses).includes("INDETERMINATE") ? "INDETERMINATE" : "FAIL"}`);
console.log(`\nCURRENT BLOCK:\n${snapshot ?? "unavailable"}`);
console.log(`\nNEXT COMMITMENT ID:\n${nextId.kind === "success" ? nextId.value : "unavailable"}`);
console.log(`\nSUBJECT BALANCE:\n${subjectBalance.kind === "success" ? displayToken(subjectBalance.value) : "unavailable"}`);
console.log(`\nFRESH HELPER:\n${FRESH_HELPER}`);
console.log(`\nHELPER BALANCE:\n${helperBalance.kind === "success" ? displayToken(helperBalance.value) : "unavailable"}`);
console.log(`\nHELPER RESTORED:\n${helperRestored.kind === "success" ? helperRestored.value : "unavailable"}`);
console.log(`\nHELPER TOKEN:\n${helperToken.kind === "success" ? getAddress(helperToken.value) : "unavailable"}`);
console.log(`\nHELPER SUBJECT:\n${helperSubject.kind === "success" ? getAddress(helperSubject.value) : "unavailable"}`);
console.log(`\nHELPER RETURN AMOUNT:\n${helperAmount.kind === "success" ? displayToken(helperAmount.value) : "unavailable"}`);
console.log(`\nUNEXPECTED TRANSFERS:\n${unexpectedStatus === "PASS" ? unexpectedTransfers : "unavailable"}`);
console.log(`\nHYPE BALANCE:\n${hype === undefined ? "unavailable" : `${formatEther(hype)} HYPE (${hype} wei)`}`);
console.log(`\nESTIMATED TOTAL REMAINING EXPERIMENT COST:\n${totalCost === undefined ? "unavailable" : `${formatEther(totalCost)} HYPE (${totalCost} wei; 150% gas and fee-rate margins)`}`);
console.log(`\nSAFETY RESERVE:\n${safetyReserve === undefined ? "unavailable" : `${formatEther(safetyReserve)} HYPE (${safetyReserve} wei remaining; required >10x cost coverage)`}`);
console.log(`\nMEASURED BLOCK CADENCE:\nlive ${liveBlocks ?? "unavailable"} blocks in ${round(observationSeconds)}s = ${liveSecondsPerBlock === undefined ? "unavailable" : `${round(liveSecondsPerBlock)}s/block`}; historical ${historicalAverage === undefined ? "unavailable" : `${round(historicalAverage)}s average, ${round(historicalMedian!)}s median, ${historicalMinimum}-${historicalMaximum}s min-max`} over ${CADENCE_INTERVALS} intervals`);
console.log(`\nCHOSEN START OFFSET:\n${START_OFFSET} blocks`);
console.log(`\nPROPOSED START BLOCK:\n${proposedStart ?? "unavailable"}`);
console.log(`\nCHOSEN WINDOW LENGTH:\n${WINDOW_LENGTH} blocks`);
console.log(`\nPROPOSED END BLOCK:\n${proposedEnd ?? "unavailable"}`);
console.log(`\nAPPROX PRE-START TIME:\n${duration(approximatePreStartSeconds)}`);
console.log(`\nAPPROX WINDOW DURATION:\n${duration(approximateWindowSeconds)}`);
console.log(`\nCREATE COMMITMENT SIMULATION:\n${statuses.simulation}`);
console.log(`\nESTIMATED COMMITMENT GAS:\n${createGas?.kind === "success" ? createGas.value : "unavailable"}`);
console.log(`\nCOMMITMENT #2 READY:\n${ready ? "YES" : "NO"}`);
console.log("\nAUTOMATIC TRANSACTIONS SENT:\n0");
console.log("\nFILES MODIFIED:\nphase5-tool/commitment2-preparation.json");
console.log(`\nBLOCKERS:\n${ready ? "NONE" : "One or more fail-closed preconditions did not pass."}`);
if (!ready) process.exitCode = 1;
