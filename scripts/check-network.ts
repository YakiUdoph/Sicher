import "dotenv/config";
import { createPublicClient, defineChain, http } from "viem";

const EXPECTED_CHAIN_ID = 99801;
const rpcUrl = process.env.ELYSIUM_RPC_URL?.trim();

type CheckStatus = "PASS" | "FAIL" | "ERROR";

function printSummary(checks: Array<[string, CheckStatus]>): void {
  console.log("\nSICHER ELYSIUM PHASE 1\n");

  for (const [name, status] of checks) {
    console.log(`[${status}] ${name}`);
  }

  const pass = checks.filter(([, status]) => status === "PASS").length;
  const fail = checks.filter(([, status]) => status === "FAIL").length;
  const error = checks.filter(([, status]) => status === "ERROR").length;

  console.log(`\nTOTAL: ${pass} PASS / ${fail} FAIL / ${error} ERROR`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

console.log("SICHER ELYSIUM NETWORK CHECK\n");

if (!rpcUrl) {
  console.log("RPC reachable: FAIL");
  console.log("Returned chain ID: unavailable");
  console.log(`Expected chain ID: ${EXPECTED_CHAIN_ID}`);
  console.log("Chain ID match: FAIL");
  console.log("Latest block: unavailable");
  console.error("\nError: ELYSIUM_RPC_URL is missing or empty.");
  printSummary([
    ["Dependencies installed", "PASS"],
    ["RPC reachable", "FAIL"],
    [`Chain ID = ${EXPECTED_CHAIN_ID}`, "FAIL"],
    ["Latest block retrieved", "FAIL"],
  ]);
  process.exitCode = 1;
} else {
  const elysiumTestnet = defineChain({
    id: EXPECTED_CHAIN_ID,
    name: "Kinetiq Elysium Testnet",
    nativeCurrency: {
      name: "HYPE",
      symbol: "HYPE",
      decimals: 18,
    },
    rpcUrls: {
      default: { http: [rpcUrl] },
    },
    testnet: true,
  });

  const client = createPublicClient({
    chain: elysiumTestnet,
    transport: http(rpcUrl),
  });

  const [chainIdResult, blockNumberResult] = await Promise.allSettled([
    client.getChainId(),
    client.getBlockNumber(),
  ]);

  const rpcReachable =
    chainIdResult.status === "fulfilled" ||
    blockNumberResult.status === "fulfilled";
  const returnedChainId =
    chainIdResult.status === "fulfilled" ? chainIdResult.value : undefined;
  const latestBlock =
    blockNumberResult.status === "fulfilled" ? blockNumberResult.value : undefined;
  const chainIdMatches = returnedChainId === EXPECTED_CHAIN_ID;

  console.log(`RPC reachable: ${rpcReachable ? "PASS" : "FAIL"}`);
  console.log(`Returned chain ID: ${returnedChainId ?? "unavailable"}`);
  console.log(`Expected chain ID: ${EXPECTED_CHAIN_ID}`);
  console.log(`Chain ID match: ${chainIdMatches ? "PASS" : "FAIL"}`);
  console.log(`Latest block: ${latestBlock ?? "unavailable"}`);

  if (chainIdResult.status === "rejected") {
    console.error(`\nChain ID request error: ${errorMessage(chainIdResult.reason)}`);
  }
  if (blockNumberResult.status === "rejected") {
    console.error(`\nLatest block request error: ${errorMessage(blockNumberResult.reason)}`);
  }

  printSummary([
    ["Dependencies installed", "PASS"],
    ["RPC reachable", rpcReachable ? "PASS" : "FAIL"],
    [`Chain ID = ${EXPECTED_CHAIN_ID}`, chainIdMatches ? "PASS" : "FAIL"],
    ["Latest block retrieved", latestBlock === undefined ? "FAIL" : "PASS"],
  ]);

  if (!rpcReachable || !chainIdMatches || latestBlock === undefined) {
    process.exitCode = 1;
  }
}
