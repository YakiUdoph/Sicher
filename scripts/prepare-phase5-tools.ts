import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { encodeAbiParameters, getAddress, parseAbiParameters, toFunctionSelector, type Abi, type Hex } from "viem";

const SUBJECT = "0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086";
const TOKEN = "0x14fc373Dce148766a3B8d9C2BF5f02F8dbe316a7";
const SICHER = "0x4e4887e28a8370678a9a37c08a85c65450b510c0";
const SETUP_SINK = "0x000000000000000000000000000000000000dEaD";
const helperAddress = getAddress("0x9A39b6B2D458212b3f0d3247C98130b2192068D0");
const artifact = JSON.parse(readFileSync(resolve("artifacts/SicherTestReturnHelper.json"), "utf8")) as { abi: Abi; bytecode: Hex; compilerVersion: string };
const fingerprints = JSON.parse(readFileSync(resolve("artifacts/SicherTestReturnHelper.fingerprints.json"), "utf8")) as {
  helperSourceSha256: string;
  helperCreationBytecodeSha256: string;
  helperRuntimeBytecodeSha256: string;
};
const constructorArguments = encodeAbiParameters(parseAbiParameters("address token, address subject"), [TOKEN, SUBJECT]);
const helperCreationData = `${artifact.bytecode}${constructorArguments.slice(2)}`;
const config = {
  expectedChainId: 99801,
  expectedChainIdHex: "0x185d9",
  subject: SUBJECT,
  token: TOKEN,
  sicherContract: SICHER,
  setupSink: SETUP_SINK,
  setupAmount: "900000000000000000000000",
  setupTransaction: "0x77e9247f84e4bc22a69ba466548cf7b952e762d1705c47a5c04f743e2b2f768a",
  setupBlock: "8110482",
  startingBalance: "100000000000000000000000",
  minimumBalance: "80000000000000000000000",
  firstTransferAmount: "8000000000000000000000",
  secondTransferAmount: "77000000000000000000000",
  restoreAmount: "85000000000000000000000",
  helperAddress,
  helperCreationData,
  helperCompilerVersion: artifact.compilerVersion,
  helperSourceSha256: fingerprints.helperSourceSha256,
  helperCreationBytecodeSha256: fingerprints.helperCreationBytecodeSha256,
  helperRuntimeBytecodeSha256: fingerprints.helperRuntimeBytecodeSha256,
  helperConstructorArguments: { token: TOKEN, subject: SUBJECT },
  selectors: {
    balanceOf: toFunctionSelector("balanceOf(address)"),
    transfer: toFunctionSelector("transfer(address,uint256)"),
    createCommitment: toFunctionSelector("createCommitment(address,address,uint256,uint256,uint256)"),
    commitments: toFunctionSelector("commitments(uint256)"),
    nextCommitmentId: toFunctionSelector("nextCommitmentId()"),
    restore: toFunctionSelector("restore()"),
    restored: toFunctionSelector("restored()"),
  },
};
writeFileSync(resolve("phase5-tool/config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log("SICHER PHASE 5 LOCAL TOOL CONFIG PREPARED");
console.log(`Subject: ${config.subject}`);
console.log(`Token: ${config.token}`);
console.log(`Setup sink: ${config.setupSink} (unrecoverable test recipient)`);
console.log(`Return helper: ${config.helperAddress ?? "PENDING DEPLOYMENT — experiment actions disabled"}`);
console.log("Transaction signed: NO");
console.log("Transaction broadcast: NO");
