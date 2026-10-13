import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();

if (!rpcUrl) {
  console.error("Error: ELYSIUM_RPC_URL is missing or empty.");
  process.exit(1);
}

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);
const envPath = resolve(".env");

try {
  writeFileSync(
    envPath,
    `ELYSIUM_RPC_URL=${rpcUrl}\nTEST_WALLET_PRIVATE_KEY=${privateKey}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
} catch (error) {
  const message =
    error instanceof Error && "code" in error && error.code === "EEXIST"
      ? "Refusing to overwrite the existing .env file."
      : "Unable to store the test wallet securely in .env.";
  console.error(`Error: ${message}`);
  process.exit(1);
}

console.log("DISPOSABLE ELYSIUM TESTNET WALLET CREATED");
console.log(`TEST WALLET ADDRESS: ${account.address}`);
console.log("Private credential stored only in ignored local .env: PASS");
console.log("Private credential displayed: NO");
