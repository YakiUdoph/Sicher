import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { loadExploreState, loadProjectState, toCommitmentPresentation } from "../frontend/src/commitmentPresentation.ts";
import { validateVerifiedCommitmentsDocument, VerifiedCommitmentDataError, type VerifiedCommitmentView } from "../frontend/src/verifiedCommitments.ts";

const ROOT = resolve(import.meta.dirname, "..");
const prepared = validateVerifiedCommitmentsDocument(JSON.parse(readFileSync(resolve(ROOT, "frontend/public/data/commitments.json"), "utf8")));
const one = prepared.commitments["1"];
const two = prepared.commitments["2"];
const getter = async (id: string): Promise<VerifiedCommitmentView> => {
  const item = prepared.commitments[id];
  if (!item) throw new VerifiedCommitmentDataError("NOT_FOUND", "Not found.");
  return item;
};

test("1 Explore shows exactly two real commitments", async () => {
  const state = await loadExploreState(getter);
  assert.equal(state.kind, "success");
  if (state.kind === "success") assert.deepEqual(state.commitments.map(({ id }) => id), ["1", "2"]);
});

test("2 fictional projects do not drive Explore", () => {
  const source = readFileSync(resolve(ROOT, "frontend/src/main.jsx"), "utf8");
  const explore = source.slice(source.indexOf("function Explore()"), source.indexOf("function ProjectPage"));
  assert.doesNotMatch(explore, /proofs\.filter|getProject|Northline|Fieldnote|Morrow|Juniper|Quiet Signal|Paper House/);
});

test("3 Commitment #1 displays Proven", () => {
  assert.equal(toCommitmentPresentation(one).statusLabel, "Proven");
});

test("4 Commitment #1 displays Corroborated separately", () => {
  const view = toCommitmentPresentation(one);
  assert.equal(view.statusLabel, "Proven");
  assert.equal(view.assuranceLabel, "Corroborated");
});

test("5 Commitment #2 displays Not proven", () => {
  assert.equal(toCommitmentPresentation(two).statusLabel, "Not proven");
});

test("6 Commitment #2 displays Corroborated separately", () => {
  const view = toCommitmentPresentation(two);
  assert.equal(view.statusLabel, "Not proven");
  assert.equal(view.assuranceLabel, "Corroborated");
});

test("7 Commitment #2 shows 15,000 minimum observed", () => {
  assert.equal(toCommitmentPresentation(two).minimumObserved, "15,000 STEST");
});

test("8 Commitment #2 shows 100,000 final balance", () => {
  assert.equal(toCommitmentPresentation(two).finalBalance, "100,000 STEST");
});

test("9 recovery does not change Commitment #2 displayed verdict", () => {
  const view = toCommitmentPresentation(two);
  assert.equal(view.finalBalance, view.startingBalance);
  assert.equal(view.statusLabel, "Not proven");
  assert.match(view.recoveryNote ?? "", /earlier breach still counts/);
});

test("10 /project/1 resolves Commitment #1", async () => {
  const state = await loadProjectState("1", getter);
  assert.equal(state.kind, "success");
  if (state.kind === "success") assert.equal(state.commitment.id, "1");
});

test("11 /project/2 resolves Commitment #2", async () => {
  const state = await loadProjectState("2", getter);
  assert.equal(state.kind, "success");
  if (state.kind === "success") assert.equal(state.commitment.id, "2");
});

test("12 unknown project ID becomes NOT_FOUND", async () => {
  assert.deepEqual(await loadProjectState("999", getter), { kind: "not_found" });
});

test("13 unknown project does not fall back to Commitment #1", async () => {
  assert.notEqual((await loadProjectState("unknown", getter)).kind, "success");
});

test("14 malformed loader result cannot display Proven", async () => {
  const state = await loadProjectState("1", async () => { throw new VerifiedCommitmentDataError("MALFORMED", "Malformed."); });
  assert.deepEqual(state, { kind: "validation_error" });
  assert.doesNotMatch(JSON.stringify(state), /Proven/);
});

test("15 unavailable data cannot display a terminal result", async () => {
  const state = await loadProjectState("1", async () => { throw new VerifiedCommitmentDataError("UNAVAILABLE", "Unavailable."); });
  assert.deepEqual(state, { kind: "unavailable" });
  assert.doesNotMatch(JSON.stringify(state), /Proven|Not proven/);
});

test("16 displayed proof status comes from the validated adapter object", () => {
  const changed = { ...one, proofStatusLabel: "Adapter-supplied status" } as VerifiedCommitmentView;
  assert.equal(toCommitmentPresentation(changed).statusLabel, "Adapter-supplied status");
});

test("17 changing path alone cannot change displayed verdict", () => {
  const changed = { ...two, pathFormatted: ["1 STEST", "2 STEST"] } as VerifiedCommitmentView;
  assert.equal(toCommitmentPresentation(changed).statusLabel, toCommitmentPresentation(two).statusLabel);
});

test("18 technical limitation is accessible", () => {
  const source = readFileSync(resolve(ROOT, "frontend/src/components.jsx"), "utf8");
  assert.match(source, /<details className="assurance-note">/);
  assert.match(source, /Shared upstream infrastructure means correlated omission cannot be mathematically excluded/);
});

test("19 no fictional identity is introduced", async () => {
  const state = await loadExploreState(getter);
  assert.equal(state.kind, "success");
  assert.doesNotMatch(JSON.stringify(state), /Northline|Fieldnote|Morrow|Juniper|Quiet Signal|Paper House|founder|testimonial/i);
});

test("20 no signing material enters browser inputs", () => {
  const browserInputs = [
    "frontend/src/main.jsx", "frontend/src/components.jsx", "frontend/src/commitmentPresentation.ts",
    "frontend/src/verifiedCommitments.ts", "frontend/public/data/commitments.json",
  ].map((path) => readFileSync(resolve(ROOT, path), "utf8")).join("\n");
  assert.doesNotMatch(browserInputs, /TEST_WALLET_PRIVATE_KEY|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|\b(?:mnemonic|seed phrase)\s*[:=]/i);
  assert.doesNotMatch(browserInputs, /https?:\/\/[^/@\s]+:[^/@\s]+@/i);
});
