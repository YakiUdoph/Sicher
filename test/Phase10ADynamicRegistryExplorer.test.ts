import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { decodeFunctionData, encodeFunctionData, encodeFunctionResult } from "viem";

import {
  loadDynamicExploreState,
  loadDynamicProjectState,
  matchesCommitmentSearch,
  presentRegistryCommitment,
} from "../frontend/src/dynamicCommitments.ts";
import {
  discoverRegistryCommitments,
  RegistryDiscoveryError,
  type RegistryCommitment,
  type RegistrySnapshot,
} from "../frontend/src/registryDiscovery.ts";
import { validateVerifiedCommitmentsDocument, type VerifiedCommitmentView } from "../frontend/src/verifiedCommitments.ts";

const ROOT = resolve(import.meta.dirname, "..");
const ACCOUNT = "0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086" as const;
const TOKEN = "0x14fc373Dce148766a3B8d9C2BF5f02F8dbe316a7" as const;
const published = validateVerifiedCommitmentsDocument(JSON.parse(readFileSync(resolve(ROOT, "frontend/public/data/commitments.json"), "utf8")));

const READ_ABI = [
  { type: "function", name: "nextCommitmentId", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "commitments", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [
    { name: "id", type: "uint256" }, { name: "creator", type: "address" }, { name: "subject", type: "address" },
    { name: "token", type: "address" }, { name: "minimumBalance", type: "uint256" },
    { name: "startBlock", type: "uint256" }, { name: "endBlock", type: "uint256" },
  ] },
] as const;

function recordFromView(view: VerifiedCommitmentView): RegistryCommitment {
  return Object.freeze({
    id: view.id, creator: view.creator, subject: view.subject, token: view.token,
    minimumBalanceBaseUnits: view.minimumRequiredBaseUnits,
    startBlock: view.startBlock, endBlock: view.endBlock,
  });
}

function record(id: number, start = 100, end = 200): RegistryCommitment {
  return Object.freeze({
    id: String(id), creator: ACCOUNT, subject: ACCOUNT, token: TOKEN,
    minimumBalanceBaseUnits: "80000000000000000000000",
    startBlock: String(start), endBlock: String(end),
  });
}

function snapshot(count = 10, head = 300n): RegistrySnapshot {
  const commitments = [recordFromView(published.commitments["1"]), recordFromView(published.commitments["2"])];
  for (let id = 3; id <= count; id += 1) commitments.push(record(id));
  return Object.freeze({ chainId: 99801, head, upperBound: BigInt(count), commitments: Object.freeze(commitments) });
}

const options = (snap = snapshot()) => ({ discover: async () => snap, loadPublished: async () => published });

function rpcMock(nextCommitmentId = 12n, malformedId?: bigint, failId?: bigint) {
  const calls: Array<{ method: string; params: unknown[] }> = [];
  const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown[] };
    calls.push({ method: body.method, params: body.params });
    let result: unknown;
    if (body.method === "eth_chainId") result = "0x185d9";
    else if (body.method === "eth_blockNumber") result = "0x12c";
    else if (body.method === "eth_call") {
      const call = body.params[0] as { data: `0x${string}` };
      const decoded = decodeFunctionData({ abi: READ_ABI, data: call.data });
      if (decoded.functionName === "nextCommitmentId") {
        result = encodeFunctionResult({ abi: READ_ABI, functionName: "nextCommitmentId", result: nextCommitmentId });
      } else {
        const id = decoded.args[0];
        if (id === failId) return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32000, message: "failed" } }), { status: 200 });
        const returnedId = id === malformedId ? 0n : id;
        result = encodeFunctionResult({ abi: READ_ABI, functionName: "commitments", result: [returnedId, ACCOUNT, ACCOUNT, TOKEN, 1n, 100n, 200n] });
      }
    } else throw new Error(`Unexpected method ${body.method}`);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), { status: 200 });
  };
  return { calls, fetchImpl };
}

test("1 published #1 remains Proven only through its published receipt", async () => {
  const state = await loadDynamicExploreState(options()); assert.equal(state.kind, "success");
  if (state.kind === "success") { const one = state.commitments[0]; assert.equal(one.statusLabel, "Proven"); assert.equal(one.hasValidatedReceipt, true); }
});

test("2 published #2 remains Not proven only through its published receipt", async () => {
  const state = await loadDynamicExploreState(options()); assert.equal(state.kind, "success");
  if (state.kind === "success") { const two = state.commitments[1]; assert.equal(two.statusLabel, "Not proven"); assert.equal(two.assuranceLabel, "Corroborated"); }
});

test("3 registry commitment without a published receipt appears", async () => {
  const state = await loadDynamicExploreState(options()); assert.equal(state.kind, "success");
  if (state.kind === "success") assert.equal(state.commitments.some(({ id }) => id === "10"), true);
});

test("4 active commitment receives no terminal verdict", () => {
  const item = presentRegistryCommitment(record(3, 100, 200), 150n); assert.equal(item.statusLabel, "Proof running"); assert.equal(item.hasValidatedReceipt, false);
});

test("5 ended commitment without receipt awaits a result", () => assert.equal(presentRegistryCommitment(record(3), 201n).statusLabel, "Awaiting result"));
test("6 missing receipt can never become Proven", () => assert.notEqual(presentRegistryCommitment(record(3), 201n).statusLabel, "Proven"));
test("7 missing receipt can never become Not proven", () => assert.notEqual(presentRegistryCommitment(record(3), 201n).statusLabel, "Not proven"));
test("8 missing receipt can never become Corroborated", () => assert.equal(presentRegistryCommitment(record(3), 201n).assuranceLabel, null));

test("9 numeric ID search finds #10", async () => {
  const state = await loadDynamicExploreState(options()); assert.equal(state.kind, "success");
  if (state.kind === "success") assert.deepEqual(state.commitments.filter((item) => matchesCommitmentSearch(item, "10")).map(({ id }) => id), ["10"]);
});

test("10 hash-prefixed ID search finds #10", async () => {
  const state = await loadDynamicExploreState(options()); assert.equal(state.kind, "success");
  if (state.kind === "success") assert.deepEqual(state.commitments.filter((item) => matchesCommitmentSearch(item, "#10")).map(({ id }) => id), ["10"]);
});

test("11 future commitment discovery uses the registry snapshot rather than a hardcoded ID list", async () => {
  const state = await loadDynamicExploreState(options(snapshot(11))); assert.equal(state.kind, "success");
  if (state.kind === "success") assert.equal(state.commitments.at(-1)?.id, "11");
});

test("12 RPC failure is explicit and never reports zero commitments", async () => {
  const state = await loadDynamicExploreState({ discover: async () => { throw new RegistryDiscoveryError("UNAVAILABLE", "offline"); }, loadPublished: async () => published });
  assert.equal(state.kind, "error"); if (state.kind === "error") { assert.equal(state.reason, "registry_unavailable"); assert.equal("onChainCount" in state, false); assert.equal(state.fallback.length, 2); }
});

test("13 unknown ID fails closed", async () => assert.deepEqual(await loadDynamicProjectState("999", options()), { kind: "not_found" }));

test("14 receipt route explains that no validated receipt is published", () => {
  const source = readFileSync(resolve(ROOT, "frontend/src/main.jsx"), "utf8"); assert.match(source, /No validated receipt[\s\S]*has been published yet/);
});

test("15 existing #1/#2 Receipt V3 rendering remains present", () => {
  const source = readFileSync(resolve(ROOT, "frontend/src/main.jsx"), "utf8"); assert.match(source, /Validated Receipt V3/); assert.match(source, /Copy receipt digest/);
});

test("16 Start transaction implementation remains byte-identical", () => {
  const bytes = readFileSync(resolve(ROOT, "frontend/src/commitmentTransaction.js")); assert.equal(createHash("sha256").update(bytes).digest("hex"), "6d8044587bf3ac2a8d92e810a2870a02ff9f77b94114cdd5aa0cff20ba40f1c1");
});

test("17 Explore discovery contains no wallet permission method", () => {
  const source = readFileSync(resolve(ROOT, "frontend/src/registryDiscovery.ts"), "utf8"); assert.doesNotMatch(source, /eth_requestAccounts|wallet_/);
});

test("18 discovery performs only read-only RPC methods", async () => {
  const mock = rpcMock(3n); await discoverRegistryCommitments({ fetchImpl: mock.fetchImpl });
  assert.deepEqual(new Set(mock.calls.map(({ method }) => method)), new Set(["eth_chainId", "eth_blockNumber", "eth_call"]));
});

test("19 malformed returned ID fails registry validation", async () => {
  const mock = rpcMock(3n, 2n); await assert.rejects(discoverRegistryCommitments({ fetchImpl: mock.fetchImpl }), /requested ID/);
});

test("20 discovery uses the approved public RPC by default", () => {
  const source = readFileSync(resolve(ROOT, "frontend/src/registryDiscovery.ts"), "utf8"); assert.match(source, /ELYSIUM_RPC_URL/); assert.doesNotMatch(source, /PRIVATE_KEY|mnemonic|seed phrase/i);
});

test("21 nextCommitmentId is snapshotted exactly once", async () => {
  const mock = rpcMock(12n); await discoverRegistryCommitments({ fetchImpl: mock.fetchImpl });
  const selector = encodeFunctionData({ abi: READ_ABI, functionName: "nextCommitmentId" });
  assert.equal(mock.calls.filter(({ method, params }) => method === "eth_call" && (params[0] as { data?: string }).data === selector).length, 1);
});

test("22 discovery source does not hardcode current maximum ID 10", () => {
  const source = readFileSync(resolve(ROOT, "frontend/src/registryDiscovery.ts"), "utf8"); assert.doesNotMatch(source, /upperBound\s*=\s*10n|\[\s*["']1["'][\s\S]*["']10["']\s*\]/);
});

test("23 mocked nextCommitmentId 12 discovers #11", async () => {
  const mock = rpcMock(12n); const state = await discoverRegistryCommitments({ fetchImpl: mock.fetchImpl }); assert.equal(state.upperBound, 11n); assert.equal(state.commitments.at(-1)?.id, "11");
});

test("24 terminal enrichment requires immutable-term agreement", () => {
  const item = presentRegistryCommitment(recordFromView(published.commitments["1"]), 9999999n, published.commitments["1"]); assert.equal(item.statusLabel, "Proven");
});

test("25 disagreeing receipt terms fail closed without a verdict", async () => {
  const bad = { ...published, commitments: { ...published.commitments, "1": { ...published.commitments["1"], minimumRequiredBaseUnits: "1" } as VerifiedCommitmentView } };
  const state = await loadDynamicExploreState({ discover: async () => snapshot(), loadPublished: async () => bad }); assert.deepEqual(state, { kind: "error", reason: "validation_error", fallback: [] }); assert.doesNotMatch(JSON.stringify(state), /Proven|Not proven|Corroborated/);
});

test("26 #6/#7 technical evidence cannot bypass the public publication boundary", async () => {
  const state = await loadDynamicExploreState(options()); assert.equal(state.kind, "success"); if (state.kind === "success") for (const id of ["6", "7"]) { assert.equal(state.commitments.find((entry) => entry.id === id)?.statusLabel, "Awaiting result"); assert.equal(state.commitments.find((entry) => entry.id === id)?.assuranceLabel, null); }
});

test("27 current #3–#10 all resolve to Awaiting result after their end blocks", async () => {
  const state = await loadDynamicExploreState(options()); assert.equal(state.kind, "success"); if (state.kind === "success") assert.equal(state.commitments.slice(2).every(({ statusLabel }) => statusLabel === "Awaiting result"), true);
});

test("28 malformed registry record never receives a normal presentation", async () => {
  const mock = rpcMock(2n, 1n); await assert.rejects(discoverRegistryCommitments({ fetchImpl: mock.fetchImpl }), RegistryDiscoveryError);
});

test("29 partial discovery failure cannot masquerade as a complete registry", async () => {
  const mock = rpcMock(12n, undefined, 5n); const state = await loadDynamicExploreState({ discover: () => discoverRegistryCommitments({ fetchImpl: mock.fetchImpl }), loadPublished: async () => published }); assert.equal(state.kind, "error"); if (state.kind === "error") assert.equal("onChainCount" in state, false);
});

test("30 Explore performs no wallet permission request", () => {
  const source = ["frontend/src/main.jsx", "frontend/src/dynamicCommitments.ts", "frontend/src/registryDiscovery.ts"].map((file) => readFileSync(resolve(ROOT, file), "utf8")).join("\n"); assert.doesNotMatch(source.slice(source.indexOf("function Explore()"), source.indexOf("function CommitmentLoading")), /eth_requestAccounts|wallet\.connect/);
});

