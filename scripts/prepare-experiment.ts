import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { createPublicClient, defineChain, formatUnits, getAddress, http, type Abi, type Address } from "viem";
import { rpcWithRetry, type RpcAttemptRecord, type RpcResult } from "./rpc-retry.ts";

const EXPECTED_CHAIN_ID = 99801;
const SUBJECT = getAddress("0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086");
const TOKEN = getAddress("0x14fc373Dce148766a3B8d9C2BF5f02F8dbe316a7");
const SICHER = getAddress("0x4e4887e28a8370678A9a37C08A85c65450b510c0");
const HELPER = getAddress("0x9A39b6B2D458212b3f0d3247C98130b2192068D0");
const START = 8_126_584n;
const END = 8_141_584n;
const MINIMUM = 80_000n * 10n ** 18n;
const EXPECTED_SUBJECT = 100_000n * 10n ** 18n;
const MINIMUM_STEP2_REMAINING_BLOCKS = 2_000n;
type Outcome = "PASS" | "FAIL" | "INDETERMINATE";
const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();
if (!rpcUrl) { console.error("ELYSIUM_RPC_URL is required."); process.exit(1); }

const tokenArtifact = JSON.parse(readFileSync("artifacts/SicherTestToken.json", "utf8")) as { abi: Abi };
const sicherArtifact = JSON.parse(readFileSync("artifacts/SicherCommitmentProof.json", "utf8")) as { abi: Abi };
const helperArtifact = JSON.parse(readFileSync("artifacts/SicherTestReturnHelper.json", "utf8")) as { abi: Abi };
const experimentState = JSON.parse(readFileSync("phase5-tool/experiment-state.json", "utf8")) as Record<"step1" | "step2" | "step3", { verified: boolean }>;
const chain = defineChain({ id: EXPECTED_CHAIN_ID, name: "Kinetiq Elysium Testnet", nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } }, testnet: true });
const client = createPublicClient({ chain, transport: http(rpcUrl, { retryCount: 0, timeout: 12_000 }) });
const records: RpcAttemptRecord[] = [];
const rpcOutcome = <T>(result: RpcResult<T>): Outcome => result.kind === "unavailable" ? "INDETERMINATE" : "FAIL";

const fileStatus: Outcome = existsSync("phase5-tool/experiment.html") ? "PASS" : "FAIL";
let httpStatus: Outcome = "INDETERMINATE";
try {
  const response = await fetch("http://127.0.0.1:4175/experiment.html", { signal: AbortSignal.timeout(5_000) });
  httpStatus = response.status === 200 ? "PASS" : "FAIL";
} catch { httpStatus = "INDETERMINATE"; }

const chainId = await rpcWithRetry("eth_chainId", () => client.getChainId(), records);
const latest = await rpcWithRetry("eth_blockNumber", () => client.getBlockNumber(), records);
const snapshot = latest.kind === "success" ? latest.value : undefined;
const [commitment, subjectBalance, helperBalance, restored] = await Promise.all([
  rpcWithRetry("eth_call commitments(1)", () => client.readContract({ address: SICHER, abi: sicherArtifact.abi, functionName: "commitments", args: [1n], blockNumber: snapshot }) as Promise<readonly [bigint, Address, Address, Address, bigint, bigint, bigint]>, records),
  rpcWithRetry("eth_call subject balance", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [SUBJECT], blockNumber: snapshot }) as Promise<bigint>, records),
  rpcWithRetry("eth_call helper balance", () => client.readContract({ address: TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [HELPER], blockNumber: snapshot }) as Promise<bigint>, records),
  rpcWithRetry("eth_call helper restored", () => client.readContract({ address: HELPER, abi: helperArtifact.abi, functionName: "restored", blockNumber: snapshot }) as Promise<boolean>, records),
]);
const chainStatus: Outcome = chainId.kind === "success" ? (chainId.value === EXPECTED_CHAIN_ID ? "PASS" : "FAIL") : rpcOutcome(chainId);
const commitmentStatus: Outcome = commitment.kind === "success" ? (() => {
  const [id, creator, subject, token, minimum, start, end] = commitment.value;
  return id === 1n && getAddress(creator) === SUBJECT && getAddress(subject) === SUBJECT && getAddress(token) === TOKEN && minimum === MINIMUM && start === START && end === END ? "PASS" : "FAIL";
})() : rpcOutcome(commitment);
const sequence = !experimentState.step1.verified && !experimentState.step2.verified && !experimentState.step3.verified
  ? { subject: EXPECTED_SUBJECT, helper: 0n, restored: false, step1: "READY", step2: "LOCKED", step3: "LOCKED" }
  : experimentState.step1.verified && !experimentState.step2.verified && !experimentState.step3.verified
    ? { subject: 92_000n * 10n ** 18n, helper: 8_000n * 10n ** 18n, restored: false, step1: "COMPLETE", step2: "READY", step3: "LOCKED" }
    : experimentState.step1.verified && experimentState.step2.verified && !experimentState.step3.verified
      ? { subject: 15_000n * 10n ** 18n, helper: 85_000n * 10n ** 18n, restored: false, step1: "COMPLETE", step2: "COMPLETE", step3: "READY" }
      : experimentState.step1.verified && experimentState.step2.verified && experimentState.step3.verified
        ? { subject: EXPECTED_SUBJECT, helper: 0n, restored: true, step1: "COMPLETE", step2: "COMPLETE", step3: "COMPLETE" }
        : undefined;
const subjectStatus: Outcome = sequence === undefined ? "FAIL" : subjectBalance.kind === "success" ? (subjectBalance.value === sequence.subject ? "PASS" : "FAIL") : rpcOutcome(subjectBalance);
const helperStatus: Outcome = sequence === undefined ? "FAIL" : helperBalance.kind === "success" ? (helperBalance.value === sequence.helper ? "PASS" : "FAIL") : rpcOutcome(helperBalance);
const restoredStatus: Outcome = sequence === undefined ? "FAIL" : restored.kind === "success" ? (restored.value === sequence.restored ? "PASS" : "FAIL") : rpcOutcome(restored);
const windowState = latest.kind === "success" ? (latest.value < START ? "WAITING" : latest.value <= END ? "ACTIVE" : "EXPIRED") : "INDETERMINATE";
const windowStatus: Outcome = windowState === "INDETERMINATE" ? rpcOutcome(latest) : windowState === "EXPIRED" ? "FAIL" : "PASS";
const blocksRemaining = latest.kind === "success" && latest.value <= END ? END - latest.value : 0n;
const remainingTimeStatus: Outcome = sequence?.step2 === "READY" ? (latest.kind === "success" ? (blocksRemaining >= MINIMUM_STEP2_REMAINING_BLOCKS ? "PASS" : "FAIL") : rpcOutcome(latest)) : "PASS";
const allStatePass = [fileStatus, httpStatus, chainStatus, commitmentStatus, subjectStatus, helperStatus, restoredStatus, remainingTimeStatus].every((status) => status === "PASS");
const actionAllowed = allStatePass && windowState === "ACTIVE";
const step1 = actionAllowed && sequence?.step1 === "READY" ? "READY" : sequence?.step1 === "COMPLETE" ? "COMPLETE" : "LOCKED";
const step2 = actionAllowed && sequence?.step2 === "READY" ? "READY" : sequence?.step2 === "COMPLETE" ? "COMPLETE" : "LOCKED";
const step3 = actionAllowed && sequence?.step3 === "READY" ? "READY" : sequence?.step3 === "COMPLETE" ? "COMPLETE" : "LOCKED";
const blocksUntilStart = latest.kind === "success" && latest.value < START ? START - latest.value : 0n;
const blocksUntilEnd = latest.kind === "success" && latest.value <= END ? END - latest.value : 0n;

console.log("SICHER ELYSIUM PHASE 5E — EXPERIMENT READINESS");
console.log(`[${fileStatus}] experiment.html exists`);
console.log(`[${httpStatus}] experiment.html HTTP 200`);
console.log(`[${chainStatus}] Chain ID`);
console.log(`[${commitmentStatus}] Commitment #1 exact`);
console.log(`[${subjectStatus}] Subject balance matches verified sequence state`);
console.log(`[${helperStatus}] Helper balance matches verified sequence state`);
console.log(`[${restoredStatus}] Helper restored matches verified sequence state`);
console.log(`[${windowStatus}] Window status`);
console.log(`[${remainingTimeStatus}] Sufficient remaining window for Step 2 submission and verification`);
console.log(`\nCURRENT BLOCK:\n${latest.kind === "success" ? latest.value : "unavailable"}`);
console.log(`\nSTART BLOCK:\n${START}`);
console.log(`\nEND BLOCK:\n${END}`);
console.log(`\nWINDOW STATUS:\n${windowState}`);
console.log(`\nBLOCKS UNTIL START:\n${blocksUntilStart}`);
console.log(`\nBLOCKS UNTIL END:\n${blocksUntilEnd}`);
console.log(`\nSUBJECT BALANCE:\n${subjectBalance.kind === "success" ? `${formatUnits(subjectBalance.value, 18)} STEST (${subjectBalance.value} base units)` : "unavailable"}`);
console.log(`\nHELPER BALANCE:\n${helperBalance.kind === "success" ? `${formatUnits(helperBalance.value, 18)} STEST (${helperBalance.value} base units)` : "unavailable"}`);
console.log(`\nHELPER RESTORED:\n${restored.kind === "success" ? restored.value : "unavailable"}`);
console.log(`\nSTEP 1:\n${step1}`);
console.log(`\nSTEP 2:\n${step2}`);
console.log(`\nSTEP 3:\n${step3}`);
console.log("\nLOCAL EXPERIMENT URL:\nhttp://127.0.0.1:4175/experiment.html");
console.log("\nSTEP 1 VERIFIER:\nscripts/verify-experiment-step.ts");
console.log("\nTRANSACTION SIGNED:\nNO");
console.log("\nTRANSACTION BROADCAST:\nNO");
if (!allStatePass || windowState === "EXPIRED" || windowState === "INDETERMINATE") process.exitCode = 1;
