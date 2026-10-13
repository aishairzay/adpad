// Look up a Solana transaction signature for a past USDC transfer, so the deal
// card can link "View on Solana" for the lock and the payout. Signatures are
// not stored on the deal record; they are found on chain by time instead.
import { LIVE_HOSTS } from '../config';
import { USDC_MINT } from './usdc-send';

// The same mainnet endpoint wallet-balance.ts uses (CORS open). Copied here
// because wallet-balance.ts must not be edited.
const RPC = 'https://celestia-cegncv-fast-mainnet.helius-rpc.com';

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (!response.ok) throw new Error(`rpc ${response.status}`);
  const body = await response.json() as { result?: T; error?: unknown };
  if (body.error || body.result === undefined) throw new Error('rpc error');
  return body.result;
}

/**
 * The signature of a USDC transfer touching `owner`'s USDC token account(s)
 * closest in time to `aroundUnix` (unix seconds) within the window, or null
 * when none matches or the lookup fails. Failed transactions are skipped.
 */
async function findUsdcTransferUncached(owner: string, aroundUnix: number, windowSeconds = 900): Promise<string | null> {
  try {
    if (!LIVE_HOSTS.has(location.hostname)) return null;
    const accounts = await rpc<{ value: { pubkey: string }[] }>('getTokenAccountsByOwner', [owner, { mint: USDC_MINT }, { encoding: 'jsonParsed' }]);
    const pubkeys = accounts.value.map(item => item.pubkey);
    if (!pubkeys.length) return null;
    // getSignaturesForAddress answers a plain array (no { value } wrapper).
    const pages = await Promise.all(pubkeys.map(pubkey =>
      rpc<{ signature: string; blockTime: number | null; err: unknown }[]>('getSignaturesForAddress', [pubkey, { limit: 50 }]),
    ));
    let best: { signature: string; distance: number } | null = null;
    for (const page of pages) {
      for (const item of Array.isArray(page) ? page : []) {
        if (item.err || typeof item.blockTime !== 'number') continue;
        const distance = Math.abs(item.blockTime - aroundUnix);
        if (distance > windowSeconds) continue;
        if (!best || distance < best.distance) best = { signature: item.signature, distance };
      }
    }
    return best?.signature ?? null;
  } catch {
    return null;
  }
}

const transferCache = new Map<string, Promise<string | null>>();

/** Cached per owner and time, so the deal card and the escrow account lookup share one search. */
export function findUsdcTransfer(owner: string, aroundUnix: number, windowSeconds = 900): Promise<string | null> {
  const key = `${owner}:${aroundUnix}:${windowSeconds}`;
  let found = transferCache.get(key);
  if (!found) { found = findUsdcTransferUncached(owner, aroundUnix, windowSeconds); transferCache.set(key, found); }
  return found;
}

interface ParsedInstruction { parsed?: { type?: string; info?: Record<string, unknown> } }

/**
 * The token account the sponsor's USDC moved into in the lock transaction:
 * the destination of the USDC transfer that `funder` signed. Pure, for tests.
 */
export function escrowAccountFromTx(tx: unknown, funder: string): string | null {
  const t = tx as { transaction?: { message?: { instructions?: ParsedInstruction[] } }; meta?: { innerInstructions?: { instructions?: ParsedInstruction[] }[] } } | null;
  if (!t) return null;
  const all: ParsedInstruction[] = [...(t.transaction?.message?.instructions ?? [])];
  for (const group of t.meta?.innerInstructions ?? []) all.push(...(group.instructions ?? []));
  for (const ins of all) {
    const type = ins.parsed?.type; const info = ins.parsed?.info;
    if (!info || (type !== 'transferChecked' && type !== 'transfer')) continue;
    if (info.authority !== funder) continue;
    if (type === 'transferChecked' && info.mint !== USDC_MINT) continue;
    if (typeof info.destination === 'string') return info.destination;
  }
  return null;
}

export interface EscrowAccount { address: string; balanceBase: number | null }

/** The escrow's USDC token account and what it holds right now (null balance when it has been closed). */
export async function findEscrowAccount(lockSignature: string, funder: string): Promise<EscrowAccount | null> {
  try {
    if (!LIVE_HOSTS.has(location.hostname)) return null;
    const tx = await rpc<unknown>('getTransaction', [lockSignature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1, commitment: 'confirmed' }]);
    const address = escrowAccountFromTx(tx, funder);
    if (!address) return null;
    let balanceBase: number | null = null;
    try {
      const balance = await rpc<{ value: { amount: string } }>('getTokenAccountBalance', [address]);
      balanceBase = Number(balance.value.amount);
    } catch { balanceBase = null; }
    return { address, balanceBase };
  } catch {
    return null;
  }
}
