import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const sha256 = (path: string) => createHash("sha256").update(readFileSync(resolve(ROOT, path))).digest("hex");
const main = read("frontend/src/main.jsx");
const components = read("frontend/src/components.jsx");
const ui = `${main}\n${components}`;
const data = JSON.parse(read("frontend/public/data/commitments.json"));

test("1 commitments are described as real Elysium testnet records, not demos", () => {
  assert.match(ui, /Real Elysium testnet record/i);
  assert.match(main, /These measurable commitments were recorded on Elysium Testnet before their outcomes/);
  assert.doesNotMatch(ui, /fictional demo|demo values|mainnet|production data|live customer|real money/i);
});

test("2 STEST is explained truthfully and is never represented as $SICHER", () => {
  assert.match(main, /STEST is the Sicher Test Token used for these proofs/);
  assert.match(main, /STEST is used only for testnet proof demonstrations; it is not a launched economic token and has no stated economic value/);
  assert.doesNotMatch(ui, /\$SICHER|dollar[- ]SICHER/i);
});

test("3 the balance sequence has nearby human context and remains adapter-bound", () => {
  assert.match(main, /Wallet balance during the commitment/);
  assert.match(main, /<ProofStrip proof=\{stripProof\((?:breach|c)\)\}/);
  assert.match(main, /It dropped to \{breach\.minimumObserved\} before recovering/);
});

test("4 the minimum requirement is explained", () => {
  assert.match(main, /The balance had to stay at or above this amount for the whole commitment/);
  assert.match(ui, /Maintain at least \$\{commitment\.minimumRequired\} in this wallet throughout the recorded period/);
});

test("5 Proven has a scoped plain-English meaning", () => {
  assert.match(main, /The wallet remained at or above its recorded minimum throughout the verified period/);
  assert.match(main, /The recorded minimum-balance condition held throughout the verified period/);
});

test("6 Not proven has a plain-English meaning", () => {
  assert.match(main, /The wallet fell below its recorded minimum during the commitment period/);
  assert.match(main, /Breach — below the recorded minimum/);
  assert.match(main, /The balance recovered\. The broken commitment didn’t disappear/);
});

test("7 Corroborated has a compact human explanation", () => {
  assert.match(components, /Checked across multiple sources/);
  assert.match(components, /Corroborated means Sicher compared the historical evidence across multiple data sources/);
});

test("8 the shared-upstream limitation remains accessible", () => {
  assert.match(components, /Shared upstream infrastructure means correlated omission cannot be mathematically excluded/);
  assert.match(main, /A correlated upstream omission cannot be mathematically excluded/);
});

test("9 official historical values, verdicts, and assurance are unchanged", () => {
  const first = data.commitments["1"];
  const second = data.commitments["2"];
  assert.deepEqual(
    [first.minimumRequiredFormatted, first.minimumObservedFormatted, first.proofResult, first.assuranceLevel],
    ["80,000 STEST", "92,000 STEST", "PROVEN", "CORROBORATED"],
  );
  assert.deepEqual(
    [second.startingBalanceFormatted, second.minimumRequiredFormatted, second.minimumObservedFormatted, second.finalBalanceFormatted, second.proofResult, second.assuranceLevel],
    ["100,000 STEST", "80,000 STEST", "15,000 STEST", "100,000 STEST", "NOT_PROVEN", "CORROBORATED"],
  );
  assert.equal(sha256("frontend/public/data/commitments.json"), "55ca3419a85110fa3ac8154ab374db1c1dd5a0f40596f14d48df8de55985fbbd");
});

test("10 frozen product logic remains byte-identical", () => {
  const expected = new Map([
    ["frontend/src/chainConfig.js", "a88163e0ca04a1b1a748cc52dd51aeeffe028e59660753a3b5470bcee2a7e1a8"],
    ["frontend/src/commitmentTransaction.js", "6d8044587bf3ac2a8d92e810a2870a02ff9f77b94114cdd5aa0cff20ba40f1c1"],
    ["frontend/src/wallet.js", "c6a32ec6fae41c2e6c5ef6ca2f00d4a88ffffedf3fefb7589b422d0b539c5a86"],
    ["frontend/src/walletContext.jsx", "aa8e1b0e2c7e045cd328de11bbad7554f536c35f5bc25e692ba4cdc71c5a82d4"],
    ["frontend/src/verifiedCommitments.ts", "02a6c0f7e3a1de12f6c4002773b1f569016df30c78ea44489ca87411bd4bc22f"],
    ["frontend/src/commitmentPresentation.ts", "11df29496e022d600cf09b43b9988520c48c9466e82cbcdcc2c2d80c21ade95a"],
  ]);
  for (const [path, hash] of expected) assert.equal(sha256(path), hash, path);
});
