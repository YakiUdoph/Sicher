import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { connectWallet, friendlyWalletError, isElysiumChain, readWallet, switchToElysium, watchWallet } from './wallet.js';

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const provider = typeof window !== 'undefined' ? window.ethereum : null;
  const [state, setState] = useState({ availability: provider ? 'available' : 'missing', account: null, chainId: null, status: 'idle', error: null });
  useEffect(() => {
    let active = true;
    if (!provider) return undefined;
    readWallet(provider).then((next) => { if (active) setState((old) => ({ ...old, ...next })); }).catch(() => {});
    const stop = watchWallet(provider, {
      onAccountsChanged: (account) => setState((old) => ({ ...old, account, status: 'idle', error: null })),
      onChainChanged: (chainId) => setState((old) => ({ ...old, chainId, status: 'idle', error: null })),
    });
    return () => { active = false; stop(); };
  }, [provider]);
  const actions = useMemo(() => ({
    connect: async () => {
      setState((old) => ({ ...old, status: 'connecting', error: null }));
      try { const next = await connectWallet(provider); setState((old) => ({ ...old, ...next, status: 'idle', error: null })); }
      catch (error) { setState((old) => ({ ...old, status: 'error', error: friendlyWalletError(error) })); }
    },
    switchNetwork: async () => {
      setState((old) => ({ ...old, status: 'switching', error: null }));
      try { const chainId = await switchToElysium(provider); setState((old) => ({ ...old, chainId, status: 'idle', error: null })); }
      catch (error) { setState((old) => ({ ...old, status: 'error', error: friendlyWalletError(error, 'switch') })); }
    },
    disconnect: () => setState((old) => ({ ...old, account: null, status: 'idle', error: null })),
  }), [provider]);
  return <WalletContext.Provider value={{ ...state, provider, correctChain: isElysiumChain(state.chainId), ...actions }}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error('useWallet must be used inside WalletProvider.');
  return value;
}
