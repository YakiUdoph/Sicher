export const ELYSIUM_CHAIN_ID = 99801;
export const ELYSIUM_CHAIN_ID_HEX = `0x${ELYSIUM_CHAIN_ID.toString(16)}`;
export const ELYSIUM_NETWORK_NAME = 'Elysium Testnet';
export const ELYSIUM_RPC_URL = 'https://elysium-testnet-rpc.hypedexer.com';
export const REGISTRY_ADDRESS = '0x4e4887e28a8370678a9a37c08a85c65450b510c0';
export const STEST_ADDRESS = '0x14fc373dce148766a3b8d9c2bf5f02f8dbe316a7';
export const STEST_DECIMALS = 18;

export const ELYSIUM_ADD_CHAIN = Object.freeze({
  chainId: ELYSIUM_CHAIN_ID_HEX,
  chainName: ELYSIUM_NETWORK_NAME,
  nativeCurrency: Object.freeze({ name: 'HYPE', symbol: 'HYPE', decimals: 18 }),
  rpcUrls: Object.freeze([ELYSIUM_RPC_URL]),
});

export const REGISTRY_ABI = Object.freeze([
  {
    type: 'function', name: 'createCommitment', stateMutability: 'nonpayable',
    inputs: [
      { name: 'subject', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'minimumBalance', type: 'uint256' },
      { name: 'startBlock', type: 'uint256' },
      { name: 'endBlock', type: 'uint256' },
    ],
    outputs: [{ name: 'id', type: 'uint256' }],
  },
  {
    type: 'function', name: 'commitments', stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [
      { name: 'id', type: 'uint256' }, { name: 'creator', type: 'address' },
      { name: 'subject', type: 'address' }, { name: 'token', type: 'address' },
      { name: 'minimumBalance', type: 'uint256' }, { name: 'startBlock', type: 'uint256' },
      { name: 'endBlock', type: 'uint256' },
    ],
  },
  {
    type: 'event', name: 'CommitmentCreated', anonymous: false,
    inputs: [
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: true, name: 'creator', type: 'address' },
      { indexed: true, name: 'subject', type: 'address' },
      { indexed: false, name: 'token', type: 'address' },
      { indexed: false, name: 'minimumBalance', type: 'uint256' },
      { indexed: false, name: 'startBlock', type: 'uint256' },
      { indexed: false, name: 'endBlock', type: 'uint256' },
    ],
  },
]);
