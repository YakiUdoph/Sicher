import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, test } from "node:test";
import { createAccount, createAddressFromString, hexToBytes } from "@ethereumjs/util";
import { createVM } from "@ethereumjs/vm";
import {
  bytesToHex,
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  type Abi,
  type Address,
  type Hex,
} from "viem";

type Artifact = { abi: Abi; bytecode: Hex; deployedBytecode: Hex };
const artifact = JSON.parse(
  readFileSync("artifacts/SicherTestToken.json", "utf8"),
) as Artifact;
const source = readFileSync("contracts/SicherTestToken.sol", "utf8");
const A = "0x1000000000000000000000000000000000000001" as Address;
const B = "0x2000000000000000000000000000000000000002" as Address;
const SPENDER = "0x3000000000000000000000000000000000000003" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const UNIT = 10n ** 18n;
const SUPPLY = 1_000_000n * UNIT;

let vm: Awaited<ReturnType<typeof createVM>>;
let tokenAddress: ReturnType<typeof createAddressFromString>;
let deploymentLogs: NonNullable<Awaited<ReturnType<typeof deploy>>["execResult"]["logs"]>;

function evmAddress(address: Address) {
  return createAddressFromString(address);
}

async function deploy() {
  return vm.evm.runCall({
    caller: evmAddress(A),
    data: hexToBytes(artifact.bytecode),
    gasLimit: 10_000_000n,
  });
}

beforeEach(async () => {
  vm = await createVM();
  for (const address of [A, B, SPENDER]) {
    await vm.stateManager.putAccount(
      evmAddress(address),
      createAccount({ nonce: 0n, balance: 10n ** 20n }),
    );
  }
  const result = await deploy();
  assert.equal(result.execResult.exceptionError, undefined);
  assert.ok(result.createdAddress);
  tokenAddress = result.createdAddress;
  deploymentLogs = result.execResult.logs ?? [];
});

async function callFrom(
  caller: Address,
  functionName: string,
  args: readonly unknown[] = [],
) {
  return vm.evm.runCall({
    caller: evmAddress(caller),
    to: tokenAddress,
    data: hexToBytes(encodeFunctionData({ abi: artifact.abi, functionName, args })),
    gasLimit: 5_000_000n,
  });
}

async function read(functionName: string, args: readonly unknown[] = []) {
  const result = await callFrom(A, functionName, args);
  assert.equal(result.execResult.exceptionError, undefined);
  return decodeFunctionResult({
    abi: artifact.abi,
    functionName,
    data: bytesToHex(result.execResult.returnValue),
  });
}

function decodeTransfer(log: NonNullable<typeof deploymentLogs>[number]) {
  const [, topics, data] = log;
  return decodeEventLog({
    abi: artifact.abi,
    eventName: "Transfer",
    topics: topics.map((topic) => bytesToHex(topic)) as [Hex, ...Hex[]],
    data: bytesToHex(data),
  }).args as unknown as { from: Address; to: Address; value: bigint };
}

async function balance(account: Address): Promise<bigint> {
  return (await read("balanceOf", [account])) as bigint;
}

test("metadata is correct", async () => {
  assert.equal(await read("name"), "Sicher Test Token");
  assert.equal(await read("symbol"), "STEST");
});

test("decimals is 18", async () => {
  assert.equal(await read("decimals"), 18);
});

test("fixed total supply is correct", async () => {
  assert.equal(await read("totalSupply"), SUPPLY);
});

test("deployment recipient receives the entire supply", async () => {
  assert.equal(await balance(A), SUPPLY);
});

test("constructor emits the conventional mint Transfer event", () => {
  assert.equal(deploymentLogs.length, 1);
  assert.deepEqual(decodeTransfer(deploymentLogs[0]), {
    from: getAddress(ZERO),
    to: getAddress(A),
    value: SUPPLY,
  });
});

test("normal transfer succeeds", async () => {
  const result = await callFrom(A, "transfer", [B, 10n * UNIT]);
  assert.equal(result.execResult.exceptionError, undefined);
  assert.equal(
    decodeFunctionResult({ abi: artifact.abi, functionName: "transfer", data: bytesToHex(result.execResult.returnValue) }),
    true,
  );
});

test("transfer decreases sender balance by the exact amount", async () => {
  await callFrom(A, "transfer", [B, 10n * UNIT]);
  assert.equal(await balance(A), SUPPLY - 10n * UNIT);
});

test("transfer increases recipient balance by the exact amount", async () => {
  await callFrom(A, "transfer", [B, 10n * UNIT]);
  assert.equal(await balance(B), 10n * UNIT);
});

test("transfer emits the standard Transfer event", async () => {
  const result = await callFrom(A, "transfer", [B, 10n * UNIT]);
  assert.deepEqual(decodeTransfer(result.execResult.logs![0]), {
    from: getAddress(A),
    to: getAddress(B),
    value: 10n * UNIT,
  });
});

test("transfer above balance reverts", async () => {
  const result = await callFrom(B, "transfer", [A, 1n]);
  assert.ok(result.execResult.exceptionError);
});

test("zero-value transfer succeeds, emits, and preserves balances", async () => {
  const beforeA = await balance(A);
  const beforeB = await balance(B);
  const result = await callFrom(A, "transfer", [B, 0n]);
  assert.equal(result.execResult.exceptionError, undefined);
  assert.deepEqual(decodeTransfer(result.execResult.logs![0]), {
    from: getAddress(A),
    to: getAddress(B),
    value: 0n,
  });
  assert.equal(await balance(A), beforeA);
  assert.equal(await balance(B), beforeB);
});

test("approve succeeds", async () => {
  const result = await callFrom(A, "approve", [SPENDER, 50n * UNIT]);
  assert.equal(result.execResult.exceptionError, undefined);
  assert.equal(
    decodeFunctionResult({ abi: artifact.abi, functionName: "approve", data: bytesToHex(result.execResult.returnValue) }),
    true,
  );
});

test("allowance reports the approved amount", async () => {
  await callFrom(A, "approve", [SPENDER, 50n * UNIT]);
  assert.equal(await read("allowance", [A, SPENDER]), 50n * UNIT);
});

test("transferFrom succeeds within allowance", async () => {
  await callFrom(A, "approve", [SPENDER, 50n * UNIT]);
  const result = await callFrom(SPENDER, "transferFrom", [A, B, 20n * UNIT]);
  assert.equal(result.execResult.exceptionError, undefined);
  assert.equal(await balance(B), 20n * UNIT);
});

test("transferFrom reduces finite allowance exactly", async () => {
  await callFrom(A, "approve", [SPENDER, 50n * UNIT]);
  await callFrom(SPENDER, "transferFrom", [A, B, 20n * UNIT]);
  assert.equal(await read("allowance", [A, SPENDER]), 30n * UNIT);
});

test("transferFrom above allowance reverts", async () => {
  await callFrom(A, "approve", [SPENDER, 10n * UNIT]);
  const result = await callFrom(SPENDER, "transferFrom", [A, B, 11n * UNIT]);
  assert.ok(result.execResult.exceptionError);
});

test("transfer to zero address is rejected", async () => {
  const result = await callFrom(A, "transfer", [ZERO, 1n]);
  assert.ok(result.execResult.exceptionError);
});

test("no public mint path exists", () => {
  const functions = artifact.abi.filter((entry) => entry.type === "function");
  assert.equal(functions.some((entry) => /mint/i.test(entry.name)), false);
});

test("no owner or admin privileged mint path exists", () => {
  const functions = artifact.abi.filter((entry) => entry.type === "function");
  assert.equal(functions.some((entry) => /owner|admin|role|accesscontrol/i.test(entry.name)), false);
  assert.doesNotMatch(
    source,
    /onlyOwner|AccessControl|Ownable|function\s+(?:owner|admin)\b|modifier\s+/,
  );
});

test("transfers charge no fee", async () => {
  const amount = 123n * UNIT;
  const beforeA = await balance(A);
  const beforeB = await balance(B);
  await callFrom(A, "transfer", [B, amount]);
  assert.equal(beforeA - (await balance(A)), amount);
  assert.equal((await balance(B)) - beforeB, amount);
});

test("transferring X has exact X-to-X accounting", async () => {
  const amount = 777n * UNIT;
  await callFrom(A, "transfer", [B, amount]);
  assert.equal(await balance(A), SUPPLY - amount);
  assert.equal(await balance(B), amount);
  assert.equal((await balance(A)) + (await balance(B)), SUPPLY);
});

test("no rebasing mechanism exists", () => {
  const names = artifact.abi.filter((entry) => entry.type === "function").map((entry) => entry.name);
  assert.equal(names.some((name) => /rebase|shares|index/i.test(name)), false);
});

test("no pause, blacklist, or whitelist path exists", () => {
  const names = artifact.abi.filter((entry) => entry.type === "function").map((entry) => entry.name);
  assert.equal(names.some((name) => /pause|blacklist|whitelist|blocklist/i.test(name)), false);
});

test("no upgradeability or delegatecall path exists", () => {
  const names = artifact.abi.filter((entry) => entry.type === "function").map((entry) => entry.name);
  assert.equal(names.some((name) => /upgrade|implementation|proxy/i.test(name)), false);
  assert.doesNotMatch(source, /delegatecall|selfdestruct/);
});

test("ABI exposes only expected ERC-20 and metadata functionality", () => {
  const names = artifact.abi
    .filter((entry) => entry.type === "function")
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(names, [
    "allowance",
    "approve",
    "balanceOf",
    "decimals",
    "name",
    "symbol",
    "totalSupply",
    "transfer",
    "transferFrom",
  ]);
});

async function reconstructionScenario() {
  await callFrom(A, "transfer", [B, 900_000n * UNIT]);
  const results = [
    await callFrom(A, "transfer", [B, 8_000n * UNIT]),
    await callFrom(A, "transfer", [B, 77_000n * UNIT]),
    await callFrom(B, "transfer", [A, 85_000n * UNIT]),
  ];
  const events = results.flatMap((result) => result.execResult.logs ?? []).map(decodeTransfer);
  let reconstructed = 100_000n * UNIT;
  const path = [reconstructed];
  for (const event of events) {
    if (getAddress(event.from) === getAddress(A)) reconstructed -= event.value;
    if (getAddress(event.to) === getAddress(A)) reconstructed += event.value;
    path.push(reconstructed);
  }
  return { events, path, minimum: path.reduce((a, b) => (a < b ? a : b)) };
}

test("Transfer-event reconstruction works from ordered VM logs", async () => {
  const result = await reconstructionScenario();
  assert.equal(result.events.length, 3);
  assert.equal(result.path.at(-1), await balance(A));
});

test("reconstructed path is 100000 -> 92000 -> 15000 -> 100000", async () => {
  const result = await reconstructionScenario();
  assert.deepEqual(result.path, [100_000n, 92_000n, 15_000n, 100_000n].map((value) => value * UNIT));
});

test("reconstructed minimum is 15000", async () => {
  const result = await reconstructionScenario();
  assert.equal(result.minimum, 15_000n * UNIT);
});
