// Keep payments on the wallet the user signed in with. The SDK pins the wallet picked in the
// login widget only for that page load; a restored session falls back to Phantom-first discovery,
// so a Solflare (or Backpack, ...) user saw Phantom open when locking USDC after a reload.
// We remember which Wallet Standard wallet holds the signed-in address and pin it on the restored
// session before signing. Only the wallet's name is kept on the device; no app state lives here.
import { getWallets } from '@wallet-standard/app';
import { getAuthProvider } from '@bounded-sh/client';

type Account = { address: string; chains: readonly string[]; features: readonly string[] };
type StdWallet = { name: string; chains: readonly string[]; accounts: readonly Account[]; features: Record<string, any> };
type Tx = { serialize(options?: unknown): Uint8Array; version?: unknown; constructor: any };

const KEY = 'adpad:wallet-name:';
const MOBILE = /mobile wallet adapter/i;

function solanaWallets(): StdWallet[] {
  if (typeof window === 'undefined') return [];
  try {
    return (getWallets().get() as unknown as StdWallet[]).filter(w =>
      w.chains.some(c => c.startsWith('solana:')) && w.features['standard:connect'] && w.features['solana:signTransaction'] && !MOBILE.test(w.name));
  } catch { return []; }
}

const holds = (wallet: StdWallet, address: string) => wallet.accounts.some(a => a.address === address);

/** Remember which installed wallet holds this address (it does right after signing in). */
export function rememberSessionWallet(address: string | null | undefined): void {
  if (!address) return;
  const wallet = solanaWallets().find(w => holds(w, address));
  if (!wallet) return;
  try { localStorage.setItem(KEY + address, wallet.name); } catch { /* storage blocked: keep SDK default */ }
}

export function preferredWalletName(address: string): string | null {
  try { return localStorage.getItem(KEY + address); } catch { return null; }
}

function serialize(tx: Tx): Uint8Array {
  return 'version' in tx ? tx.serialize() : tx.serialize({ requireAllSignatures: false, verifySignatures: false });
}

function revive(original: Tx, bytes: Uint8Array): Tx {
  const ctor = original.constructor;
  return 'version' in original ? ctor.deserialize(bytes) : ctor.from(bytes);
}

/** A Wallet Standard wallet in the injected-provider shape the SDK signs with. */
export function standardProvider(wallet: StdWallet, address: string, chain: string | null) {
  const account = () => wallet.accounts.find(a => a.address === address && (!chain || a.chains.includes(chain)))
    ?? wallet.accounts.find(a => a.chains.some(c => c.startsWith('solana:')) && (!chain || a.chains.includes(chain))) ?? null;
  const need = () => { const a = account(); if (!a) throw new Error('Wallet not connected'); return a; };
  const input = (a: Account, transaction: Uint8Array) => chain ? { account: a, transaction, chain } : { account: a, transaction };
  return {
    get isConnected() { return account() !== null; },
    get publicKey() { const a = account(); return a ? { toString: () => a.address } : null; },
    async connect(options?: { onlyIfTrusted?: boolean }) {
      const res = await wallet.features['standard:connect'].connect(options?.onlyIfTrusted ? { silent: true } : undefined);
      const a = (res?.accounts as Account[] | undefined)?.find(x => x.address === address) ?? account();
      if (!a) throw new Error('Wallet returned no account on connect');
      return { publicKey: { toString: () => a.address } };
    },
    async disconnect() { await wallet.features['standard:disconnect']?.disconnect(); },
    async signMessage(message: Uint8Array) {
      const a = need();
      const [out] = await wallet.features['solana:signMessage'].signMessage({ account: a, message });
      return { signature: out.signature as Uint8Array, publicKey: { toString: () => a.address } };
    },
    async signTransaction<T extends Tx>(tx: T): Promise<T> {
      const [out] = await wallet.features['solana:signTransaction'].signTransaction(input(need(), serialize(tx)));
      return revive(tx, out.signedTransaction) as T;
    },
    async signAllTransactions<T extends Tx>(txs: T[]): Promise<T[]> {
      const a = need();
      const outs = await wallet.features['solana:signTransaction'].signTransaction(...txs.map(tx => input(a, serialize(tx))));
      return outs.map((o: { signedTransaction: Uint8Array }, i: number) => revive(txs[i], o.signedTransaction) as T);
    },
    supportedTransactionVersions() {
      const v = wallet.features['solana:signTransaction']?.supportedTransactionVersions;
      const list = (v instanceof Set ? [...v] : Array.isArray(v) ? v : []).filter((x: unknown) => x === 'legacy' || x === 0);
      return list.length ? list : ['legacy', 0];
    },
    // Sign, then the SDK submits and checks who signed; never the wallet's own send.
    canSignAndSend: () => false,
    canSignTransaction: () => account() !== null,
  };
}

/**
 * Before a signature on a restored session, point the SDK at the wallet the user signed in with.
 * Does nothing when the SDK already has a wallet pinned (a login in this page load), when the
 * wallet is unknown or not installed, or for phone wallets; the SDK's own discovery stays.
 */
export async function pinSessionWallet(address: string | null | undefined, chain: string | null): Promise<void> {
  if (!address) return;
  rememberSessionWallet(address);
  const name = preferredWalletName(address);
  if (!name) return;
  const wallet = solanaWallets().find(w => w.name === name);
  if (!wallet) return;
  let provider: any;
  try { provider = await getAuthProvider(); } catch { return; }
  if (!provider || typeof provider.setWalletConfig !== 'function' || !provider.config || provider.config.getProvider) return;
  if (provider.authenticatedAddress && provider.authenticatedAddress !== address) return;
  const pinned = standardProvider(wallet, address, chain);
  provider.setWalletConfig({ ...provider.config, getProvider: () => pinned });
}
