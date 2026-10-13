import { describe, expect, it } from 'vitest';
import { ADPAD_AGENT_ADDRESS, isEscrowId, MAX_DISPUTE_REASON, newEscrowId, parseEscrow, validateDisputeReason, validateEscrowTerms } from '../src/lib/app-escrow';

const now = 1_791_322_000;
const funder = 'SponsorWallet111';
const ok = { payee: 'CreatorWallet222', amountUsdc: 25_000_000, expiresAt: now + 30 * 86_400, ref: 'deal_' + 'a'.repeat(32) };

describe('app escrow terms', () => {
  it('accepts terms inside the escrow rules, with or without a creator named', () => {
    expect(validateEscrowTerms(ok, funder, now)).toEqual([]);
    expect(validateEscrowTerms({ ...ok, payee: null }, funder, now)).toEqual([]);
  });
  it('enforces amount, expiry, ref and parties', () => {
    expect(validateEscrowTerms({ ...ok, amountUsdc: 999_999 }, funder, now).length).toBe(1);
    expect(validateEscrowTerms({ ...ok, amountUsdc: 1_000_000_001 }, funder, now).length).toBe(1);
    expect(validateEscrowTerms({ ...ok, expiresAt: now + 3_599 }, funder, now).length).toBe(1);
    expect(validateEscrowTerms({ ...ok, expiresAt: now + 7_776_001 }, funder, now).length).toBe(1);
    expect(validateEscrowTerms({ ...ok, ref: '' }, funder, now).length).toBe(1);
    expect(validateEscrowTerms({ ...ok, payee: funder }, funder, now).length).toBe(1);
    expect(validateEscrowTerms({ ...ok, payee: ADPAD_AGENT_ADDRESS }, funder, now).length).toBe(1);
    expect(validateEscrowTerms(ok, null, now).length).toBe(1);
  });
  it('makes and recognises escrow ids', () => {
    expect(isEscrowId(newEscrowId())).toBe(true);
    expect(isEscrowId('AB'.repeat(16))).toBe(false);
  });
  it('wants a dispute reason of 10 to 400 characters', () => {
    expect(validateDisputeReason('too short')).not.toBeNull();
    expect(validateDisputeReason('x'.repeat(MAX_DISPUTE_REASON))).toBeNull();
    expect(validateDisputeReason('x'.repeat(MAX_DISPUTE_REASON + 1))).not.toBeNull();
  });
  it('reads an escrow record and refuses a malformed one', () => {
    const id = 'c'.repeat(32);
    const escrow = parseEscrow({ funder, payee: null, amountUsdc: 5_000_000, expiresAt: now, ref: 'deal_x', createdAt: now, status: 'locked', version: 1, fundedAt: now }, id);
    expect(escrow).toMatchObject({ escrowId: id, payee: null, status: 'locked', version: 1, fundedAt: now, settledAt: null });
    expect(parseEscrow({ funder, amountUsdc: 5_000_000, expiresAt: now, status: 'approved' }, id)).toBeNull();
    expect(parseEscrow({ funder, amountUsdc: 5_000_000, expiresAt: now, status: 'locked' }, 'not-an-id')).toBeNull();
  });
});
