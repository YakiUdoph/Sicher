import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const sourcePath = resolve("contracts/SicherCommitmentProof.sol");
const artifactPath = resolve("artifacts/SicherCommitmentProof.json");
const fingerprintsPath = resolve("artifacts/build-fingerprints.json");
const source = readFileSync(sourcePath);
const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as {
  compilerVersion: string;
  bytecode: string;
  deployedBytecode: string;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function bytecodeBytes(value: string): Buffer {
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(value)) {
    throw new Error("Artifact contains invalid bytecode.");
  }
  return Buffer.from(value.slice(2), "hex");
}

const fingerprints = {
  compilerVersion: artifact.compilerVersion,
  sourceSha256: sha256(source),
  creationBytecodeSha256: sha256(bytecodeBytes(artifact.bytecode)),
  runtimeBytecodeSha256: sha256(bytecodeBytes(artifact.deployedBytecode)),
};

writeFileSync(
  fingerprintsPath,
  `${JSON.stringify(fingerprints, null, 2)}\n`,
  "utf8",
);

console.log("SICHER CONTRACT BUILD FINGERPRINTS");
console.log(`Solidity compiler: ${fingerprints.compilerVersion}`);
console.log(`Source SHA-256: ${fingerprints.sourceSha256}`);
console.log(
  `Creation bytecode SHA-256: ${fingerprints.creationBytecodeSha256}`,
);
console.log(`Runtime bytecode SHA-256: ${fingerprints.runtimeBytecodeSha256}`);
console.log(`Fingerprints artifact: ${fingerprintsPath}`);
