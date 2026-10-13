// Public totals for AdPad's own escrows (dealEscrows). Escrow records are publicly
// readable, so Insights reads them directly instead of deal records (which only
// their sponsor and creator can see).
import { createClient } from '@bounded-sh/client';
import { APP_ID, NETWORK } from '../config';
import { parseEscrow, type Escrow } from './app-escrow';

export type EscrowBucket = 'in_escrow' | 'disputed' | 'paid_out' | 'refunded';
export const ESCROW_BUCKETS: readonly EscrowBucket[] = ['in_escrow', 'disputed', 'paid_out', 'refunded'];
export const ESCROW_BUCKET_LABELS: Record<EscrowBucket, string> = {
  in_escrow: 'Locked in escrow',
  disputed: 'Disputed, frozen',
  paid_out: 'Paid out to creator',
  refunded: 'Returned to sponsor',
};

export type PublicEscrow = Escrow;

/** Where an escrow's USDC is now; null for an escrow that was never funded. */
export function escrowBucket(escrow: PublicEscrow): EscrowBucket | null {
  if (escrow.status === 'released') return 'paid_out';
  if (escrow.status === 'refunded') return 'refunded';
  if (escrow.status === 'disputed') return 'disputed';
  if (escrow.status === 'locked' || escrow.status === 'accepted') return 'in_escrow';
  return null;
}

/** The latest recorded time for the escrow's current state, in seconds. */
export function escrowStateTime(escrow: PublicEscrow): number | null {
  return escrow.settledAt || escrow.disputedAt || escrow.acceptedAt || escrow.fundedAt;
}

export interface EscrowSummary {
  totals: Record<EscrowBucket, number>;
  counts: Record<EscrowBucket, number>;
  /** Everything still locked: in escrow and disputed. */
  lockedTotal: number;
  lockedCount: number;
  recent: { escrow: PublicEscrow; bucket: EscrowBucket; time: number | null }[];
}

export function summarizeEscrows(escrows: readonly PublicEscrow[]): EscrowSummary {
  const totals = Object.fromEntries(ESCROW_BUCKETS.map(bucket => [bucket, 0])) as Record<EscrowBucket, number>;
  const counts = { ...totals };
  const recent: EscrowSummary['recent'] = [];
  for (const escrow of escrows) {
    const bucket = escrowBucket(escrow);
    if (!bucket) continue;
    totals[bucket] += escrow.amountUsdc;
    counts[bucket] += 1;
    recent.push({ escrow, bucket, time: escrowStateTime(escrow) });
  }
  recent.sort((a, b) => (b.time || 0) - (a.time || 0));
  return { totals, counts, lockedTotal: totals.in_escrow + totals.disputed, lockedCount: counts.in_escrow + counts.disputed, recent };
}

export function formatBaseUsdc(base: number): string {
  return (base / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Reads every AdPad escrow anonymously. Null when the records cannot be read: never shown as zero. */
export async function readPublicEscrows(): Promise<PublicEscrow[] | null> {
  try {
    const client = createClient({ appId: APP_ID, network: NETWORK });
    const out: PublicEscrow[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      const result = await client.get('dealEscrows', { limit: 100, ...(cursor ? { cursor } : {}) }) as { data?: Record<string, unknown>[]; nextCursor?: string | null } | Record<string, unknown>[] | null;
      const rows = Array.isArray(result) ? result : result?.data;
      if (!Array.isArray(rows)) return null;
      for (const row of rows) {
        const id = String(row._id ?? row.pathId ?? '').split('/').pop() || '';
        const escrow = parseEscrow(row, id);
        if (escrow) out.push(escrow);
      }
      cursor = Array.isArray(result) ? undefined : result?.nextCursor || undefined;
      if (!cursor) break;
    }
    return out;
  } catch { return null; }
}
