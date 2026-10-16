import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { encodeAbiParameters, encodeEventTopics, encodeFunctionResult } from 'viem';
import { ELYSIUM_ADD_CHAIN, ELYSIUM_CHAIN_ID_HEX, REGISTRY_ABI, REGISTRY_ADDRESS, STEST_ADDRESS } from '../frontend/src/chainConfig.js';
import { buildCommitmentTransaction, parseMinimumBalance, preflightCommitment, submitCommitment, TX_STATE, validateCommitmentInput, waitForSuccessfulReceipt } from '../frontend/src/commitmentTransaction.js';
import { connectWallet, friendlyWalletError, isElysiumChain, readWallet, shortenAddress, switchToElysium, watchWallet } from '../frontend/src/wallet.js';
import { loadProjectState } from '../frontend/src/commitmentPresentation.ts';
import { VerifiedCommitmentDataError } from '../frontend/src/verifiedCommitments.ts';

const ROOT = resolve(import.meta.dirname, '..');
const ACCOUNT = '0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086';
const HEAD = 8_710_397n;
const FEES = async () => ({ maxFeePerGas: '0xbebc200', maxPriorityFeePerGas: '0x0' });
const input = { subject: ACCOUNT, minimum: '80000', startBlock: '9000000', endBlock: '9015000' };
const source = (...files: string[]) => files.map((file) => readFileSync(resolve(ROOT, file), 'utf8')).join('\n');
const provider = (request: (args: any) => any) => ({ request });

test('1 Connect requests accounts and then reads chain ID', async () => { const calls: string[] = []; await connectWallet(provider(({ method }) => { calls.push(method); return method === 'eth_requestAccounts' ? [ACCOUNT] : ELYSIUM_CHAIN_ID_HEX; })); assert.deepEqual(calls, ['eth_requestAccounts', 'eth_chainId']); });
test('2 connected address has a readable shortened form', () => assert.equal(shortenAddress(ACCOUNT), '0xa808…A086'));
test('3 passive wallet state uses eth_accounts and eth_chainId', async () => { const calls: string[] = []; await readWallet(provider(({ method }) => { calls.push(method); return method === 'eth_accounts' ? [ACCOUNT] : ELYSIUM_CHAIN_ID_HEX; })); assert.deepEqual(calls.sort(), ['eth_accounts', 'eth_chainId']); });
test('4 wrong chain is detected', () => { assert.equal(isElysiumChain('0x1'), false); assert.equal(isElysiumChain(ELYSIUM_CHAIN_ID_HEX), true); });
test('5 switch request uses derived chain ID', async () => { let seen: any; await switchToElysium(provider(({ method, params }) => { if (method === 'wallet_switchEthereumChain') seen = params; return method === 'eth_chainId' ? ELYSIUM_CHAIN_ID_HEX : null; })); assert.deepEqual(seen, [{ chainId: '0x185d9' }]); });
test('6 missing chain requests verified add-chain configuration', async () => { const calls: any[] = []; await switchToElysium(provider(({ method, params }) => { calls.push({ method, params }); if (method === 'wallet_switchEthereumChain') throw Object.assign(new Error(), { code: 4902 }); return method === 'eth_chainId' ? ELYSIUM_CHAIN_ID_HEX : null; })); assert.deepEqual(calls[1], { method: 'wallet_addEthereumChain', params: [ELYSIUM_ADD_CHAIN] }); });
test('7 rejected connection has clear message', () => assert.equal(friendlyWalletError({ code: 4001 }), 'Connection was cancelled.'));
test('8 rejected switch has clear message', () => assert.equal(friendlyWalletError({ code: 4001 }, 'switch'), 'Network switch was cancelled.'));
test('9 wallet account and chain listeners are registered', () => { const names: string[] = []; const p: any = { on: (name: string) => names.push(name), removeListener() {} }; watchWallet(p, {}); assert.deepEqual(names, ['accountsChanged', 'chainChanged']); });
test('10 only MIN_BALANCE is offered', () => { const text = source('frontend/src/main.jsx'); assert.match(text, /MIN_BALANCE/); assert.doesNotMatch(text, /Limit how much can leave/); });
test('11 STEST is correctly identified', () => assert.match(source('frontend/src/main.jsx'), /Sicher Test Token \(STEST\)/));
test('12 STEST is not called dollar-SICHER', () => assert.doesNotMatch(source('frontend/src/main.jsx', 'frontend/src/components.jsx'), /\$SICHER/));
test('13 minimum rejects zero', () => assert.throws(() => parseMinimumBalance('0'), /greater than zero/));
test('14 decimal conversion is exact', () => assert.equal(parseMinimumBalance('1.25'), 1_250_000_000_000_000_000n));
test('15 comma-formatted amount converts safely', () => assert.equal(parseMinimumBalance('80,000'), 80_000n * 10n ** 18n));
test('16 excessive token precision is rejected', () => assert.throws(() => parseMinimumBalance('1.0000000000000000001')));
test('17 malformed subject is rejected', () => assert.equal(validateCommitmentInput({ ...input, subject: 'bad' }, HEAD).valid, false));
test('18 start and end block order is validated', () => assert.match(validateCommitmentInput({ ...input, endBlock: input.startBlock }, HEAD).errors.endBlock, /after the start/));
test('19 transaction targets the deployed registry', () => assert.equal(buildCommitmentTransaction(input, ACCOUNT, HEAD).to.toLowerCase(), REGISTRY_ADDRESS));
test('20 transaction calldata uses the ABI encoder', () => assert.ok(buildCommitmentTransaction(input, ACCOUNT, HEAD).data.startsWith('0x04b0ac93')));
test('21 review exposes exact transaction terms', () => { const text = source('frontend/src/main.jsx'); for (const label of ['Network', 'Proof', 'Subject', 'Token', 'Minimum', 'Starts', 'Ends', 'Current block', 'Status']) assert.match(text, new RegExp(label)); });
test('22 simulation failure blocks gas estimation', async () => { const calls: string[] = []; await assert.rejects(preflightCommitment(provider(({ method }) => { calls.push(method); throw new Error('simulation failed'); }), buildCommitmentTransaction(input, ACCOUNT, HEAD)), /verify the commitment transaction/); assert.deepEqual(calls, ['eth_call']); });
test('23 estimate failure blocks submission preflight', async () => { const calls: string[] = []; await assert.rejects(preflightCommitment(provider(({ method }) => { calls.push(method); if (method === 'eth_call') return '0x'; throw new Error('estimate failed'); }), buildCommitmentTransaction(input, ACCOUNT, HEAD)), /estimate the transaction gas/); assert.deepEqual(calls, ['eth_call', 'eth_estimateGas']); });
test('24 zero native gas balance blocks submit', async () => { await assert.rejects(preflightCommitment(provider(({ method }) => method === 'eth_estimateGas' ? '0x5208' : method === 'eth_getBalance' ? '0x0' : '0x'), buildCommitmentTransaction(input, ACCOUNT, HEAD)), /no native HYPE/); });
test('25 wallet rejection never confirms', async () => { const states: string[] = []; const p = provider(({ method }) => { if (method === 'eth_chainId') return ELYSIUM_CHAIN_ID_HEX; if (method === 'eth_accounts') return [ACCOUNT]; if (method === 'eth_getTransactionCount') return '0x1'; if (method === 'eth_estimateGas') return '0x5208'; if (method === 'eth_getBalance') return '0x1'; if (method === 'eth_sendTransaction') throw Object.assign(new Error(), { code: 4001 }); return '0x'; }); const result = await submitCommitment(p, input, ACCOUNT, (state: string) => states.push(state), { readHead: async () => HEAD, readFees: FEES }); assert.equal(result.state, TX_STATE.REJECTED); assert.doesNotMatch(states.join(','), /CONFIRMED/); });
test('26 reverted receipt fails closed', async () => { await assert.rejects(waitForSuccessfulReceipt(provider(() => ({ status: '0x0' })), '0xhash', { attempts: 1, intervalMs: 0 }), /reverted/); });

function successfulProvider(readbackId = 3n) {
  const topics = encodeEventTopics({ abi: REGISTRY_ABI, eventName: 'CommitmentCreated', args: { id: 3n, creator: ACCOUNT, subject: ACCOUNT } });
  const logData = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], [STEST_ADDRESS, 80_000n * 10n ** 18n, 9_000_000n, 9_015_000n]);
  const readback = encodeFunctionResult({ abi: REGISTRY_ABI, functionName: 'commitments', result: [readbackId, ACCOUNT, ACCOUNT, STEST_ADDRESS, 80_000n * 10n ** 18n, 9_000_000n, 9_015_000n] });
  let callCount = 0;
  return provider(({ method }) => { if (method === 'eth_chainId') return ELYSIUM_CHAIN_ID_HEX; if (method === 'eth_accounts') return [ACCOUNT]; if (method === 'eth_getTransactionCount') return '0x1'; if (method === 'eth_estimateGas') return '0x5208'; if (method === 'eth_getBalance') return '0x1'; if (method === 'eth_sendTransaction') return `0x${'ab'.repeat(32)}`; if (method === 'eth_getTransactionReceipt') return { status: '0x1', logs: [{ address: REGISTRY_ADDRESS, topics, data: logData }] }; if (method === 'eth_call') { callCount += 1; return callCount === 1 ? '0x' : readback; } throw new Error(method); });
}

test('27 submitted transaction is not immediately called confirmed', async () => { const states: string[] = []; await submitCommitment(successfulProvider(), input, ACCOUNT, (state: string) => states.push(state), { readHead: async () => HEAD, readFees: FEES }); assert.ok(states.indexOf(TX_STATE.SUBMITTED) < states.indexOf(TX_STATE.CONFIRMED)); assert.ok(states.indexOf(TX_STATE.CONFIRMING) < states.indexOf(TX_STATE.CONFIRMED)); });
test('28 successful receipt requires registry readback', async () => await assert.rejects(submitCommitment(successfulProvider(0n), input, ACCOUNT, undefined, { readHead: async () => HEAD, readFees: FEES }), /readback/));
test('29 confirmed commitment returns authoritative ID', async () => { const result = await submitCommitment(successfulProvider(), input, ACCOUNT, undefined, { readHead: async () => HEAD, readFees: FEES }); assert.equal(result.commitment.id, 3n); });
test('30 active commitment copy does not claim Proven', () => { const text = source('frontend/src/main.jsx'); assert.match(text, /The period is active\. It is not Proven, and no terminal receipt exists/); });
test('31 active commitment has no generated terminal receipt', () => assert.match(source('frontend/src/main.jsx'), /no terminal receipt exists/i));
test('32 unknown proof fails closed', async () => assert.equal((await loadProjectState('999', async () => { throw new VerifiedCommitmentDataError('NOT_FOUND', 'Not found.'); })).kind, 'not_found'));
test('33 no fictional projects or fake success wording remain reachable', () => assert.doesNotMatch(source('frontend/src/main.jsx', 'frontend/src/components.jsx'), /Northline|Fieldnote|Morrow|Juniper|Quiet Signal|Paper House|prepared proof|design preview/i));
test('34 no fake URI scheme or alert-only Connect remains', () => { const text = source('frontend/src/main.jsx', 'frontend/src/components.jsx'); assert.doesNotMatch(text, new RegExp('de' + 'mo://', 'i')); assert.doesNotMatch(text, /window\.alert/); });
test('35 browser source contains no private signing material', () => assert.doesNotMatch(source('frontend/src/main.jsx', 'frontend/src/components.jsx', 'frontend/src/wallet.js', 'frontend/src/commitmentTransaction.js', 'frontend/src/chainConfig.js'), /TEST_WALLET_PRIVATE_KEY|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|seed phrase|mnemonic/i));
