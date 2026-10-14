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
const css = read("frontend/src/styles.css");

test("1 home uses the approved concise proposition", () => {
  assert.match(main, /Make a measurable commitment\.<br \/>Sicher keeps the record\./);
  assert.doesNotMatch(main, /Projects say what they’ll do|The interesting part is what happens next|What was hidden/);
});

test("2 the strongest historical example is shown without duplicate adjacent explanations", () => {
  const home = main.slice(main.indexOf("function Home()"), main.indexOf("function Explore()"));
  assert.match(home, /Wallet balance during the commitment/);
  assert.match(home, /<ProofStrip proof=\{stripProof\(breach\)\}/);
  assert.match(home, /The balance recovered\.<\/h3><p>The breach didn’t disappear\./);
  assert.doesNotMatch(home, /The record remembers|does not erase an earlier breach/);
});

test("3 Explore cards prioritize requirement, verdict, assurance, and observed minimum", () => {
  assert.match(components, /<Eyebrow>Promise<\/Eyebrow>/);
  assert.match(components, /\{commitment\.plainProofType\}/);
  assert.match(components, /<StatusPill status=\{commitment\.status\} label=\{commitment\.statusLabel\}/);
  assert.match(components, /className="assurance-label">\{commitment\.assuranceLabel\}/);
  assert.match(components, /'Lowest balance' : 'Minimum observed'/);
  const recordCard = components.slice(components.indexOf("export function VerifiedRecordCard"), components.indexOf("export function AssuranceNote"));
  assert.doesNotMatch(recordCard, /recoveryNote|What happened/);
});

test("4 proof verdict terminology and assurance remain separate", () => {
  const proof = main.slice(main.indexOf("function ProofPage"), main.indexOf("function Receipt"));
  assert.match(proof, /<h1>\{c\.statusLabel\}\.<\/h1>/);
  assert.match(proof, /className="assurance-label">\{c\.assuranceLabel\}/);
  assert.doesNotMatch(proof, /statusLabel.*assuranceLabel.*statusLabel/s);
});

test("5 required safety disclosures remain discoverable", () => {
  for (const phrase of [
    "Anchor measurable terms before the outcome",
    "entire block window",
    "temporary breach remains a failure",
    "Proven and Not proven",
    "Corroborated is an assurance level, not a verdict",
    "correlated upstream omission cannot be mathematically excluded",
    "conventional ERC-20 Transfer accounting",
    "not automatically Proven",
    "missing evidence never implies success",
  ]) assert.match(main + components, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
});

test("6 obsolete copy wrappers are absent", () => {
  assert.doesNotMatch(main, /statement-section|statement-aside|className="choice selected"|className="proof-commitment"/);
  assert.doesNotMatch(main, /<p(?:\s+className="[^"]*")?>\s*<\/p>|<div(?:\s+className="[^"]*")?>\s*<\/div>/);
});

test("7 desktop and mobile typography use component-specific scales", () => {
  assert.match(css, /\.hero-copy h1 \{[^}]*font-size: clamp\(52px, 5vw, 60px\)/);
  assert.match(css, /\.page-intro h1 \{[^}]*font-size: clamp\(38px, 4vw, 44px\)/);
  assert.match(css, /\.section-heading h2 \{[^}]*font-size: clamp\(28px, 3vw, 32px\)/);
  assert.match(css, /\.proof-card-title \{[^}]*font-size: 22px/);
  assert.match(css, /body \{[^}]*font-size: 16px/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*body \{ font-size: 15px/);
  assert.doesNotMatch(css, /font-size:\s*80%/);
});

test("8 copy removal also removes legacy tall layout constraints", () => {
  assert.doesNotMatch(css, /\.hero \{[^}]*min-height:\s*720px/);
  assert.doesNotMatch(css, /\.start-(?:rail|content) \{[^}]*min-height:\s*680px/);
  assert.doesNotMatch(css, /\.record-preview-grid \.proof-card \{[^}]*min-height:\s*2[01]0px/);
});

test("9 approved logo and palette remain unchanged", () => {
  assert.equal(sha256("frontend/public/sicher-logo.png"), "a49f7823369b1c4a0949a424e6850c38dd6e7def74e8f9905808dc7872ce00d3");
  for (const token of ["#f4f0e8", "#fbf9f4", "#071436", "#2454d6", "#1747e8", "#f2a77e", "#ff805c", "#497d64", "#e76551"]) assert.match(css, new RegExp(token, "i"));
});

test("10 frozen functional frontend files remain byte-identical", () => {
  const expected = new Map([
    ["frontend/src/chainConfig.js", "a88163e0ca04a1b1a748cc52dd51aeeffe028e59660753a3b5470bcee2a7e1a8"],
    ["frontend/src/commitmentTransaction.js", "6d8044587bf3ac2a8d92e810a2870a02ff9f77b94114cdd5aa0cff20ba40f1c1"],
    ["frontend/src/wallet.js", "c6a32ec6fae41c2e6c5ef6ca2f00d4a88ffffedf3fefb7589b422d0b539c5a86"],
    ["frontend/src/walletContext.jsx", "aa8e1b0e2c7e045cd328de11bbad7554f536c35f5bc25e692ba4cdc71c5a82d4"],
    ["frontend/src/verifiedCommitments.ts", "02a6c0f7e3a1de12f6c4002773b1f569016df30c78ea44489ca87411bd4bc22f"],
    ["frontend/src/commitmentPresentation.ts", "11df29496e022d600cf09b43b9988520c48c9466e82cbcdcc2c2d80c21ade95a"],
    ["frontend/public/data/commitments.json", "55ca3419a85110fa3ac8154ab374db1c1dd5a0f40596f14d48df8de55985fbbd"],
  ]);
  for (const [path, hash] of expected) assert.equal(sha256(path), hash, path);
});
