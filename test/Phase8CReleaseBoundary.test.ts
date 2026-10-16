import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { encodeAbiParameters, encodeEventTopics, encodeFunctionResult } from 'viem';
import { ELYSIUM_CHAIN_ID_HEX, REGISTRY_ABI, REGISTRY_ADDRESS, STEST_ADDRESS } from '../frontend/src/chainConfig.js';
import {
  ACCOUNT_CHANGED_MESSAGE, buildPendingTransaction, buildUnknownSendAttempt, CHAIN_CHANGED_MESSAGE,
  createSubmissionGuard, loadPendingTransaction, loadUnknownSendAttempt, persistPendingTransaction,
  persistUnknownSendAttempt, reconcilePendingTransaction, reconcileUnknownSendAttempt, submitCommitment, TX_STATE,
  UNKNOWN_SEND_MESSAGE,
} from '../frontend/src/commitmentTransaction.js';

const ROOT = resolve(import.meta.dirname, '..');
const ACCOUNT = '0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086';
const OTHER = '0x1111111111111111111111111111111111111111';
const HASH = `0x${'ab'.repeat(32)}`;
const HASH_TWO = `0x${'cd'.repeat(32)}`;
const HEAD = 8_710_397n;
const input = { subject: ACCOUNT, minimum: '80000', startBlock: '9000000', endBlock: '9015000' };
const FEES = async () => ({ maxFeePerGas: '0xbebc200', maxPriorityFeePerGas: '0x0' });
const source = (file: string) => readFileSync(resolve(ROOT, file), 'utf8');

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function eventLog(hash = HASH, id = 7n) {
  return {
    address: REGISTRY_ADDRESS, transactionHash: hash,
    topics: encodeEventTopics({ abi: REGISTRY_ABI, eventName: 'CommitmentCreated', args: { id, creator: ACCOUNT, subject: ACCOUNT } }),
    data: encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
      [STEST_ADDRESS, 80_000n * 10n ** 18n, 9_000_000n, 9_015_000n],
    ),
  };
}

function readback(id = 7n) {
  return encodeFunctionResult({ abi: REGISTRY_ABI, functionName: 'commitments', result: [id, ACCOUNT, ACCOUNT, STEST_ADDRESS, 80_000n * 10n ** 18n, 9_000_000n, 9_015_000n] });
}

function submitProvider(send: () => any, { account = ACCOUNT, secondChain = ELYSIUM_CHAIN_ID_HEX } = {}) {
  let chainReads = 0;
  return { request: async ({ method }: any) => {
    if (method === 'eth_chainId') { chainReads += 1; return chainReads === 1 ? ELYSIUM_CHAIN_ID_HEX : secondChain; }
    if (method === 'eth_accounts') return [account];
    if (method === 'eth_getTransactionCount') return '0x11';
    if (method === 'eth_call') return '0x';
    if (method === 'eth_estimateGas') return '0x5208';
    if (method === 'eth_getBalance') return '0x1';
    if (method === 'eth_sendTransaction') return send();
    throw new Error(method);
  } };
}

function recoveryProvider(logs: any[]) {
  let calls = 0;
  return { request: async ({ method, params }: any) => {
    if (method === 'eth_blockNumber') return '0x84ec20';
    if (method === 'eth_getLogs') return logs;
    if (method === 'eth_getTransactionByHash') return { from: ACCOUNT, nonce: '0x11' };
    if (method === 'eth_getTransactionReceipt') return { status: '0x1', logs: [logs[0]] };
    if (method === 'eth_call') { calls += 1; return readback(); }
    throw new Error(`${method}:${params?.length ?? 0}`);
  } };
}

test('1 explicit code 4001 is retryable, uses cancellation semantics, and leaves no unknown record', async () => {
  const storage = new MemoryStorage();
  const result = await submitCommitment(submitProvider(() => { throw Object.assign(new Error('cancel'), { code: 4001 }); }), input, ACCOUNT, undefined, { readHead: async () => HEAD, readFees: FEES, storage });
  assert.equal(result.state, TX_STATE.PRE_BROADCAST_FAILED); assert.equal(result.error, 'Transaction cancelled. Nothing was submitted.'); assert.equal(loadUnknownSendAttempt(storage), null);
});

for (const [number, label, error] of [[2, 'timeout', new Error('timeout')], [3, 'disconnect', Object.assign(new Error('disconnect'), { code: 4900 })], [4, 'internal error', Object.assign(new Error('internal'), { code: -32603 })]] as const) {
  test(`${number} generic ${label} before hash enters unknown-send and blocks immediate retry`, async () => {
    const storage = new MemoryStorage(); let sends = 0;
    const provider = submitProvider(() => { sends += 1; throw error; });
    const first = await submitCommitment(provider, input, ACCOUNT, undefined, { readHead: async () => HEAD, readFees: FEES, storage });
    const second = await submitCommitment(provider, input, ACCOUNT, undefined, { readHead: async () => HEAD, readFees: FEES, storage });
    assert.equal(first.state, TX_STATE.UNKNOWN_SEND); assert.equal(second.state, TX_STATE.UNKNOWN_SEND); assert.equal(sends, 1); assert.doesNotMatch(first.error, /nothing was submitted/i);
  });
}

test('5 unknown-send context is allowlisted public metadata with no secret material', () => {
  const attempt = buildUnknownSendAttempt(input, ACCOUNT, HEAD, 17n, 1);
  assert.deepEqual(Object.keys(attempt).sort(), ['attemptBlock', 'attemptedAt', 'chainId', 'endBlock', 'minimumBalance', 'preSendAccount', 'preSendNonce', 'registry', 'schema', 'sender', 'startBlock', 'subject', 'token'].sort());
  assert.doesNotMatch(JSON.stringify(attempt), /private|secret|seed|mnemonic|signature/i);
});

test('6 reload restores warning state and normal submit is guarded', async () => {
  const storage = new MemoryStorage(); const attempt = buildUnknownSendAttempt(input, ACCOUNT, HEAD, 17n, 1); persistUnknownSendAttempt(attempt, storage); let sends = 0;
  assert.equal(loadUnknownSendAttempt(storage)?.attemptedAt, 1);
  const result = await submitCommitment(submitProvider(() => { sends += 1; }), input, ACCOUNT, undefined, { readHead: async () => HEAD, readFees: FEES, storage });
  assert.equal(result.state, TX_STATE.UNKNOWN_SEND); assert.equal(sends, 0); assert.match(source('frontend/src/main.jsx'), /loadUnknownSendAttempt/);
});

test('7 one exact match recovers hash and ID through strict normal confirmation', async () => {
  const storage = new MemoryStorage(); const attempt = buildUnknownSendAttempt(input, ACCOUNT, HEAD, 17n, 1); persistUnknownSendAttempt(attempt, storage);
  const result = await reconcileUnknownSendAttempt(recoveryProvider([eventLog()]), attempt, undefined, { storage });
  assert.equal(result.state, TX_STATE.CONFIRMED); assert.equal(result.hash, HASH); assert.equal(result.commitment.id, 7n); assert.equal(loadUnknownSendAttempt(storage), null);
});

test('8 multiple exact matches produce explicit duplicate ambiguity and choose none', async () => {
  const storage = new MemoryStorage(); const attempt = buildUnknownSendAttempt(input, ACCOUNT, HEAD, 17n, 1); persistUnknownSendAttempt(attempt, storage);
  const result = await reconcileUnknownSendAttempt(recoveryProvider([eventLog(), eventLog(HASH_TWO, 8n)]), attempt, undefined, { storage });
  assert.equal(result.state, TX_STATE.UNKNOWN_SEND_DUPLICATE); assert.equal(result.matches, 2); assert.equal(loadPendingTransaction(storage), null); assert.ok(loadUnknownSendAttempt(storage));
});

test('9 no match remains unresolved and never becomes safe retry', async () => {
  const storage = new MemoryStorage(); const attempt = buildUnknownSendAttempt(input, ACCOUNT, HEAD, 17n, 1); persistUnknownSendAttempt(attempt, storage);
  const result = await reconcileUnknownSendAttempt(recoveryProvider([]), attempt, undefined, { storage });
  assert.equal(result.state, TX_STATE.UNKNOWN_SEND); assert.ok(loadUnknownSendAttempt(storage));
});

test('10 status reconciliation is read-only and never invokes eth_sendTransaction', async () => {
  const attempt = buildUnknownSendAttempt(input, ACCOUNT, HEAD, 17n, 1); let sends = 0;
  const provider: any = recoveryProvider([]); const original = provider.request; provider.request = async (args: any) => { if (args.method === 'eth_sendTransaction') sends += 1; return original(args); };
  await reconcileUnknownSendAttempt(provider, attempt); assert.equal(sends, 0);
});

test('11 account change immediately before send blocks the wallet request', async () => {
  let sends = 0; await assert.rejects(submitCommitment(submitProvider(() => { sends += 1; }, { account: OTHER }), input, ACCOUNT, undefined, { readHead: async () => HEAD, readFees: FEES }), new RegExp(ACCOUNT_CHANGED_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); assert.equal(sends, 0);
});

test('12 chain change immediately before send blocks the wallet request', async () => {
  let sends = 0; await assert.rejects(submitCommitment(submitProvider(() => { sends += 1; }, { secondChain: '0x1' }), input, ACCOUNT, undefined, { readHead: async () => HEAD, readFees: FEES }), new RegExp(CHAIN_CHANGED_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); assert.equal(sends, 0);
});

test('13 unchanged account and chain still permit one wallet request', async () => {
  let sends = 0; const result = await submitCommitment(submitProvider(() => { sends += 1; throw new Error('transport'); }), input, ACCOUNT, undefined, { readHead: async () => HEAD, readFees: FEES }); assert.equal(sends, 1); assert.equal(result.state, TX_STATE.UNKNOWN_SEND);
});

test('14 synchronous guard still collapses rapid double activation', async () => {
  const guard = createSubmissionGuard(); let calls = 0; let release!: () => void; const hold = new Promise<void>((resolve) => { release = resolve; });
  const run = () => guard.run(async () => { calls += 1; await hold; }); const one = run(); const two = run(); release(); await Promise.all([one, two]); assert.equal(calls, 1);
});

test('15 known-hash ambiguous reconciliation remains read-only and protected', async () => {
  const storage = new MemoryStorage(); const pending = buildPendingTransaction(input, ACCOUNT, HASH, 1); persistPendingTransaction(pending, storage); let sends = 0;
  const result = await reconcilePendingTransaction({ request: async ({ method }: any) => { if (method === 'eth_sendTransaction') sends += 1; if (method === 'eth_getTransactionReceipt') return null; throw new Error(method); } }, pending, undefined, { storage });
  assert.equal(result.state, TX_STATE.AMBIGUOUS); assert.equal(sends, 0); assert.ok(loadPendingTransaction(storage));
});

test('16 lifecycle copy discloses safe off-browser verification and publication', () => {
  const main = source('frontend/src/main.jsx'); assert.match(main, /After its block window ends, Sicher’s off-browser process checks the history and publishes a result only when validation safely completes/); assert.doesNotMatch(main, /operator-run verification|In this competition build/);
});

test('17 public-record disclosure is present before the transaction CTA', () => {
  const main = source('frontend/src/main.jsx'); const disclosure = main.indexOf('Public Elysium Testnet record'); const cta = main.indexOf('Review in wallet and start');
  assert.ok(disclosure > 0); assert.ok(main.indexOf('public testnet blockchain', disclosure) > disclosure); assert.ok(main.indexOf('cannot edit or delete', disclosure) > disclosure); assert.ok(disclosure < main.lastIndexOf('onClick={submit}')); assert.ok(cta > 0);
});

test('18 STEST remains a demonstration test token without a launch claim', () => {
  const main = source('frontend/src/main.jsx'); assert.match(main, /STEST is used only for testnet proof demonstrations; it is not a launched economic token/); assert.doesNotMatch(main, /launched \$SICHER|mainnet token/i);
});

test('19 Vercel config provides a deep-route SPA fallback', () => {
  const config = JSON.parse(source('frontend/vercel.json')); assert.deepEqual(config.routes[0], { handle: 'filesystem' }); assert.deepEqual(config.routes[1], { src: '/.*', dest: '/index.html' }); assert.equal(config.outputDirectory, 'dist');
});

test('20 Vercel filesystem handling precedes fallback so public assets are preserved', () => {
  const config = JSON.parse(source('frontend/vercel.json')); assert.equal(config.routes.findIndex((route: any) => route.handle === 'filesystem'), 0); assert.equal(config.routes.at(-1).dest, '/index.html');
  for (const asset of ['frontend/public/data/commitments.json', 'frontend/public/sicher-logo.png', 'frontend/public/sicher-hero-web.jpg']) assert.doesNotThrow(() => source(asset));
});

test('21 malformed provider hash response remains unknown and blocks retry', async () => {
  const storage = new MemoryStorage(); let sends = 0; const provider = submitProvider(() => { sends += 1; return 'malformed'; });
  const result = await submitCommitment(provider, input, ACCOUNT, undefined, { readHead: async () => HEAD, readFees: FEES, storage });
  assert.equal(result.state, TX_STATE.UNKNOWN_SEND); assert.equal(result.error, UNKNOWN_SEND_MESSAGE); assert.ok(loadUnknownSendAttempt(storage));
});
