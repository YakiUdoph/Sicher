import "dotenv/config";

const DEFAULT_ENDPOINTS = [
  { id: "hypedexer", url: "https://elysium-testnet-rpc.hypedexer.com" },
  { id: "kinetiq", url: "https://testnet-rpc.elysium.kinetiq.xyz" },
];
const SAMPLE_START = BigInt(process.env.PHASE6_BENCHMARK_START_BLOCK?.trim() || "8128175");
const SAMPLE_BLOCKS = Number(process.env.PHASE6_BENCHMARK_BLOCKS?.trim() || "10");
if (!Number.isSafeInteger(SAMPLE_BLOCKS) || SAMPLE_BLOCKS < 1 || SAMPLE_BLOCKS > 100) throw new Error("PHASE6_BENCHMARK_BLOCKS must be an integer from 1 through 100.");

type RpcResponse = { result?: unknown; error?: { code?: number; message?: string } };
async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json() as RpcResponse;
  if (payload.error) throw new Error(`RPC ${payload.error.code ?? "error"}: ${payload.error.message ?? "unknown"}`);
  if (!("result" in payload)) throw new Error("RPC result missing");
  return payload.result;
}
function compact(error: unknown): string { return error instanceof Error ? error.message : String(error); }

const configured = [
  process.env.PHASE6_RPC_A_URL && { id: process.env.PHASE6_RPC_A_NAME || "provider-a", url: process.env.PHASE6_RPC_A_URL },
  process.env.PHASE6_RPC_B_URL && { id: process.env.PHASE6_RPC_B_NAME || "provider-b", url: process.env.PHASE6_RPC_B_URL },
].filter(Boolean) as Array<{ id: string; url: string }>;
const endpoints = configured.length >= 2 ? configured : DEFAULT_ENDPOINTS;
const report = [];
for (const endpoint of endpoints) {
  const started = performance.now();
  let requests = 0;
  let successfulBlocks = 0;
  let receipts = 0;
  let rateLimits = 0;
  let fullBlocksSucceeded = 0;
  const errors: string[] = [];
  for (let offset = 0; offset < SAMPLE_BLOCKS; offset += 1) {
    const block = `0x${(SAMPLE_START + BigInt(offset)).toString(16)}`;
    try {
      requests += 2;
      const [value, fullBlock] = await Promise.all([rpc(endpoint.url, "eth_getBlockReceipts", [block]), rpc(endpoint.url, "eth_getBlockByNumber", [block, false])]);
      if (!Array.isArray(value)) throw new Error("non-array receipt result");
      if (!fullBlock || typeof fullBlock !== "object" || !Array.isArray((fullBlock as { transactions?: unknown[] }).transactions)) throw new Error("malformed full-block result");
      if (value.length !== (fullBlock as { transactions: unknown[] }).transactions.length) throw new Error("receipt count differs from enumerated transaction count");
      successfulBlocks += 1;
      fullBlocksSucceeded += 1;
      receipts += value.length;
    } catch (error) {
      const message = compact(error);
      if (/429|rate/i.test(message)) rateLimits += 1;
      errors.push(`${block}: ${message}`);
      break;
    }
  }
  report.push({
    provider: endpoint.id,
    method: "eth_getBlockReceipts",
    startBlock: SAMPLE_START.toString(),
    blocksRequested: SAMPLE_BLOCKS,
    blocksSucceeded: successfulBlocks,
    rpcRequests: requests,
    receiptCount: receipts,
    elapsedMs: Math.round(performance.now() - started),
    rateLimits,
    blockReceiptBatching: successfulBlocks > 0,
    archiveSampleAvailable: successfulBlocks === SAMPLE_BLOCKS,
    fullBlockEnumeration: { supported: fullBlocksSucceeded === SAMPLE_BLOCKS, blocksSucceeded: fullBlocksSucceeded },
    errors,
  });
}
console.log(JSON.stringify({ benchmark: "bounded-read-only", report }, null, 2));
