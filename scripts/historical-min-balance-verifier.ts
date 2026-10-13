import { readFileSync } from "node:fs";
import {
  createPublicClient,
  decodeEventLog,
  defineChain,
  formatUnits,
  getAddress,
  http,
  padHex,
  toEventSelector,
  toHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import {
  inclusiveChunks,
  reconstructMinimum,
  validateMinBalanceInputs,
  type TransferEvidence,
} from "./min-balance-core.ts";
import { rpcWithRetry, type RpcAttemptRecord } from "./rpc-retry.ts";

const EXPECTED_CHAIN_ID = 99801;
const TRANSFER_TOPIC = toEventSelector("Transfer(address,address,uint256)");
const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();
const token = process.env.TOKEN_ADDRESS?.trim() as Address | undefined;
const subject = process.env.SUBJECT_ADDRESS?.trim() as Address | undefined;
const startBlockText = process.env.START_BLOCK?.trim();
const endBlockText = process.env.END_BLOCK?.trim();
const minimumText = process.env.MINIMUM_BALANCE?.trim();
const chunkSizeText = process.env.LOG_CHUNK_SIZE?.trim() ?? "2000";

if (!rpcUrl || !token || !subject || !startBlockText || !endBlockText || !minimumText) {
  console.error("Required: ELYSIUM_RPC_URL, TOKEN_ADDRESS, SUBJECT_ADDRESS, START_BLOCK, END_BLOCK, MINIMUM_BALANCE.");
  process.exit(1);
}
const tokenAddress = getAddress(token);
const subjectAddress = getAddress(subject);

let startBlock: bigint;
let endBlock: bigint;
let minimumBalance: bigint;
let chunkSize: bigint;
try {
  startBlock = BigInt(startBlockText);
  endBlock = BigInt(endBlockText);
  minimumBalance = BigInt(minimumText);
  chunkSize = BigInt(chunkSizeText);
  validateMinBalanceInputs({ token, subject, startBlock, endBlock, minimumBalance });
  if (chunkSize <= 0n) throw new Error("LOG_CHUNK_SIZE must be greater than zero.");
} catch (error) {
  console.error(`Input error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const tokenArtifact = JSON.parse(readFileSync("artifacts/SicherTestToken.json", "utf8")) as { abi: Abi };
const chain = defineChain({
  id: EXPECTED_CHAIN_ID,
  name: "Kinetiq Elysium Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  testnet: true,
});
const client = createPublicClient({ chain, transport: http(rpcUrl, { retryCount: 0, timeout: 12_000 }) });
const records: RpcAttemptRecord[] = [];

type RawLog = {
  address: Address;
  blockNumber: Hex | null;
  transactionHash: Hex | null;
  transactionIndex: Hex | null;
  logIndex: Hex | null;
  data: Hex;
  topics: [Hex, ...Hex[]];
};
const rawRequestClient = client as unknown as {
  request(args: { method: "eth_getLogs"; params: [{ address: Address; fromBlock: Hex; toBlock: Hex; topics: Array<Hex | null> }] }): Promise<RawLog[]>;
};

function addressTopic(address: Address): Hex {
  return padHex(getAddress(address), { size: 32 });
}

async function queryDirection(
  direction: "outgoing" | "incoming",
  fromBlock: bigint,
  toBlock: bigint,
) {
  const topics = direction === "outgoing"
    ? [TRANSFER_TOPIC, addressTopic(subjectAddress)]
    : [TRANSFER_TOPIC, null, addressTopic(subjectAddress)];
  return rpcWithRetry(
    `eth_getLogs ${direction} ${fromBlock}-${toBlock}`,
    () => rawRequestClient.request({ method: "eth_getLogs", params: [{ address: tokenAddress, fromBlock: toHex(fromBlock), toBlock: toHex(toBlock), topics }] }),
    records,
  );
}

function decodeRawLog(log: RawLog): TransferEvidence {
  if (log.blockNumber === null || log.transactionHash === null || log.transactionIndex === null || log.logIndex === null) {
    throw new Error("A relevant Transfer log is missing ordering or transaction identity fields.");
  }
  const decoded = decodeEventLog({ abi: tokenArtifact.abi, eventName: "Transfer", data: log.data, topics: log.topics, strict: true });
  const args = decoded.args as unknown as { from: Address; to: Address; value: bigint };
  return {
    from: getAddress(args.from),
    to: getAddress(args.to),
    value: args.value,
    blockNumber: BigInt(log.blockNumber),
    transactionIndex: Number(BigInt(log.transactionIndex)),
    logIndex: Number(BigInt(log.logIndex)),
    transactionHash: log.transactionHash,
  };
}

const chainResult = await rpcWithRetry("eth_chainId", () => client.getChainId(), records);
if (chainResult.kind !== "success" || chainResult.value !== EXPECTED_CHAIN_ID) {
  console.log("SICHER MIN_BALANCE HISTORICAL VERIFIER");
  console.log(`VERDICT: ${chainResult.kind === "unavailable" ? "INDETERMINATE" : "FAIL"}`);
  console.log(`REASON: ${chainResult.kind === "success" ? `Wrong chain ${chainResult.value}` : chainResult.error}`);
  process.exit(1);
}

const [startingResult, currentBlockResult] = await Promise.all([
  rpcWithRetry(
    `eth_call balanceOf at block ${startBlock - 1n}`,
    () => client.readContract({ address: tokenAddress, abi: tokenArtifact.abi, functionName: "balanceOf", args: [subjectAddress], blockNumber: startBlock - 1n }) as Promise<bigint>,
    records,
  ),
  rpcWithRetry("eth_blockNumber", () => client.getBlockNumber(), records),
]);

const events: TransferEvidence[] = [];
let logsComplete = true;
let evidenceError: string | undefined;
const evidenceEndBlock = currentBlockResult.kind === "success" && currentBlockResult.value < endBlock
  ? currentBlockResult.value
  : endBlock;
for (const [fromBlock, toBlock] of inclusiveChunks(startBlock, evidenceEndBlock, chunkSize)) {
  for (const direction of ["outgoing", "incoming"] as const) {
    const result = await queryDirection(direction, fromBlock, toBlock);
    if (result.kind !== "success") {
      logsComplete = false;
      evidenceError = `${direction} log range ${fromBlock}-${toBlock}: ${result.error}`;
      continue;
    }
    try {
      events.push(...result.value.map(decodeRawLog));
    } catch (error) {
      logsComplete = false;
      evidenceError = error instanceof Error ? error.message : String(error);
    }
  }
}

const evidenceComplete = startingResult.kind === "success" && currentBlockResult.kind === "success" && logsComplete;
const result = reconstructMinimum({
  subject: subjectAddress, startBlock, endBlock,
  currentBlock: currentBlockResult.kind === "success" ? currentBlockResult.value : 0n,
  minimumBalance,
  startingBalance: startingResult.kind === "success" ? startingResult.value : undefined,
  events: logsComplete ? events : undefined,
  evidenceComplete,
  evidenceError: evidenceError ?? (startingResult.kind !== "success" ? startingResult.error : currentBlockResult.kind !== "success" ? currentBlockResult.error : undefined),
});

console.log("SICHER MIN_BALANCE HISTORICAL VERIFIER");
console.log(`CHAIN ID: ${chainResult.value}`);
console.log(`TOKEN: ${tokenAddress}`);
console.log(`SUBJECT: ${subjectAddress}`);
console.log(`WINDOW: ${startBlock} <= block <= ${endBlock}`);
console.log(`CURRENT BLOCK: ${currentBlockResult.kind === "success" ? currentBlockResult.value : "unavailable"}`);
console.log(`REQUIRED MINIMUM: ${formatUnits(minimumBalance, 18)} STEST (${minimumBalance})`);
console.log(`STARTING BALANCE AT BLOCK ${startBlock - 1n}: ${result.startingBalance === undefined ? "unavailable" : `${formatUnits(result.startingBalance, 18)} STEST (${result.startingBalance})`}`);
console.log(`RELEVANT TRANSFERS: ${result.orderedEvents.length}`);
for (const event of result.orderedEvents) {
  console.log(`TRANSFER: block=${event.blockNumber} txIndex=${event.transactionIndex} logIndex=${event.logIndex} tx=${event.transactionHash} from=${event.from} to=${event.to} value=${event.value}`);
}
console.log(`MINIMUM OBSERVED: ${result.minimum ? `${formatUnits(result.minimum.balance, 18)} STEST (${result.minimum.balance})` : "unavailable"}`);
console.log(`MINIMUM BLOCK: ${result.minimum?.blockNumber ?? "unavailable"}`);
console.log(`MINIMUM-CAUSING TX: ${result.minimum?.transactionHash ?? "starting balance"}`);
console.log(`MINIMUM LOG INDEX: ${result.minimum?.logIndex ?? "not applicable"}`);
console.log(`FINAL RECONSTRUCTED BALANCE: ${result.finalBalance === undefined ? "unavailable" : `${formatUnits(result.finalBalance, 18)} STEST (${result.finalBalance})`}`);
console.log(`VERDICT: ${result.verdict}`);
console.log(`REASON: ${result.reason}`);
console.log("RPC ATTEMPTS:");
for (const record of records) console.log(`${record.method}: ${record.attempts} attempt(s), ${record.outcome}${record.error ? ` — ${record.error}` : ""}`);
if (result.verdict === "FAIL") process.exitCode = 2;
if (result.verdict === "INDETERMINATE") process.exitCode = 3;
if (result.verdict === "ACTIVE") process.exitCode = 4;
