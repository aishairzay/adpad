import type { Listing } from '../types';
import { isCommunityListing } from './community';
import { availability } from './sponsorship';
import { formatUsdc } from './money';
import { FEATURED_SOLANA_EVENTS } from '../solana-events';

/** A buyer's answers in the guided Buy attention flow. Null means "any". */
export interface AttentionAnswers {
  category: string | null;
  eventId: string | null;
  date: string | null;
  budgetMicro: number | null;
}

export const ATTENTION_BUDGETS = [100, 250, 500, 1000] as const;

const UTC_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Discovery pool for buyers: real, currently bookable ad-space offers only. Example cards and test fixtures never appear. */
export function bookablePlacements(listings: readonly Listing[], nowSeconds: number): Listing[] {
  return listings.filter(listing => listing.active && !listing.deleted && !listing.sample && listing.bookingReady !== false && listing.kind !== 'service' && isCommunityListing(listing) && availability(listing, nowSeconds).bookable);
}

/** Only dated activations count when the buyer picked a day; undated offers stay out of that search. */
export function coversUtcDate(listing: Pick<Listing, 'startsAt' | 'endsAt'>, date: string): boolean {
  if (!UTC_DATE.test(date)) return false;
  return Boolean(listing.startsAt && listing.endsAt) && Number(listing.startsAt) <= Date.parse(`${date}T23:59:59Z`) / 1000 && Number(listing.endsAt) >= Date.parse(`${date}T00:00:00Z`) / 1000;
}

/** Soonest activation first (undated offers last), then newest, then a stable id order. */
export function byAttentionSort(left: Listing, right: Listing): number {
  return (left.startsAt ?? Infinity) - (right.startsAt ?? Infinity) || right.createdAt - left.createdAt || left.id.localeCompare(right.id);
}

/** Placements matching every answered question. Skipped questions do not constrain. */
export function matchAttention(listings: readonly Listing[], answers: AttentionAnswers, nowSeconds: number): Listing[] {
  const budget = Number.isSafeInteger(answers.budgetMicro) && (answers.budgetMicro as number) > 0 ? answers.budgetMicro : null;
  return bookablePlacements(listings, nowSeconds).filter(listing =>
    (!answers.category || listing.category === answers.category)
    && (!answers.eventId || listing.eventId === answers.eventId)
    && (!answers.date || coversUtcDate(listing, answers.date))
    && (!budget || listing.priceMicro <= budget),
  ).sort(byAttentionSort);
}

export interface AttentionSuggestions {
  /** Same kind of attention, bookable now, ignoring the timing and budget answers. */
  sameKind: Listing[];
  /** Kinds that currently have bookable space, with counts, for browse chips. */
  nearestCategories: { category: string; count: number }[];
}

/** No dead ends: what to show a buyer whose answers matched nothing. */
export function attentionSuggestions(listings: readonly Listing[], answers: AttentionAnswers, nowSeconds: number, limit = 3): AttentionSuggestions {
  const pool = bookablePlacements(listings, nowSeconds);
  const sameKind = answers.category
    ? pool.filter(listing => listing.category === answers.category).sort(byAttentionSort).slice(0, limit)
    : [];
  const counts = new Map<string, number>();
  for (const listing of pool) {
    if (answers.category && listing.category === answers.category) continue;
    counts.set(listing.category, (counts.get(listing.category) || 0) + 1);
  }
  const nearestCategories = [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));
  return { sameKind, nearestCategories };
}

/** A short editable starting brief from the buyer's own answers; empty when they skipped everything. */
export function attentionBrief(answers: AttentionAnswers): string {
  const lines: string[] = [];
  if (answers.category) lines.push(`Kind of attention: ${answers.category}.`);
  if (answers.eventId) {
    const event = FEATURED_SOLANA_EVENTS.find(item => item.id === answers.eventId);
    if (event) lines.push(`Timing: ${event.title} (${event.dateLabel}).`);
  } else if (answers.date && UTC_DATE.test(answers.date)) {
    const parsed = new Date(`${answers.date}T00:00:00Z`);
    const label = Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : answers.date;
    lines.push(`Timing: around ${label} (UTC).`);
  }
  const budget = typeof answers.budgetMicro === 'number' && Number.isSafeInteger(answers.budgetMicro) && answers.budgetMicro > 0 ? answers.budgetMicro : null;
  if (budget) lines.push(`Budget: up to ${formatUsdc(budget)} USDC.`);
  return lines.join(' ');
}
