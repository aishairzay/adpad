import { describe, expect, it } from 'vitest';
import { bookedSpots, parseDealRecord, recordAsDeal, withBookedSpots } from './deal-records';
import type { Listing } from '../types';

const listing = { id: 'l1', seller: 'Creator1111111111111111111111111111', owner: 'owner1', title: 'Hat at Breakpoint', channel: 'IRL', kind: 'placement', capacity: 2, reserved: 0 } as unknown as Listing;
const row = { listingId: 'l1', creator: listing.seller, sponsor: 'Sponsor111111111111111111111111111', headline: 'Hat at Breakpoint', amountUsdc: 1_000_000, escrowId: 'f'.repeat(32), status: 'released', proofUrl: 'https://example.com/proof', fundedAt: 10, settledAt: 20, updatedAt: 20 };

describe('deal records', () => {
  it('turns a paid record into a released deal with its proof and no brief', () => {
    const record = parseDealRecord(row, 'deal_1')!;
    const deal = recordAsDeal(record, listing);
    expect(deal).toMatchObject({ id: 'deal_1', status: 'released', buyer: row.sponsor, seller: listing.seller, amount: 1_000_000, proofUrl: row.proofUrl, listingOwner: 'owner1', settledAt: 20, brief: '' });
  });

  it('hides the proof link until the deal is paid out', () => {
    expect(recordAsDeal(parseDealRecord({ ...row, status: 'funded' }, 'deal_1')!, listing).proofUrl).toBe('');
  });

  it('rejects malformed rows', () => {
    expect(parseDealRecord({ ...row, status: 'cancelled' }, 'deal_1')).toBeNull();
    expect(parseDealRecord({ ...row, amountUsdc: 0 }, 'deal_1')).toBeNull();
  });

  it('counts funded and paid bookings as taken spots, frees refunds, and ignores records for another creator', () => {
    const records = [parseDealRecord(row, 'a')!, parseDealRecord({ ...row, status: 'funded' }, 'b')!, parseDealRecord({ ...row, status: 'refunded' }, 'c')!, parseDealRecord({ ...row, creator: 'Other111111111111111111111111111111' }, 'd')!];
    const spots = bookedSpots(records, [listing]);
    expect(spots.get('l1')).toBe(2);
    expect(withBookedSpots(listing, spots).reserved).toBe(2);
    expect(withBookedSpots({ ...listing, capacity: 1 } as Listing, spots).reserved).toBe(1);
  });
});
