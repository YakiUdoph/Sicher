export type Eip1193Provider = { request(args: { method: string; params?: unknown[] }): Promise<any> | any; on?(event: string, listener: (...args: any[]) => void): void; removeListener?(event: string, listener: (...args: any[]) => void): void };
export function shortenAddress(address: string | null): string;
export function isElysiumChain(chainId: unknown): boolean;
export function friendlyWalletError(error: any, action?: string): string;
export function readWallet(provider: Eip1193Provider): Promise<{ availability: string; account: string | null; chainId: string | null }>;
export function connectWallet(provider: Eip1193Provider): Promise<{ account: string | null; chainId: string }>;
export function switchToElysium(provider: Eip1193Provider): Promise<string>;
export function watchWallet(provider: Eip1193Provider, handlers: { onAccountsChanged?(account: string | null): void; onChainChanged?(chainId: string): void }): () => void;
