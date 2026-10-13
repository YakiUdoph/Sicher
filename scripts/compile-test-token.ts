import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import solc from "solc";

const sourceName = "contracts/SicherTestToken.sol";
const contractName = "SicherTestToken";
const sourcePath = resolve(sourceName);
const artifactPath = resolve("artifacts/SicherTestToken.json");
const input = {
  language: "Solidity",
  sources: { [sourceName]: { content: readFileSync(sourcePath, "utf8") } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object", "metadata"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const diagnostics = (output.errors ?? []) as Array<{
  severity: string;
  formattedMessage: string;
}>;
for (const diagnostic of diagnostics) {
  const log = diagnostic.severity === "error" ? console.error : console.warn;
  log(diagnostic.formattedMessage.trim());
}
if (diagnostics.some(({ severity }) => severity === "error")) process.exit(1);

const compiled = output.contracts?.[sourceName]?.[contractName];
if (!compiled) throw new Error("Compiler output did not contain SicherTestToken.");
const bytecode = compiled.evm.bytecode.object as string;
const deployedBytecode = compiled.evm.deployedBytecode.object as string;
const artifact = {
  contractName,
  sourceName,
  compilerVersion: solc.version(),
  implementation: "Direct conventional fixed-supply ERC-20",
  dependencyVersion: "NONE",
  abi: compiled.abi,
  bytecode: `0x${bytecode}`,
  deployedBytecode: `0x${deployedBytecode}`,
  bytecodeSizeBytes: bytecode.length / 2,
  runtimeBytecodeSizeBytes: deployedBytecode.length / 2,
};
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

console.log("SICHER TEST TOKEN COMPILATION");
console.log(`Solidity compiler: ${artifact.compilerVersion}`);
console.log(`ERC-20 implementation: ${artifact.implementation}`);
console.log(`Dependency version: ${artifact.dependencyVersion}`);
console.log(`Creation bytecode size: ${artifact.bytecodeSizeBytes} bytes`);
console.log(`Runtime bytecode size: ${artifact.runtimeBytecodeSizeBytes} bytes`);
console.log(`ABI entries: ${artifact.abi.length}`);
console.log("ABI generation: PASS");
console.log(`Artifact: ${artifactPath}`);
