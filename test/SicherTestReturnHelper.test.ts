import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, test } from "node:test";
import { createAccount, createAddressFromString, hexToBytes } from "@ethereumjs/util";
import { createVM } from "@ethereumjs/vm";
import {
  bytesToHex,
  decodeEventLog,
  decodeFunctionResult,
  encodeDeployData,
  encodeFunctionData,
  getAddress,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { expectedHelperRuntime, type HelperArtifact } from "../scripts/return-helper-build.ts";

type Artifact = { abi: Abi; bytecode: Hex };
const tokenArtifact = JSON.parse(readFileSync("artifacts/SicherTestToken.json", "utf8")) as Artifact;
const helperArtifact = JSON.parse(readFileSync("artifacts/SicherTestReturnHelper.json", "utf8")) as Artifact & HelperArtifact;
const SUBJECT = "0x1000000000000000000000000000000000000001" as Address;
const OTHER = "0x2000000000000000000000000000000000000002" as Address;
const UNIT = 10n ** 18n;
const RETURN_AMOUNT = 85_000n * UNIT;

let vm: Awaited<ReturnType<typeof createVM>>;
let token: ReturnType<typeof createAddressFromString>;
let helper: ReturnType<typeof createAddressFromString>;
const evmAddress = (address: Address) => createAddressFromString(address);

beforeEach(async () => {
  vm = await createVM();
  for (const address of [SUBJECT, OTHER]) {
    await vm.stateManager.putAccount(evmAddress(address), createAccount({ nonce: 0n, balance: 10n ** 20n }));
  }
  const tokenDeployment = await vm.evm.runCall({ caller: evmAddress(SUBJECT), data: hexToBytes(tokenArtifact.bytecode), gasLimit: 10_000_000n });
  assert.equal(tokenDeployment.execResult.exceptionError, undefined);
  token = tokenDeployment.createdAddress!;
  const helperData = encodeDeployData({
    abi: helperArtifact.abi,
    bytecode: helperArtifact.bytecode,
    args: [token.toString(), SUBJECT],
  });
  const helperDeployment = await vm.evm.runCall({ caller: evmAddress(SUBJECT), data: hexToBytes(helperData), gasLimit: 10_000_000n });
  assert.equal(helperDeployment.execResult.exceptionError, undefined);
  helper = helperDeployment.createdAddress!;
});

async function call(address: typeof token, caller: Address, abi: Abi, functionName: string, args: readonly unknown[] = []) {
  return vm.evm.runCall({ caller: evmAddress(caller), to: address, data: hexToBytes(encodeFunctionData({ abi, functionName, args })), gasLimit: 5_000_000n });
}
async function tokenBalance(address: string): Promise<bigint> {
  const result = await call(token, SUBJECT, tokenArtifact.abi, "balanceOf", [address]);
  return decodeFunctionResult({ abi: tokenArtifact.abi, functionName: "balanceOf", data: bytesToHex(result.execResult.returnValue) }) as bigint;
}
async function deposit(amount: bigint) {
  return call(token, SUBJECT, tokenArtifact.abi, "transfer", [helper.toString(), amount]);
}
async function restore(caller = SUBJECT) {
  return call(helper, caller, helperArtifact.abi, "restore");
}

test("constructor fixes token, subject, and 85000 return amount", async () => {
  for (const [name, expected] of [["token", getAddress(token.toString())], ["subject", getAddress(SUBJECT)], ["RETURN_AMOUNT", RETURN_AMOUNT]] as const) {
    const result = await call(helper, SUBJECT, helperArtifact.abi, name);
    assert.equal(decodeFunctionResult({ abi: helperArtifact.abi, functionName: name, data: bytesToHex(result.execResult.returnValue) }), expected);
  }
});

test("unauthorized caller cannot restore", async () => {
  await deposit(RETURN_AMOUNT);
  assert.ok((await restore(OTHER)).execResult.exceptionError);
});

test("restoration before full 85000 deposit reverts", async () => {
  await deposit(8_000n * UNIT);
  assert.ok((await restore()).execResult.exceptionError);
});

test("two deposits followed by restore reproduce 100000 -> 92000 -> 15000 -> 100000", async () => {
  await call(token, SUBJECT, tokenArtifact.abi, "transfer", [OTHER, 900_000n * UNIT]);
  const path = [await tokenBalance(SUBJECT)];
  await deposit(8_000n * UNIT); path.push(await tokenBalance(SUBJECT));
  await deposit(77_000n * UNIT); path.push(await tokenBalance(SUBJECT));
  await restore(); path.push(await tokenBalance(SUBJECT));
  assert.deepEqual(path, [100_000n, 92_000n, 15_000n, 100_000n].map((value) => value * UNIT));
});

test("restore emits a genuine token Transfer from helper to subject", async () => {
  await deposit(RETURN_AMOUNT);
  const result = await restore();
  const tokenLog = result.execResult.logs?.find(([address]) => bytesToHex(address) === token.toString());
  assert.ok(tokenLog);
  const [, topics, data] = tokenLog;
  const args = decodeEventLog({ abi: tokenArtifact.abi, eventName: "Transfer", topics: topics.map((topic) => bytesToHex(topic)) as [Hex, ...Hex[]], data: bytesToHex(data) }).args as unknown as { from: Address; to: Address; value: bigint };
  assert.deepEqual(args, { from: getAddress(helper.toString()), to: getAddress(SUBJECT), value: RETURN_AMOUNT });
});

test("restore cannot be executed twice", async () => {
  await deposit(RETURN_AMOUNT);
  assert.equal((await restore()).execResult.exceptionError, undefined);
  assert.ok((await restore()).execResult.exceptionError);
});

test("helper has no withdrawal target or admin mutation function", () => {
  const names = helperArtifact.abi.filter((entry) => entry.type === "function").map((entry) => entry.name).sort();
  assert.deepEqual(names, ["RETURN_AMOUNT", "restore", "restored", "subject", "token"]);
});

test("immutable-substituted runtime matches the actually deployed VM code exactly", async () => {
  const actualRuntime = bytesToHex(await vm.stateManager.getCode(helper));
  assert.equal(actualRuntime, expectedHelperRuntime(helperArtifact, token.toString() as Address, SUBJECT));
});
