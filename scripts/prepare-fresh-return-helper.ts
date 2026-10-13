import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  defineChain,
  formatEther,
  formatUnits,
  getContractAddress,
  http,
  type Abi,
} from "viem";
import {
  HELPER_RETURN_AMOUNT,
  HELPER_SUBJECT,
  HELPER_TOKEN,
  helperConstructorArguments,
  helperCreationData,
  type HelperArtifact,
} from "./return-helper-build.ts";
import { rpcWithRetry, type RpcAttemptRecord, type RpcResult } from "./rpc-retry.ts";

const CHAIN_ID = 99801;
const OLD_HELPER = "0x9A39b6B2D458212b3f0d3247C98130b2192068D0" as const;
const EXPECTED_SOURCE = "c6b86382059949072b0e6c07d4cc855500d52392ab00ba1142609ed535ec423d";
const EXPECTED_CREATION = "1460903f5b2e31057042cb3bbc1d877cc43dc0378d2aaf3699c5f8e560b15562";
const EXPECTED_RUNTIME = "95ca1edfa1ee823b3668353e0818a31faf6934be729991c92ae5d1ffec0e60c8";
const EXPECTED_COMPILER = "0.8.37+commit.f401782d.Emscripten.clang";
type Outcome = "PASS" | "FAIL" | "INDETERMINATE";

const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();
if (!rpcUrl) { console.error("ELYSIUM_RPC_URL is required."); process.exit(1); }
const source = readFileSync("contracts/SicherTestReturnHelper.sol", "utf8");
const artifact = JSON.parse(readFileSync("artifacts/SicherTestReturnHelper.json", "utf8")) as HelperArtifact & { abi: Abi; compilerVersion: string };
const tokenArtifact = JSON.parse(readFileSync("artifacts/SicherTestToken.json", "utf8")) as { abi: Abi };
const config = JSON.parse(readFileSync("phase5-tool/config.json", "utf8")) as Record<string, any>;
const finalEvidence = JSON.parse(readFileSync("phase5-tool/commitment1-final.json", "utf8")) as { verified: boolean; verdict: string; minimumObserved: string };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const sourceSha256 = digest(source);
const creationSha256 = digest(artifact.bytecode);
const runtimeSha256 = digest(artifact.deployedBytecode);
const creationData = helperCreationData(artifact);
const constructorArguments = helperConstructorArguments();

const functions = artifact.abi.filter((entry): entry is Extract<Abi[number], { type: "function" }> => entry.type === "function");
const constructor = artifact.abi.find((entry) => entry.type === "constructor");
const functionNames = functions.map((entry) => entry.name).sort();
const expectedFunctions = ["RETURN_AMOUNT", "restore", "restored", "subject", "token"].sort();
const restoreFunction = functions.find((entry) => entry.name === "restore");
const mutationFunctions = functions.filter((entry) => entry.stateMutability !== "view" && entry.stateMutability !== "pure");
const semanticSurfaceExact = JSON.stringify(functionNames) === JSON.stringify(expectedFunctions)
  && mutationFunctions.length === 1 && mutationFunctions[0]?.name === "restore"
  && restoreFunction?.inputs.length === 0 && restoreFunction.outputs.length === 0
  && constructor?.inputs.length === 2
  && constructor.inputs[0]?.type === "address" && constructor.inputs[1]?.type === "address"
  && Object.values(artifact.immutableNamesById).sort().join(",") === "subject,token"
  && !functionNames.some((name) => name.toLowerCase().includes("mint") || name.toLowerCase().includes("owner") || name.toLowerCase().includes("admin") || name.toLowerCase().includes("withdraw"));
const constructorExact = config.helperConstructorArguments?.token === HELPER_TOKEN
  && config.helperConstructorArguments?.subject === HELPER_SUBJECT
  && config.helperCreationData === creationData
  && creationData.endsWith(constructorArguments.slice(2));
const commitmentPass = finalEvidence.verified && finalEvidence.verdict === "PASS" && BigInt(finalEvidence.minimumObserved) === 92_000n * 10n ** 18n;

const chain = defineChain({ id: CHAIN_ID, name: "Kinetiq Elysium Testnet", nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } }, testnet: true });
const client = createPublicClient({ chain, transport: http(rpcUrl, { retryCount: 0, timeout: 12_000 }) });
const records: RpcAttemptRecord[] = [];
const chainResult = await rpcWithRetry("eth_chainId", () => client.getChainId(), records);
const [subjectTokenBalance, oldHelperBalance, oldHelperRestored, hypeBalance, nonceResult, gasResult, gasPriceResult, feeResult] = await Promise.all([
  rpcWithRetry("eth_call subject STEST balance", () => client.readContract({ address: HELPER_TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [HELPER_SUBJECT] }) as Promise<bigint>, records),
  rpcWithRetry("eth_call old helper STEST balance", () => client.readContract({ address: HELPER_TOKEN, abi: tokenArtifact.abi, functionName: "balanceOf", args: [OLD_HELPER] }) as Promise<bigint>, records),
  rpcWithRetry("eth_call old helper restored", () => client.readContract({ address: OLD_HELPER, abi: artifact.abi, functionName: "restored" }) as Promise<boolean>, records),
  rpcWithRetry("eth_getBalance subject", () => client.getBalance({ address: HELPER_SUBJECT }), records),
  rpcWithRetry("eth_getTransactionCount pending", () => client.getTransactionCount({ address: HELPER_SUBJECT, blockTag: "pending" }), records),
  rpcWithRetry("eth_estimateGas fresh helper deployment", () => client.estimateGas({ account: HELPER_SUBJECT, data: creationData }), records),
  rpcWithRetry("eth_gasPrice", () => client.getGasPrice(), records),
  rpcWithRetry("EIP-1559 fee estimation", () => client.estimateFeesPerGas(), records),
]);
const rpcOutcome = <T>(result: RpcResult<T>): Outcome => result.kind === "unavailable" ? "INDETERMINATE" : "FAIL";
const exact = <T>(result: RpcResult<T>, expected: T): Outcome => result.kind === "success" ? (result.value === expected ? "PASS" : "FAIL") : rpcOutcome(result);
const chainStatus = exact(chainResult, CHAIN_ID);
const subjectStatus = exact(subjectTokenBalance, 100_000n * 10n ** 18n);
const oldBalanceStatus = exact(oldHelperBalance, 0n);
const oldRestoredStatus = exact(oldHelperRestored, true);
const sourceStatus: Outcome = sourceSha256 === EXPECTED_SOURCE ? "PASS" : "FAIL";
const creationStatus: Outcome = creationSha256 === EXPECTED_CREATION ? "PASS" : "FAIL";
const runtimeStatus: Outcome = runtimeSha256 === EXPECTED_RUNTIME ? "PASS" : "FAIL";
const compilerStatus: Outcome = artifact.compilerVersion === EXPECTED_COMPILER ? "PASS" : "FAIL";
const constructorStatus: Outcome = constructorExact ? "PASS" : "FAIL";
const returnAmountStatus: Outcome = HELPER_RETURN_AMOUNT === 85_000n * 10n ** 18n && source.includes("85_000 * 10 ** 18") ? "PASS" : "FAIL";
const semanticStatus: Outcome = semanticSurfaceExact && sourceStatus === "PASS" ? "PASS" : "FAIL";
const commitmentStatus: Outcome = commitmentPass ? "PASS" : "FAIL";
const gasEstimate = gasResult.kind === "success" ? gasResult.value : undefined;
const gasLimit = gasEstimate === undefined ? undefined : (gasEstimate * 120n + 99n) / 100n;
const gasPrice = gasPriceResult.kind === "success" ? gasPriceResult.value : undefined;
const maxFeePerGas = feeResult.kind === "success" ? feeResult.value.maxFeePerGas : undefined;
const feeCandidates = [gasPrice, maxFeePerGas].filter((value): value is bigint => value !== undefined);
const feeRate = feeCandidates.reduce<bigint | undefined>((highest, value) => highest === undefined || value > highest ? value : highest, undefined);
const conservativeFee = gasLimit === undefined || feeRate === undefined ? undefined : gasLimit * feeRate;
const hype = hypeBalance.kind === "success" ? hypeBalance.value : undefined;
const feeSafe = conservativeFee !== undefined && hype !== undefined && hype > 0n && conservativeFee * 100n <= hype;
const feeStatus: Outcome = conservativeFee === undefined || hype === undefined ? "INDETERMINATE" : feeSafe ? "PASS" : "FAIL";
const percentage = conservativeFee === undefined || hype === undefined || hype === 0n ? "indeterminate" : `${Number(conservativeFee * 100_000_000n / hype) / 1_000_000}%`;
const nonce = nonceResult.kind === "success" ? nonceResult.value : undefined;
const predicted = nonce === undefined ? undefined : getContractAddress({ from: HELPER_SUBJECT, nonce: BigInt(nonce) });
const predictedCode = predicted === undefined ? undefined : await rpcWithRetry("eth_getCode predicted address", () => client.getBytecode({ address: predicted }), records);
const predictedUnusedStatus: Outcome = predictedCode === undefined ? "INDETERMINATE" : predictedCode.kind === "success" ? (predictedCode.value === undefined ? "PASS" : "FAIL") : rpcOutcome(predictedCode);
const statuses = [chainStatus, subjectStatus, oldBalanceStatus, oldRestoredStatus, commitmentStatus, sourceStatus, creationStatus, runtimeStatus, compilerStatus, constructorStatus, returnAmountStatus, semanticStatus, feeStatus, predictedUnusedStatus];
const ready = statuses.every((status) => status === "PASS") && gasEstimate !== undefined && predicted !== undefined;
const evidence = {
  generatedAt: new Date().toISOString(), ready, chainId: chainResult.kind === "success" ? chainResult.value : null,
  subjectTokenBalance: subjectTokenBalance.kind === "success" ? subjectTokenBalance.value.toString() : null,
  oldHelper: OLD_HELPER, oldHelperBalance: oldHelperBalance.kind === "success" ? oldHelperBalance.value.toString() : null,
  oldHelperRestored: oldHelperRestored.kind === "success" ? oldHelperRestored.value : null,
  commitment1Verdict: finalEvidence.verdict, sourceSha256, creationBytecodeSha256: creationSha256, runtimeBytecodeSha256: runtimeSha256,
  compiler: artifact.compilerVersion, constructorToken: HELPER_TOKEN, constructorSubject: HELPER_SUBJECT, returnAmount: HELPER_RETURN_AMOUNT.toString(),
  semanticSurfaceExact, constructorArguments, pendingNonce: nonce ?? null, predictedAddress: predicted ?? null,
  predictionStatus: "PREDICTED ONLY / NOT YET DEPLOYED / NOT VERIFIED UNTIL MINED",
  walletBalanceWei: hype?.toString() ?? null, estimatedGas: gasEstimate?.toString() ?? null, conservativeGasLimit: gasLimit?.toString() ?? null,
  feeRateUsedWei: feeRate?.toString() ?? null, conservativeMaxFeeWei: conservativeFee?.toString() ?? null, percentageOfWalletBalance: percentage,
};
writeFileSync("phase5-tool/predeployment.json", `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
const displayToken = (value: bigint) => `${formatUnits(value, 18)} STEST (${value} base units)`;
console.log("SICHER PHASE 5J — FRESH RETURN HELPER DEPLOYMENT PREFLIGHT");
console.log(`[${chainStatus}] Chain ID = 99801`);
console.log(`[${subjectStatus}] Subject balance = 100,000 STEST`);
console.log(`[${oldBalanceStatus}] Old helper balance = 0 STEST`);
console.log(`[${oldRestoredStatus}] Old helper restored = true`);
console.log(`[${commitmentStatus}] Commitment #1 verdict PASS`);
console.log(`[${sourceStatus}] Source fingerprint`);
console.log(`[${creationStatus}] Creation bytecode fingerprint`);
console.log(`[${runtimeStatus}] Runtime bytecode fingerprint`);
console.log(`[${compilerStatus}] Compiler version`);
console.log(`[${constructorStatus}] Exact constructor configuration`);
console.log(`[${returnAmountStatus}] Exact 85,000 STEST return amount`);
console.log(`[${semanticStatus}] No arbitrary recipient, admin mutation, mint, or post-deployment token/subject configuration`);
console.log(`[${feeStatus}] Conservative deployment fee at or below 1% of HYPE balance`);
console.log(`[${predictedUnusedStatus}] Predicted address currently has no code`);
console.log(`\nPREFLIGHT:\n${ready ? "PASS" : statuses.includes("INDETERMINATE") ? "INDETERMINATE" : "FAIL"}`);
console.log(`\nCHAIN ID:\n${chainResult.kind === "success" ? chainResult.value : "unavailable"}`);
console.log(`\nSUBJECT BALANCE:\n${subjectTokenBalance.kind === "success" ? displayToken(subjectTokenBalance.value) : "unavailable"}`);
console.log(`\nOLD HELPER BALANCE:\n${oldHelperBalance.kind === "success" ? displayToken(oldHelperBalance.value) : "unavailable"}`);
console.log(`\nOLD HELPER RESTORED:\n${oldHelperRestored.kind === "success" ? oldHelperRestored.value : "unavailable"}`);
console.log(`\nCOMMITMENT #1 VERDICT:\n${finalEvidence.verdict}`);
console.log(`\nSOURCE SHA256:\n${sourceSha256}`);
console.log(`\nSOURCE MATCH:\n${sourceStatus}`);
console.log(`\nCREATION BYTECODE SHA256:\n${creationSha256}`);
console.log(`\nCREATION BYTECODE MATCH:\n${creationStatus}`);
console.log(`\nRUNTIME BYTECODE SHA256:\n${runtimeSha256}`);
console.log(`\nRUNTIME BYTECODE MATCH:\n${runtimeStatus}`);
console.log(`\nCOMPILER:\n${artifact.compilerVersion}`);
console.log(`\nCONSTRUCTOR TOKEN:\n${HELPER_TOKEN}`);
console.log(`\nCONSTRUCTOR SUBJECT:\n${HELPER_SUBJECT}`);
console.log(`\nRETURN AMOUNT:\n${displayToken(HELPER_RETURN_AMOUNT)}`);
console.log(`\nDEPLOYMENT GAS ESTIMATE:\n${gasEstimate ?? "unavailable"}`);
console.log(`\nCONSERVATIVE GAS LIMIT:\n${gasLimit ?? "unavailable"}`);
console.log(`\nHYPE BALANCE:\n${hype === undefined ? "unavailable" : `${formatEther(hype)} HYPE (${hype} wei)`}`);
console.log(`\nCONSERVATIVE MAX FEE:\n${conservativeFee === undefined ? "unavailable" : `${formatEther(conservativeFee)} HYPE (${conservativeFee} wei; ${percentage})`}`);
console.log(`\nPREDICTED ADDRESS:\n${predicted ?? "unavailable"}`);
console.log("\nPREDICTED ONLY:\nYES — NOT VERIFIED UNTIL MINED");
console.log(`\nFRESH HELPER DEPLOYMENT READY:\n${ready ? "YES" : "NO"}`);
console.log("\nAUTOMATIC TRANSACTIONS SENT:\n0");
console.log("\nFILES MODIFIED:\nartifacts/SicherTestReturnHelper.json (recompiled); phase5-tool/predeployment.json (fresh read-only evidence)");
console.log(`\nBLOCKERS:\n${ready ? "NONE" : "One or more fail-closed preconditions did not pass."}`);
if (!ready) process.exitCode = 1;
