import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FEE_DISCOVERY_MESSAGE,
  GAS_ESTIMATION_FAILURE_MESSAGE,
  SIMULATION_FAILURE_MESSAGE,
  preflightCommitment,
  readFreshEip1559Fees,
} from '../frontend/src/commitmentTransaction.js';

const provider = (request: (args: any) => any) => ({ request });

test('1 exact live failure: priority-fee timeout is advisory and falls back to zero', async () => {
  const calls: string[] = [];
  const fees = await readFreshEip1559Fees(provider(({ method }) => {
    calls.push(method);
    if (method === 'eth_getBlockByNumber') return { baseFeePerGas: '0x5f62f20' }; // 100,020,000
    if (method === 'eth_gasPrice') return '0x5f5e100'; // 100,000,000
    if (method === 'eth_maxPriorityFeePerGas') throw Object.assign(new Error('Internal JSON-RPC error.'), { cause: new Error('Connect Timeout Error') });
    if (method === 'eth_feeHistory') return { oldestBlock: '0x8512de', baseFeePerGas: ['0x5f62f20', '0x5f5e100'], gasUsedRatio: [0.004], reward: [['0x0']] };
    throw new Error(method);
  }));
  assert.deepEqual(calls, ['eth_getBlockByNumber', 'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_feeHistory']);
  assert.equal(fees.maxPriorityFeePerGas, '0x0');
  assert.equal(fees.observedBaseFeePerGas, 100_020_000n);
  assert.ok(BigInt(fees.maxFeePerGas) >= fees.observedBaseFeePerGas);
});

test('2 fee reads are serialized rather than launched concurrently', async () => {
  let active = 0;
  let maximum = 0;
  const fees = await readFreshEip1559Fees(provider(async ({ method }) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await Promise.resolve();
    active -= 1;
    if (method === 'eth_getBlockByNumber') return { baseFeePerGas: '0x5f5e100' };
    if (method === 'eth_gasPrice') return '0x5f65630';
    if (method === 'eth_maxPriorityFeePerGas') return '0x0';
    return { baseFeePerGas: ['0x5f5e100', '0x5f65630'] };
  }));
  assert.equal(maximum, 1);
  assert.equal(fees.maxPriorityFeePerGas, '0x7530'); // gasPrice - baseFee = 30,000
});

test('3 alternating Elysium base fees use the last feeHistory item as next base fee', async () => {
  const fees = await readFreshEip1559Fees(provider(({ method }) => {
    if (method === 'eth_getBlockByNumber') return { baseFeePerGas: '0x5f5e100' };
    if (method === 'eth_gasPrice') return '0x5f5e100';
    if (method === 'eth_maxPriorityFeePerGas') return '0x0';
    return { oldestBlock: '0x1', baseFeePerGas: ['0x5f5e100', '0x5f65630', '0x5f5e100'], gasUsedRatio: [1, 0.004], reward: [['0x0'], ['0x0']] };
  }));
  assert.equal(fees.observedBaseFeePerGas, 100_000_000n);
  assert.equal(fees.predictedBaseFeePerGas, 100_000_000n);
});

test('4 malformed required block fee fails closed as fee discovery', async () => {
  await assert.rejects(readFreshEip1559Fees(provider(({ method }) => method === 'eth_getBlockByNumber' ? { baseFeePerGas: null } : '0x0')), new RegExp(FEE_DISCOVERY_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('5 malformed advisory feeHistory falls back to current base fee', async () => {
  const fees = await readFreshEip1559Fees(provider(({ method }) => {
    if (method === 'eth_getBlockByNumber') return { baseFeePerGas: '0x5f65630' };
    if (method === 'eth_gasPrice') return '0x5f65630';
    if (method === 'eth_maxPriorityFeePerGas') return '0x0';
    return { baseFeePerGas: [null] };
  }));
  assert.equal(fees.predictedBaseFeePerGas, 100_030_000n);
});

test('6 simulation failures have their own safe classification', async () => {
  const raw = new Error('execution reverted: internal detail');
  await assert.rejects(preflightCommitment(provider(() => { throw raw; }), { from: '0x1' }), (error: any) => error.message === SIMULATION_FAILURE_MESSAGE && error.cause === raw);
});

test('7 gas-estimation failures have their own safe classification', async () => {
  const raw = new Error('estimator unavailable');
  await assert.rejects(preflightCommitment(provider(({ method }) => { if (method === 'eth_call') return '0x'; throw raw; }), { from: '0x1' }), (error: any) => error.message === GAS_ESTIMATION_FAILURE_MESSAGE && error.cause === raw);
});
