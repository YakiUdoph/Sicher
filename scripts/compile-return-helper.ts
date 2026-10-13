import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import solc from "solc";

const sourceName = "contracts/SicherTestReturnHelper.sol";
const contractName = "SicherTestReturnHelper";
const artifactPath = resolve("artifacts/SicherTestReturnHelper.json");
const input = {
  language: "Solidity",
  sources: { [sourceName]: { content: readFileSync(resolve(sourceName), "utf8") } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "": ["ast"],
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object", "evm.deployedBytecode.immutableReferences"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const diagnostics = (output.errors ?? []) as Array<{ severity: string; formattedMessage: string }>;
for (const diagnostic of diagnostics) {
  (diagnostic.severity === "error" ? console.error : console.warn)(diagnostic.formattedMessage.trim());
}
if (diagnostics.some(({ severity }) => severity === "error")) process.exit(1);

const compiled = output.contracts?.[sourceName]?.[contractName];
if (!compiled) throw new Error("Compiler output did not contain SicherTestReturnHelper.");
const bytecode = compiled.evm.bytecode.object as string;
const deployedBytecode = compiled.evm.deployedBytecode.object as string;
const immutableNamesById: Record<string, string> = {};
function collectImmutableNames(node: unknown): void {
  if (!node || typeof node !== "object") return;
  const value = node as Record<string, unknown>;
  if (value.nodeType === "VariableDeclaration" && value.mutability === "immutable" && typeof value.id === "number" && typeof value.name === "string") {
    immutableNamesById[String(value.id)] = value.name;
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach(collectImmutableNames);
    else if (child && typeof child === "object") collectImmutableNames(child);
  }
}
collectImmutableNames(output.sources?.[sourceName]?.ast);
const artifact = {
  contractName,
  sourceName,
  compilerVersion: solc.version(),
  purpose: "Phase 5 test infrastructure only; fixed 85,000 STEST return to fixed subject",
  abi: compiled.abi,
  bytecode: `0x${bytecode}`,
  deployedBytecode: `0x${deployedBytecode}`,
  immutableReferences: compiled.evm.deployedBytecode.immutableReferences,
  immutableNamesById,
  bytecodeSizeBytes: bytecode.length / 2,
  runtimeBytecodeSizeBytes: deployedBytecode.length / 2,
};
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log("SICHER PHASE 5 RETURN HELPER COMPILATION");
console.log(`Compiler: ${artifact.compilerVersion}`);
console.log(`Creation bytecode: ${artifact.bytecodeSizeBytes} bytes`);
console.log(`Runtime bytecode: ${artifact.runtimeBytecodeSizeBytes} bytes`);
console.log(`Artifact: ${artifactPath}`);
console.log("Helper deployed: NO");
