import { decodeFunctionResult, encodeFunctionData } from 'viem';
import { REGISTRY_ABI, REGISTRY_ADDRESS } from '../frontend/src/chainConfig.js';
import { buildPendingTransaction, reconcilePendingTransaction } from '../frontend/src/commitmentTransaction.js';

const RPC_URLS = ['https://testnet-rpc.elysium.kinetiq.xyz', 'https://elysium-testnet-rpc.hypedexer.com'];
const ACCOUNT = '0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086';
const HASH_7 = '0x5322d6e6069d4f446840a3862389ed273a78c8485f1ab2d5ecd384d73d5764c3';
const allowedMethods = new Set(['eth_getTransactionReceipt', 'eth_call']);
let requestId = 0;
let lastRpcUrl = '';

const provider = {
  async request({ method, params = [] }: { method: string; params?: unknown[] }) {
    if (!allowedMethods.has(method)) throw new Error(`Read-only check blocked RPC method ${method}.`);
    let lastError: unknown;
    for (const rpcUrl of RPC_URLS) {
      try {
        const response = await fetch(rpcUrl, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
        });
        const payload = await response.json();
        if (payload.error) throw new Error(payload.error.message);
        lastRpcUrl = rpcUrl;
        return payload.result;
      } catch (error) { lastError = error; }
    }
    throw lastError;
  },
};

const pending = buildPendingTransaction({ subject: ACCOUNT, minimum: '80000', startBlock: '8726278', endBlock: '8729278' }, ACCOUNT, HASH_7, 1_791_938_410_000);
const result = await reconcilePendingTransaction(provider, pending);
const nextIdAbi = [{ type: 'function', name: 'nextCommitmentId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }] as const;
const data = encodeFunctionData({ abi: nextIdAbi, functionName: 'nextCommitmentId' });
const raw = await provider.request({ method: 'eth_call', params: [{ to: REGISTRY_ADDRESS, data }, 'latest'] });
const nextCommitmentId = decodeFunctionResult({ abi: nextIdAbi, functionName: 'nextCommitmentId', data: raw as `0x${string}` });
const eightData = encodeFunctionData({ abi: REGISTRY_ABI, functionName: 'commitments', args: [8n] });
const eightRaw = await provider.request({ method: 'eth_call', params: [{ to: REGISTRY_ADDRESS, data: eightData }, 'latest'] });
const commitment8 = decodeFunctionResult({ abi: REGISTRY_ABI, functionName: 'commitments', data: eightRaw as `0x${string}` }) as readonly [bigint, ...unknown[]];

console.log(JSON.stringify({
  state: result.state, hash: result.hash, commitmentId: result.commitment?.id?.toString(),
  creator: result.commitment?.creator, subject: result.commitment?.subject, token: result.commitment?.token,
  minimumBalance: result.commitment?.minimumBalance?.toString(), startBlock: result.commitment?.startBlock?.toString(),
  endBlock: result.commitment?.endBlock?.toString(), nextCommitmentId: nextCommitmentId.toString(), commitment8Exists: commitment8[0] !== 0n,
  lastRpcUrl,
}, null, 2));
