import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const artifact = JSON.parse(
  readFileSync(resolve("artifacts/SicherTestToken.json"), "utf8"),
) as {
  contractName: string;
  compilerVersion: string;
  bytecode: string;
  bytecodeSizeBytes: number;
};
const fingerprints = JSON.parse(
  readFileSync(resolve("artifacts/SicherTestToken.fingerprints.json"), "utf8"),
) as {
  sourceSha256: string;
  creationBytecodeSha256: string;
  runtimeBytecodeSha256: string;
};
const config = {
  contractName: artifact.contractName,
  tokenName: "Sicher Test Token",
  tokenSymbol: "STEST",
  decimals: 18,
  initialSupplyTokens: "1000000",
  initialSupplyBaseUnits: "1000000000000000000000000",
  constructorBehavior: "Mint the fixed 1,000,000 STEST supply to msg.sender",
  constructorArguments: "NONE",
  compilerVersion: artifact.compilerVersion,
  expectedChainId: 99801,
  expectedChainIdHex: "0x185d9",
  requiredDeployer: "0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086",
  creationBytecode: artifact.bytecode,
  creationBytecodeSizeBytes: artifact.bytecodeSizeBytes,
  ...fingerprints,
};
writeFileSync(
  resolve("deployment-tool/token-deployment-config.json"),
  `${JSON.stringify(config, null, 2)}\n`,
  "utf8",
);

console.log("SICHER TEST TOKEN DEPLOYMENT CONFIG PREPARED");
console.log(`Token: ${config.tokenName} (${config.tokenSymbol})`);
console.log(`Initial supply: ${config.initialSupplyTokens} ${config.tokenSymbol}`);
console.log(`Constructor arguments: ${config.constructorArguments}`);
console.log(`Creation bytecode SHA-256: ${config.creationBytecodeSha256}`);
console.log("Deployment triggered: NO");
