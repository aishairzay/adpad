import { describe, expect, it } from 'vitest';
import type { Deal, Listing, Profile } from '../src/types';
import { COMMUNITY_STATUSES, communitySummary, formatCommunityUsdc, linkedCommunityActivity } from '../src/lib/community';

const listing = (overrides: Partial<Listing> = {}): Listing => ({
  id: 'offer-one', owner: 'creator-one', seller: 'seller-one', title: 'An event placement', publisher: 'Creator One', category: 'Event', channel: 'In person', audience: 'Event attendees', description: 'A published offer', deliverables: 'A photo', priceMicro: 100_000_000, turnaroundDays: 2, active: true, createdAt: 1_000, ...overrides,
});
const deal = (overrides: Partial<Deal> = {}): Deal => ({
  id: 'campaign-one', headline: 'Event-day shirt', brief: 'Wear the agreed shirt', deliverables: 'A photo', placement: 'Event', buyer: 'buyer-one', seller: 'seller-one', arbitrator: 'arbitrator', version: 2, amount: 100_000_000, deadline: 4_000, createdAt: 1_100, status: 'released', proofUrl: '', proofNote: '', disputeReason: '', resolutionNote: '', listingId: 'offer-one', listingOwner: 'creator-one', ...overrides,
});
const profile = (overrides: Partial<Profile> = {}): Profile => ({
  id: 'profile-one', owner: 'brand-owner', wallet: 'buyer-one', name: 'A published brand', bio: '', location: '', website: '', socialUrl: '', imageUrl: '', profileType: 'brand', createdAt: 900, updatedAt: 1_000, ...overrides,
});

describe('community activity totals', () => {
  it('separates released payouts from escrow and never counts unfunded or refunded amounts as funded', () => {
    const records = COMMUNITY_STATUSES.map((status, index) => deal({ id: `campaign-${index}`, status }));
    const summary = communitySummary([listing()], records, []);
    expect(summary.releasedMicro).toBe(100_000_000n);
    expect(summary.escrowMicro).toBe(400_000_000n);
    expect(summary.fundedCount).toBe(5);
    expect(summary.inEscrowCount).toBe(4);
    expect(summary.releasedCount).toBe(1);
    expect(summary.statusCounts).toEqual(Object.fromEntries(COMMUNITY_STATUSES.map(status => [status, 1])));
    expect(summary.categoryPayouts).toEqual([{ category: 'Event', count: 1, amountMicro: 100_000_000n }]);
    expect(summary.buyers[0].completedCount).toBe(1);
  });

  it('counts only linked user offers with the correct publisher, excluding examples and integration fixtures', () => {
    const listings = [listing(), listing({ id: 'example', sample: true }), listing({ id: 'integration_check', active: false }), listing({ id: 'sponsorship_test_check' })];
    const invalid = [
      deal({ id: 'legacy', listingId: undefined }),
      deal({ id: 'missing', listingId: 'missing-offer' }),
      deal({ id: 'example-record', listingId: 'example' }),
      deal({ id: 'integration-record', listingId: 'integration_check' }),
      deal({ id: 'sponsorship-record', listingId: 'sponsorship_test_check' }),
      deal({ id: 'wrong-seller', seller: 'different-seller' }),
      deal({ id: 'wrong-owner', listingOwner: 'different-owner' }),
      deal({ id: 'self-deal', buyer: 'seller-one' }),
      deal({ id: 'no-buyer', buyer: '' }),
      deal({ id: 'unknown-status', status: 'complete' as Deal['status'] }),
    ];
    const summary = communitySummary(listings, [deal(), ...invalid], []);
    expect(summary.activity.map(record => record.deal.id)).toEqual(['campaign-one']);
    expect(summary.releasedMicro).toBe(100_000_000n);
    expect(summary.activeListingCount).toBe(1);
  });

  it('keeps retired user-offer history without counting retired offers as active', () => {
    const summary = communitySummary([listing({ active: false })], [deal({ listingOwner: undefined })], []);
    expect(summary.activeListingCount).toBe(0);
    expect(summary.releasedCount).toBe(1);
    expect(summary.releasedMicro).toBe(100_000_000n);
  });

  it('uses one latest head per campaign, so an older release cannot inflate a current refunded record', () => {
    const old = deal({ status: 'released', version: 2 });
    const current = deal({ status: 'refunded', version: 3 });
    const summary = communitySummary([listing()], [old, current, old], []);
    expect(summary.activity).toHaveLength(1);
    expect(summary.statusCounts.refunded).toBe(1);
    expect(summary.releasedMicro).toBe(0n);
    expect(summary.fundedCount).toBe(0);
    expect(summary.buyers).toEqual([]);
  });

  it('rejects unsafe or non-positive amounts and preserves exact sums above the safe-number limit', () => {
    const invalidAmounts = [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1];
    const records = invalidAmounts.map((amount, index) => deal({ id: `invalid-${index}`, amount }));
    records.push(deal({ id: 'large-one', amount: Number.MAX_SAFE_INTEGER }), deal({ id: 'large-two', amount: Number.MAX_SAFE_INTEGER }));
    const summary = communitySummary([listing()], records, []);
    expect(summary.releasedCount).toBe(2);
    expect(summary.releasedMicro).toBe(18_014_398_509_481_982n);
    expect(formatCommunityUsdc(summary.releasedMicro)).toBe('18,014,398,509.481982');
    expect(formatCommunityUsdc(0n)).toBe('0');
    expect(formatCommunityUsdc(1n)).toBe('0.000001');
    expect(formatCommunityUsdc(10_500_000n)).toBe('10.5');
  });

  it('attributes completed buyer relationships to matching profiles, never to inferred brands', () => {
    const offers = [listing(), listing({ id: 'offer-two', category: 'T-shirts' }), listing({ id: 'offer-three', owner: 'creator-two', seller: 'seller-two' })];
    const records = [
      deal(),
      deal({ id: 'second-release', listingId: 'offer-two' }),
      deal({ id: 'third-release', listingId: 'offer-three', listingOwner: 'creator-two', seller: 'seller-two' }),
      deal({ id: 'not-completed', status: 'active' }),
      deal({ id: 'unknown-buyer', buyer: 'wallet-without-profile' }),
    ];
    const profiles = [profile(), profile({ id: 'person-profile', owner: 'person-owner', wallet: 'someone-else', name: 'A person', profileType: 'person' }), profile({ id: 'new-brand', owner: 'new-brand-owner', wallet: 'new-brand-wallet', name: 'A new brand' })];
    const summary = communitySummary(offers, records, profiles);
    expect(summary.brands.map(brand => brand.profile.name)).toEqual(['A published brand', 'A new brand']);
    expect(summary.brands[0]).toMatchObject({ completedCount: 3, creatorCount: 2, amountMicro: 300_000_000n });
    expect(summary.brands[1]).toMatchObject({ completedCount: 0, creatorCount: 0, amountMicro: 0n });
    expect(summary.buyers.find(buyer => buyer.wallet === 'wallet-without-profile')).toMatchObject({ profile: null, completedCount: 1 });
    expect(summary.categoryPayouts).toEqual([{ category: 'Event', count: 3, amountMicro: 300_000_000n }, { category: 'T-shirts', count: 1, amountMicro: 100_000_000n }]);
  });

  it('uses only the latest profile for an owner when their profile type or wallet changes', () => {
    const summary = communitySummary([listing()], [deal()], [profile(), profile({ id: 'profile-new', wallet: 'new-wallet', profileType: 'person', updatedAt: 2_000 })]);
    expect(summary.brands).toEqual([]);
    expect(summary.buyers[0].profile).toBeNull();
  });

  it('sorts activity using recorded state timestamps and labels creation-date fallbacks honestly', () => {
    const records = [
      deal({ id: 'creation-only', status: 'disputed', createdAt: 1_000, fundedAt: 9_000, submittedAt: 10_000 }),
      deal({ id: 'settled', settledAt: 5_000 }),
      deal({ id: 'accepted', status: 'active', acceptedAt: 4_000 }),
      deal({ id: 'submitted', status: 'submitted', submittedAt: 3_000 }),
      deal({ id: 'funded', status: 'funded', fundedAt: 2_000 }),
      deal({ id: 'invalid-date', settledAt: Infinity, createdAt: NaN }),
    ];
    expect(linkedCommunityActivity([listing()], records).map(({ deal: current, timestamp, timestampLabel }) => [current.id, timestamp, timestampLabel])).toEqual([
      ['settled', 5_000, 'Settled'], ['accepted', 4_000, 'Accepted'], ['submitted', 3_000, 'Submitted'], ['funded', 2_000, 'Funded'], ['creation-only', 1_000, 'Created'], ['invalid-date', 0, 'Created'],
    ]);
  });

  it('returns honest zero totals and empty collections before any activity exists', () => {
    const summary = communitySummary([], [], []);
    expect(summary.activity).toEqual([]);
    expect(summary.buyers).toEqual([]);
    expect(summary.brands).toEqual([]);
    expect(summary.categoryPayouts).toEqual([]);
    expect(summary.releasedMicro).toBe(0n);
    expect(summary.escrowMicro).toBe(0n);
    expect(summary.activeListingCount).toBe(0);
  });
});
