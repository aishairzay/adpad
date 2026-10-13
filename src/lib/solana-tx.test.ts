import { describe, expect, it } from 'vitest';
import { escrowAccountFromTx } from './solana-tx';
import { USDC_MINT } from './usdc-send';

// Shape copied from the real lock transaction of AdPad's first mainnet deal.
const SPONSOR = '9e78iP279ZeCuuMFM5v3Z1Sz8oxQTYzX6YRuh9Tw31ep';
const lockTx = {
  transaction: { message: { instructions: [{ programId: 'openTv7fbpYSseNHYmCZFZ1CZgj4r8D9fKNgEz1qo6F' }] } },
  meta: { innerInstructions: [{ instructions: [
    { parsed: { type: 'createAccount', info: { newAccount: 'EkKEjhFnuafrNzWbvDM5WExr2As8tbiZBRMPuzFPETFP' } } },
    { parsed: { type: 'transferChecked', info: { authority: 'someoneElse', destination: 'WRONG', mint: USDC_MINT } } },
    { parsed: { type: 'transferChecked', info: { authority: SPONSOR, destination: 'FkcztCCheFbNck8TPEcy8B3kANsKSr3foUbrwAL45MqJ', mint: USDC_MINT, source: '37PSfuCjLPHNTmk38H4hkAT1kTtLMTozF9XxcEbskoVU' } } },
  ] }] },
};

describe('escrowAccountFromTx', () => {
  it('finds the token account the sponsor locked USDC into', () => {
    expect(escrowAccountFromTx(lockTx, SPONSOR)).toBe('FkcztCCheFbNck8TPEcy8B3kANsKSr3foUbrwAL45MqJ');
  });
  it('ignores transfers signed by someone else or of another mint', () => {
    expect(escrowAccountFromTx(lockTx, 'nobody')).toBeNull();
    const otherMint = { meta: { innerInstructions: [{ instructions: [{ parsed: { type: 'transferChecked', info: { authority: SPONSOR, destination: 'X', mint: 'notUsdc' } } }] }] } };
    expect(escrowAccountFromTx(otherMint, SPONSOR)).toBeNull();
  });
  it('survives a missing transaction', () => {
    expect(escrowAccountFromTx(null, SPONSOR)).toBeNull();
  });
});
