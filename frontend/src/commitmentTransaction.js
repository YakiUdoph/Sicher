import { decodeEventLog, decodeFunctionResult, encodeFunctionData, getAddress, parseUnits } from 'viem';
import { ELYSIUM_CHAIN_ID_HEX, ELYSIUM_RPC_URL, REGISTRY_ABI, REGISTRY_ADDRESS, STEST_ADDRESS, STEST_DECIMALS } from './chainConfig.js';

export const TX_STATE = Object.freeze({
  IDLE: 'IDLE', PREPARING: 'PREPARING', AWAITING_WALLET: 'AWAITING_WALLET',
  SUBMITTED: 'SUBMITTED', CONFIRMING: 'CONFIRMING', CONFIRMED: 'CONFIRMED',
  PRE_BROADCAST_FAILED: 'PRE_BROADCAST_FAILED', AMBIGUOUS: 'AMBIGUOUS', REVERTED: 'REVERTED',
  READY: 'IDLE', AWAITING_WALLET_APPROVAL: 'AWAITING_WALLET',
  REJECTED: 'PRE_BROADCAST_FAILED', FAILED: 'PRE_BROADCAST_FAILED',
});
export const PENDING_TX_STORAGE_KEY = 'sicher.pending-commitment.v1';
export const PENDING_TX_SCHEMA = 'sicher.pending-commitment/1';
export const AMBIGUOUS_TRANSACTION_MESSAGE = "Your transaction was submitted, but Sicher hasn't finished confirming it yet. Don't start another proof.";
const addressPattern = /^0x[0-9a-fA-F]{40}$/;
const integerPattern = /^(0|[1-9][0-9]*)$/;
const zeroAddressPattern = /^0x0{40}$/i;
export const SAFE_START_BUFFER_BLOCKS = 2_000n;
export const DEFAULT_PROOF_WINDOW_BLOCKS = 3_000n;
export const HEAD_UNAVAILABLE_MESSAGE = "We couldn't confirm the current Elysium block. Try again before starting the proof.";
export const STALE_START_MESSAGE = 'The selected start block has already passed. Refresh the start block and try again.';
export const FEE_PREPARATION_MESSAGE = 'Network fees changed before the transaction could start. Refresh and try again.';
export const FEE_DISCOVERY_MESSAGE = "We couldn't confirm current network fees. Try again.";
export const SIMULATION_FAILURE_MESSAGE = "We couldn't verify the commitment transaction. Check the terms and try again.";
export const GAS_ESTIMATION_FAILURE_MESSAGE = "We couldn't estimate the transaction gas. Try again.";
export const BASE_FEE_HEADROOM_MULTIPLIER = 2n;

function rpcQuantity(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) throw new Error('Malformed RPC quantity.');
  return BigInt(value);
}

function toRpcQuantity(value) { return `0x${value.toString(16)}`; }

function browserStorage() {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export function createSubmissionGuard() {
  let locked = false;
  return {
    isLocked: () => locked,
    run(task) {
      if (locked) return Promise.resolve({ skipped: true });
      locked = true;
      try { return Promise.resolve(task()).finally(() => { locked = false; }); }
      catch (error) { locked = false; throw error; }
    },
  };
}

export function buildPendingTransaction(input, account, txHash, createdAt = Date.now()) {
  return {
    schema: PENDING_TX_SCHEMA,
    chainId: ELYSIUM_CHAIN_ID_HEX,
    registry: getAddress(REGISTRY_ADDRESS),
    txHash,
    sender: getAddress(account),
    subject: getAddress(input.subject),
    token: getAddress(STEST_ADDRESS),
    minimumBalance: parseMinimumBalance(input.minimum).toString(),
    startBlock: BigInt(input.startBlock).toString(),
    endBlock: BigInt(input.endBlock).toString(),
    createdAt,
  };
}

export function persistPendingTransaction(pending, storage = browserStorage()) {
  if (!storage?.setItem) return false;
  try { storage.setItem(PENDING_TX_STORAGE_KEY, JSON.stringify(pending)); return true; }
  catch { return false; }
}

export function loadPendingTransaction(storage = browserStorage()) {
  if (!storage?.getItem) return null;
  try {
    const value = JSON.parse(storage.getItem(PENDING_TX_STORAGE_KEY));
    if (value?.schema !== PENDING_TX_SCHEMA || !/^0x[0-9a-f]{64}$/i.test(value.txHash ?? '') ||
      !addressPattern.test(value.sender ?? '') || !addressPattern.test(value.subject ?? '') ||
      !addressPattern.test(value.token ?? '') || !addressPattern.test(value.registry ?? '') ||
      !integerPattern.test(value.minimumBalance ?? '') || !integerPattern.test(value.startBlock ?? '') ||
      !integerPattern.test(value.endBlock ?? '') || typeof value.createdAt !== 'number') return null;
    return value;
  } catch { return null; }
}

export function clearPendingTransaction(storage = browserStorage()) {
  storage?.removeItem?.(PENDING_TX_STORAGE_KEY);
}

export function pendingMatchesTerms(pending, input, account) {
  if (!pending || !addressPattern.test(account ?? '')) return false;
  try {
    return pending.chainId.toLowerCase() === ELYSIUM_CHAIN_ID_HEX &&
      pending.registry.toLowerCase() === REGISTRY_ADDRESS.toLowerCase() &&
      pending.sender.toLowerCase() === account.toLowerCase() &&
      pending.subject.toLowerCase() === getAddress(input.subject).toLowerCase() &&
      pending.token.toLowerCase() === STEST_ADDRESS.toLowerCase() &&
      pending.minimumBalance === parseMinimumBalance(input.minimum).toString() &&
      pending.startBlock === BigInt(input.startBlock).toString() &&
      pending.endBlock === BigInt(input.endBlock).toString();
  } catch { return false; }
}

export function pendingMatchesWallet(pending, account, chainId) {
  return Boolean(pending && addressPattern.test(account ?? '') && typeof chainId === 'string' &&
    pending.sender.toLowerCase() === account.toLowerCase() && pending.chainId.toLowerCase() === chainId.toLowerCase() &&
    pending.registry.toLowerCase() === REGISTRY_ADDRESS.toLowerCase());
}

export function parseMinimumBalance(value) {
  const clean = String(value ?? '').trim().replaceAll(',', '');
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(clean)) throw new Error('Enter a valid positive STEST amount.');
  if ((clean.split('.')[1]?.length ?? 0) > STEST_DECIMALS) throw new Error('STEST supports at most 18 decimal places.');
  const units = parseUnits(clean, STEST_DECIMALS);
  if (units <= 0n) throw new Error('Minimum balance must be greater than zero.');
  return units;
}

export async function readCurrentElysiumBlock(fetchImplementation = globalThis.fetch) {
  if (typeof fetchImplementation !== 'function') throw new Error(HEAD_UNAVAILABLE_MESSAGE);
  try {
    const response = await fetchImplementation(ELYSIUM_RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
    });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error || !/^0x[0-9a-f]+$/i.test(payload.result ?? '')) throw new Error('Malformed RPC response');
    return BigInt(payload.result);
  } catch {
    throw new Error(HEAD_UNAVAILABLE_MESSAGE);
  }
}

export function safeStartBlock(currentHead, buffer = SAFE_START_BUFFER_BLOCKS) {
  if (typeof currentHead !== 'bigint' || currentHead < 0n || typeof buffer !== 'bigint' || buffer <= 0n) throw new Error(HEAD_UNAVAILABLE_MESSAGE);
  return currentHead + buffer;
}

export function proofWindowEnd(startBlock, window = DEFAULT_PROOF_WINDOW_BLOCKS) {
  if (typeof startBlock !== 'bigint' || startBlock <= 0n || typeof window !== 'bigint' || window <= 0n) throw new Error('Choose a valid proof window.');
  return startBlock + window;
}

export function validateCommitmentInput(input, currentHead) {
  const errors = {};
  if (!addressPattern.test(input.subject ?? '')) errors.subject = 'Enter a valid subject address.';
  else if (zeroAddressPattern.test(input.subject)) errors.subject = 'The subject cannot be the zero address.';
  let minimumBalance;
  try { minimumBalance = parseMinimumBalance(input.minimum); } catch (error) { errors.minimum = error.message; }
  if (!integerPattern.test(input.startBlock ?? '') || BigInt(input.startBlock || 0) <= 0n) errors.startBlock = 'Enter a valid start block.';
  if (!integerPattern.test(input.endBlock ?? '') || BigInt(input.endBlock || 0) <= 0n) errors.endBlock = 'Enter a valid end block.';
  if (typeof currentHead !== 'bigint' || currentHead < 0n) errors.head = HEAD_UNAVAILABLE_MESSAGE;
  if (!errors.startBlock && !errors.head && BigInt(input.startBlock) <= currentHead) errors.startBlock = 'This block has already passed. Choose a future start block.';
  if (!errors.startBlock && !errors.endBlock && BigInt(input.endBlock) <= BigInt(input.startBlock)) errors.endBlock = 'End block must come after the start block.';
  return { valid: Object.keys(errors).length === 0, errors, minimumBalance, currentHead };
}

export function buildCommitmentTransaction(input, from, currentHead) {
  const checked = validateCommitmentInput(input, currentHead);
  if (!checked.valid) throw new Error('Commitment terms are invalid.');
  const args = [getAddress(input.subject), getAddress(STEST_ADDRESS), checked.minimumBalance, BigInt(input.startBlock), BigInt(input.endBlock)];
  return {
    from: getAddress(from), to: getAddress(REGISTRY_ADDRESS), value: '0x0',
    data: encodeFunctionData({ abi: REGISTRY_ABI, functionName: 'createCommitment', args }),
  };
}

export async function preflightCommitment(provider, transaction) {
  // Simulation checks contract execution; estimation determines only the gas limit.
  // Transaction pricing is refreshed separately after both checks.
  try { await provider.request({ method: 'eth_call', params: [transaction, 'latest'] }); }
  catch (error) { throw new Error(SIMULATION_FAILURE_MESSAGE, { cause: error }); }
  let gas;
  try { gas = await provider.request({ method: 'eth_estimateGas', params: [transaction] }); }
  catch (error) { throw new Error(GAS_ESTIMATION_FAILURE_MESSAGE, { cause: error }); }
  let balance;
  try { balance = await provider.request({ method: 'eth_getBalance', params: [transaction.from, 'latest'] }); }
  catch (error) { throw new Error("We couldn't confirm this wallet's gas balance. Try again.", { cause: error }); }
  if (BigInt(balance) === 0n) throw new Error('This wallet has no native HYPE for gas.');
  return { gas };
}

export async function readFreshEip1559Fees(provider) {
  try {
    // Serialize required reads: repository-known Elysium endpoints can time out
    // individual requests when these methods are issued concurrently.
    const block = await provider.request({ method: 'eth_getBlockByNumber', params: ['latest', false] });
    const gasPriceValue = await provider.request({ method: 'eth_gasPrice' });
    const baseFeePerGas = rpcQuantity(block?.baseFeePerGas);
    const gasPrice = rpcQuantity(gasPriceValue);
    // A zero tip is normal on Elysium. If the advisory priority method is
    // unavailable, gasPrice - baseFee is a network-derived, non-magic fallback.
    let maxPriorityFeePerGas = gasPrice > baseFeePerGas ? gasPrice - baseFeePerGas : 0n;
    try {
      const priorityFeeValue = await provider.request({ method: 'eth_maxPriorityFeePerGas' });
      const recommendedPriorityFee = rpcQuantity(priorityFeeValue);
      if (recommendedPriorityFee > maxPriorityFeePerGas) maxPriorityFeePerGas = recommendedPriorityFee;
    } catch { /* Advisory method unavailable; use the fresh gas/base-fee delta. */ }
    let predictedBaseFeePerGas = baseFeePerGas;
    try {
      const history = await provider.request({ method: 'eth_feeHistory', params: ['0x1', 'latest', [50]] });
      const predicted = history?.baseFeePerGas?.at(-1);
      if (predicted !== undefined) predictedBaseFeePerGas = rpcQuantity(predicted);
    } catch { /* Fee history is advisory; the fresh block base fee remains authoritative. */ }
    const feeBase = [baseFeePerGas, predictedBaseFeePerGas].reduce((highest, value) => value > highest ? value : highest, 0n);
    const maxFeePerGas = [feeBase * BASE_FEE_HEADROOM_MULTIPLIER + maxPriorityFeePerGas, gasPrice].reduce((highest, value) => value > highest ? value : highest, 0n);
    if (maxFeePerGas < baseFeePerGas) throw new Error(FEE_PREPARATION_MESSAGE);
    return {
      maxFeePerGas: toRpcQuantity(maxFeePerGas), maxPriorityFeePerGas: toRpcQuantity(maxPriorityFeePerGas),
      observedBaseFeePerGas: baseFeePerGas, predictedBaseFeePerGas, observedGasPrice: gasPrice,
    };
  } catch (error) {
    if (error?.message === FEE_PREPARATION_MESSAGE) throw error;
    throw new Error(FEE_DISCOVERY_MESSAGE, { cause: error });
  }
}

export async function waitForSuccessfulReceipt(provider, hash, { attempts = 90, intervalMs = 2000 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [hash] });
    if (receipt) {
      if (BigInt(receipt.status) !== 1n) throw Object.assign(new Error('The transaction reverted. Nothing was created.'), { code: 'TRANSACTION_REVERTED' });
      return receipt;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Confirmation timed out. Check the transaction in your wallet.');
}

export function commitmentEventFromReceipt(receipt) {
  for (const log of receipt.logs ?? []) {
    if (log.address?.toLowerCase() !== REGISTRY_ADDRESS.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: REGISTRY_ABI, eventName: 'CommitmentCreated', data: log.data, topics: log.topics });
      if (decoded.args?.id !== undefined) return decoded.args;
    } catch { /* Ignore unrelated registry logs. */ }
  }
  throw new Error('The confirmed transaction did not emit CommitmentCreated.');
}

export function commitmentIdFromReceipt(receipt) { return commitmentEventFromReceipt(receipt).id; }

export async function readBackCommitment(provider, id) {
  const data = encodeFunctionData({ abi: REGISTRY_ABI, functionName: 'commitments', args: [id] });
  const result = await provider.request({ method: 'eth_call', params: [{ to: REGISTRY_ADDRESS, data }, 'latest'] });
  const values = decodeFunctionResult({ abi: REGISTRY_ABI, functionName: 'commitments', data: result });
  if (!values || values[0] !== id) throw new Error('Registry readback did not confirm the commitment.');
  return { id: values[0], creator: values[1], subject: values[2], token: values[3], minimumBalance: values[4], startBlock: values[5], endBlock: values[6] };
}

export function commitmentMatchesPending(commitment, pending) {
  return commitment.creator.toLowerCase() === pending.sender.toLowerCase() &&
    commitment.subject.toLowerCase() === pending.subject.toLowerCase() &&
    commitment.token.toLowerCase() === pending.token.toLowerCase() &&
    commitment.minimumBalance.toString() === pending.minimumBalance &&
    commitment.startBlock.toString() === pending.startBlock && commitment.endBlock.toString() === pending.endBlock;
}

export function commitmentEventMatchesPending(event, pending) {
  return event.creator.toLowerCase() === pending.sender.toLowerCase() &&
    event.subject.toLowerCase() === pending.subject.toLowerCase() && event.token.toLowerCase() === pending.token.toLowerCase() &&
    event.minimumBalance.toString() === pending.minimumBalance && event.startBlock.toString() === pending.startBlock &&
    event.endBlock.toString() === pending.endBlock;
}

export async function reconcilePendingTransaction(provider, pending, onState = () => {}, options = {}) {
  const storage = options.storage ?? browserStorage();
  onState(TX_STATE.CONFIRMING, { hash: pending.txHash, pending, error: null });
  let receipt;
  try { receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [pending.txHash] }); }
  catch (error) {
    onState(TX_STATE.AMBIGUOUS, { hash: pending.txHash, pending, error: AMBIGUOUS_TRANSACTION_MESSAGE });
    return { state: TX_STATE.AMBIGUOUS, hash: pending.txHash, pending, error };
  }
  if (!receipt) {
    onState(TX_STATE.AMBIGUOUS, { hash: pending.txHash, pending, error: AMBIGUOUS_TRANSACTION_MESSAGE });
    return { state: TX_STATE.AMBIGUOUS, hash: pending.txHash, pending };
  }
  if (BigInt(receipt.status) !== 1n) {
    clearPendingTransaction(storage);
    const error = 'The transaction reverted. Nothing was created.';
    onState(TX_STATE.REVERTED, { hash: pending.txHash, pending: null, error });
    return { state: TX_STATE.REVERTED, hash: pending.txHash, error };
  }
  try {
    const event = commitmentEventFromReceipt(receipt);
    if (!commitmentEventMatchesPending(event, pending)) throw new Error('CommitmentCreated does not match the submitted commitment terms.');
    const id = event.id;
    const commitment = await readBackCommitment(provider, id);
    if (!commitmentMatchesPending(commitment, pending)) throw new Error('Registry readback does not match the submitted commitment terms.');
    clearPendingTransaction(storage);
    onState(TX_STATE.CONFIRMED, { hash: pending.txHash, commitment, pending: null, error: null });
    return { state: TX_STATE.CONFIRMED, hash: pending.txHash, commitment };
  } catch (error) {
    onState(TX_STATE.AMBIGUOUS, { hash: pending.txHash, pending, error: AMBIGUOUS_TRANSACTION_MESSAGE });
    return { state: TX_STATE.AMBIGUOUS, hash: pending.txHash, pending, error };
  }
}

export async function prepareCommitmentForWallet(provider, input, account, { readHead = readCurrentElysiumBlock, readFees = readFreshEip1559Fees, onHead = () => {} } = {}) {
  const chainId = await provider.request({ method: 'eth_chainId' });
  if (chainId.toLowerCase() !== ELYSIUM_CHAIN_ID_HEX) throw new Error('Switch to Elysium Testnet before submitting.');
  let currentHead;
  try { currentHead = await readHead(); } catch { throw new Error(HEAD_UNAVAILABLE_MESSAGE); }
  onHead(currentHead);
  const checked = validateCommitmentInput(input, currentHead);
  if (checked.errors.startBlock === 'This block has already passed. Choose a future start block.') throw new Error(STALE_START_MESSAGE);
  if (!checked.valid) throw new Error(checked.errors.head || checked.errors.subject || checked.errors.endBlock || checked.errors.minimum || 'Commitment terms are invalid.');
  const transaction = buildCommitmentTransaction(input, account, currentHead);
  const { gas } = await preflightCommitment(provider, transaction);
  const fees = await readFees(provider);
  return { transaction: { ...transaction, gas, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas }, fees, currentHead };
}

export async function submitCommitment(provider, input, account, onState = () => {}, options = {}) {
  onState(TX_STATE.PREPARING);
  const { transaction } = await prepareCommitmentForWallet(provider, input, account, options);
  onState(TX_STATE.AWAITING_WALLET);
  let hash;
  try { hash = await provider.request({ method: 'eth_sendTransaction', params: [transaction] }); }
  catch (error) {
    if (error?.code === 4001) {
      const message = 'Transaction cancelled. Nothing was submitted.';
      onState(TX_STATE.PRE_BROADCAST_FAILED, { error: message });
      return { state: TX_STATE.PRE_BROADCAST_FAILED, error: message };
    }
    if (/max fee|base fee|fee per gas|underpriced/i.test(error?.message ?? '')) throw new Error(FEE_PREPARATION_MESSAGE, { cause: error });
    throw error;
  }
  const storage = options.storage ?? browserStorage();
  const pending = buildPendingTransaction(input, account, hash, options.now?.() ?? Date.now());
  persistPendingTransaction(pending, storage);
  onState(TX_STATE.SUBMITTED, { hash, pending });
  onState(TX_STATE.CONFIRMING, { hash, pending });
  try {
    const receipt = await (options.waitForReceipt ?? waitForSuccessfulReceipt)(provider, hash);
    const event = commitmentEventFromReceipt(receipt);
    if (!commitmentEventMatchesPending(event, pending)) throw new Error('CommitmentCreated does not match the submitted commitment terms.');
    const id = event.id;
    const commitment = await readBackCommitment(provider, id);
    if (!commitmentMatchesPending(commitment, pending)) throw new Error('Registry readback does not match the submitted commitment terms.');
    clearPendingTransaction(storage);
    onState(TX_STATE.CONFIRMED, { hash, commitment, pending: null });
    return { state: TX_STATE.CONFIRMED, hash, commitment };
  } catch (error) {
    if (error?.code === 'TRANSACTION_REVERTED') {
      clearPendingTransaction(storage);
      onState(TX_STATE.REVERTED, { hash, pending: null, error: error.message });
      return { state: TX_STATE.REVERTED, hash, error: error.message };
    }
    onState(TX_STATE.AMBIGUOUS, { hash, pending, error: AMBIGUOUS_TRANSACTION_MESSAGE });
    throw Object.assign(error instanceof Error ? error : new Error(AMBIGUOUS_TRANSACTION_MESSAGE), { code: 'AMBIGUOUS_TRANSACTION', hash, pending });
  }
}
