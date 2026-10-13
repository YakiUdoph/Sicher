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

type Artifact = {
  abi: Abi;
  bytecode: Hex;
};

const artifact = JSON.parse(
  readFileSync("artifacts/SicherCommitmentProof.json", "utf8"),
) as Artifact;
const CREATOR = "0x1000000000000000000000000000000000000001" as Address;
const SUBJECT = "0x2000000000000000000000000000000000000002" as Address;
const TOKEN = "0x3000000000000000000000000000000000000003" as Address;
const MINIMUM_BALANCE = 500n;
const START_BLOCK = 1_000n;
const END_BLOCK = 2_000n;

let vm: Awaited<ReturnType<typeof createVM>>;
let contractAddress: ReturnType<typeof createAddressFromString>;
let creatorAddress: ReturnType<typeof createAddressFromString>;

beforeEach(async () => {
  vm = await createVM();
  creatorAddress = createAddressFromString(CREATOR);
  await vm.stateManager.putAccount(
    creatorAddress,
    createAccount({ nonce: 0n, balance: 10n ** 20n }),
  );
  const deployment = await vm.evm.runCall({
    caller: creatorAddress,
    data: hexToBytes(artifact.bytecode),
    gasLimit: 10_000_000n,
  });
  assert.equal(deployment.execResult.exceptionError, undefined);
  assert.ok(deployment.createdAddress);
  contractAddress = deployment.createdAddress;
});

async function call(functionName: string, args: readonly unknown[] = []) {
  return vm.evm.runCall({
    caller: creatorAddress,
    to: contractAddress,
    data: hexToBytes(
      encodeFunctionData({ abi: artifact.abi, functionName, args }),
    ),
    gasLimit: 5_000_000n,
  });
}

async function createCommitment(
  subject: Address = SUBJECT,
  token: Address = TOKEN,
  minimumBalance: bigint = MINIMUM_BALANCE,
  startBlock: bigint = START_BLOCK,
  endBlock: bigint = END_BLOCK,
) {
  return call("createCommitment", [
    subject,
    token,
    minimumBalance,
    startBlock,
    endBlock,
  ]);
}

async function storedCommitment() {
  const result = await call("commitments", [1n]);
  assert.equal(result.execResult.exceptionError, undefined);
  return decodeFunctionResult({
    abi: artifact.abi,
    functionName: "commitments",
    data: bytesToHex(result.execResult.returnValue),
  }) as readonly [bigint, Address, Address, Address, bigint, bigint, bigint];
}

test("valid commitment creation succeeds", async () => {
  const result = await createCommitment();
  assert.equal(result.execResult.exceptionError, undefined);
  assert.deepEqual(await storedCommitment(), [
    1n,
    getAddress(CREATOR),
    getAddress(SUBJECT),
    getAddress(TOKEN),
    MINIMUM_BALANCE,
    START_BLOCK,
    END_BLOCK,
  ]);
});

test("creator equals the caller", async () => {
  await createCommitment();
  assert.equal((await storedCommitment())[1], getAddress(CREATOR));
});

test("stored subject is correct", async () => {
  await createCommitment();
  assert.equal((await storedCommitment())[2], getAddress(SUBJECT));
});

test("stored token is correct", async () => {
  await createCommitment();
  assert.equal((await storedCommitment())[3], getAddress(TOKEN));
});

test("stored minimum balance is correct", async () => {
  await createCommitment();
  assert.equal((await storedCommitment())[4], MINIMUM_BALANCE);
});

test("stored start block is correct", async () => {
  await createCommitment();
  assert.equal((await storedCommitment())[5], START_BLOCK);
});

test("stored end block is correct", async () => {
  await createCommitment();
  assert.equal((await storedCommitment())[6], END_BLOCK);
});

test("creation event contains the complete commitment definition", async () => {
  const result = await createCommitment();
  assert.equal(result.execResult.logs?.length, 1);
  const [, topics, data] = result.execResult.logs![0];
  const decoded = decodeEventLog({
    abi: artifact.abi,
    topics: topics.map((topic) => bytesToHex(topic)) as [Hex, ...Hex[]],
    data: bytesToHex(data),
  });
  assert.equal(decoded.eventName, "CommitmentCreated");
  assert.deepEqual(decoded.args, {
    id: 1n,
    creator: getAddress(CREATOR),
    subject: getAddress(SUBJECT),
    token: getAddress(TOKEN),
    minimumBalance: MINIMUM_BALANCE,
    startBlock: START_BLOCK,
    endBlock: END_BLOCK,
  });
});

test("zero subject is rejected", async () => {
  const result = await createCommitment(
    "0x0000000000000000000000000000000000000000",
  );
  assert.ok(result.execResult.exceptionError);
});

test("zero token is rejected", async () => {
  const result = await createCommitment(
    SUBJECT,
    "0x0000000000000000000000000000000000000000",
  );
  assert.ok(result.execResult.exceptionError);
});

test("zero minimum balance is rejected", async () => {
  const result = await createCommitment(SUBJECT, TOKEN, 0n);
  assert.ok(result.execResult.exceptionError);
});

test("equal block bounds are rejected", async () => {
  const result = await createCommitment(SUBJECT, TOKEN, 1n, 1_000n, 1_000n);
  assert.ok(result.execResult.exceptionError);
});

test("reversed block bounds are rejected", async () => {
  const result = await createCommitment(SUBJECT, TOKEN, 1n, 2_000n, 1_000n);
  assert.ok(result.execResult.exceptionError);
});

test("no edit path exists", () => {
  const functions = artifact.abi.filter((entry) => entry.type === "function");
  assert.deepEqual(
    functions.filter((entry) => entry.stateMutability === "nonpayable").map((entry) => entry.name),
    ["createCommitment"],
  );
  assert.equal(functions.some((entry) => /update|edit|modify/i.test(entry.name)), false);
});

test("no delete path exists", () => {
  const functions = artifact.abi.filter((entry) => entry.type === "function");
  assert.equal(functions.some((entry) => /delete|remove/i.test(entry.name)), false);
});
