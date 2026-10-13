import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';

// Same mainnet endpoint the wallet balance reader uses (CORS open). Duplicated here
// because usdc-send must be self-contained and not edit wallet-balance.ts.
const RPC_URL = 'https://celestia-cegncv-fast-mainnet.helius-rpc.com';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_MINT_KEY = new PublicKey(USDC_MINT);
const SYSTEM_PROGRAM_KEY = SystemProgram.programId;
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const USDC_DECIMALS = 6;

// Rough costs, stated plainly in the UI. A plain transfer is about 0.000005 SOL;
// a brand new recipient token account costs about 0.002 SOL of rent on top.
export const SOL_FEE_ESTIMATE = 0.000005;
export const ATA_RENT_ESTIMATE = 0.002;

/** Error message for a recipient address, or null when it can be used. */
export function validateSolanaAddress(input: string, self: string): string | null {
  const value = input.trim();
  if (!value) return 'Enter a Solana address.';
  let key: PublicKey;
  try {
    key = new PublicKey(value);
  } catch {
    return 'That does not look like a Solana address. It is a long string of letters and numbers.';
  }
  const selfValue = self.trim();
  if (selfValue) {
    try {
      if (key.equals(new PublicKey(selfValue))) return 'That is the address you are sending from. Enter a different one.';
    } catch { /* self was not a valid key: fall through */ }
  }
  if (key.equals(USDC_MINT_KEY)) return 'That is the USDC mint address, not a personal wallet.';
  if (key.equals(SYSTEM_PROGRAM_KEY)) return 'That is a Solana program address, not a personal wallet.';
  return null;
}

/** Parse a USDC amount into exact base units. Balance is in whole USDC, or null when unknown. */
export function parseUsdcAmount(input: string, balanceUsdc: number | null): { base: bigint } | { error: string } {
  const value = input.trim();
  if (!value) return { error: 'Enter an amount.' };
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) return { error: 'Use numbers only, up to 6 decimal places.' };
  const whole = value.split('.');
  const fraction = whole[1] ?? '';
  const base = BigInt(whole[0] + fraction + '0'.repeat(USDC_DECIMALS - fraction.length));
  if (base === 0n) return { error: 'Enter an amount above zero.' };
  if (balanceUsdc !== null && Number(base) > Math.round(balanceUsdc * 1e6)) {
    return { error: 'That is more USDC than the wallet has.' };
  }
  return { base };
}

/** Exact string for a USDC whole amount, keeping up to 6 decimals without trailing zeros. */
export function formatUsdcAmount(usdc: number): string {
  return usdc.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function solDisplay(sol: number): string {
  if (sol === 0) return '0';
  return sol.toFixed(9).replace(/0+$/, '').replace(/\.$/, '');
}

/** Plain-words warning when the sending wallet cannot cover the Solana fee, or null when it can. */
export function solFeeError(sol: number, needsAta: boolean): string | null {
  const needed = needsAta ? ATA_RENT_ESTIMATE + SOL_FEE_ESTIMATE : SOL_FEE_ESTIMATE;
  if (sol >= needed) return null;
  const about = needsAta ? '0.002' : '0.000005';
  return `Sending needs a little SOL for the Solana network fee (about ${about} SOL). Your wallet has ${solDisplay(sol)} SOL.`;
}

async function rpcCall<T>(method: string, params: unknown[], rpcUrl?: string): Promise<T> {
  const response = await fetch(rpcUrl || RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`rpc ${response.status}`);
  const body = await response.json() as { result?: T; error?: unknown };
  if (body.error || body.result === undefined) throw new Error('rpc error');
  return body.result;
}

/** Whether the recipient already holds a USDC token account. Null when it cannot be checked. */
export async function hasUsdcTokenAccount(owner: string, rpcUrl?: string): Promise<boolean | null> {
  try {
    const result = await rpcCall<{ value: unknown[] }>('getTokenAccountsByOwner', [owner.trim(), { mint: USDC_MINT }, { encoding: 'jsonParsed' }], rpcUrl);
    return result.value.length > 0;
  } catch {
    return null;
  }
}

function u64LeBytes(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  let rest = value;
  for (let i = 0; i < 8; i++) {
    bytes[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return bytes;
}

async function fetchRecentBlockhash(rpcUrl?: string): Promise<string> {
  const result = await rpcCall<{ value: { blockhash: string } }>('getLatestBlockhash', [{ commitment: 'confirmed' }], rpcUrl);
  return result.value.blockhash;
}

export interface UsdcTransferArgs {
  /** Sender wallet address (the signed-in AdPad wallet). */
  from: string;
  /** Recipient Solana address. */
  to: string;
  /** Amount in USDC base units (6 decimals). */
  base: bigint;
  /** False adds an idempotent create for the recipient's USDC token account. */
  recipientHasAta: boolean;
  /** Optional recent blockhash; fetched from the RPC when omitted. */
  blockhash?: string;
  /** Optional RPC endpoint override (tests). */
  rpcUrl?: string;
}

/** Build the USDC transfer transaction with feePayer and recentBlockhash set. */
export async function buildUsdcTransfer(args: UsdcTransferArgs): Promise<Transaction> {
  const from = new PublicKey(args.from.trim());
  const to = new PublicKey(args.to.trim());
  const [sourceAta, destinationAta] = [from, to].map(owner =>
    PublicKey.findProgramAddressSync([owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), USDC_MINT_KEY.toBytes()], ASSOCIATED_TOKEN_PROGRAM_ID)[0],
  );

  const transaction = new Transaction();
  if (!args.recipientHasAta) {
    transaction.add(new TransactionInstruction({
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: from, isSigner: true, isWritable: true },
        { pubkey: destinationAta, isSigner: false, isWritable: true },
        { pubkey: to, isSigner: false, isWritable: false },
        { pubkey: USDC_MINT_KEY, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([1]),
    }));
  }

  const data = new Uint8Array(10);
  data[0] = 12; // TransferChecked
  data.set(u64LeBytes(args.base), 1);
  data[9] = USDC_DECIMALS;
  transaction.add(new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: sourceAta, isSigner: false, isWritable: true },
      { pubkey: USDC_MINT_KEY, isSigner: false, isWritable: false },
      { pubkey: destinationAta, isSigner: false, isWritable: true },
      { pubkey: from, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(data),
  }));

  transaction.feePayer = from;
  transaction.recentBlockhash = args.blockhash ?? await fetchRecentBlockhash(args.rpcUrl);
  return transaction;
}

/** Build, sign with the signed-in user's wallet, submit, and return the signature. */
export async function sendUsdc(args: UsdcTransferArgs): Promise<string> {
  const transaction = await buildUsdcTransfer(args);
  const { signAndSubmitTransaction } = await import('@bounded-sh/client');
  return signAndSubmitTransaction(transaction);
}
