import { describe, expect, it } from 'vitest';
import { FEATURED_SOLANA_EVENTS, headlineSolanaEvents } from '../src/solana-events';
import { FEATURED_EVENTS, applyOfficialEventWindows, upcomingEvents } from '../functions/featured-events';

describe('event-first metadata', () => {
  it('keeps the assistant copy identical to the site copy', () => {
    expect(upcomingEvents(0)).toEqual(FEATURED_SOLANA_EVENTS.map(event => ({ id: event.id, title: event.title, dateLabel: event.dateLabel, city: event.city, venue: event.venue, startAt: event.startAt, endAt: event.endAt })));
  });
  it('offers Hacker House London and Breakpoint first and drops past events', () => {
    const beforeBoth = Date.parse('2026-10-01T00:00:00Z');
    expect(headlineSolanaEvents(beforeBoth).map(event => event.id)).toEqual(['london-hacker-house-2026', 'breakpoint-2026']);
    const afterHouse = Date.parse('2026-11-13T00:00:00Z');
    expect(headlineSolanaEvents(afterHouse).map(event => event.id)).toEqual(['breakpoint-2026']);
    const afterBoth = Date.parse('2026-11-20T00:00:00Z');
    expect(headlineSolanaEvents(afterBoth)).toEqual([]);
  });
  it('fills official windows deterministically from the chosen event', () => {
    const draft = { offers: { placement: { eventId: 'breakpoint-2026', startsAt: 1, endsAt: 2, supplyBy: 3 }, service: { eventName: 'solana breakpoint 2026' } } };
    applyOfficialEventWindows(draft, FEATURED_EVENTS);
    const expected = { eventId: 'breakpoint-2026', eventName: 'Solana Breakpoint 2026', startsAt: Date.parse('2026-11-15T16:00:00.000Z') / 1000, endsAt: Date.parse('2026-11-17T19:00:00.000Z') / 1000 };
    expect(draft.offers.placement).toEqual(expected);
    expect(draft.offers.service).toEqual(expected);
  });
  it('leaves independent activations undated for the form', () => {
    const draft = { offers: { placement: { eventName: 'London meetup', startsAt: 1790000000, endsAt: 1790008600, supplyBy: 1789999999 } } };
    applyOfficialEventWindows(draft, FEATURED_EVENTS);
    expect(draft.offers.placement).toEqual({ eventName: 'London meetup' });
  });
});
