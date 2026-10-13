import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADDR = 'So1f1areUser11111111111111111111111111111111';
const registry: any[] = [];
let provider: any = null;
vi.mock('@wallet-standard/app', () => ({ getWallets: () => ({ get: () => registry }) }));
vi.mock('@bounded-sh/client', () => ({ getAuthProvider: async () => provider }));

import { pinSessionWallet, preferredWalletName, rememberSessionWallet, standardProvider } from '../src/lib/wallet-choice';

function wallet(name: string, accounts: string[] = []) {
  const w: any = {
    name, chains: ['solana:mainnet'], accounts: accounts.map(address => ({ address, chains: ['solana:mainnet'], features: [] })),
    features: {
      'standard:connect': { connect: vi.fn(async () => { w.accounts = [{ address: ADDR, chains: ['solana:mainnet'], features: [] }]; return { accounts: w.accounts }; }) },
      'solana:signTransaction': { signTransaction: vi.fn(async (...inputs: any[]) => inputs.map(i => ({ signedTransaction: new Uint8Array([...i.transaction, 9]) }))) },
      'solana:signMessage': { signMessage: vi.fn() },
    },
  };
  return w;
}

class FakeTx { constructor(public bytes: Uint8Array) {} serialize() { return this.bytes; } static from(b: Uint8Array) { return new FakeTx(b); } }

beforeEach(() => {
  registry.length = 0;
  const store = new Map<string, string>();
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  provider = { config: { network: 'x' }, authenticatedAddress: ADDR, setWalletConfig(c: any) { this.config = c; } };
});

describe('wallet choice', () => {
  it('remembers the wallet that holds the signed-in address', () => {
    registry.push(wallet('Phantom'), wallet('Solflare', [ADDR]));
    rememberSessionWallet(ADDR);
    expect(preferredWalletName(ADDR)).toBe('Solflare');
  });

  it('pins the remembered wallet on a restored session', async () => {
    const solflare = wallet('Solflare', [ADDR]);
    registry.push(wallet('Phantom'), solflare);
    rememberSessionWallet(ADDR);
    solflare.accounts = []; // after a reload nothing is connected yet
    await pinSessionWallet(ADDR, 'solana:mainnet');
    const pinned = provider.config.getProvider();
    expect(provider.config.network).toBe('x');
    expect(pinned.isConnected).toBe(false);
    await pinned.connect({ onlyIfTrusted: true });
    expect(solflare.features['standard:connect'].connect).toHaveBeenCalledWith({ silent: true });
    expect(pinned.publicKey.toString()).toBe(ADDR);
  });

  it('leaves a wallet the SDK already pinned alone', async () => {
    registry.push(wallet('Solflare', [ADDR]));
    const mine = () => 'widget choice';
    provider.config.getProvider = mine;
    await pinSessionWallet(ADDR, null);
    expect(provider.config.getProvider).toBe(mine);
  });

  it('does nothing without a remembered wallet', async () => {
    registry.push(wallet('Phantom'));
    await pinSessionWallet(ADDR, null);
    expect(provider.config.getProvider).toBeUndefined();
  });

  it('signs through the wallet and returns the same transaction type', async () => {
    const w = wallet('Solflare', [ADDR]);
    const p = standardProvider(w, ADDR, 'solana:mainnet');
    const signed = await p.signTransaction(new FakeTx(new Uint8Array([1, 2])) as any);
    expect(signed).toBeInstanceOf(FakeTx);
    expect([...(signed as any).bytes]).toEqual([1, 2, 9]);
    expect(w.features['solana:signTransaction'].signTransaction.mock.calls[0][0].chain).toBe('solana:mainnet');
    expect(p.canSignAndSend()).toBe(false);
  });
});
