import { describe, expect, it } from 'vitest';
import { callDeal, callState, canRespond, draftSponsorCall, isCallId, validateCallResponse, type SponsorCall } from '../src/lib/sponsor-calls';
import { termsForDeal, type SponsorDeal } from '../src/lib/sponsor-deals';
import type { Escrow, EscrowStatus } from '../src/lib/app-escrow';

const now = 1_791_338_000;
const sponsor = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const creator = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const base = {
  sponsor, sponsorId: 'u1', verifiedXHandle: 'brand', verifiedXId: '42', title: 'Wear our cap at Breakpoint',
  brief: 'Wear the cap all day at Breakpoint and post three photos on X.', category: 'Hats', where: 'Breakpoint', amountUsdc: 50_000_000,
  deadline: now + 7 * 86_400, nowSeconds: now, callId: 'call_' + 'c'.repeat(32), dealId: 'deal_' + 'c'.repeat(32),
};

function posted(extra: Partial<SponsorCall> = {}): SponsorCall {
  const draft = draftSponsorCall(base);
  return { ...draft.call, id: draft.callId, escrowId: 'e'.repeat(32), status: 'open', createdAt: now, ...extra };
}

function escrow(status: EscrowStatus, extra: Partial<Escrow> = {}): Escrow {
  return { escrowId: 'e'.repeat(32), funder: sponsor, payee: null, amountUsdc: 50_000_000, expiresAt: now + 21 * 86_400, ref: base.dealId, createdAt: now, status, version: 1, fundedAt: now, acceptedAt: null, disputedAt: null, disputedBy: null, disputeReason: null, settledAt: null, settledKind: null, ...extra };
}

describe('sponsor calls', () => {
  it('locks with no creator named, with the future booking id as the escrow ref', () => {
    const draft = draftSponsorCall(base);
    expect(draft.problems).toEqual([]);
    expect(draft.terms).toEqual({ payee: null, amountUsdc: 50_000_000, expiresAt: now + 21 * 86_400, ref: base.dealId });
    expect(draft.call).toMatchObject({ dealId: base.dealId, expiresAt: draft.terms.expiresAt, where: 'Breakpoint' });
    expect(isCallId(draft.callId)).toBe(true);
  });
  it('keeps the expiry inside 90 days and the deadline before it', () => {
    const draft = draftSponsorCall({ ...base, deadline: now + 100 * 86_400 });
    expect(draft.problems).toEqual([]);
    expect(draft.terms.expiresAt).toBeLessThanOrEqual(now + 7_776_000);
    expect(draft.call.deadline).toBeLessThanOrEqual(draft.terms.expiresAt);
  });
  it('refuses calls it could not post', () => {
    expect(draftSponsorCall({ ...base, amountUsdc: 500_000 }).problems.length).toBeGreaterThan(0);
    expect(draftSponsorCall({ ...base, brief: 'short' }).problems.length).toBeGreaterThan(0);
    expect(draftSponsorCall({ ...base, category: 'All placements' }).problems.length).toBeGreaterThan(0);
    expect(draftSponsorCall({ ...base, deadline: now + 600 }).problems.length).toBeGreaterThan(0);
    expect(draftSponsorCall({ ...base, where: '' }).call.where).toBeNull();
  });
  it('takes responses from others while open and before the deadline', () => {
    expect(canRespond(posted(), creator, now)).toBe(true);
    expect(canRespond(posted(), sponsor, now)).toBe(false);
    expect(canRespond(posted({ status: 'picked' }), creator, now)).toBe(false);
    expect(canRespond(posted(), creator, now + 8 * 86_400)).toBe(false);
    expect(validateCallResponse('I wear caps at every event.', '')).toBeNull();
    expect(validateCallResponse('too short', '')).not.toBeNull();
    expect(validateCallResponse('I wear caps at every event.', 'not a link')).not.toBeNull();
  });
  it('reads the money from the escrow', () => {
    expect(callState(posted({ status: 'funding' }), escrow('locked'))).toBe('open');
    expect(callState(posted({ status: 'funding' }), escrow('unfunded'))).toBe('funding');
    expect(callState(posted(), escrow('refunded'))).toBe('closed');
    expect(callState(posted({ status: 'picked' }), escrow('accepted'))).toBe('picked');
  });
  it('turns a pick into a booking whose terms are the escrow it already funded', () => {
    const call = posted();
    const deal = { ...callDeal(call, creator), id: call.dealId, createdAt: now } as SponsorDeal;
    expect(deal).toMatchObject({ listingId: call.id, creator, status: 'awaiting_funding', escrowId: null });
    expect(termsForDeal(deal)).toEqual({ payee: creator, amountUsdc: call.amountUsdc, expiresAt: call.expiresAt, ref: call.dealId });
  });
});
