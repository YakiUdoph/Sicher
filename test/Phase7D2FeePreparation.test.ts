import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { ELYSIUM_CHAIN_ID_HEX } from '../frontend/src/chainConfig.js';
import {
  BASE_FEE_HEADROOM_MULTIPLIER,
  FEE_PREPARATION_MESSAGE,
  prepareCommitmentForWallet,
  readFreshEip1559Fees,
  submitCommitment,
} from '../frontend/src/commitmentTransaction.js';

const ROOT = resolve(import.meta.dirname, '..');
const ACCOUNT = '0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086';
const HEAD = 8_715_516n;
const input = { subject: ACCOUNT, minimum: '80000', startBlock: '8717249', endBlock: '8720249' };
const requestProvider = (request: (args: any) => any) => ({ request });

function feeProvider(overrides: Record<string, any> = {}) {
  return requestProvider(({ method }) => {
    if (method in overrides) {
      const value = overrides[method];
      if (value instanceof Error) throw value;
      return value;
    }
    if (method === 'eth_getBlockByNumber') return { baseFeePerGas: '0x5f65630' }; // 100,030,000
    if (method === 'eth_gasPrice') return '0x5f5e100'; // 100,000,000
    if (method === 'eth_maxPriorityFeePerGas') return '0x0';
    if (method === 'eth_feeHistory') return { baseFeePerGas: ['0x5f65630', '0x5f67d40'] }; // predicts 100,040,000
    throw new Error(method);
  });
}

test('1 a risen base fee replaces stale fee data with proportional headroom', async () => {
  const fees = await readFreshEip1559Fees(feeProvider());
  assert.equal(fees.observedBaseFeePerGas, 100_030_000n);
  assert.equal(fees.predictedBaseFeePerGas, 100_040_000n);
  assert.equal(BigInt(fees.maxFeePerGas), 200_080_000n);
  assert.ok(BigInt(fees.maxFeePerGas) > 100_010_000n);
  assert.ok(BigInt(fees.maxFeePerGas) >= fees.observedBaseFeePerGas);
});

test('2 live frontend contains no fixed fee-rate constants', () => {
  const source = readFileSync(resolve(ROOT, 'frontend/src/commitmentTransaction.js'), 'utf8');
  assert.doesNotMatch(source, /100010000|100000000/);
  assert.equal(BASE_FEE_HEADROOM_MULTIPLIER, 2n);
});

test('3 fee refresh runs after simulation and gas-limit estimation', async () => {
  const calls: string[] = [];
  const provider = requestProvider(({ method }) => {
    calls.push(method);
    if (method === 'eth_chainId') return ELYSIUM_CHAIN_ID_HEX;
    if (method === 'eth_call') return '0x';
    if (method === 'eth_estimateGas') return '0x12345';
    if (method === 'eth_getBalance') return '0x1';
    throw new Error(method);
  });
  await prepareCommitmentForWallet(provider, input, ACCOUNT, {
    readHead: async () => HEAD,
    readFees: async () => { calls.push('fresh_fee_preparation'); return { maxFeePerGas: '0xbecfa80', maxPriorityFeePerGas: '0x0' }; },
  });
  assert.deepEqual(calls, ['eth_chainId', 'eth_call', 'eth_estimateGas', 'eth_getBalance', 'fresh_fee_preparation']);
});

test('4 prepared wallet request explicitly contains fresh EIP-1559 fees', async () => {
  const provider = requestProvider(({ method }) => method === 'eth_chainId' ? ELYSIUM_CHAIN_ID_HEX : method === 'eth_estimateGas' ? '0x12345' : method === 'eth_getBalance' ? '0x1' : '0x');
  const prepared = await prepareCommitmentForWallet(provider, input, ACCOUNT, { readHead: async () => HEAD, readFees: async () => ({ maxFeePerGas: '0xbecfa80', maxPriorityFeePerGas: '0x0' }) });
  assert.equal(prepared.transaction.maxFeePerGas, '0xbecfa80');
  assert.equal(prepared.transaction.maxPriorityFeePerGas, '0x0');
});

test('5 unavailable advisory priority RPC falls back safely to live gas/base delta', async () => {
  const fees = await readFreshEip1559Fees(feeProvider({ eth_maxPriorityFeePerGas: new Error('method unavailable') }));
  assert.equal(fees.maxPriorityFeePerGas, '0x0');
  assert.ok(BigInt(fees.maxFeePerGas) >= fees.observedBaseFeePerGas);
});

test('6 fee-preparation failure never calls eth_sendTransaction', async () => {
  const calls: string[] = [];
  const provider = requestProvider(({ method }) => {
    calls.push(method);
    if (method === 'eth_chainId') return ELYSIUM_CHAIN_ID_HEX;
    if (method === 'eth_estimateGas') return '0x12345';
    if (method === 'eth_getBalance') return '0x1';
    return '0x';
  });
  await assert.rejects(submitCommitment(provider, input, ACCOUNT, undefined, { readHead: async () => HEAD, readFees: async () => { throw new Error(FEE_PREPARATION_MESSAGE); } }), /Network fees changed/);
  assert.doesNotMatch(calls.join(','), /eth_sendTransaction/);
});

test('7 a failed fee attempt never enters a confirmed or Proof started state', async () => {
  const states: string[] = [];
  const provider = requestProvider(({ method }) => method === 'eth_chainId' ? ELYSIUM_CHAIN_ID_HEX : method === 'eth_estimateGas' ? '0x12345' : method === 'eth_getBalance' ? '0x1' : '0x');
  await assert.rejects(submitCommitment(provider, input, ACCOUNT, (state) => states.push(state), { readHead: async () => HEAD, readFees: async () => { throw new Error(FEE_PREPARATION_MESSAGE); } }));
  assert.deepEqual(states, ['PREPARING']);
});

test('8 receipt success is still checked before CONFIRMED', () => {
  const source = readFileSync(resolve(ROOT, 'frontend/src/commitmentTransaction.js'), 'utf8');
  assert.ok(source.indexOf('waitForSuccessfulReceipt(provider, hash)') < source.indexOf('onState(TX_STATE.CONFIRMED'));
});

test('9 registry readback is still required before CONFIRMED', () => {
  const source = readFileSync(resolve(ROOT, 'frontend/src/commitmentTransaction.js'), 'utf8');
  assert.ok(source.indexOf('readBackCommitment(provider, id)') < source.indexOf('onState(TX_STATE.CONFIRMED'));
});

test('10 future-start revalidation happens before fee preparation', async () => {
  let feeRead = false;
  const provider = requestProvider(({ method }) => method === 'eth_chainId' ? ELYSIUM_CHAIN_ID_HEX : '0x');
  await assert.rejects(prepareCommitmentForWallet(provider, input, ACCOUNT, { readHead: async () => BigInt(input.startBlock), readFees: async () => { feeRead = true; return { maxFeePerGas: '0x1', maxPriorityFeePerGas: '0x0' }; } }), /already passed/);
  assert.equal(feeRead, false);
});

test('11 transaction success still cannot imply Proven', () => {
  const source = readFileSync(resolve(ROOT, 'frontend/src/main.jsx'), 'utf8');
  assert.match(source, /The period is active\. It is not Proven, and no terminal receipt exists/);
  assert.match(source, /It is not Proven/);
});
