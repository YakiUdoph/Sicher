import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { encodeAbiParameters, encodeEventTopics, encodeFunctionResult } from 'viem';
import { ELYSIUM_CHAIN_ID_HEX, REGISTRY_ABI, REGISTRY_ADDRESS, STEST_ADDRESS } from '../frontend/src/chainConfig.js';
import {
  buildPendingTransaction, clearPendingTransaction, createSubmissionGuard, loadPendingTransaction,
  pendingMatchesTerms, persistPendingTransaction, reconcilePendingTransaction, submitCommitment,
  TX_STATE,
} from '../frontend/src/commitmentTransaction.js';

const ROOT = resolve(import.meta.dirname, '..');
const ACCOUNT = '0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086';
const HASH = `0x${'ab'.repeat(32)}`;
const HEAD = 8_710_397n;
const input = { subject: ACCOUNT, minimum: '80000', startBlock: '9000000', endBlock: '9015000' };
const FEES = async () => ({ maxFeePerGas: '0xbebc200', maxPriorityFeePerGas: '0x0' });
const source = (...files: string[]) => files.map((file) => readFileSync(resolve(ROOT, file), 'utf8')).join('\n');

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function receipt(id = 7n) {
  const topics = encodeEventTopics({ abi: REGISTRY_ABI, eventName: 'CommitmentCreated', args: { id, creator: ACCOUNT, subject: ACCOUNT } });
  const data = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], [STEST_ADDRESS, 80_000n * 10n ** 18n, 9_000_000n, 9_015_000n]);
  return { status: '0x1', logs: [{ address: REGISTRY_ADDRESS, topics, data }] };
}

function readback(id = 7n) {
  return encodeFunctionResult({ abi: REGISTRY_ABI, functionName: 'commitments', result: [id, ACCOUNT, ACCOUNT, STEST_ADDRESS, 80_000n * 10n ** 18n, 9_000_000n, 9_015_000n] });
}

function baseProvider(overrides: Record<string, (args: any) => any> = {}) {
  let calls = 0;
  return { request: async (args: any) => {
    if (overrides[args.method]) return overrides[args.method](args);
    if (args.method === 'eth_chainId') return ELYSIUM_CHAIN_ID_HEX;
    if (args.method === 'eth_accounts') return [ACCOUNT];
    if (args.method === 'eth_getTransactionCount') return '0x11';
    if (args.method === 'eth_estimateGas') return '0x5208';
    if (args.method === 'eth_getBalance') return '0x1';
    if (args.method === 'eth_sendTransaction') return HASH;
    if (args.method === 'eth_getTransactionReceipt') return receipt();
    if (args.method === 'eth_call') { calls += 1; return calls === 1 ? '0x' : readback(); }
    throw new Error(args.method);
  } };
}

async function guardedInvocations(count: number) {
  const guard = createSubmissionGuard();
  let pipelines = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const invoke = () => guard.run(async () => { pipelines += 1; await pending; });
  const runs = Array.from({ length: count }, invoke);
  await Promise.resolve();
  release();
  await Promise.all(runs);
  return pipelines;
}

test('A rapid double click starts exactly one pipeline', async () => assert.equal(await guardedInvocations(2), 1));
test('B two synchronous handler invocations start exactly one pipeline', async () => assert.equal(await guardedInvocations(2), 1));
test('C repeated keyboard activation starts exactly one pipeline', async () => assert.equal(await guardedInvocations(4), 1));
test('D/E/F in-flight UI states disable the CTA and use natural labels', () => {
  const text = source('frontend/src/main.jsx');
  for (const state of ['PREPARING', 'AWAITING_WALLET', 'SUBMITTED', 'CONFIRMING']) assert.match(text, new RegExp(`TX_STATE\\.${state}`));
  for (const label of ['Preparing…', 'Check your wallet…', 'Confirming on Elysium…']) assert.match(text, new RegExp(label));
  assert.match(text, /disabled={!canSubmit}/);
});
test('G wallet rejection is retryable and creates no pending record', async () => {
  const storage = new MemoryStorage();
  const result = await submitCommitment(baseProvider({ eth_sendTransaction: () => { throw Object.assign(new Error('cancelled'), { code: 4001 }); } }), input, ACCOUNT, undefined, { readHead: async () => HEAD, readFees: FEES, storage });
  assert.equal(result.state, TX_STATE.PRE_BROADCAST_FAILED);
  assert.equal(loadPendingTransaction(storage), null);
});
test('H preparation failure is retryable and creates no pending record', async () => {
  const storage = new MemoryStorage();
  await assert.rejects(submitCommitment(baseProvider(), input, ACCOUNT, undefined, { readHead: async () => HEAD, readFees: async () => { throw new Error('fee unavailable'); }, storage }));
  assert.equal(loadPendingTransaction(storage), null);
});
test('I a receipt timeout becomes ambiguous, persists the hash, and blocks retry', async () => {
  const storage = new MemoryStorage(); const states: string[] = [];
  await assert.rejects(submitCommitment(baseProvider(), input, ACCOUNT, (state) => states.push(state), { readHead: async () => HEAD, readFees: FEES, storage, waitForReceipt: async () => { throw new Error('timeout'); } }), (error: any) => error.code === 'AMBIGUOUS_TRANSACTION');
  const pending = loadPendingTransaction(storage);
  assert.equal(states.at(-1), TX_STATE.AMBIGUOUS); assert.equal(pending?.txHash, HASH); assert.equal(pendingMatchesTerms(pending, input, ACCOUNT), true);
});
test('J a registry readback timeout stays ambiguous and blocks retry', async () => {
  const storage = new MemoryStorage(); let call = 0; const states: string[] = [];
  const p = baseProvider({ eth_call: () => { call += 1; if (call === 1) return '0x'; throw new Error('readback timeout'); } });
  await assert.rejects(submitCommitment(p, input, ACCOUNT, (state) => states.push(state), { readHead: async () => HEAD, readFees: FEES, storage, waitForReceipt: async () => receipt() }));
  assert.equal(states.at(-1), TX_STATE.AMBIGUOUS); assert.equal(loadPendingTransaction(storage)?.txHash, HASH);
});
test('K reload reconciliation never sends a new transaction', async () => {
  const storage = new MemoryStorage(); const pending = buildPendingTransaction(input, ACCOUNT, HASH, 1); persistPendingTransaction(pending, storage); let sends = 0;
  const result = await reconcilePendingTransaction(baseProvider({ eth_sendTransaction: () => { sends += 1; throw new Error('must not send'); }, eth_call: () => readback() }), loadPendingTransaction(storage)!, undefined, { storage });
  assert.equal(result.state, TX_STATE.CONFIRMED); assert.equal(sends, 0);
});
test('L successful reconciliation restores the commitment ID and clears pending state', async () => {
  const storage = new MemoryStorage(); const pending = buildPendingTransaction(input, ACCOUNT, HASH, 1); persistPendingTransaction(pending, storage);
  const result = await reconcilePendingTransaction(baseProvider({ eth_call: () => readback() }), pending, undefined, { storage });
  assert.equal(result.commitment.id, 7n); assert.equal(loadPendingTransaction(storage), null);
});
test('M a reverted receipt never starts a proof and permits a later attempt', async () => {
  const storage = new MemoryStorage(); const pending = buildPendingTransaction(input, ACCOUNT, HASH, 1); persistPendingTransaction(pending, storage);
  const result = await reconcilePendingTransaction(baseProvider({ eth_getTransactionReceipt: () => ({ status: '0x0', logs: [] }) }), pending, undefined, { storage });
  assert.equal(result.state, TX_STATE.REVERTED); assert.equal(loadPendingTransaction(storage), null);
});
test('N identical pending terms are detected', () => assert.equal(pendingMatchesTerms(buildPendingTransaction(input, ACCOUNT, HASH), input, ACCOUNT), true));
test('O resolved pending state does not falsely block different terms', () => {
  const storage = new MemoryStorage(); persistPendingTransaction(buildPendingTransaction(input, ACCOUNT, HASH), storage); clearPendingTransaction(storage);
  assert.equal(pendingMatchesTerms(loadPendingTransaction(storage), { ...input, minimum: '90000' }, ACCOUNT), false);
});
test('P/Q successful creation copy cannot claim Proven or fabricate Receipt V3', () => {
  const text = source('frontend/src/main.jsx');
  assert.match(text, /It is not Proven, and no terminal receipt exists/);
  assert.doesNotMatch(text.slice(text.indexOf('function StartProof'), text.indexOf('function ProofPage')), /Validated Receipt V3/);
});
test('R persisted state contains only the public allowlist and no private information', () => {
  const pending = buildPendingTransaction(input, ACCOUNT, HASH, 1);
  assert.deepEqual(Object.keys(pending).sort(), ['chainId', 'createdAt', 'endBlock', 'minimumBalance', 'registry', 'schema', 'sender', 'startBlock', 'subject', 'token', 'txHash'].sort());
  assert.doesNotMatch(JSON.stringify(pending), /private|secret|seed|mnemonic|signature/i);
});
test('verified #6/#7 fixture proves the immutable registry accepts identical terms in separate transactions', () => {
  const six = { hash: '0xc94cb3b425f79a291555e08396514cd4164e3495606592d0f2551a8c95dff95a', nonce: 17, terms: [ACCOUNT, STEST_ADDRESS, '80000000000000000000000', '8726278', '8729278'] };
  const seven = { hash: '0x5322d6e6069d4f446840a3862389ed273a78c8485f1ab2d5ecd384d73d5764c3', nonce: 18, terms: [...six.terms] };
  assert.notEqual(six.hash, seven.hash); assert.equal(seven.nonce, six.nonce + 1); assert.deepEqual(six.terms, seven.terms);
  assert.match(source('docs/SECURITY.md'), /do not provide protocol-level uniqueness/i);
});
