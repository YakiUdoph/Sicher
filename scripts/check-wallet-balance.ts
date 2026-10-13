import "dotenv/config";
import { createPublicClient, defineChain, formatEther, http } from "viem";
import {
  INTENDED_TEST_WALLET,
  OLD_TEST_WALLET,
  OLD_TEST_WALLET_STATUS,
} from "./phase2-wallet-config.ts";

const EXPECTED_CHAIN_ID = 99801;
const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();

if (!rpcUrl) {
  console.error("Error: ELYSIUM_RPC_URL is missing or empty.");
  process.exit(1);
}

const elysiumTestnet = defineChain({
  id: EXPECTED_CHAIN_ID,
  name: "Kinetiq Elysium Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  testnet: true,
});
const client = createPublicClient({
  chain: elysiumTestnet,
  transport: http(rpcUrl),
});

try {
  const chainId = await client.getChainId();

  if (chainId !== EXPECTED_CHAIN_ID) {
    console.error("SICHER PHASE 2 — WALLET REPLACEMENT CHECK");
    console.error(`\nOLD WALLET:\n${OLD_TEST_WALLET}`);
    console.error(`\nSTATUS:\n${OLD_TEST_WALLET_STATUS}`);
    console.error(`\nNEW WALLET:\n${INTENDED_TEST_WALLET}`);
    console.error(`\nCHAIN ID:\n${chainId}`);
    console.error("\nCHAIN CHECK:\nFAIL");
    console.error("\nNEW WALLET BALANCE:\nunavailable");
    console.error("\nSIGNING ACCESS:\nNOT CONFIGURED");
    console.error("\nREAD ACCESS:\nFAIL");
    process.exit(1);
  }

  const balance = await client.getBalance({ address: INTENDED_TEST_WALLET });

  console.log("SICHER PHASE 2 — WALLET REPLACEMENT CHECK");
  console.log(`\nOLD WALLET:\n${OLD_TEST_WALLET}`);
  console.log(`\nSTATUS:\n${OLD_TEST_WALLET_STATUS}`);
  console.log(`\nNEW WALLET:\n${INTENDED_TEST_WALLET}`);
  console.log(`\nCHAIN ID:\n${chainId}`);
  console.log("\nCHAIN CHECK:\nPASS");
  console.log(
    `\nNEW WALLET BALANCE:\n${formatEther(balance)} HYPE (${balance} wei)`,
  );
  console.log("\nSIGNING ACCESS:\nNOT CONFIGURED");
  console.log("\nREAD ACCESS:\nPASS");
} catch (error) {
  console.error("SICHER PHASE 2 — WALLET REPLACEMENT CHECK");
  console.error("\nREAD ACCESS:\nFAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
