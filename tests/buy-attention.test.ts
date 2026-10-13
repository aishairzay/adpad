import { describe, expect, it } from 'vitest';
import type { Listing } from '../src/types';
import { ATTENTION_BUDGETS, attentionBrief, attentionSuggestions, bookablePlacements, coversUtcDate, matchAttention } from '../src/lib/buy-attention';

const NOW = Math.floor(Date.parse('2026-10-01T00:00:00Z') / 1000);
const BREAK_START = Math.floor(Date.parse('2026-11-16T00:00:00Z') / 1000);
const BREAK_END = Math.floor(Date.parse('2026-11-16T23:59:59Z') / 1000);
const base: Listing = { id: 'listing_one', owner: 'alice', seller: 'walletA', title: 'Wear your merch', publisher: 'Alice', category: 'T-shirts', channel: 'London', audience: 'Builders', description: 'A merch activation', deliverables: 'Wear a hoodie and provide photos', priceMicro: 250000000, turnaroundDays: 7, active: true, createdAt: 100, kind: 'placement' };
const atBreakpoint: Listing = { ...base, id: 'listing_breakpoint', category: 'T-shirts', eventId: 'breakpoint-2026', eventName: 'Solana Breakpoint 2026', startsAt: BREAK_START, endsAt: BREAK_END };
const wall: Listing = { ...base, id: 'listing_wall', category: 'Event', priceMicro: 120000000, createdAt: 200 };

describe('buy attention discovery pool', () => {
  it('shows only real, bookable ad-space offers', () => {
    const listings: Listing[] = [atBreakpoint, wall, { ...atBreakpoint, sample: true }, { ...atBreakpoint, id: 'integration_fixture_1' }, { ...atBreakpoint, id: 'sponsorship_test_2' }, { ...atBreakpoint, kind: 'service' }, { ...atBreakpoint, active: false }, { ...atBreakpoint, deleted: true }];
    expect(bookablePlacements(listings, NOW).map(listing => listing.id)).toEqual(['listing_breakpoint', 'listing_wall']);
  });
  it('keeps ended, started, pending and fully booked offers out', () => {
    const past = { ...base, id: 'past', startsAt: NOW - 86400 * 2, endsAt: NOW - 86400 };
    const started = { ...base, id: 'started', startsAt: NOW - 60, endsAt: NOW + 86400 };
    const pendingPublication = { ...base, id: 'pending', capacity: 2, bookingReady: false };
    const full = { ...base, id: 'full', capacity: 2, reserved: 2, bookingReady: true };
    const open = { ...base, id: 'open', capacity: 2, reserved: 1, bookingReady: true };
    expect(bookablePlacements([past, started, pendingPublication, full, open], NOW).map(listing => listing.id)).toEqual(['open']);
  });
});

describe('buy attention matching', () => {
  it('matches each answered question and ignores skipped ones', () => {
    expect(matchAttention([atBreakpoint, wall], { category: null, eventId: null, date: null, budgetMicro: null }, NOW).map(l => l.id)).toEqual(['listing_breakpoint', 'listing_wall']);
    expect(matchAttention([atBreakpoint, wall], { category: 'Event', eventId: null, date: null, budgetMicro: null }, NOW).map(l => l.id)).toEqual(['listing_wall']);
    expect(matchAttention([atBreakpoint, wall], { category: null, eventId: 'breakpoint-2026', date: null, budgetMicro: null }, NOW).map(l => l.id)).toEqual(['listing_breakpoint']);
    expect(matchAttention([atBreakpoint, wall], { category: null, eventId: null, date: '2026-11-16', budgetMicro: null }, NOW).map(l => l.id)).toEqual(['listing_breakpoint']);
    expect(matchAttention([atBreakpoint, wall], { category: null, eventId: null, date: '2026-11-20', budgetMicro: null }, NOW).map(l => l.id)).toEqual([]);
    expect(matchAttention([atBreakpoint, wall], { category: null, eventId: null, date: null, budgetMicro: 100000000 }, NOW).map(l => l.id)).toEqual([]);
    expect(matchAttention([atBreakpoint, wall], { category: null, eventId: null, date: null, budgetMicro: 150000000 }, NOW).map(l => l.id)).toEqual(['listing_wall']);
    expect(matchAttention([atBreakpoint, wall], { category: null, eventId: null, date: null, budgetMicro: 250000000 }, NOW).map(l => l.id)).toEqual(['listing_breakpoint', 'listing_wall']);
    expect(matchAttention([atBreakpoint], { category: null, eventId: null, date: null, budgetMicro: 0 }, NOW).map(l => l.id)).toEqual(['listing_breakpoint']);
  });
  it('sorts soonest activation first and undated offers last', () => {
    const later: Listing = { ...atBreakpoint, id: 'later', startsAt: BREAK_START + 86400, endsAt: BREAK_END + 86400 };
    const undated: Listing = { ...base, id: 'undated', createdAt: 5 };
    expect(matchAttention([undated, later, atBreakpoint], { category: null, eventId: null, date: null, budgetMicro: null }, NOW).map(l => l.id)).toEqual(['listing_breakpoint', 'later', 'undated']);
  });
  it('only counts dated activations covering the chosen day', () => {
    expect(coversUtcDate({ startsAt: BREAK_START, endsAt: BREAK_END }, '2026-11-16')).toBe(true);
    expect(coversUtcDate({ startsAt: BREAK_START, endsAt: BREAK_END }, '2026-11-15')).toBe(false);
    expect(coversUtcDate({ startsAt: BREAK_START, endsAt: BREAK_END }, '2026-11-17')).toBe(false);
    expect(coversUtcDate({}, '2026-11-16')).toBe(false);
    expect(coversUtcDate({ startsAt: BREAK_START, endsAt: BREAK_END }, '16/11/2026')).toBe(false);
  });
});

describe('no dead ends', () => {
  it('offers the same kind of attention when only timing or budget miss', () => {
    const other: Listing = { ...wall, id: 'other_hats', category: 'Hats' };
    const answers = { category: 'Hats', eventId: null, date: '2026-11-16', budgetMicro: 10000000 };
    const suggestions = attentionSuggestions([atBreakpoint, other, wall], answers, NOW);
    expect(suggestions.sameKind.map(l => l.id)).toEqual(['other_hats']);
    expect(suggestions.nearestCategories).toEqual([{ category: 'Event', count: 1 }, { category: 'T-shirts', count: 1 }]);
  });
  it('offers nearest categories when the chosen kind has nothing', () => {
    const answers = { category: 'Podcast', eventId: null, date: null, budgetMicro: null };
    const suggestions = attentionSuggestions([atBreakpoint, wall], answers, NOW);
    expect(suggestions.sameKind).toEqual([]);
    expect(suggestions.nearestCategories).toEqual([{ category: 'Event', count: 1 }, { category: 'T-shirts', count: 1 }]);
  });
  it('leaves a bare browse link when nothing is bookable at all', () => {
    const suggestions = attentionSuggestions([{ ...atBreakpoint, active: false }], { category: 'T-shirts', eventId: null, date: null, budgetMicro: null }, NOW);
    expect(suggestions.sameKind).toEqual([]);
    expect(suggestions.nearestCategories).toEqual([]);
  });
  it('counts categories with bookable space across offers', () => {
    const second: Listing = { ...wall, id: 'wall2', createdAt: 300 };
    const suggestions = attentionSuggestions([wall, second, atBreakpoint], { category: null, eventId: null, date: null, budgetMicro: null }, NOW);
    expect(suggestions.nearestCategories).toEqual([{ category: 'Event', count: 2 }, { category: 'T-shirts', count: 1 }]);
  });
});

describe('prefilled brief', () => {
  it('turns the answers into an editable starting brief', () => {
    expect(attentionBrief({ category: 'T-shirts', eventId: 'breakpoint-2026', date: null, budgetMicro: 250000000 }))
      .toBe('Kind of attention: T-shirts. Timing: Solana Breakpoint 2026 (15–17 November 2026). Budget: up to 250 USDC.');
    expect(attentionBrief({ category: null, eventId: null, date: '2026-11-16', budgetMicro: null })).toBe('Timing: around 16 Nov 2026 (UTC).');
    expect(attentionBrief({ category: 'Event', eventId: null, date: null, budgetMicro: null })).toBe('Kind of attention: Event.');
    expect(attentionBrief({ category: null, eventId: null, date: null, budgetMicro: null })).toBe('');
    expect(attentionBrief({ category: null, eventId: 'unknown-event', date: null, budgetMicro: null })).toBe('');
  });
  it('offers sensible budget steps', () => {
    expect(ATTENTION_BUDGETS).toEqual([100, 250, 500, 1000]);
  });
});
