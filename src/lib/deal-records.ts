import type { Deal, Listing } from '../types';

/** Public outcome of a sponsor booking, written only by the AdPad agent once it has checked the venue escrow. */
export interface DealRecord {
  id: string;
  listingId: string;
  creator: string;
  sponsor: string;
  headline: string;
  amountUsdc: number;
  escrowId: string;
  status: 'funded' | 'released' | 'refunded';
  proofUrl?: string | null;
  fundedAt?: number | null;
  settledAt?: number | null;
  updatedAt: number;
}

const STATUSES = new Set(['funded', 'released', 'refunded']);

export function parseDealRecord(row: Record<string, unknown>, id: string): DealRecord | null {
  if (!id || typeof row.listingId !== 'string' || typeof row.creator !== 'string' || typeof row.sponsor !== 'string') return null;
  if (!STATUSES.has(String(row.status)) || !Number.isSafeInteger(row.amountUsdc) || Number(row.amountUsdc) <= 0) return null;
  return { ...(row as unknown as DealRecord), id, headline: String(row.headline || '') };
}

/** Shapes a public record like an older escrow deal so listing and profile history read both the same way. Never carries a brief. */
export function recordAsDeal(record: DealRecord, listing?: Listing): Deal {
  const time = Number(record.settledAt || record.fundedAt || record.updatedAt || 0);
  return {
    id: record.id, headline: record.headline || listing?.title || 'Sponsorship', brief: '', deliverables: '', placement: listing?.channel || '',
    buyer: record.sponsor, seller: record.creator, arbitrator: '', version: 1, amount: Number(record.amountUsdc), deadline: 0,
    createdAt: Number(record.fundedAt || time), status: record.status, proofUrl: record.status === 'released' ? String(record.proofUrl || '') : '',
    proofNote: '', disputeReason: '', resolutionNote: '', listingId: record.listingId, listingOwner: listing?.owner ?? null,
    listingKind: listing?.kind ?? null, fundedAt: record.fundedAt ?? null, settledAt: record.settledAt ?? null,
  } as Deal;
}

/** Spots held by sponsor bookings: funded or paid out. A refund frees its spot. */
export function bookedSpots(records: readonly DealRecord[], listings: readonly Listing[]): Map<string, number> {
  const sellers = new Map(listings.map(listing => [listing.id, listing.seller]));
  const counts = new Map<string, number>();
  for (const record of records) {
    if (record.status === 'refunded' || sellers.get(record.listingId) !== record.creator) continue;
    counts.set(record.listingId, (counts.get(record.listingId) || 0) + 1);
  }
  return counts;
}

/** Adds sponsor bookings to the older escrow count, never above the listing's capacity. */
export function withBookedSpots(listing: Listing, counts: Map<string, number>): Listing {
  const extra = counts.get(listing.id) || 0;
  if (!extra || listing.capacity == null || !Number.isSafeInteger(listing.reserved)) return listing;
  return { ...listing, reserved: Math.min(Number(listing.capacity), Number(listing.reserved) + extra) };
}
