import { LIVE_HOSTS } from '../config';

// The same mainnet endpoint @bounded-sh/client uses for solana_mainnet (CORS open). The public
// api.mainnet-beta endpoint answers 403 to browsers.
const RPC = 'https://celestia-cegncv-fast-mainnet.helius-rpc.com';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export interface WalletBalance { usdc: number; sol: number }

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (!response.ok) throw new Error(`rpc ${response.status}`);
  const body = await response.json() as { result?: T; error?: unknown };
  if (body.error || body.result === undefined) throw new Error('rpc error');
  return body.result;
}

/** Mainnet USDC and SOL for an address. Null when it cannot be read (previews, network trouble): never shown as zero. */
export async function readWalletBalance(address: string): Promise<WalletBalance | null> {
  if (!LIVE_HOSTS.has(location.hostname)) return null;
  try {
    const [lamports, tokens] = await Promise.all([
      rpc<{ value: number }>('getBalance', [address]),
      rpc<{ value: { account: { data: { parsed: { info: { tokenAmount: { uiAmount: number | null } } } } } }[] }>('getTokenAccountsByOwner', [address, { mint: USDC_MINT }, { encoding: 'jsonParsed' }]),
    ]);
    const usdc = tokens.value.reduce((sum, item) => sum + (item.account.data.parsed.info.tokenAmount.uiAmount || 0), 0);
    return { usdc, sol: lamports.value / 1e9 };
  } catch { return null; }
}
