import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { sha256Canonical } from "../scripts/phase6-evidence-core.ts";
import {
  FrontendDataPreparationError,
  prepareVerifiedCommitment,
  prepareVerifiedCommitments,
  readJsonArtifact,
} from "../scripts/phase7-prepare-frontend-data.ts";
import {
  VERIFIED_COMMITMENTS_SCHEMA,
  VerifiedCommitmentDataError,
  getVerifiedCommitment,
  validateVerifiedCommitmentsDocument,
} from "../frontend/src/verifiedCommitments.ts";

const ROOT = resolve(".");
const RECEIPT_1 = "evidence/phase6b2-commitment1-receipt-v3.json";
const RECEIPT_2 = "evidence/phase6b2-commitment2-receipt-v3.json";
const FREEZE = "evidence/phase6-competition-freeze.json";
const CROSSCHECK = "evidence/phase6b2-phase5-phase6-crosscheck.json";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const envelope1 = readJsonArtifact(resolve(ROOT, RECEIPT_1));
const envelope2 = readJsonArtifact(resolve(ROOT, RECEIPT_2));
const freeze = readJsonArtifact(resolve(ROOT, FREEZE));
const crosscheck = readJsonArtifact(resolve(ROOT, CROSSCHECK));
const prepared = prepareVerifiedCommitments(ROOT);
const one = prepared.commitments["1"];
const two = prepared.commitments["2"];

const responseFor = (value: unknown, status = 200): Promise<Response> => Promise.resolve(new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json" },
}));

function resignEnvelope(value: unknown, mutation: Record<string, unknown>): { envelope: Record<string, unknown>; digest: string } {
  const envelope = clone(value) as Record<string, unknown>;
  const receipt = { ...(envelope.receipt as Record<string, unknown>), ...mutation };
  const { receiptDigest: _old, ...unsigned } = receipt;
  const digest = sha256Canonical(unsigned);
  envelope.receipt = { ...unsigned, receiptDigest: digest };
  return { envelope, digest };
}

test("1 Commitment #1 validates and prepares", () => assert.equal(one.id, "1"));
test("2 Commitment #2 validates and prepares", () => assert.equal(two.id, "2"));
test("3 Commitment #1 result is PROVEN", () => assert.equal(one.proofResult, "PROVEN"));
test("4 Commitment #2 result is NOT_PROVEN", () => assert.equal(two.proofResult, "NOT_PROVEN"));
test("5 Commitment #1 assurance is CORROBORATED", () => assert.equal(one.assuranceLevel, "CORROBORATED"));
test("6 Commitment #2 assurance is CORROBORATED", () => assert.equal(two.assuranceLevel, "CORROBORATED"));
test("7 Commitment #2 minimum is 15,000 STEST", () => {
  assert.equal(two.minimumObservedBaseUnits, "15000000000000000000000");
  assert.equal(two.minimumObservedFormatted, "15,000 STEST");
});
test("8 Commitment #2 final balance is 100,000 STEST", () => {
  assert.equal(two.finalBalanceBaseUnits, "100000000000000000000000");
  assert.equal(two.finalBalanceFormatted, "100,000 STEST");
});
test("9 Commitment #2 breach remains OBSERVED", () => assert.equal(two.breachStatus, "OBSERVED"));

test("10 unknown ID fails with NOT_FOUND", async () => {
  await assert.rejects(
    getVerifiedCommitment("999", { fetchImpl: () => responseFor(prepared) }),
    (error: unknown) => error instanceof VerifiedCommitmentDataError && error.code === "NOT_FOUND",
  );
});

test("11 missing artifact fails closed", () => {
  assert.throws(() => readJsonArtifact(resolve(ROOT, "evidence/does-not-exist.json")), FrontendDataPreparationError);
});

test("12 malformed artifact fails closed", () => {
  const directory = mkdtempSync(join(tmpdir(), "sicher-phase7-"));
  const path = join(directory, "malformed.json");
  try {
    writeFileSync(path, "{not-json", "utf8");
    assert.throws(() => readJsonArtifact(path), FrontendDataPreparationError);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("13 tampered receipt fails closed", () => {
  const tampered = clone(envelope1) as Record<string, unknown>;
  (tampered.receipt as Record<string, unknown>).minimumObservedBaseUnits = "1";
  assert.throws(() => prepareVerifiedCommitment({ envelopeValue: tampered, freezeValue: freeze, receiptArtifact: RECEIPT_1 }), /Receipt V3 validation failed/);
});

test("14 receipt digest mismatch fails closed", () => {
  const tampered = clone(envelope1) as Record<string, unknown>;
  (tampered.receipt as Record<string, unknown>).receiptDigest = "0".repeat(64);
  assert.throws(() => prepareVerifiedCommitment({ envelopeValue: tampered, freezeValue: freeze, receiptArtifact: RECEIPT_1 }), /receiptDigest mismatch/);
});

test("15 verifier fingerprint mismatch fails closed", () => {
  const altered = resignEnvelope(envelope1, { verifierFingerprint: "0".repeat(64) });
  const alteredFreeze = clone(freeze) as Record<string, unknown>;
  (alteredFreeze.commitment1 as Record<string, unknown>).receiptDigest = altered.digest;
  assert.throws(() => prepareVerifiedCommitment({ envelopeValue: altered.envelope, freezeValue: alteredFreeze, receiptArtifact: RECEIPT_1 }), /fingerprint mismatch/);
});

test("16 generated JSON contains no private signing material or provider endpoints", () => {
  const json = JSON.stringify(prepared);
  assert.doesNotMatch(json, /private[_-]?key|mnemonic|seed[_-]?phrase|access[_-]?token|api[_-]?key|password/i);
  assert.doesNotMatch(json, /"endpoint"\s*:|https?:\/\//i);
});

test("17 frontend loader returns authoritative result without calculating it", async () => {
  const loaded = await getVerifiedCommitment("2", { fetchImpl: () => responseFor(prepared) });
  assert.equal(loaded.proofResult, two.proofResult);
  assert.equal(loaded.breachStatus, two.breachStatus);
});

test("18 changing an explanatory path cannot change proofResult", () => {
  const changed = clone(prepared) as unknown as { schemaVersion: string; commitments: Record<string, Record<string, unknown>> };
  changed.commitments["2"].pathBaseUnits = ["100000000000000000000000"];
  changed.commitments["2"].pathFormatted = ["100,000 STEST"];
  const validated = validateVerifiedCommitmentsDocument(changed);
  assert.equal(validated.commitments["2"].proofResult, "NOT_PROVEN");
});

test("19 invalid path provenance cannot be exposed", () => {
  const invalid = clone(prepared) as unknown as { schemaVersion: string; commitments: Record<string, Record<string, unknown>> };
  invalid.commitments["2"].pathProvenance = { validated: false, method: "FROZEN_PHASE5_PHASE6_CROSSCHECK", sources: [CROSSCHECK] };
  assert.throws(() => validateVerifiedCommitmentsDocument(invalid), /Validated path provenance is required/);
});

test("20 official Commitment #2 path is bound exactly", () => {
  assert.deepEqual(two.pathBaseUnits, [
    "100000000000000000000000",
    "92000000000000000000000",
    "15000000000000000000000",
    "100000000000000000000000",
  ]);
  assert.equal(two.pathProvenance?.method, "FROZEN_PHASE5_PHASE6_CROSSCHECK");
});

test("21 missing prepared JSON is unavailable", async () => {
  await assert.rejects(
    getVerifiedCommitment("1", { fetchImpl: () => responseFor({}, 404) }),
    (error: unknown) => error instanceof VerifiedCommitmentDataError && error.code === "UNAVAILABLE",
  );
});

test("22 malformed prepared JSON is rejected", async () => {
  const fetchImpl = (): Promise<Response> => Promise.resolve(new Response("{", { status: 200, headers: { "content-type": "application/json" } }));
  await assert.rejects(
    getVerifiedCommitment("1", { fetchImpl }),
    (error: unknown) => error instanceof VerifiedCommitmentDataError && error.code === "MALFORMED",
  );
});

test("23 unsupported prepared schema is rejected", async () => {
  await assert.rejects(
    getVerifiedCommitment("1", { fetchImpl: () => responseFor({ ...prepared, schemaVersion: "unsupported" }) }),
    (error: unknown) => error instanceof VerifiedCommitmentDataError && error.code === "UNSUPPORTED_SCHEMA",
  );
});

test("24 Commitment #1 path is bound to digest-checked evidence and frozen reconstruction", () => {
  assert.deepEqual(one.pathBaseUnits, ["100000000000000000000000", "92000000000000000000000"]);
  assert.equal(one.pathProvenance?.method, "FROZEN_RECONSTRUCTION_CORE");
});

test("25 prepared document uses the supported collection schema", () => assert.equal(prepared.schemaVersion, VERIFIED_COMMITMENTS_SCHEMA));

test("26 Commitment #2 direct preparation requires the frozen cross-check", () => {
  assert.throws(() => prepareVerifiedCommitment({ envelopeValue: envelope2, freezeValue: freeze, receiptArtifact: RECEIPT_2 }), /cross-check is invalid/);
  const direct = prepareVerifiedCommitment({ envelopeValue: envelope2, freezeValue: freeze, receiptArtifact: RECEIPT_2, crosscheckValue: crosscheck });
  assert.equal(direct.proofResult, "NOT_PROVEN");
});
