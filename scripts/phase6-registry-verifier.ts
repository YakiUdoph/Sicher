import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { decodeEventLog, decodeFunctionResult, encodeFunctionData, getAddress, padHex, toEventSelector, toHex, type Address, type Hex } from "viem";
import {
  COMPETITION_CHAIN_ID, COMPETITION_REGISTRY, SHARED_INFRASTRUCTURE_LIMITATION, assessBlockHashAgreement, assessFinalizedHeads, auditCoverage, canonicalJson,
  compareProviderEvidence, deterministicRanges, digestRawLogs,
  reconstructPath, sha256Canonical, type CoverageRecord, type FinalizedHeadObservation, type HashObservation,
  type RawTransferLog, type TokenModelStatus, type TransferEvidence,
} from "./phase6-evidence-core.ts";
import {
  CORROBORATED_LIMITATION, assessDiscoveredReceiptChecks, createReceiptV3, evaluateAssuranceCandidate,
  type AssuranceLevel, type DiscoveredReceiptCheck,
} from "./phase6-assurance-core.ts";

const VERSION = "sicher-phase6-competition-verifier/3.0.0";
const KNOWN_STEST = getAddress("0x14fc373Dce148766a3B8d9C2BF5f02F8dbe316a7");
const KNOWN_STEST_RUNTIME_SHA256 = "a7398bc4e67dad5a766d08245438046e757cbdcc77b3faad053c43c1101dca15";
const TRANSFER_TOPIC = toEventSelector("Transfer(address,address,uint256)");
const MAX_ATTEMPTS = 3;
const registryAbi = [{ type: "function", name: "commitments", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [
  { name: "id", type: "uint256" }, { name: "creator", type: "address" }, { name: "subject", type: "address" }, { name: "token", type: "address" },
  { name: "minimumBalance", type: "uint256" }, { name: "startBlock", type: "uint256" }, { name: "endBlock", type: "uint256" },
] }] as const;
const tokenAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "event", name: "Transfer", inputs: [{ indexed: true, name: "from", type: "address" }, { indexed: true, name: "to", type: "address" }, { indexed: false, name: "value", type: "uint256" }] },
] as const;

type Commitment = readonly [bigint, Address, Address, Address, bigint, bigint, bigint];
type Provider = { id: string; url: string; sanitizedUrl: string };
type JsonRpcResponse = { result?: unknown; error?: { code?: number; message?: string } };
type RpcBlock = { number: Hex; hash: Hex };
let rpcRequests = 0;
let rpcRetries = 0;

function required(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required.`); return value; }
function sanitizeUrl(value: string): string { const url = new URL(value); return `${url.protocol}//${url.host}${url.pathname === "/" ? "" : "/..."}`; }
function providerFromEnvironment(suffix: "A" | "B"): Provider | undefined {
  const url = process.env[`PHASE6_RPC_${suffix}_URL`]?.trim();
  return url ? { id: process.env[`PHASE6_RPC_${suffix}_NAME`]?.trim() || `provider-${suffix.toLowerCase()}`, url, sanitizedUrl: sanitizeUrl(url) } : undefined;
}
function compactError(error: unknown): string { return (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).replace(/https?:\/\/\S+/g, "[sanitized-url]").replace(/\s+/g, " ").trim(); }
async function rpc(provider: Provider, method: string, params: unknown[]): Promise<unknown> {
  let last = "unavailable";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      rpcRequests += 1;
      if (attempt > 1) rpcRetries += 1;
      const response = await fetch(provider.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as JsonRpcResponse;
      if (payload.error) throw new Error(`RPC ${payload.error.code ?? "error"}: ${payload.error.message ?? "unknown"}`);
      if (!("result" in payload)) throw new Error("RPC response omitted result.");
      return payload.result;
    } catch (error) { last = compactError(error); if (attempt < MAX_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 300 * attempt)); }
  }
  throw new Error(`${provider.id} ${method} unavailable after ${MAX_ATTEMPTS} attempts: ${last}`);
}
function asHex(value: unknown, label: string): Hex { if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value)) throw new Error(`${label} is not hex.`); return value as Hex; }
function asSafeIndex(value: unknown, label: string): number {
  const parsed = BigInt(asHex(value, label));
  if (parsed < 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} is outside the safe non-negative integer range.`);
  return Number(parsed);
}
function parseBlock(value: unknown, label: string): RpcBlock {
  if (!value || typeof value !== "object") throw new Error(`${label} is unavailable or malformed.`);
  const block = value as Record<string, unknown>;
  const number = asHex(block.number, `${label} number`); const hash = asHex(block.hash, `${label} hash`);
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash) || number === "0x") throw new Error(`${label} is unavailable or malformed.`);
  return { number, hash };
}
async function blockAt(provider: Provider, block: "latest" | "finalized" | bigint): Promise<RpcBlock> { return parseBlock(await rpc(provider, "eth_getBlockByNumber", [typeof block === "bigint" ? toHex(block) : block, false]), `${String(block)} block`); }
function sameCommitment(a: Commitment, b: Commitment): boolean { return a.every((value, index) => typeof value === "bigint" ? value === b[index] : getAddress(value) === getAddress(b[index] as Address)); }
async function readCommitment(provider: Provider, registry: Address, commitmentId: bigint, blockHash: Hex): Promise<Commitment> {
  const data = encodeFunctionData({ abi: registryAbi, functionName: "commitments", args: [commitmentId] });
  const result = asHex(await rpc(provider, "eth_call", [{ to: registry, data }, { blockHash, requireCanonical: true }]), "commitment result");
  return decodeFunctionResult({ abi: registryAbi, functionName: "commitments", data: result }) as Commitment;
}
async function balanceAtHash(provider: Provider, token: Address, subject: Address, blockHash: Hex): Promise<bigint> {
  const data = encodeFunctionData({ abi: tokenAbi, functionName: "balanceOf", args: [subject] });
  const result = asHex(await rpc(provider, "eth_call", [{ to: token, data }, { blockHash, requireCanonical: true }]), "balance result");
  return decodeFunctionResult({ abi: tokenAbi, functionName: "balanceOf", data: result }) as bigint;
}
function topicAddress(address: Address): Hex { return padHex(address, { size: 32 }); }
function parseRawLog(value: unknown): RawTransferLog {
  if (!value || typeof value !== "object") throw new Error("Malformed relevant log object.");
  const log = value as Record<string, unknown>; if (!Array.isArray(log.topics)) throw new Error("Malformed relevant log topics.");
  return { address: getAddress(String(log.address)), blockNumber: BigInt(asHex(log.blockNumber, "blockNumber")), blockHash: asHex(log.blockHash, "blockHash"), transactionHash: asHex(log.transactionHash, "transactionHash"), transactionIndex: asSafeIndex(log.transactionIndex, "transactionIndex"), logIndex: asSafeIndex(log.logIndex, "logIndex"), topics: log.topics.map((topic) => asHex(topic, "topic")), data: asHex(log.data, "data") };
}
function decodeTransfer(log: RawTransferLog): TransferEvidence {
  const decoded = decodeEventLog({ abi: tokenAbi, eventName: "Transfer", data: log.data, topics: log.topics as [Hex, ...Hex[]], strict: true });
  const args = decoded.args as { from: Address; to: Address; value: bigint };
  return { ...log, from: getAddress(args.from), to: getAddress(args.to), value: args.value };
}
async function logsForRange(provider: Provider, token: Address, subject: Address, fromBlock: bigint, toBlock: bigint): Promise<RawTransferLog[]> {
  const common = { address: token, fromBlock: toHex(fromBlock), toBlock: toHex(toBlock) };
  const [outgoing, incoming] = await Promise.all([rpc(provider, "eth_getLogs", [{ ...common, topics: [TRANSFER_TOPIC, topicAddress(subject)] }]), rpc(provider, "eth_getLogs", [{ ...common, topics: [TRANSFER_TOPIC, null, topicAddress(subject)] }])]);
  if (!Array.isArray(outgoing) || !Array.isArray(incoming)) throw new Error("eth_getLogs result is not an array.");
  const unique = new Map<string, RawTransferLog>();
  for (const raw of [...outgoing, ...incoming].map(parseRawLog)) { const key = `${raw.transactionHash.toLowerCase()}:${raw.logIndex}`; const old = unique.get(key); if (old && canonicalJson(old) !== canonicalJson(raw)) throw new Error(`Conflicting duplicate raw log ${key}.`); unique.set(key, raw); }
  return [...unique.values()];
}
async function receiptLogsForBlock(provider: Provider, token: Address, subject: Address, blockNumber: bigint): Promise<RawTransferLog[]> {
  const [receipts, blockValue] = await Promise.all([
    rpc(provider, "eth_getBlockReceipts", [toHex(blockNumber)]),
    rpc(provider, "eth_getBlockByNumber", [toHex(blockNumber), false]),
  ]);
  if (!Array.isArray(receipts)) throw new Error("eth_getBlockReceipts result is not an array.");
  if (!blockValue || typeof blockValue !== "object") throw new Error("Full block transaction enumeration is unavailable.");
  const block = blockValue as Record<string, unknown>;
  const blockHash = asHex(block.hash, "receipt-scan block hash");
  if (!/^0x[0-9a-fA-F]{64}$/.test(blockHash) || !Array.isArray(block.transactions) || block.transactions.some((item) => typeof item !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(item))) throw new Error("Malformed full block transaction enumeration.");
  const transactionHashes = new Set((block.transactions as string[]).map((item) => item.toLowerCase()));
  const receiptHashes = new Set<string>();
  const relevant: RawTransferLog[] = [];
  const subjectTopic = topicAddress(subject).toLowerCase();
  for (const receipt of receipts) {
    if (!receipt || typeof receipt !== "object" || !Array.isArray((receipt as Record<string, unknown>).logs)) throw new Error("Malformed block receipt.");
    const receiptHash = asHex((receipt as Record<string, unknown>).transactionHash, "receipt transaction hash").toLowerCase();
    if (!transactionHashes.has(receiptHash) || receiptHashes.has(receiptHash)) throw new Error("Block receipts do not correspond one-to-one with enumerated block transactions.");
    receiptHashes.add(receiptHash);
    for (const value of (receipt as { logs: unknown[] }).logs) {
      const log = parseRawLog(value);
      if (log.blockNumber !== blockNumber || log.blockHash.toLowerCase() !== blockHash.toLowerCase() || log.transactionHash.toLowerCase() !== receiptHash) throw new Error("Receipt log is not bound to its enumerated block and transaction.");
      if (getAddress(log.address) !== getAddress(token) || log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC.toLowerCase()) continue;
      if (log.topics[1]?.toLowerCase() === subjectTopic || log.topics[2]?.toLowerCase() === subjectTopic) relevant.push(log);
    }
  }
  if (receiptHashes.size !== transactionHashes.size) throw new Error("Block receipt count does not match full block transaction enumeration.");
  return relevant;
}
async function receiptEvidenceForDiscoveredEvent(provider: Provider, event: TransferEvidence): Promise<TransferEvidence | null> {
  const value = await rpc(provider, "eth_getTransactionReceipt", [event.transactionHash]);
  if (!value || typeof value !== "object" || !Array.isArray((value as Record<string, unknown>).logs)) return null;
  const receipt = value as Record<string, unknown>;
  if (asHex(receipt.transactionHash, "receipt transactionHash").toLowerCase() !== event.transactionHash.toLowerCase()) throw new Error("Transaction receipt hash differs from discovered event.");
  const candidates = (receipt.logs as unknown[]).map(parseRawLog).filter((log) => log.logIndex === event.logIndex);
  if (candidates.length !== 1) return null;
  return decodeTransfer(candidates[0]);
}
function sha256Bytecode(bytecode: Hex): string { return createHash("sha256").update(Buffer.from(bytecode.slice(2), "hex")).digest("hex"); }
function cacheMatches(commitment: Commitment): boolean {
  const cached = { subject: process.env.PHASE6_CACHED_SUBJECT?.trim(), token: process.env.PHASE6_CACHED_TOKEN?.trim(), minimum: process.env.PHASE6_CACHED_MINIMUM?.trim(), start: process.env.PHASE6_CACHED_START_BLOCK?.trim(), end: process.env.PHASE6_CACHED_END_BLOCK?.trim() };
  try { return (!cached.subject || getAddress(cached.subject) === getAddress(commitment[2])) && (!cached.token || getAddress(cached.token) === getAddress(commitment[3])) && (!cached.minimum || BigInt(cached.minimum) === commitment[4]) && (!cached.start || BigInt(cached.start) === commitment[5]) && (!cached.end || BigInt(cached.end) === commitment[6]); } catch { return false; }
}
async function hashObservations(providers: Provider[], blockNumber: bigint): Promise<HashObservation[]> {
  return Promise.all(providers.map(async (provider) => { try { const block = await blockAt(provider, blockNumber); return { provider: provider.id, blockNumber: BigInt(block.number), blockHash: block.hash }; } catch (error) { return { provider: provider.id, blockNumber, error: compactError(error) }; } }));
}

const chainId = BigInt(required("PHASE6_CHAIN_ID"));
const registry = getAddress(required("PHASE6_REGISTRY_ADDRESS"));
const commitmentId = BigInt(required("PHASE6_COMMITMENT_ID"));
const chunkSize = BigInt(process.env.PHASE6_LOG_CHUNK_SIZE?.trim() || "5000");
const receiptScanMaxBlocks = BigInt(process.env.PHASE6_RECEIPT_SCAN_MAX_BLOCKS?.trim() || "1000");
const tokenDecimals = Number(process.env.PHASE6_TOKEN_DECIMALS?.trim() || "18");
const requestedAssuranceLevel: AssuranceLevel = process.env.PHASE6_ASSURANCE_MODE?.trim().toUpperCase() === "EXHAUSTIVE" ? "EXHAUSTIVE" : "CORROBORATED";
const acceptCorroboratedFallback = process.env.PHASE6_ACCEPT_CORROBORATED_FALLBACK?.trim().toLowerCase() === "true";
const verifierMode = process.env.PHASE6_MODE?.trim().toLowerCase() === "development" ? "development" : "competition";
if (verifierMode === "competition" && (chainId.toString() !== COMPETITION_CHAIN_ID || getAddress(registry) !== COMPETITION_REGISTRY)) throw new Error(`Competition mode requires chain ${COMPETITION_CHAIN_ID} and registry ${COMPETITION_REGISTRY}.`);
if (receiptScanMaxBlocks <= 0n) throw new Error("PHASE6_RECEIPT_SCAN_MAX_BLOCKS must be positive.");
const providers = [providerFromEnvironment("A"), providerFromEnvironment("B")].filter(Boolean) as Provider[];
if (providers.length < 2) throw new Error("PHASE6_RPC_A_URL and PHASE6_RPC_B_URL are required for corroboration.");
if (new Set(providers.map(({ id }) => id)).size !== providers.length) throw new Error("Provider names must be distinct.");
if (new Set(providers.map(({ sanitizedUrl }) => sanitizedUrl)).size !== providers.length) throw new Error("Provider endpoints must be distinct.");

const snapshots = await Promise.all(providers.map(async (provider) => {
  try {
    const [reportedChain, latest, finalized] = await Promise.all([rpc(provider, "eth_chainId", []), blockAt(provider, "latest"), blockAt(provider, "finalized")]);
    return { provider, chainId: BigInt(asHex(reportedChain, "chainId")), latest, finalized };
  } catch (error) { return { provider, error: compactError(error) }; }
}));
const finalizedObservations: FinalizedHeadObservation[] = snapshots.map((item) => item.error ? { provider: item.provider.id, error: item.error } : { provider: item.provider.id, blockNumber: BigInt(item.finalized!.number), blockHash: item.finalized!.hash });
const readableSnapshots = snapshots.filter((item) => !item.error && item.chainId !== undefined && item.latest && item.finalized);
if (!readableSnapshots.length) throw new Error("No provider returned readable chain heads.");
const currentBlock = readableSnapshots.map((item) => BigInt(item.latest!.number)).reduce((a, b) => a < b ? a : b);

const providerCommitments = new Map<string, Commitment>();
let registryBound = readableSnapshots.length === providers.length && readableSnapshots.every((item) => item.chainId === chainId);
await Promise.all(readableSnapshots.map(async (item) => { try { const commitment = await readCommitment(item.provider, registry, commitmentId, item.finalized!.hash); providerCommitments.set(item.provider.id, commitment); if (commitment[0] !== commitmentId) registryBound = false; } catch { registryBound = false; } }));
const commitmentValues = [...providerCommitments.values()];
if (commitmentValues.length !== providers.length || commitmentValues.slice(1).some((value) => !sameCommitment(commitmentValues[0], value))) registryBound = false;
const commitment = commitmentValues[0]; if (!commitment) throw new Error("No provider returned readable commitment storage.");
if (!cacheMatches(commitment)) registryBound = false;
const [, creator, subject, token, minimumBalance, startBlock, endBlock] = commitment;
const finality = assessFinalizedHeads(finalizedObservations, endBlock);
const evidenceEnd = currentBlock <= endBlock ? currentBlock : endBlock;
const ranges = evidenceEnd >= startBlock ? deterministicRanges(startBlock, evidenceEnd, chunkSize) : [];
const benchmarkStarted = Date.now();

const startMinusOneHashes = await hashObservations(providers, startBlock - 1n);
const startHashes = await hashObservations(providers, startBlock);
const startingHashAgreement = assessBlockHashAgreement(startMinusOneHashes, startBlock - 1n);
const startHashAgreement = assessBlockHashAgreement(startHashes, startBlock);
const endHashObservations = currentBlock > endBlock ? await hashObservations(providers, endBlock) : [];
const endHashAgreement = currentBlock > endBlock ? assessBlockHashAgreement(endHashObservations, endBlock) : undefined;
const startingBalances = new Map<string, bigint>();
const providerEvidence = new Map<string, TransferEvidence[]>();
const coverageRecords: CoverageRecord[] = [];
const tokenRuntimeCompatibility = new Map<string, boolean>();
for (const provider of providers) {
  const pinnedHash = startMinusOneHashes.find((item) => item.provider === provider.id)?.blockHash;
  const finalizedHash = finalizedObservations.find((item) => item.provider === provider.id)?.blockHash;
  try {
    if (!pinnedHash || !finalizedHash) throw new Error("Pinned block hash unavailable.");
    const [balance, code] = await Promise.all([balanceAtHash(provider, token, subject, pinnedHash), rpc(provider, "eth_getCode", [token, { blockHash: finalizedHash, requireCanonical: true }]).then((value) => asHex(value, "token code"))]);
    startingBalances.set(provider.id, balance);
    tokenRuntimeCompatibility.set(provider.id, getAddress(token) === KNOWN_STEST && sha256Bytecode(code) === KNOWN_STEST_RUNTIME_SHA256);
  } catch { tokenRuntimeCompatibility.set(provider.id, false); }
  const events: TransferEvidence[] = [];
  for (const range of ranges) {
    try { const logs = await logsForRange(provider, token, subject, range.fromBlock, range.toBlock); events.push(...logs.map(decodeTransfer)); coverageRecords.push({ provider: provider.id, ...range, status: "SUCCESS", logCount: logs.length, digest: digestRawLogs(logs) }); }
    catch (error) { coverageRecords.push({ provider: provider.id, ...range, status: "FAILED", logCount: null, digest: null, error: compactError(error) }); }
  }
  providerEvidence.set(provider.id, events);
}
const receiptProviderEvidence = new Map<string, TransferEvidence[]>();
const receiptScanBlocks = evidenceEnd >= startBlock ? evidenceEnd - startBlock + 1n : 0n;
const receiptScanStarted = Date.now();
let receiptEvidenceComplete = requestedAssuranceLevel === "EXHAUSTIVE" && receiptScanBlocks > 0n && receiptScanBlocks <= receiptScanMaxBlocks;
let receiptRpcRequests = 0;
const receiptScanErrors: Array<{ provider: string; blockNumber?: string; error: string }> = [];
if (receiptEvidenceComplete) {
  for (const provider of providers) {
    const events: TransferEvidence[] = [];
    for (let blockNumber = startBlock; blockNumber <= evidenceEnd; blockNumber += 1n) {
      try { receiptRpcRequests += 2; events.push(...(await receiptLogsForBlock(provider, token, subject, blockNumber)).map(decodeTransfer)); }
      catch (error) { receiptEvidenceComplete = false; receiptScanErrors.push({ provider: provider.id, blockNumber: blockNumber.toString(), error: compactError(error) }); break; }
    }
    receiptProviderEvidence.set(provider.id, events);
    if (!receiptEvidenceComplete) break;
  }
} else if (requestedAssuranceLevel === "EXHAUSTIVE") receiptScanErrors.push({ provider: "policy", error: `Exhaustive receipt scan requires ${receiptScanBlocks} blocks, above configured bound ${receiptScanMaxBlocks}.` });
const tokenModelStatus: TokenModelStatus = tokenRuntimeCompatibility.size === providers.length && [...tokenRuntimeCompatibility.values()].every(Boolean) ? "CONVENTIONAL_ERC20_TRANSFER_V1" : getAddress(token) === KNOWN_STEST ? "UNVERIFIED" : "UNSUPPORTED";
const coverage = auditCoverage({ expectedRanges: ranges, records: coverageRecords, providers: providers.map(({ id }) => id) });
const consensus = compareProviderEvidence(providerEvidence);
const discoveredReceiptChecks: DiscoveredReceiptCheck[] = [];
const discoveredReceiptErrors: Array<{ provider: string; transactionHash: string; error: string }> = [];
if (consensus.consensus) for (const event of consensus.evidence) for (const provider of providers) {
  try { discoveredReceiptChecks.push({ provider: provider.id, queried: event, receipt: await receiptEvidenceForDiscoveredEvent(provider, event) }); }
  catch (error) { discoveredReceiptErrors.push({ provider: provider.id, transactionHash: event.transactionHash, error: compactError(error) }); discoveredReceiptChecks.push({ provider: provider.id, queried: event, receipt: null }); }
}
const targetedReceiptAssessment = assessDiscoveredReceiptChecks(consensus.evidence, discoveredReceiptChecks, providers.map(({ id }) => id));
const receiptConsensus = receiptEvidenceComplete ? compareProviderEvidence(receiptProviderEvidence) : { consensus: false, redundancy: "NONE" as const, reason: "Receipt-derived evidence coverage is incomplete.", evidence: [] };
const allChannels = new Map<string, TransferEvidence[]>();
for (const [provider, events] of providerEvidence) allChannels.set(`log-query:${provider}`, events);
for (const [provider, events] of receiptProviderEvidence) allChannels.set(`block-receipts:${provider}`, events);
const channelConsensus = receiptEvidenceComplete ? compareProviderEvidence(allChannels) : { consensus: false, redundancy: "NONE" as const, reason: "Required receipt-derived channel is incomplete.", evidence: [] };
const balanceConsensus = startingBalances.size === providers.length && new Set([...startingBalances.values()].map(String)).size === 1;
const startingBalance = balanceConsensus ? [...startingBalances.values()][0] : undefined;
const endBalances = new Map<string, bigint>();
if (currentBlock > endBlock) for (const provider of providers) {
  const pinnedHash = endHashObservations.find((item) => item.provider === provider.id)?.blockHash;
  try { if (!pinnedHash) throw new Error("End block hash unavailable."); endBalances.set(provider.id, await balanceAtHash(provider, token, subject, pinnedHash)); } catch { /* fails closed below */ }
}
const endBalanceConsensus = currentBlock <= endBlock || (endBalances.size === providers.length && new Set([...endBalances.values()].map(String)).size === 1);
const pinnedEndBalance = currentBlock > endBlock && endBalanceConsensus ? [...endBalances.values()][0] : undefined;
let minimumBlock = startBlock - 1n;
if (startingBalance !== undefined && consensus.consensus && ranges.length) {
  try { minimumBlock = reconstructPath({ subject, startingBalance, startBlock, endBlock: evidenceEnd, events: consensus.evidence }).minimumPoint.blockNumber; } catch { /* evaluation fails closed below */ }
}
const minimumHashAgreement = assessBlockHashAgreement(await hashObservations(providers, minimumBlock), minimumBlock);
const boundaryHashConsensus = startingHashAgreement.agreement && startHashAgreement.agreement && minimumHashAgreement.agreement && (endHashAgreement?.agreement ?? true);
const evidenceComplete = coverage.complete && ranges.length > 0 && balanceConsensus;
const evaluation = evaluateAssuranceCandidate({ requestedAssuranceLevel, acceptCorroboratedFallback, registryBound, logRangeCoverageComplete: evidenceComplete, logProviderAgreement: consensus.consensus, discoveredEventReceiptChecksComplete: targetedReceiptAssessment.complete, exhaustiveReceiptVerificationCompleted: receiptEvidenceComplete, exhaustiveReceiptAgreement: receiptConsensus.consensus && channelConsensus.consensus, boundaryHashConsensus, startingBalanceConsensus: balanceConsensus, endingBalanceConsensus: endBalanceConsensus, tokenModelStatus, finalityStatus: finality.status, currentBlock, startBlock, endBlock, minimumBalance, subject, startingBalance, pinnedEndBalance, events: consensus.consensus ? consensus.evidence : undefined });

const providerList = providers.map(({ id, sanitizedUrl }) => ({ id, endpoint: sanitizedUrl })).sort((a, b) => a.id.localeCompare(b.id));
const orderedEvidence = consensus.evidence.map((event) => ({ blockNumber: event.blockNumber.toString(), blockHash: event.blockHash, transactionHash: event.transactionHash.toLowerCase() as Hex, transactionIndex: event.transactionIndex, logIndex: event.logIndex, emitter: event.address, from: event.from, to: event.to, valueBaseUnits: event.value.toString() }));
const evidenceManifest = {
  schemaVersion: "sicher.phase6.evidence-manifest/2.0", chainId: chainId.toString(), registryAddress: registry, commitmentId: commitmentId.toString(),
  inclusiveInterval: { startBlock: startBlock.toString(), evidenceThroughBlock: evidenceEnd.toString(), endBlock: endBlock.toString() },
  startingBalanceContext: { blockNumber: (startBlock - 1n).toString(), blockHash: startingHashAgreement.blockHash, meaning: "balance immediately before the inclusive proof window" },
  criticalBlockHashes: { startBlockHash: startHashAgreement.blockHash, endBlockHash: endHashAgreement?.blockHash, minimumCausingBlock: minimumBlock.toString(), minimumCausingBlockHash: minimumHashAgreement.blockHash },
  finalizedHeads: [...finalizedObservations].sort((a, b) => a.provider.localeCompare(b.provider)), providers: providerList,
  providerIndependence: "PARTIAL_DISTINCT_OPERATORS_SHARED_UPSTREAM",
  ranges: [...coverageRecords].sort((a, b) => a.provider.localeCompare(b.provider) || (a.fromBlock < b.fromBlock ? -1 : a.fromBlock > b.fromBlock ? 1 : 0)),
  logQueryCoverageComplete: coverage.complete, logQueryConsensus: consensus.consensus,
  requestedAssuranceLevel, achievedAssuranceLevel: evaluation.assuranceLevel,
  discoveredEventReceiptChecks: { ...targetedReceiptAssessment, errors: discoveredReceiptErrors },
  receiptDerivedEvidence: { method: "eth_getBlockReceipts", complete: receiptEvidenceComplete, consensus: receiptConsensus.consensus, crossChannelConsensus: channelConsensus.consensus, blocksRequired: receiptScanBlocks.toString(), configuredMaximumBlocks: receiptScanMaxBlocks.toString(), rpcRequests: receiptRpcRequests, errors: receiptScanErrors },
  boundaryHashConsensus, startingBalanceConsensus: balanceConsensus, endingBalanceConsensus: endBalanceConsensus, pinnedEndBalance: pinnedEndBalance?.toString(),
  warning: "Start/end balance consistency does not prove absence of an omitted temporary breach.", orderedRelevantEvidence: orderedEvidence,
};
const evidenceManifestDigest = sha256Canonical(evidenceManifest);
const verifierSource = readFileSync(new URL(import.meta.url));
const coreSource = Buffer.concat([
  readFileSync(new URL("./phase6-evidence-core.ts", import.meta.url)),
  readFileSync(new URL("./phase6-assurance-core.ts", import.meta.url)),
  readFileSync(new URL("./phase6-evidence-cache.ts", import.meta.url)),
]);
const verifierFingerprint = createHash("sha256").update(verifierSource).digest("hex");
const reconstructionCoreFingerprint = createHash("sha256").update(coreSource).digest("hex");
const terminal = evaluation.proofResult === "PROVEN" || evaluation.proofResult === "NOT_PROVEN";
const receipt = terminal && evaluation.assuranceLevel ? createReceiptV3({
  verifierVersion: VERSION, verifierFingerprint, chainId: chainId.toString(), registryAddress: registry, commitmentId: commitmentId.toString(),
  proofResult: evaluation.proofResult, assuranceLevel: evaluation.assuranceLevel, coreFingerprint: reconstructionCoreFingerprint,
  creator, subject, token, proofType: "MIN_BALANCE", minimumRequiredBaseUnits: minimumBalance.toString(), tokenDecimals,
  startBlock: startBlock.toString(), startBlockHash: startHashAgreement.blockHash!, endBlock: endBlock.toString(), endBlockHash: endHashAgreement!.blockHash!,
  startingBalanceBaseUnits: startingBalance!.toString(), minimumObservedBaseUnits: evaluation.minimumObserved!.toString(), finalBalanceBaseUnits: evaluation.finalBalance!.toString(),
  minimumCausingEvidence: { blockNumber: evaluation.minimumPoint!.blockNumber.toString(), blockHash: minimumHashAgreement.blockHash!, transactionHash: evaluation.minimumPoint?.transactionHash ?? null, transactionIndex: evaluation.minimumPoint?.transactionIndex ?? null, logIndex: evaluation.minimumPoint?.logIndex ?? null },
  windowStatus: evaluation.windowStatus, breachStatus: evaluation.breachStatus, evidenceStatus: evaluation.evidenceStatus, finalityStatus: evaluation.finalityStatus,
  providers: providerList,
  providerAgreement: { logEvidence: consensus.consensus, discoveredReceiptChecks: targetedReceiptAssessment.complete, exhaustiveReceiptEvidence: requestedAssuranceLevel === "EXHAUSTIVE" ? receiptConsensus.consensus && channelConsensus.consensus : null, startingBalance: balanceConsensus, endingBalance: endBalanceConsensus, criticalBlockHashes: boundaryHashConsensus, finalizedHead: finality.status !== "DISAGREEMENT" },
  logRangeCoverage: { complete: coverage.complete, chunks: ranges.length * providers.length, successfulChunks: coverageRecords.filter((record) => record.status === "SUCCESS").length, fromBlock: startBlock.toString(), toBlock: evidenceEnd.toString(), retries: rpcRetries },
  discoveredEventReceiptChecks: { complete: targetedReceiptAssessment.complete, eventsChecked: targetedReceiptAssessment.eventsChecked, checksPerformed: targetedReceiptAssessment.checksPerformed, digest: targetedReceiptAssessment.digest },
  exhaustiveReceiptVerification: { requested: requestedAssuranceLevel === "EXHAUSTIVE", completed: receiptEvidenceComplete, blocksVerified: receiptEvidenceComplete ? receiptScanBlocks.toString() : "0", totalBlocks: receiptScanBlocks.toString(), progressDigest: null },
  finalizedBlock: finality.agreedBlock!.toString(), finalizedBlockHash: finality.agreedHash!, evidenceManifestDigest,
  limitations: [CORROBORATED_LIMITATION, SHARED_INFRASTRUCTURE_LIMITATION, "Targeted transaction-receipt checks prove discovered events are genuine; they do not prove an undiscovered event was not omitted.", "Start/end balances and sparse checkpoints do not prove absence of an omitted temporary breach.", "This local digest is not a signature or immutable anchor."],
}) : undefined;
const outputPath = process.env.PHASE6_OUTPUT_PATH?.trim();
if (outputPath && receipt) writeFileSync(outputPath, `${JSON.stringify({ evidenceManifest, receipt }, (_, value) => typeof value === "bigint" ? value.toString() : value, 2)}\n`, "utf8");

console.log("SICHER PHASE 6 COMPETITION VERIFIER");
console.log(`CHAIN ID: ${chainId}`); console.log(`REGISTRY: ${registry}`); console.log(`COMMITMENT ID: ${commitmentId}`); console.log(`REGISTRY BINDING: ${registryBound}`);
console.log(`REQUESTED ASSURANCE LEVEL: ${requestedAssuranceLevel}`); console.log(`ACHIEVED ASSURANCE LEVEL: ${evaluation.assuranceLevel ?? "NONE"}`);
console.log(`PROVIDERS: ${providerList.map((item) => `${item.id}=${item.endpoint}`).join(", ")}`);
console.log(`FINALIZED HEAD: ${finality.agreedBlock ?? "unavailable"}`); console.log(`FINALIZED HEAD HASH: ${finality.agreedHash ?? "unavailable"}`);
console.log(`CURRENT BLOCK: ${currentBlock}`); console.log(`WINDOW STATUS: ${evaluation.windowStatus}`); console.log(`BREACH STATUS: ${evaluation.breachStatus}`);
console.log(`EVIDENCE STATUS: ${evaluation.evidenceStatus}`); console.log(`FINALITY STATUS: ${evaluation.finalityStatus}`); console.log(`EVIDENCE CONSENSUS: ${consensus.consensus}`);
console.log(`RECEIPT-DERIVED EVIDENCE COMPLETE: ${receiptEvidenceComplete}`); console.log(`RECEIPT-DERIVED EVIDENCE CONSENSUS: ${receiptConsensus.consensus}`); console.log(`CROSS-CHANNEL CONSENSUS: ${channelConsensus.consensus}`);
console.log(`DISCOVERED EVENT RECEIPT CHECKS: ${targetedReceiptAssessment.complete} (${targetedReceiptAssessment.checksPerformed} checks)`);
console.log(`RECEIPT SCAN: blocks=${receiptScanBlocks} requests=${receiptRpcRequests} elapsedMs=${Date.now() - receiptScanStarted}`);
console.log(`BLOCK HASH PINNING: ${boundaryHashConsensus}`); console.log(`STARTING BALANCE BLOCK: ${startBlock - 1n}`); console.log(`STARTING BALANCE CONSENSUS: ${balanceConsensus}`);
console.log(`END BALANCE CONSENSUS: ${endBalanceConsensus}`); console.log(`PINNED END BALANCE: ${pinnedEndBalance ?? "not applicable or unavailable"}`);
console.log(`PATH: ${evaluation.path.join(" -> ") || "unavailable"}`); console.log(`MINIMUM OBSERVED: ${evaluation.minimumObserved ?? "unavailable"}`);
console.log(`PROOF RESULT: ${evaluation.proofResult}`); console.log(`REASON: ${evaluation.reason}`); console.log(`EVIDENCE MANIFEST DIGEST: ${evidenceManifestDigest}`);
console.log(`CORROBORATED BENCHMARK: requests=${rpcRequests} retries=${rpcRetries} chunks=${ranges.length * providers.length} evidence=${consensus.evidence.length} elapsedMs=${Date.now() - benchmarkStarted}`);
console.log(`RECEIPT DIGEST: ${receipt?.receiptDigest ?? "not generated"}`); console.log(`OUTPUT: ${outputPath && receipt ? outputPath : "not written"}`);
if (evaluation.proofResult === "INDETERMINATE") process.exitCode = 3;
