import { describe, expect, it } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  USDC_MINT,
  buildUsdcTransfer,
  formatUsdcAmount,
  parseUsdcAmount,
  solFeeError,
  validateSolanaAddress,
} from '../src/lib/usdc-send';

// Deterministic 32-byte public keys, valid by construction.
const key = (seed: number) => new PublicKey(Uint8Array.from({ length: 32 }, (_, i) => (seed + i) % 251)).toBase58();
const FROM = key(1);
const OTHER = key(2);
const BLOCKHASH = '11111111111111111111111111111111';

const errorOf = (result: { base: bigint } | { error: string }): string | undefined =>
  ('error' in result ? result.error : undefined);

const ataSeed = (owner: string) =>
  PublicKey.findProgramAddressSync([new PublicKey(owner).toBytes(), TOKEN_PROGRAM_ID.toBytes(), new PublicKey(USDC_MINT).toBytes()], ASSOCIATED_TOKEN_PROGRAM_ID)[0];

describe('address validation', () => {
  it('accepts a plain valid address and trims whitespace', () => {
    expect(validateSolanaAddress(`  ${OTHER}  `, FROM)).toBeNull();
  });

  it('rejects garbage', () => {
    expect(validateSolanaAddress('hello', FROM)).toMatch(/does not look like/);
    expect(validateSolanaAddress('abc$def', FROM)).toMatch(/does not look like/);
    expect(validateSolanaAddress('   ', FROM)).toMatch(/Enter a Solana address/);
  });

  it('rejects sending to yourself', () => {
    expect(validateSolanaAddress(FROM, FROM)).toMatch(/sending from/);
  });

  it('rejects the USDC mint and the System Program id', () => {
    expect(validateSolanaAddress(USDC_MINT, FROM)).toMatch(/USDC mint/);
    expect(validateSolanaAddress('11111111111111111111111111111111', FROM)).toMatch(/program address/);
  });
});

describe('amount parsing', () => {
  it('converts to base units', () => {
    expect(parseUsdcAmount('1', null)).toEqual({ base: 1000000n });
    expect(parseUsdcAmount('0.000001', null)).toEqual({ base: 1n });
    expect(parseUsdcAmount(' 12.34 ', null)).toEqual({ base: 12340000n });
  });

  it('rejects bad input', () => {
    expect(parseUsdcAmount('', null)).toEqual({ error: 'Enter an amount.' });
    expect(errorOf(parseUsdcAmount('0', null))).toMatch(/above zero/);
    expect(errorOf(parseUsdcAmount('-1', null))).toMatch(/numbers only/);
    expect(errorOf(parseUsdcAmount('1.0000001', null))).toMatch(/6 decimal/);
    expect(errorOf(parseUsdcAmount('abc', null))).toMatch(/numbers only/);
    expect(errorOf(parseUsdcAmount('1,000', null))).toMatch(/numbers only/);
  });

  it('checks the balance only when it is known', () => {
    expect(errorOf(parseUsdcAmount('2', 1))).toMatch(/more USDC than the wallet has/);
    expect(parseUsdcAmount('1', 1)).toEqual({ base: 1000000n });
    expect(parseUsdcAmount('2', null)).toEqual({ base: 2000000n });
    expect(parseUsdcAmount('0.000001', 1)).toEqual({ base: 1n });
    expect(errorOf(parseUsdcAmount('1.01', 1))).toMatch(/more USDC than the wallet has/);
  });
});

describe('fee warning', () => {
  it('warns plainly when SOL is short', () => {
    expect(solFeeError(0, true)).toBe('Sending needs a little SOL for the Solana network fee (about 0.002 SOL). Your wallet has 0 SOL.');
    expect(solFeeError(0.001, true)).toMatch(/Your wallet has 0.001 SOL/);
    expect(solFeeError(0.0021, true)).toBeNull();
    expect(solFeeError(0.000005, false)).toBeNull();
    expect(solFeeError(0.000001, false)).toMatch(/about 0.000005 SOL/);
  });
});

describe('buildUsdcTransfer', () => {
  it('encodes TransferChecked amount and decimals correctly', async () => {
    const tx = await buildUsdcTransfer({ from: FROM, to: OTHER, base: 1234567n, recipientHasAta: true, blockhash: BLOCKHASH });
    expect(tx.feePayer?.toBase58()).toBe(FROM);
    expect(tx.recentBlockhash).toBe(BLOCKHASH);
    expect(tx.instructions).toHaveLength(1);
    const transfer = tx.instructions[0];
    expect(transfer.programId.toBase58()).toBe(TOKEN_PROGRAM_ID.toBase58());
    const sourceAta = ataSeed(FROM);
    const destinationAta = ataSeed(OTHER);
    expect(transfer.keys.map(item => item.pubkey.toBase58())).toEqual([
      sourceAta.toBase58(),
      USDC_MINT,
      destinationAta.toBase58(),
      FROM,
    ]);
    expect(transfer.keys[3].isSigner).toBe(true);
    expect(Array.from(transfer.data)).toEqual([12, 0x87, 0xd6, 0x12, 0, 0, 0, 0, 0, 6]);
  });

  it('adds an idempotent token account create when the recipient has no account', async () => {
    const tx = await buildUsdcTransfer({ from: FROM, to: OTHER, base: 1n, recipientHasAta: false, blockhash: BLOCKHASH });
    expect(tx.instructions).toHaveLength(2);
    const create = tx.instructions[0];
    expect(create.programId.toBase58()).toBe(ASSOCIATED_TOKEN_PROGRAM_ID.toBase58());
    expect(Array.from(create.data)).toEqual([1]);
    expect(create.keys.map(item => item.pubkey.toBase58())).toEqual([
      FROM,
      ataSeed(OTHER).toBase58(),
      OTHER,
      USDC_MINT,
      '11111111111111111111111111111111',
      TOKEN_PROGRAM_ID.toBase58(),
    ]);
    expect(create.keys[0].isSigner).toBe(true);
  });
});

describe('formatUsdcAmount', () => {
  it('trims trailing zeros', () => {
    expect(formatUsdcAmount(1.5)).toBe('1.5');
    expect(formatUsdcAmount(12)).toBe('12');
    expect(formatUsdcAmount(0.000001)).toBe('0.000001');
    expect(formatUsdcAmount(12.345678)).toBe('12.345678');
  });
});
