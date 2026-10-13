import assert from "node:assert/strict";
import { test } from "node:test";
import type { Address, Hex } from "viem";
import {
  deduplicateAndSort,
  inclusiveChunks,
  reconstructMinimum,
  validateMinBalanceInputs,
  type TransferEvidence,
} from "../scripts/min-balance-core.ts";

const SUBJECT = "0x1000000000000000000000000000000000000001" as Address;
const OTHER = "0x2000000000000000000000000000000000000002" as Address;
const TOKEN = "0x3000000000000000000000000000000000000003" as Address;
const UNIT = 10n ** 18n;
const hash = (value: number) => `0x${value.toString(16).padStart(64, "0")}` as Hex;
const transfer = (
  value: bigint,
  from: Address,
  to: Address,
  blockNumber: bigint,
  transactionIndex: number,
  logIndex: number,
): TransferEvidence => ({ from, to, value, blockNumber, transactionIndex, logIndex, transactionHash: hash(Number(blockNumber) * 100 + transactionIndex) });

function evaluate(events: TransferEvidence[], options: Partial<Parameters<typeof reconstructMinimum>[0]> = {}) {
  return reconstructMinimum({
    subject: SUBJECT,
    startBlock: 10n,
    endBlock: 20n,
    currentBlock: 20n,
    minimumBalance: 80_000n * UNIT,
    startingBalance: 100_000n * UNIT,
    evidenceComplete: true,
    events,
    ...options,
  });
}

test("1 failure path 100000 -> 92000 -> 15000 -> 100000 is FAIL", () => {
  const result = evaluate([
    transfer(8_000n * UNIT, SUBJECT, OTHER, 11n, 0, 0),
    transfer(77_000n * UNIT, SUBJECT, OTHER, 12n, 0, 0),
    transfer(85_000n * UNIT, OTHER, SUBJECT, 13n, 0, 0),
  ]);
  assert.equal(result.verdict, "FAIL");
  assert.equal(result.minimum?.balance, 15_000n * UNIT);
});

test("2 compliant path is PASS after window completion", () => {
  assert.equal(evaluate([
    transfer(6_000n * UNIT, SUBJECT, OTHER, 11n, 0, 0),
    transfer(7_000n * UNIT, SUBJECT, OTHER, 12n, 0, 0),
    transfer(4_000n * UNIT, OTHER, SUBJECT, 13n, 0, 0),
  ]).verdict, "PASS");
});

test("3 final balance above threshold does not erase historical breach", () => {
  const result = evaluate([
    transfer(85_000n * UNIT, SUBJECT, OTHER, 11n, 0, 0),
    transfer(85_000n * UNIT, OTHER, SUBJECT, 12n, 0, 0),
  ]);
  assert.equal(result.finalBalance, 100_000n * UNIT);
  assert.equal(result.verdict, "FAIL");
});

test("4 exact 80000 boundary is PASS", () => {
  assert.equal(evaluate([transfer(20_000n * UNIT, SUBJECT, OTHER, 11n, 0, 0)]).verdict, "PASS");
});

test("5 one wei below boundary is FAIL", () => {
  assert.equal(evaluate([transfer(20_000n * UNIT + 1n, SUBJECT, OTHER, 11n, 0, 0)]).verdict, "FAIL");
});

test("6 incoming transfer increases balance", () => {
  assert.equal(evaluate([transfer(5_000n * UNIT, OTHER, SUBJECT, 11n, 0, 0)]).finalBalance, 105_000n * UNIT);
});

test("7 outgoing transfer decreases balance", () => {
  assert.equal(evaluate([transfer(5_000n * UNIT, SUBJECT, OTHER, 11n, 0, 0)]).finalBalance, 95_000n * UNIT);
});

test("8 self-transfer has zero net effect", () => {
  assert.equal(evaluate([transfer(99_000n * UNIT, SUBJECT, SUBJECT, 11n, 0, 0)]).finalBalance, 100_000n * UNIT);
});

test("9 same-block events sort by transactionIndex", () => {
  const result = evaluate([
    transfer(25_000n * UNIT, OTHER, SUBJECT, 11n, 2, 0),
    transfer(20_001n * UNIT, SUBJECT, OTHER, 11n, 1, 0),
  ]);
  assert.equal(result.verdict, "FAIL");
  assert.equal(result.orderedEvents[0].transactionIndex, 1);
});

test("10 same-transaction events sort by logIndex", () => {
  const outgoing = transfer(20_001n * UNIT, SUBJECT, OTHER, 11n, 1, 1);
  const incoming = { ...transfer(25_000n * UNIT, OTHER, SUBJECT, 11n, 1, 2), transactionHash: outgoing.transactionHash };
  const result = evaluate([incoming, outgoing]);
  assert.equal(result.verdict, "FAIL");
  assert.deepEqual(result.orderedEvents.map(({ logIndex }) => logIndex), [1, 2]);
});

test("11 no relevant events preserves starting balance", () => {
  const result = evaluate([]);
  assert.equal(result.finalBalance, 100_000n * UNIT);
  assert.equal(result.minimum?.balance, 100_000n * UNIT);
});

test("12 RPC timeout evidence state is INDETERMINATE", () => {
  assert.equal(evaluate([], { evidenceComplete: false, evidenceError: "RPC timeout" }).verdict, "INDETERMINATE");
});

test("13 missing starting balance is INDETERMINATE", () => {
  assert.equal(evaluate([], { startingBalance: undefined }).verdict, "INDETERMINATE");
});

test("14 incomplete log retrieval is INDETERMINATE", () => {
  assert.equal(evaluate([], { evidenceComplete: false, evidenceError: "log chunk unavailable" }).verdict, "INDETERMINATE");
});

test("15 current block before endBlock never produces PASS", () => {
  assert.equal(evaluate([], { currentBlock: 19n }).verdict, "ACTIVE");
});

test("16 chunk boundaries cover every block without gaps", () => {
  assert.deepEqual(inclusiveChunks(10n, 20n, 4n), [[10n, 13n], [14n, 17n], [18n, 20n]]);
});

test("17 chunk boundaries do not overlap", () => {
  const chunks = inclusiveChunks(10n, 25n, 5n);
  for (let index = 1; index < chunks.length; index += 1) assert.equal(chunks[index - 1][1] + 1n, chunks[index][0]);
});

test("18 duplicate RPC log is deduplicated", () => {
  const event = transfer(1n, SUBJECT, OTHER, 11n, 0, 0);
  assert.equal(deduplicateAndSort([event, { ...event }]).length, 1);
});

test("19 malformed relevant log causes INDETERMINATE", () => {
  const malformed = { ...transfer(1n, SUBJECT, OTHER, 11n, 0, 0), transactionHash: "0x12" as Hex };
  assert.equal(evaluate([malformed]).verdict, "INDETERMINATE");
});

test("20 startBlock greater than endBlock is rejected", () => {
  assert.throws(() => validateMinBalanceInputs({ token: TOKEN, subject: SUBJECT, startBlock: 2n, endBlock: 1n, minimumBalance: 1n }));
});

test("21 minimum zero is rejected", () => {
  assert.throws(() => validateMinBalanceInputs({ token: TOKEN, subject: SUBJECT, startBlock: 1n, endBlock: 2n, minimumBalance: 0n }));
});

test("22 invalid token and subject addresses are rejected", () => {
  assert.throws(() => validateMinBalanceInputs({ token: "bad", subject: SUBJECT, startBlock: 1n, endBlock: 2n, minimumBalance: 1n }));
  assert.throws(() => validateMinBalanceInputs({ token: TOKEN, subject: "bad", startBlock: 1n, endBlock: 2n, minimumBalance: 1n }));
});
