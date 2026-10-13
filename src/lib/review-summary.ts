import type { Draft } from '../../functions/onboarding-schema';

export type ListingKindKey = 'placement' | 'service';
export type ReviewRow = { label: string; value: string };
export type ReviewSection = { heading: string; rows: ReviewRow[] };

export const NOT_SET = 'Not set yet';
const CLOTHING_SUMMARY: Record<string, string> = { sponsor: 'Sponsor supplies the merch', creator: 'I’ll arrange custom branded clothing', existing: 'I already have the agreed clothing or gear' };

const wholeUsdc = (micro: unknown): string => typeof micro === 'number' && micro > 0 ? `${Number((micro / 1000000).toFixed(6)).toLocaleString('en-US')} USDC` : '';

/** UTC day labels keep the summary identical to the calendar dates the form submits. */
const utcDay = (seconds: unknown): string => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '';
  return new Date(seconds * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

const offerRows = (kind: ListingKindKey, offer: Record<string, string | number | boolean> | undefined): ReviewRow[] => {
  const source = offer || {};
  const event = typeof source.eventName === 'string' && source.eventName.trim() ? source.eventName.trim() : '';
  const window = [utcDay(source.startsAt), utcDay(source.endsAt)].filter(Boolean).join(' – ');
  const rows: ReviewRow[] = [
    { label: 'Title', value: typeof source.title === 'string' && source.title.trim() ? source.title.trim() : NOT_SET },
    { label: kind === 'service' ? 'Skill' : 'Category', value: typeof source.category === 'string' && source.category ? source.category : NOT_SET },
    { label: 'Price', value: wholeUsdc(source.priceMicro) || NOT_SET },
    { label: 'Delivery window', value: typeof source.turnaroundDays === 'number' && source.turnaroundDays > 0 ? `${source.turnaroundDays} ${source.turnaroundDays === 1 ? 'day' : 'days'}` : NOT_SET },
    { label: 'Booking spots', value: typeof source.capacity === 'number' && source.capacity > 0 ? String(source.capacity) : '1' },
    { label: 'Event or activation', value: event ? `${event}${window ? ` · ${window} (UTC)` : ''}` : 'Independent — no event tag' },
  ];
  if (kind === 'placement') rows.push({ label: 'Clothing or merch', value: typeof source.clothingSource === 'string' && CLOTHING_SUMMARY[source.clothingSource] ? CLOTHING_SUMMARY[source.clothingSource] : 'Not included' });
  return rows;
};

/** The read-back a creator checks before pressing publish: current values, gaps named plainly. */
export function reviewSections(draft: Draft, kinds: readonly ListingKindKey[]): ReviewSection[] {
  const sections: ReviewSection[] = [{
    heading: 'You',
    rows: [
      { label: 'Name / crew', value: typeof draft.publisher === 'string' && draft.publisher.trim() ? draft.publisher.trim() : NOT_SET },
      { label: 'X account', value: typeof draft.xHandle === 'string' && draft.xHandle.trim() ? draft.xHandle.trim() : 'Not added' },
    ],
  }];
  for (const kind of kinds) sections.push({ heading: kind === 'service' ? 'Creator service' : 'Ad space', rows: offerRows(kind, draft.offers[kind]) });
  return sections;
}
