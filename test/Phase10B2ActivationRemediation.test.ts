import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { STEST_ADDRESS } from "../frontend/src/chainConfig.js";
import type { RegistryCommitment, RegistrySnapshot } from "../frontend/src/registryDiscovery.ts";
import { emptyPublicResultIndex, type PublicResultIndex } from "../scripts/phase10b-publication.ts";
import { scanFinalizedRegistry, selectCompletedVerificationJobs } from "../scripts/phase10b-scanner.ts";
import { verifyOneCommitment } from "../scripts/phase10b-verify-one.ts";

const ROOT = resolve(import.meta.dirname, "..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/phase10b-publish-results.yml"), "utf8");
const ACCOUNT = "0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086";
const OTHER_TOKEN = "0x0000000000000000000000000000000000000001";
const record = (id: string, endBlock = "10", token = STEST_ADDRESS): RegistryCommitment => Object.freeze({ id, creator: ACCOUNT, subject: ACCOUNT, token, minimumBalanceBaseUnits: "1", startBlock: "1", endBlock });
const snapshot = (commitments: readonly RegistryCommitment[], head = 20n): RegistrySnapshot => Object.freeze({ chainId: 99801, head, upperBound: BigInt(commitments.length), commitments: Object.freeze([...commitments]) });
const select = (commitments: readonly RegistryCommitment[], manualCommitmentId?: string, index: PublicResultIndex = emptyPublicResultIndex(false), limit = 1) => selectCompletedVerificationJobs({ snapshot: snapshot(commitments), index, limit, manualCommitmentId });

test("1 publish job is bound exactly to the protected publication environment", () => {
  assert.match(WORKFLOW, /^jobs:\r?\n  publish:\r?\n    environment: sicher-result-publication\r?$/m);
  const jobsSection = WORKFLOW.slice(WORKFLOW.indexOf("jobs:"));
  assert.deepEqual([...jobsSection.matchAll(/^  ([a-zA-Z0-9_-]+):\s*$/gm)].map((match) => match[1]), ["publish"]);
});

test("2 workflow triggers and permissions remain the approved minimum", () => {
  const triggerBlock = WORKFLOW.slice(WORKFLOW.indexOf("on:"), WORKFLOW.indexOf("permissions:"));
  assert.deepEqual([...triggerBlock.matchAll(/^  ([a-zA-Z0-9_-]+):\s*$/gm)].map((match) => match[1]), ["schedule", "workflow_dispatch"]);
  assert.doesNotMatch(WORKFLOW, /^  (?:push|pull_request|pull_request_target):/m);
  const permissionBlock = WORKFLOW.slice(WORKFLOW.indexOf("permissions:"), WORKFLOW.indexOf("concurrency:"));
  assert.equal(permissionBlock.replace(/\r/g, "").trim(), "permissions:\n  contents: write\n  pull-requests: write");
  assert.equal((WORKFLOW.match(/^permissions:/gm) ?? []).length, 1);
});

test("3 no manual ID preserves generic lowest-eligible selection", () => {
  assert.deepEqual(select([record("10"), record("3"), record("7")]).map(({ id }) => id), ["3"]);
});

test("4 manual #10 narrows selection to #10", () => {
  assert.deepEqual(select([record("3"), record("10")], "10").map(({ id }) => id), ["10"]);
});

test("5 already-published manual ID fails closed", () => {
  const index = structuredClone(emptyPublicResultIndex(false)) as { results: Record<string, unknown> };
  index.results["1"] = {};
  assert.throws(() => select([record("1")], "1", index as unknown as PublicResultIndex), /already published/);
});

test("6 nonexistent manual ID fails closed", () => assert.throws(() => select([record("3")], "10"), /does not exist/));
test("7 malformed manual IDs fail closed", () => { for (const id of ["0", "01", "-1", "1.0", "abc", " 10 "]) assert.throws(() => select([record("10")], id), /canonical positive integer/); });
test("8 unsupported-token manual ID fails closed", () => assert.throws(() => select([record("10", "10", OTHER_TOKEN)], "10"), /unsupported token/));
test("9 unended manual ID fails closed", () => assert.throws(() => select([record("10", "21")], "10"), /has not ended/));
test("10 manual ID cannot bypass the finalized-head boundary", () => assert.throws(() => selectCompletedVerificationJobs({ snapshot: snapshot([record("10", "20")], 20n), index: emptyPublicResultIndex(false), limit: 1, manualCommitmentId: "10" }), /has not ended/));

test("11 manual selection still enters the frozen verifier fail-closed path", async () => {
  const [terms] = select([record("10")], "10");
  await assert.rejects(verifyOneCommitment({ terms, runner: async () => ({ code: 1, stdout: "", stderr: "provider disagreement" }) }), /Frozen verifier failed closed.*provider disagreement/);
});

test("12 manual selection cannot bypass dual-provider agreement", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body)) as { id: number; method: string };
    const result = body.method === "eth_chainId"
      ? `0x${(99801).toString(16)}`
      : { number: "0x14", hash: String(input).includes("a.invalid") ? `0x${"11".repeat(32)}` : `0x${"22".repeat(32)}` };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), { status: 200 });
  };
  try { await assert.rejects(scanFinalizedRegistry(["https://a.invalid", "https://b.invalid"]), /Finalized head disagreement/); }
  finally { globalThis.fetch = originalFetch; }
});

test("13 manual selection can never return more than one result", () => assert.equal(select([record("3"), record("10")], "10", emptyPublicResultIndex(false), 25).length, 1));

test("14 scheduled runs cannot inject a manual target", () => {
  assert.match(WORKFLOW, /PHASE10B_MANUAL_COMMITMENT_ID: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.commitment_id \|\| '' \}\}/);
  assert.doesNotMatch(WORKFLOW.slice(WORKFLOW.indexOf("schedule:"), WORKFLOW.indexOf("workflow_dispatch:")), /commitment_id|inputs\./);
});

test("15 manual targeting does not bypass the single worker verification and publication pipeline", () => {
  const worker = readFileSync(resolve(ROOT, "scripts/phase10b-worker.ts"), "utf8");
  assert.match(worker, /selectCompletedVerificationJobs\([\s\S]*manualCommitmentId/);
  assert.equal((worker.match(/verifyOneCommitment\(/g) ?? []).length, 1);
  assert.equal((worker.match(/publishValidatedResult\(/g) ?? []).length, 1);
});

test("16 #6 and #7 technical evidence is not imported by manual-selection support", () => {
  const index = emptyPublicResultIndex(false);
  assert.equal(Object.hasOwn(index.results, "6"), false);
  assert.equal(Object.hasOwn(index.results, "7"), false);
  assert.doesNotMatch(WORKFLOW, /commitment_id:\s*["']?(?:6|7)["']?\s*$/m);
});
