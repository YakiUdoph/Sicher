import { ELYSIUM_ADD_CHAIN, ELYSIUM_CHAIN_ID_HEX } from './chainConfig.js';

export function shortenAddress(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';
}

export function isElysiumChain(chainId) {
  return typeof chainId === 'string' && chainId.toLowerCase() === ELYSIUM_CHAIN_ID_HEX;
}

export function friendlyWalletError(error, action = 'connect') {
  if (error?.code === 4001) return action === 'switch' ? 'Network switch was cancelled.' : 'Connection was cancelled.';
  if (error?.code === -32002) return 'A wallet request is already open.';
  return action === 'switch' ? 'Could not switch networks. Try again in your wallet.' : 'Could not connect. Check your wallet and try again.';
}

export async function readWallet(provider) {
  if (!provider?.request) return { availability: 'missing', account: null, chainId: null };
  const [accounts, chainId] = await Promise.all([
    provider.request({ method: 'eth_accounts' }),
    provider.request({ method: 'eth_chainId' }),
  ]);
  return { availability: 'available', account: accounts?.[0] ?? null, chainId };
}

export async function connectWallet(provider) {
  if (!provider?.request) throw Object.assign(new Error('No injected wallet found.'), { code: 'NO_PROVIDER' });
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  const chainId = await provider.request({ method: 'eth_chainId' });
  return { account: accounts?.[0] ?? null, chainId };
}

export async function switchToElysium(provider) {
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: ELYSIUM_CHAIN_ID_HEX }] });
  } catch (error) {
    if (error?.code !== 4902) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [ELYSIUM_ADD_CHAIN] });
  }
  return provider.request({ method: 'eth_chainId' });
}

export function watchWallet(provider, handlers) {
  if (!provider?.on) return () => {};
  const onAccounts = (accounts) => handlers.onAccountsChanged?.(accounts?.[0] ?? null);
  const onChain = (chainId) => handlers.onChainChanged?.(chainId);
  provider.on('accountsChanged', onAccounts);
  provider.on('chainChanged', onChain);
  return () => {
    provider.removeListener?.('accountsChanged', onAccounts);
    provider.removeListener?.('chainChanged', onChain);
  };
}
