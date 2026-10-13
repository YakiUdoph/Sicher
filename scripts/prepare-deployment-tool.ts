import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const artifact = JSON.parse(
  readFileSync(resolve("artifacts/SicherCommitmentProof.json"), "utf8"),
) as {
  contractName: string;
  compilerVersion: string;
  bytecode: string;
  bytecodeSizeBytes: number;
};
const fingerprints = JSON.parse(
  readFileSync(resolve("artifacts/build-fingerprints.json"), "utf8"),
) as {
  creationBytecodeSha256: string;
  runtimeBytecodeSha256: string;
  sourceSha256: string;
};

const config = {
  contractName: artifact.contractName,
  compilerVersion: artifact.compilerVersion,
  expectedChainId: 99801,
  expectedChainIdHex: "0x185d9",
  requiredDeployer: "0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086",
  constructorArguments: "NONE",
  creationBytecode: artifact.bytecode,
  creationBytecodeSizeBytes: artifact.bytecodeSizeBytes,
  sourceSha256: fingerprints.sourceSha256,
  creationBytecodeSha256: fingerprints.creationBytecodeSha256,
  runtimeBytecodeSha256: fingerprints.runtimeBytecodeSha256,
};

writeFileSync(
  resolve("deployment-tool/deployment-config.json"),
  `${JSON.stringify(config, null, 2)}\n`,
  "utf8",
);

console.log("LOCAL DEPLOYMENT TOOL CONFIG PREPARED");
console.log(`Contract: ${config.contractName}`);
console.log(`Compiler: ${config.compilerVersion}`);
console.log(`Required chain ID: ${config.expectedChainId}`);
console.log(`Required deployer: ${config.requiredDeployer}`);
console.log(`Constructor arguments: ${config.constructorArguments}`);
console.log(`Creation bytecode SHA-256: ${config.creationBytecodeSha256}`);
console.log("Deployment triggered: NO");
