import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { ELYSIUM_CHAIN_ID_HEX } from '../frontend/src/chainConfig.js';
import {
  DEFAULT_PROOF_WINDOW_BLOCKS,
  HEAD_UNAVAILABLE_MESSAGE,
  SAFE_START_BUFFER_BLOCKS,
  STALE_START_MESSAGE,
  proofWindowEnd,
  readCurrentElysiumBlock,
  safeStartBlock,
  submitCommitment,
  validateCommitmentInput,
} from '../frontend/src/commitmentTransaction.js';

const ROOT = resolve(import.meta.dirname, '..');
const ACCOUNT = '0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086';
const ZERO = `0x${'0'.repeat(40)}`;
const HEAD = 8_710_397n;
const valid = { subject: ACCOUNT, minimum: '80000', startBlock: '8712397', endBlock: '8715397' };

test('1 a past start block is rejected against the live head', () => {
  const checked = validateCommitmentInput({ ...valid, startBlock: '5000', endBlock: '7000' }, HEAD);
  assert.equal(checked.valid, false);
  assert.match(checked.errors.startBlock, /already passed/);
});

test('2 a start block equal to the live head is rejected', () => {
  const checked = validateCommitmentInput({ ...valid, startBlock: HEAD.toString() }, HEAD);
  assert.match(checked.errors.startBlock, /future start block/);
});

test('3 a reversed future range is rejected', () => {
  const checked = validateCommitmentInput({ ...valid, startBlock: '8715397', endBlock: '8712397' }, HEAD);
  assert.match(checked.errors.endBlock, /after the start/);
});

test('4 the zero subject address is rejected', () => {
  const checked = validateCommitmentInput({ ...valid, subject: ZERO }, HEAD);
  assert.match(checked.errors.subject, /zero address/);
});

test('5 an unavailable or malformed RPC head fails closed', async () => {
  await assert.rejects(readCurrentElysiumBlock(async () => { throw new Error('offline'); }), new RegExp(HEAD_UNAVAILABLE_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await assert.rejects(readCurrentElysiumBlock(async () => ({ ok: true, json: async () => ({ result: 'not-a-block' }) }) as Response), /confirm the current Elysium block/);
  assert.equal(validateCommitmentInput(valid, null).valid, false);
});

test('6 stale refresh blocks before simulation or wallet approval', async () => {
  const calls: string[] = [];
  const provider = { request: async ({ method }: { method: string }) => { calls.push(method); if (method === 'eth_chainId') return ELYSIUM_CHAIN_ID_HEX; throw new Error(`unexpected ${method}`); } };
  await assert.rejects(submitCommitment(provider, valid, ACCOUNT, undefined, { readHead: async () => BigInt(valid.startBlock) }), new RegExp(STALE_START_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.deepEqual(calls, ['eth_chainId']);
  assert.doesNotMatch(calls.join(','), /eth_call|eth_estimateGas|eth_sendTransaction/);
});

test('7 safe-start helper is exactly 2,000 blocks beyond the head', () => {
  const start = safeStartBlock(HEAD);
  assert.equal(SAFE_START_BUFFER_BLOCKS, 2_000n);
  assert.equal(start, HEAD + 2_000n);
  assert.ok(start > HEAD);
});

test('8 proof-window helper is exactly 3,000 blocks after start', () => {
  const start = safeStartBlock(HEAD);
  assert.equal(DEFAULT_PROOF_WINDOW_BLOCKS, 3_000n);
  assert.equal(proofWindowEnd(start), start + 3_000n);
});

test('9 valid future terms pass client validation', () => assert.equal(validateCommitmentInput(valid, HEAD).valid, true));

test('10 successful creation remains active and never means Proven', () => {
  const source = readFileSync(resolve(ROOT, 'frontend/src/main.jsx'), 'utf8');
  assert.match(source, /commitment is active; final evaluation is not yet available/i);
  assert.match(source, /It is not Proven, and no terminal receipt exists/);
});

test('11 limitation documentation preserves immutable historical artifacts', () => {
  const docs = readFileSync(resolve(ROOT, 'docs/PHASE7D1_CLIENT_VALIDATION.md'), 'utf8');
  assert.match(docs, /direct contract callers/i);
  assert.match(docs, /#3.*#4.*#5/s);
  assert.match(docs, /immutable/i);
  assert.match(docs, /not.*Explore/is);
});
