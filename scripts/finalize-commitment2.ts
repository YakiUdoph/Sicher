import "dotenv/config";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
  parseAbiItem,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { reconstructMinimum, type TransferEvidence } from "./min-balance-core.ts";

const VERIFIER_VERSION = "sicher-phase5-commitment2-finalizer/1.0.0";
const CHAIN_ID = 99801;
const REGISTRY = getAddress("0x4e4887e28a8370678A9a37C08A85c65450b510c0");
const COMMITMENT_ID = 2n;
const CREATOR = getAddress("0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086");
const SUBJECT = CREATOR;
const TOKEN = getAddress("0x14fc373Dce148766a3B8d9C2BF5f02F8dbe316a7");
const HELPER = getAddress("0x266bcaac497BaE5450B7aD3721376B3081DEc63c");
const MINIMUM = 80_000n * 10n ** 18n;
const START_BLOCK = 8_220_689n;
const END_BLOCK = 8_520_689n;
const STARTING_BALANCE = 100_000n * 10n ** 18n;
const EXPECTED_MINIMUM = 15_000n * 10n ** 18n;
const EXPECTED_FINAL = 100_000n * 10n ** 18n;
const MANIFEST_PATH = "evidence/phase5-commitment2-finalization-candidate.json";
const JSON_RECEIPT_PATH = "evidence/phase5-commitment2-final-receipt.json";
const TEXT_RECEIPT_PATH = "evidence/phase5-commitment2-final-receipt.txt";
const ARCHIVE_RPC = process.env.PHASE5_ARCHIVE_RPC_URL?.trim() || "https://elysium-testnet-rpc.hypedexer.com";

const expectedEvidence = [
  { transactionHash: "0x671a9b056418de973f981c521299bec4e69d946fc9d0b2f515f8dfd58e338b85" as Hex, blockNumber: 8_419_292n, transactionIndex: 2, logIndex: 0, from: SUBJECT, to: HELPER, value: 8_000n * 10n ** 18n },
  { transactionHash: "0x2ad4aa32c27551c0dbe1795e94dd1b49bb1caf01b9e67e978a8c16912a2ef148" as Hex, blockNumber: 8_425_736n, transactionIndex: 1, logIndex: 0, from: SUBJECT, to: HELPER, value: 77_000n * 10n ** 18n },
  { transactionHash: "0x55db69e114e157a891ed361be741eefd41c1eb139f1d56d58908d4f2dc4404f0" as Hex, blockNumber: 8_433_798n, transactionIndex: 1, logIndex: 0, from: HELPER, to: SUBJECT, value: 85_000n * 10n ** 18n },
] as const;

type FrozenManifest = {
  verifierVersion: string;
  historicalVerifier: { path: string; sha256: string };
  reconstructionCore: { path: string; sha256: string };
  finalizer: { path: string; sha256: string };
};

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const fail = (message: string): never => { throw new Error(`FAIL CLOSED: ${message}`); };
const sameAddress = (left: string, right: string) => getAddress(left) === getAddress(right);
const stringify = (value: unknown) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2);

if (!existsSync(MANIFEST_PATH)) fail(`Frozen candidate manifest is missing: ${MANIFEST_PATH}`);
const frozen = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as FrozenManifest;
if (frozen.verifierVersion !== VERIFIER_VERSION) fail("Frozen verifier version differs from this finalizer.");
for (const item of [frozen.historicalVerifier, frozen.reconstructionCore, frozen.finalizer]) {
  if (!existsSync(item.path) || sha256(item.path) !== item.sha256) fail(`Frozen fingerprint mismatch: ${item.path}`);
}

const registryAbi = JSON.parse(readFileSync("artifacts/SicherCommitmentProof.json", "utf8")) as { abi: Abi };
const tokenAbi = JSON.parse(readFileSync("artifacts/SicherTestToken.json", "utf8")) as { abi: Abi };
const chain = defineChain({ id: CHAIN_ID, name: "Kinetiq Elysium Testnet", nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: { default: { http: [ARCHIVE_RPC] } }, testnet: true });
const client = createPublicClient({ chain, transport: http(ARCHIVE_RPC, { retryCount: 5, retryDelay: 1_000, timeout: 60_000 }) });

const [chainId, currentBlock] = await Promise.all([client.getChainId(), client.getBlockNumber()]);
if (chainId !== CHAIN_ID) fail(`Wrong chain ID ${chainId}; expected ${CHAIN_ID}.`);
const evidenceEnd = currentBlock < END_BLOCK ? currentBlock : END_BLOCK;
if (evidenceEnd < START_BLOCK) fail("Current block precedes the commitment start.");

const [commitment, startingBalance, transferLogs] = await Promise.all([
  client.readContract({ address: REGISTRY, abi: registryAbi.abi, functionName: "commitments", args: [COMMITMENT_ID], blockNumber: currentBlock }) as Promise<readonly [bigint, Address, Address, Address, bigint, bigint, bigint]>,
  client.readContract({ address: TOKEN, abi: tokenAbi.abi, functionName: "balanceOf", args: [SUBJECT], blockNumber: START_BLOCK - 1n }) as Promise<bigint>,
  client.getLogs({ address: TOKEN, event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"), fromBlock: START_BLOCK, toBlock: evidenceEnd }),
]);

const [id, creator, subject, token, minimumBalance, startBlock, endBlock] = commitment;
if (id !== COMMITMENT_ID || !sameAddress(creator, CREATOR) || !sameAddress(subject, SUBJECT) || !sameAddress(token, TOKEN) || minimumBalance !== MINIMUM || startBlock !== START_BLOCK || endBlock !== END_BLOCK) fail("Commitment #2 storage differs from frozen immutable terms.");
if (startingBalance !== STARTING_BALANCE) fail(`Starting balance is ${startingBalance}, expected ${STARTING_BALANCE}.`);

const relevant: TransferEvidence[] = transferLogs
  .filter((log) => [log.args.from, log.args.to].some((address) => sameAddress(String(address), SUBJECT) || sameAddress(String(address), HELPER)))
  .map((log) => {
    const { from, to, value } = log.args;
    if (log.blockNumber === null || log.transactionHash === null || log.transactionIndex === null || log.logIndex === null || from === undefined || to === undefined || value === undefined) fail("Relevant log is missing identity, ordering, or value fields.");
    return { from: getAddress(from as Address), to: getAddress(to as Address), value: value as bigint, blockNumber: log.blockNumber, transactionIndex: log.transactionIndex, logIndex: log.logIndex, transactionHash: log.transactionHash };
  });

const result = reconstructMinimum({ subject: SUBJECT, startBlock: START_BLOCK, endBlock: END_BLOCK, currentBlock, minimumBalance: MINIMUM, startingBalance, events: relevant, evidenceComplete: true });
if (result.minimum === undefined || result.finalBalance === undefined) fail("Reconstruction did not produce a minimum and final balance.");
const minimumPoint = result.minimum!;
const finalBalance = result.finalBalance!;
if (result.orderedEvents.length !== expectedEvidence.length) fail(`Found ${result.orderedEvents.length} relevant transfers; expected exactly ${expectedEvidence.length}.`);
for (let index = 0; index < expectedEvidence.length; index += 1) {
  const actual = result.orderedEvents[index];
  const expected = expectedEvidence[index];
  if (actual.transactionHash.toLowerCase() !== expected.transactionHash || actual.blockNumber !== expected.blockNumber || actual.transactionIndex !== expected.transactionIndex || actual.logIndex !== expected.logIndex || !sameAddress(actual.from, expected.from) || !sameAddress(actual.to, expected.to) || actual.value !== expected.value) fail(`Relevant transfer ${index + 1} differs from frozen evidence.`);
}
if (result.startingBalance !== STARTING_BALANCE || finalBalance !== EXPECTED_FINAL || minimumPoint.balance !== EXPECTED_MINIMUM || minimumPoint.blockNumber !== expectedEvidence[1].blockNumber || minimumPoint.transactionHash?.toLowerCase() !== expectedEvidence[1].transactionHash || minimumPoint.logIndex !== expectedEvidence[1].logIndex) fail("Reconstructed path, final balance, or minimum-causing evidence differs from the frozen experiment.");
const reconstructedPath = result.balances.map((point) => point.balance);
const expectedPath = [100_000n, 92_000n, 15_000n, 100_000n].map((value) => value * 10n ** 18n);
if (reconstructedPath.length !== expectedPath.length || reconstructedPath.some((value, index) => value !== expectedPath[index])) fail("Reconstructed balance path is not exactly 100,000 -> 92,000 -> 15,000 -> 100,000 STEST.");

const active = currentBlock < END_BLOCK;
const blocksRemaining = active ? END_BLOCK - currentBlock : 0n;
const breachEstablished = minimumPoint.balance < MINIMUM;
console.log("SICHER PHASE 5 — COMMITMENT #2 FINALIZATION GATE");
console.log(`CURRENT BLOCK: ${currentBlock}`);
console.log(`START BLOCK: ${START_BLOCK}`);
console.log(`END BLOCK: ${END_BLOCK}`);
console.log(`WINDOW STATUS: ${active ? "ACTIVE" : "COMPLETE"}`);
console.log(`BLOCKS REMAINING: ${blocksRemaining}`);
console.log("VERIFIED PATH: 100,000 -> 92,000 -> 15,000 -> 100,000 STEST");
console.log(`BREACH ALREADY ESTABLISHED: ${breachEstablished ? "YES" : "NO"}`);

if (active) {
  console.log("FINALIZATION READY: NO");
  console.log("FINAL RECEIPT GENERATED: NO");
  process.exit(0);
}

if (result.verdict !== "FAIL" || !breachEstablished) fail(`Complete-window verifier returned ${result.verdict}; expected established failure.`);
const orderedEvidence = result.orderedEvents.map((event) => ({ blockNumber: event.blockNumber.toString(), transactionIndex: event.transactionIndex, logIndex: event.logIndex, transactionHash: event.transactionHash, from: event.from, to: event.to, amount: event.value.toString() }));
const receipt = {
  schema: "sicher.min-balance.receipt/1.0",
  verifier: { version: VERIFIER_VERSION, finalizerSha256: frozen.finalizer.sha256, historicalVerifierSha256: frozen.historicalVerifier.sha256, reconstructionCoreSha256: frozen.reconstructionCore.sha256 },
  chainId: CHAIN_ID,
  registry: REGISTRY,
  commitmentId: COMMITMENT_ID.toString(),
  creator: CREATOR,
  subject: SUBJECT,
  token: TOKEN,
  proofType: "MIN_BALANCE",
  minimumRequired: MINIMUM.toString(),
  startBlock: START_BLOCK.toString(),
  endBlock: END_BLOCK.toString(),
  verificationBlock: currentBlock.toString(),
  startingBalance: STARTING_BALANCE.toString(),
  minimumObserved: minimumPoint.balance.toString(),
  minimumCausingBlock: minimumPoint.blockNumber?.toString(),
  minimumCausingTransactionHash: minimumPoint.transactionHash,
  minimumCausingTransactionIndex: expectedEvidence[1].transactionIndex,
  minimumCausingLogIndex: minimumPoint.logIndex,
  finalReconstructedBalance: finalBalance.toString(),
  finalVerdict: "NOT_PROVEN",
  reason: "A complete immutable-window history contains a verified subject balance of 15,000 STEST, below the required 80,000 STEST minimum; later restoration does not erase the historical breach.",
  relevantOrderedEvidence: orderedEvidence,
  evidenceCompleteness: { status: "COMPLETE", interval: `${START_BLOCK}-${END_BLOCK}`, unexplainedRelevantTransfers: 0 },
} as const;
const human = [
  "SICHER COMMITMENT #2 FINAL RECEIPT",
  `Schema: ${receipt.schema}`,
  `Verifier: ${VERIFIER_VERSION}`,
  `Chain ID: ${CHAIN_ID}`,
  `Registry: ${REGISTRY}`,
  `Commitment ID: ${COMMITMENT_ID}`,
  `Subject: ${SUBJECT}`,
  `Token: ${TOKEN}`,
  `Proof type: MIN_BALANCE`,
  `Window: ${START_BLOCK} <= block <= ${END_BLOCK}`,
  `Starting balance: ${STARTING_BALANCE}`,
  `Required minimum: ${MINIMUM}`,
  `Minimum observed: ${minimumPoint.balance}`,
  `Minimum-causing block: ${minimumPoint.blockNumber}`,
  `Minimum-causing transaction: ${minimumPoint.transactionHash}`,
  `Minimum-causing transactionIndex: ${expectedEvidence[1].transactionIndex}`,
  `Minimum-causing logIndex: ${minimumPoint.logIndex}`,
  `Final reconstructed balance: ${finalBalance}`,
  "Evidence completeness: COMPLETE",
  "Final verdict: NOT_PROVEN",
  `Reason: ${receipt.reason}`,
  "Relevant ordered evidence:",
  ...orderedEvidence.map((event, index) => `${index + 1}. block=${event.blockNumber} txIndex=${event.transactionIndex} logIndex=${event.logIndex} tx=${event.transactionHash} from=${event.from} to=${event.to} amount=${event.amount}`),
  "",
].join("\n");
writeFileSync(JSON_RECEIPT_PATH, `${stringify(receipt)}\n`, "utf8");
writeFileSync(TEXT_RECEIPT_PATH, human, "utf8");
console.log("FINALIZATION READY: YES");
console.log("FINAL VERDICT: NOT_PROVEN");
console.log("FINAL RECEIPT GENERATED: YES");
console.log(`MACHINE RECEIPT: ${JSON_RECEIPT_PATH}`);
console.log(`HUMAN RECEIPT: ${TEXT_RECEIPT_PATH}`);
