import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const source = readFileSync(resolve("contracts/SicherTestReturnHelper.sol"), "utf8");
const verifier = readFileSync(resolve("scripts/historical-min-balance-verifier.ts"), "utf8");
const core = readFileSync(resolve("scripts/min-balance-core.ts"), "utf8");
const artifact = JSON.parse(readFileSync(resolve("artifacts/SicherTestReturnHelper.json"), "utf8")) as { bytecode: string; deployedBytecode: string };
const fingerprints = {
  algorithm: "sha256",
  helperSourceSha256: digest(source),
  helperCreationBytecodeSha256: digest(artifact.bytecode),
  helperRuntimeBytecodeSha256: digest(artifact.deployedBytecode),
  historicalVerifierSha256: digest(verifier),
  reconstructionCoreSha256: digest(core),
};
writeFileSync(resolve("artifacts/SicherTestReturnHelper.fingerprints.json"), `${JSON.stringify(fingerprints, null, 2)}\n`, "utf8");

const manifestPath = resolve("evidence/phase5-min-balance.manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.verifier.fingerprintSha256 = fingerprints.historicalVerifierSha256;
manifest.verifier.reconstructionCoreFingerprintSha256 = fingerprints.reconstructionCoreSha256;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log("SICHER PHASE 5 FINGERPRINTS");
for (const [name, value] of Object.entries(fingerprints)) console.log(`${name}: ${value}`);
