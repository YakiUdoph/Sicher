import { getAddress, isAddress, type Address, type Hex } from "viem";

export type TransferEvidence = {
  from: Address;
  to: Address;
  value: bigint;
  blockNumber: bigint;
  transactionIndex: number;
  logIndex: number;
  transactionHash: Hex;
};

export type BalancePoint = {
  balance: bigint;
  blockNumber: bigint | null;
  transactionHash: Hex | null;
  logIndex: number | null;
};

export type MinBalanceResult = {
  verdict: "PASS" | "FAIL" | "INDETERMINATE" | "ACTIVE";
  reason: string;
  orderedEvents: TransferEvidence[];
  balances: BalancePoint[];
  startingBalance?: bigint;
  finalBalance?: bigint;
  minimum?: BalancePoint;
};

export function validateMinBalanceInputs(input: {
  token: string;
  subject: string;
  startBlock: bigint;
  endBlock: bigint;
  minimumBalance: bigint;
}): void {
  if (!isAddress(input.token) || getAddress(input.token) === getAddress("0x0000000000000000000000000000000000000000")) {
    throw new Error("Invalid token address.");
  }
  if (!isAddress(input.subject) || getAddress(input.subject) === getAddress("0x0000000000000000000000000000000000000000")) {
    throw new Error("Invalid subject address.");
  }
  if (input.startBlock > input.endBlock) throw new Error("startBlock must not exceed endBlock.");
  if (input.startBlock === 0n) throw new Error("startBlock must be greater than zero for startBlock - 1 evidence.");
  if (input.minimumBalance <= 0n) throw new Error("minimumBalance must be greater than zero.");
}

export function inclusiveChunks(startBlock: bigint, endBlock: bigint, chunkSize: bigint): Array<[bigint, bigint]> {
  if (chunkSize <= 0n) throw new Error("chunkSize must be greater than zero.");
  if (startBlock > endBlock) throw new Error("startBlock must not exceed endBlock.");
  const chunks: Array<[bigint, bigint]> = [];
  for (let from = startBlock; from <= endBlock; from += chunkSize) {
    const candidate = from + chunkSize - 1n;
    chunks.push([from, candidate < endBlock ? candidate : endBlock]);
  }
  return chunks;
}

function assertEvent(event: TransferEvidence): void {
  if (!isAddress(event.from) || !isAddress(event.to)) throw new Error("Malformed Transfer address.");
  if (event.value < 0n || event.blockNumber < 0n) throw new Error("Malformed Transfer numeric value.");
  if (!Number.isInteger(event.transactionIndex) || event.transactionIndex < 0) throw new Error("Malformed transactionIndex.");
  if (!Number.isInteger(event.logIndex) || event.logIndex < 0) throw new Error("Malformed logIndex.");
  if (!/^0x[0-9a-fA-F]{64}$/.test(event.transactionHash)) throw new Error("Malformed transactionHash.");
}

export function deduplicateAndSort(events: TransferEvidence[]): TransferEvidence[] {
  const unique = new Map<string, TransferEvidence>();
  for (const event of events) {
    assertEvent(event);
    const key = `${event.transactionHash.toLowerCase()}:${event.logIndex}`;
    const existing = unique.get(key);
    if (existing && (
      existing.blockNumber !== event.blockNumber ||
      existing.transactionIndex !== event.transactionIndex ||
      getAddress(existing.from) !== getAddress(event.from) ||
      getAddress(existing.to) !== getAddress(event.to) ||
      existing.value !== event.value
    )) throw new Error(`Conflicting duplicate Transfer evidence: ${key}`);
    unique.set(key, event);
  }
  return [...unique.values()].sort((a, b) =>
    a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1
      : a.transactionIndex - b.transactionIndex || a.logIndex - b.logIndex,
  );
}

export function reconstructMinimum(input: {
  subject: Address;
  startBlock: bigint;
  endBlock: bigint;
  currentBlock: bigint;
  minimumBalance: bigint;
  startingBalance?: bigint;
  events?: TransferEvidence[];
  evidenceComplete: boolean;
  evidenceError?: string;
}): MinBalanceResult {
  if (input.startBlock > input.endBlock) throw new Error("startBlock must not exceed endBlock.");
  if (input.minimumBalance <= 0n) throw new Error("minimumBalance must be greater than zero.");
  if (!input.evidenceComplete || input.startingBalance === undefined || input.events === undefined) {
    return {
      verdict: "INDETERMINATE",
      reason: input.evidenceError ?? "Required balance or Transfer evidence is incomplete.",
      orderedEvents: [],
      balances: [],
    };
  }

  let orderedEvents: TransferEvidence[];
  try {
    orderedEvents = deduplicateAndSort(input.events);
  } catch (error) {
    return {
      verdict: "INDETERMINATE",
      reason: error instanceof Error ? error.message : String(error),
      orderedEvents: [],
      balances: [],
    };
  }
  let balance = input.startingBalance;
  const startingPoint: BalancePoint = { balance, blockNumber: input.startBlock - 1n, transactionHash: null, logIndex: null };
  const balances = [startingPoint];
  let minimum = startingPoint;
  for (const event of orderedEvents) {
    if (event.blockNumber < input.startBlock || event.blockNumber > input.endBlock) {
      return { verdict: "INDETERMINATE", reason: "Transfer evidence lies outside the requested window.", orderedEvents, balances };
    }
    if (getAddress(event.from) === getAddress(input.subject)) balance -= event.value;
    if (getAddress(event.to) === getAddress(input.subject)) balance += event.value;
    if (balance < 0n) {
      return { verdict: "INDETERMINATE", reason: "Reconstruction produced an impossible negative balance.", orderedEvents, balances };
    }
    const point: BalancePoint = {
      balance,
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
    };
    balances.push(point);
    if (balance < minimum.balance) minimum = point;
  }
  if (minimum.balance < input.minimumBalance) {
    return { verdict: "FAIL", reason: "Observed minimum is below the required minimum.", orderedEvents, balances, startingBalance: input.startingBalance, finalBalance: balance, minimum };
  }
  if (input.currentBlock < input.endBlock) {
    return { verdict: "ACTIVE", reason: "Window is not complete; terminal PASS is prohibited.", orderedEvents, balances, startingBalance: input.startingBalance, finalBalance: balance, minimum };
  }
  return { verdict: "PASS", reason: "Complete evidence shows the minimum was maintained.", orderedEvents, balances, startingBalance: input.startingBalance, finalBalance: balance, minimum };
}
