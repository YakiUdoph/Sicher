import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const file = (path: string) => resolve(ROOT, path);
const read = (path: string) => readFileSync(file(path), "utf8");
const sha256 = (path: string) => createHash("sha256").update(readFileSync(file(path))).digest("hex");
const pngSize = (path: string) => {
  const data = readFileSync(file(path));
  assert.equal(data.subarray(1, 4).toString(), "PNG");
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
};
const jpegSize = (path: string) => {
  const data = readFileSync(file(path));
  assert.equal(data[0], 0xff);
  assert.equal(data[1], 0xd8);
  let offset = 2;
  while (offset < data.length) {
    if (data[offset] !== 0xff) { offset += 1; continue; }
    const marker = data[offset + 1];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return [data.readUInt16BE(offset + 7), data.readUInt16BE(offset + 5)];
    }
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    offset += 2 + data.readUInt16BE(offset + 2);
  }
  throw new Error("JPEG dimensions were not found.");
};

test("1 approved hero source is valid and byte-identical", () => {
  assert.deepEqual(pngSize("frontend/public/sicher-hero.png"), [1774, 887]);
  assert.equal(sha256("frontend/public/sicher-hero.png"), "047de40db68791e04f840bcd9dc8d5346a4379bb3dc821de4e239692e9298a01");
});

test("2 served derivative keeps dimensions and materially reduces transfer size", () => {
  assert.deepEqual(jpegSize("frontend/public/sicher-hero-web.jpg"), [1774, 887]);
  assert.ok(statSync(file("frontend/public/sicher-hero-web.jpg")).size < statSync(file("frontend/public/sicher-hero.png")).size / 4);
});

test("3 home renders the optimized hero as decorative imagery", () => {
  const source = read("frontend/src/main.jsx");
  assert.match(source, /className="hero-image-wrap" aria-hidden="true"><img src="\/sicher-hero-web\.jpg" alt="" \/>/);
  assert.doesNotMatch(source, /hero-image-wrap hero-gradient/);
});

test("4 approved hero copy and Commitment #2 overlay remain", () => {
  const source = read("frontend/src/main.jsx");
  const home = source.slice(source.indexOf("function Home()"), source.indexOf("function Explore()"));
  for (const phrase of ["Proof,", "not promises.", "Make a measurable commitment.", "Sicher keeps the record.", "Start a proof", "Explore proofs"]) assert.match(home, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(home, /find\(\(item\) => item\.id === '2'\)/);
  assert.match(home, /<VerifiedProofCard commitment=\{breach\} featured \/>/);
});

test("5 image uses undistorted cover behavior and obsolete fallback is gone", () => {
  const css = read("frontend/src/styles.css");
  assert.match(css, /\.hero-image-wrap img \{[^}]*width: 100%;[^}]*height: 100%;[^}]*object-fit: cover;[^}]*object-position:/);
  assert.doesNotMatch(css, /\.hero-gradient|\.hero-image-wrap[^}]*radial-gradient/);
  assert.doesNotMatch(css, /\.hero-image-wrap img \{[^}]*animation:/);
});

test("6 obsolete Manus restoration TODO is resolved accurately", () => {
  const todo = read("frontend/TODO.md");
  assert.doesNotMatch(todo, /Restore the approved original Manus hero image/);
  assert.match(todo, /final approved Sicher hero replacement/);
  assert.match(todo, /not described as the original Manus asset/);
});
