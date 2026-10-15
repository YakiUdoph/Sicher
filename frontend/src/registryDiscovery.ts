import { decodeFunctionResult, encodeFunctionData, getAddress } from "viem";

import {
  ELYSIUM_CHAIN_ID,
  ELYSIUM_RPC_URL,
  REGISTRY_ADDRESS,
} from "./chainConfig.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_DISCOVERY_COMMITMENTS = 10_000n;
const DEFAULT_CONCURRENCY = 4;

const REGISTRY_READ_ABI = [
  {
    type: "function",
    name: "nextCommitmentId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "commitments",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "id", type: "uint256" },
      { name: "creator", type: "address" },
      { name: "subject", type: "address" },
      { name: "token", type: "address" },
      { name: "minimumBalance", type: "uint256" },
      { name: "startBlock", type: "uint256" },
      { name: "endBlock", type: "uint256" },
    ],
  },
] as const;

export type RegistryCommitment = Readonly<{
  id: string;
  creator: `0x${string}`;
  subject: `0x${string}`;
  token: `0x${string}`;
  minimumBalanceBaseUnits: string;
  startBlock: string;
  endBlock: string;
}>;

export type RegistrySnapshot = Readonly<{
  chainId: number;
  head: bigint;
  upperBound: bigint;
  commitments: readonly RegistryCommitment[];
}>;

export type RegistryDiscoveryErrorCode =
  | "UNAVAILABLE"
  | "WRONG_CHAIN"
  | "MALFORMED"
  | "LIMIT_EXCEEDED";

export class RegistryDiscoveryError extends Error {
  readonly code: RegistryDiscoveryErrorCode;

  constructor(code: RegistryDiscoveryErrorCode, message: string) {
    super(message);
    this.name = "RegistryDiscoveryError";
    this.code = code;
  }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type DiscoveryOptions = Readonly<{
  fetchImpl?: FetchLike;
  rpcUrl?: string;
  concurrency?: number;
}>;

let rpcRequestId = 0;

async function rpc(fetchImpl: FetchLike, rpcUrl: string, method: string, params: readonly unknown[]): Promise<unknown> {
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcRequestId, method, params }),
      signal: controller.signal,
    });
  } catch {
    throw new RegistryDiscoveryError("UNAVAILABLE", "The live Elysium registry could not be reached.");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new RegistryDiscoveryError("UNAVAILABLE", `Registry RPC returned HTTP ${response.status}.`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new RegistryDiscoveryError("MALFORMED", "Registry RPC returned malformed JSON.");
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new RegistryDiscoveryError("MALFORMED", "Registry RPC returned an invalid response.");
  }
  const envelope = payload as Record<string, unknown>;
  if (envelope.error !== undefined || !("result" in envelope)) {
    throw new RegistryDiscoveryError("UNAVAILABLE", `Registry RPC could not complete ${method}.`);
  }
  return envelope.result;
}

function parseQuantity(value: unknown, field: string): bigint {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) {
    throw new RegistryDiscoveryError("MALFORMED", `${field} is not a canonical RPC quantity.`);
  }
  return BigInt(value);
}

function asHex(value: unknown, field: string): `0x${string}` {
  if (typeof value !== "string" || !/^0x[0-9a-f]*$/i.test(value)) {
    throw new RegistryDiscoveryError("MALFORMED", `${field} is not hexadecimal data.`);
  }
  return value as `0x${string}`;
}

async function ethCall(fetchImpl: FetchLike, rpcUrl: string, data: `0x${string}`): Promise<`0x${string}`> {
  return asHex(await rpc(fetchImpl, rpcUrl, "eth_call", [{ to: REGISTRY_ADDRESS, data }, "latest"]), "eth_call result");
}

function validateRecord(requestedId: bigint, decoded: readonly unknown[]): RegistryCommitment {
  const [id, creatorValue, subjectValue, tokenValue, minimumBalance, startBlock, endBlock] = decoded;
  if (id !== requestedId || typeof minimumBalance !== "bigint" || typeof startBlock !== "bigint" || typeof endBlock !== "bigint") {
    throw new RegistryDiscoveryError("MALFORMED", `Registry commitment #${requestedId} did not match its requested ID or numeric schema.`);
  }
  let creator: `0x${string}`;
  let subject: `0x${string}`;
  let token: `0x${string}`;
  try {
    creator = getAddress(String(creatorValue));
    subject = getAddress(String(subjectValue));
    token = getAddress(String(tokenValue));
  } catch {
    throw new RegistryDiscoveryError("MALFORMED", `Registry commitment #${requestedId} contains an invalid address.`);
  }
  if ([creator, subject, token].some((value) => value.toLowerCase() === ZERO_ADDRESS)) {
    throw new RegistryDiscoveryError("MALFORMED", `Registry commitment #${requestedId} contains a zero address.`);
  }
  if (minimumBalance <= 0n || endBlock <= startBlock) {
    throw new RegistryDiscoveryError("MALFORMED", `Registry commitment #${requestedId} contains invalid immutable terms.`);
  }
  return Object.freeze({
    id: id.toString(), creator, subject, token,
    minimumBalanceBaseUnits: minimumBalance.toString(),
    startBlock: startBlock.toString(), endBlock: endBlock.toString(),
  });
}

async function readCommitment(fetchImpl: FetchLike, rpcUrl: string, id: bigint): Promise<RegistryCommitment> {
  const data = encodeFunctionData({ abi: REGISTRY_READ_ABI, functionName: "commitments", args: [id] });
  const result = await ethCall(fetchImpl, rpcUrl, data);
  let decoded: readonly unknown[];
  try {
    decoded = decodeFunctionResult({ abi: REGISTRY_READ_ABI, functionName: "commitments", data: result }) as readonly unknown[];
  } catch {
    throw new RegistryDiscoveryError("MALFORMED", `Registry commitment #${id} could not be decoded.`);
  }
  return validateRecord(id, decoded);
}

export async function discoverRegistryCommitments(options: DiscoveryOptions = {}): Promise<RegistrySnapshot> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const rpcUrl = options.rpcUrl ?? ELYSIUM_RPC_URL;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new RegistryDiscoveryError("MALFORMED", "Registry discovery concurrency is invalid.");
  }

  const chainId = Number(parseQuantity(await rpc(fetchImpl, rpcUrl, "eth_chainId", []), "chain ID"));
  if (chainId !== ELYSIUM_CHAIN_ID) {
    throw new RegistryDiscoveryError("WRONG_CHAIN", `Expected chain ${ELYSIUM_CHAIN_ID}, received ${chainId}.`);
  }
  const head = parseQuantity(await rpc(fetchImpl, rpcUrl, "eth_blockNumber", []), "chain head");
  const nextData = encodeFunctionData({ abi: REGISTRY_READ_ABI, functionName: "nextCommitmentId" });
  const nextResult = await ethCall(fetchImpl, rpcUrl, nextData);
  let nextCommitmentId: bigint;
  try {
    nextCommitmentId = decodeFunctionResult({ abi: REGISTRY_READ_ABI, functionName: "nextCommitmentId", data: nextResult });
  } catch {
    throw new RegistryDiscoveryError("MALFORMED", "nextCommitmentId could not be decoded.");
  }
  if (nextCommitmentId < 1n) throw new RegistryDiscoveryError("MALFORMED", "nextCommitmentId is invalid.");
  const upperBound = nextCommitmentId - 1n;
  if (upperBound > MAX_DISCOVERY_COMMITMENTS) {
    throw new RegistryDiscoveryError("LIMIT_EXCEEDED", "The registry is larger than the safe browser discovery limit.");
  }

  const commitments = new Array<RegistryCommitment>(Number(upperBound));
  let cursor = 1n;
  async function worker(): Promise<void> {
    while (cursor <= upperBound) {
      const id = cursor++;
      commitments[Number(id - 1n)] = await readCommitment(fetchImpl, rpcUrl, id);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, commitments.length) }, () => worker()));
  return Object.freeze({ chainId, head, upperBound, commitments: Object.freeze(commitments) });
}

