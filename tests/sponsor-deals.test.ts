import { describe, expect, it } from 'vitest';
import { canDispute, displayStatus, draftSponsorDeal, termsForDeal, type SponsorDeal } from '../src/lib/sponsor-deals';
import type { Escrow, EscrowStatus } from '../src/lib/app-escrow';

const now = 1_791_338_000;
const sponsor = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const creator = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const base = { sponsor, sponsorId: 'u1', creator, listingId: 'l1', headline: 'Wear our hat at Breakpoint', brief: 'Wear the hat all day and post three photos.', nowSeconds: now, dealId: 'deal_' + 'c'.repeat(32) };

function saved(draft: ReturnType<typeof draftSponsorDeal>, extra: Partial<SponsorDeal> = {}): SponsorDeal {
  return { ...draft.deal, id: draft.dealId, createdAt: now, ...extra } as SponsorDeal;
}

function escrow(status: EscrowStatus, extra: Partial<Escrow> = {}): Escrow {
  return { escrowId: 'b'.repeat(32), funder: sponsor, payee: creator, amountUsdc: 5_000_000, expiresAt: now + 10 * 86_400, ref: base.dealId, createdAt: now, status, version: 1, fundedAt: now, acceptedAt: null, disputedAt: null, disputedBy: null, disputeReason: null, settledAt: null, settledKind: null, ...extra };
}

describe('sponsor deals', () => {
  it('drafts escrow terms paying the creator, with the deal id as ref', () => {
    const draft = draftSponsorDeal({ ...base, amountUsdc: 40_000_000, deadline: now + 7 * 86_400 });
    expect(draft.problems).toEqual([]);
    expect(draft.terms).toEqual({ payee: creator, amountUsdc: 40_000_000, expiresAt: now + 21 * 86_400, ref: base.dealId });
    expect(draft.deal.escrowId).toBeNull();
  });
  it('rejects amounts outside 1 to 1000 USDC', () => {
    expect(draftSponsorDeal({ ...base, amountUsdc: 500_000, deadline: now + 86_400 * 3 }).problems.length).toBeGreaterThan(0);
    expect(draftSponsorDeal({ ...base, amountUsdc: 1_000_000_001, deadline: now + 86_400 * 3 }).problems.length).toBeGreaterThan(0);
  });
  it('keeps the expiry inside 90 days', () => {
    const draft = draftSponsorDeal({ ...base, amountUsdc: 5_000_000, deadline: now + 100 * 86_400 });
    expect(draft.problems).toEqual([]);
    expect(draft.terms.expiresAt).toBeLessThanOrEqual(now + 7_776_000);
    expect(draft.deal.deadline).toBeLessThanOrEqual(draft.terms.expiresAt);
  });
  it('refuses a creator paying themselves', () => {
    expect(draftSponsorDeal({ ...base, creator: sponsor, amountUsdc: 5_000_000, deadline: now + 86_400 * 3 }).problems.length).toBeGreaterThan(0);
  });
  it('rebuilds identical terms from the saved deal for a retry', () => {
    const draft = draftSponsorDeal({ ...base, amountUsdc: 300_000_000, deadline: now + 7 * 86_400 });
    expect(termsForDeal(saved(draft))).toEqual(draft.terms);
  });
  it('lets only the sponsor or creator dispute, once the creator accepted and before expiry', () => {
    const deal = saved(draftSponsorDeal({ ...base, amountUsdc: 5_000_000, deadline: now + 86_400 * 3 }), { escrowId: 'b'.repeat(32), status: 'funded' });
    expect(canDispute(deal, sponsor, escrow('accepted'), now)).toBe(true);
    expect(canDispute(deal, creator, escrow('accepted'), now)).toBe(true);
    expect(canDispute(deal, 'someoneElse', escrow('accepted'), now)).toBe(false);
    expect(canDispute(deal, sponsor, escrow('locked'), now)).toBe(false);
    expect(canDispute(deal, sponsor, escrow('disputed'), now)).toBe(false);
    expect(canDispute(deal, sponsor, escrow('accepted'), now + 11 * 86_400)).toBe(false);
    expect(canDispute(deal, sponsor, null, now)).toBe(false);
  });
});

describe('the escrow decides what the card shows', () => {
  const deal = saved(draftSponsorDeal({ ...base, amountUsdc: 5_000_000, deadline: now + 86_400 * 3 }), { escrowId: 'b'.repeat(32) });
  it('shows locked money as funded before AdPad confirms it', () => {
    expect(displayStatus({ ...deal, status: 'awaiting_funding' }, escrow('locked'))).toBe('funded');
    expect(displayStatus({ ...deal, status: 'awaiting_funding' }, escrow('unfunded'))).toBe('awaiting_funding');
  });
  it('shows a payout, a return, an expiry and a dispute as soon as the escrow records them', () => {
    expect(displayStatus({ ...deal, status: 'funded' }, escrow('released'))).toBe('released');
    expect(displayStatus({ ...deal, status: 'funded' }, escrow('refunded', { settledKind: 'withdraw' }))).toBe('refunded');
    expect(displayStatus({ ...deal, status: 'funded' }, escrow('refunded', { settledKind: 'expire' }))).toBe('expired');
    expect(displayStatus({ ...deal, status: 'proof_submitted' }, escrow('disputed'))).toBe('disputed');
  });
  it('falls back to the deal record without an escrow', () => {
    expect(displayStatus({ ...deal, status: 'proof_submitted' }, undefined)).toBe('proof_submitted');
  });
});
