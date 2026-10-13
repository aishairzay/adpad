import { describe, expect, it } from 'vitest';
import type { Listing, Profile } from '../src/types';
import { eventOfferProfile, eventOffersFor } from '../src/lib/event-offers';

const at = (value: string) => Date.parse(value) / 1000;
const now = at('2026-09-21T12:00:00Z');
const event = { id: 'breakpoint-2026', startAt: '2026-11-15T16:00:00Z', endAt: '2026-11-17T19:00:00Z' };
const offer = (overrides: Partial<Listing> = {}): Listing => ({
  id: 'offer-one', owner: 'person-one', seller: 'wallet-one', title: 'Your logo at Breakpoint', publisher: 'A published creator', category: 'T-shirts', channel: 'London', audience: 'People at the event', description: 'Sponsor the agreed merch placement.', deliverables: 'Wear the shirt and submit public photo proof.', priceMicro: 100_000_000, turnaroundDays: 7, active: true, createdAt: now - 500, kind: 'placement', attendingEvent: true, eventId: event.id, eventName: 'Breakpoint', startsAt: at('2026-11-15T17:00:00Z'), endsAt: at('2026-11-16T17:00:00Z'), capacity: 1, reserved: 0, bookingReady: true, ...overrides,
});
const profile = (overrides: Partial<Profile> = {}): Profile => ({ id: 'profile-one', owner: 'person-one', wallet: 'wallet-one', name: 'Published Creator', bio: '', location: 'London', website: '', socialUrl: '', imageUrl: '', profileType: 'person', createdAt: now - 1000, updatedAt: now - 500, ...overrides });

describe('event offers from self-declared attendees', () => {
  it('requires explicit attendance, an exact event ID, and a real placement', () => {
    const rows = [offer(), offer({ id: 'no-statement', attendingEvent: undefined }), offer({ id: 'declined', attendingEvent: false }), offer({ id: 'null-statement', attendingEvent: null }), offer({ id: 'wrong-event', eventId: 'london-hacker-house-2026', eventName: 'Breakpoint' }), offer({ id: 'name-only', eventId: undefined }), offer({ id: 'service', kind: 'service' })];
    expect(eventOffersFor(event, rows, now).map(row => row.id)).toEqual(['offer-one']);
  });

  it('excludes examples, automated fixtures, and records without a real account identity', () => {
    const rows = [offer(), offer({ id: 'sample', sample: true }), offer({ id: 'integration_attendee' }), offer({ id: 'sponsorship_test_attendee' }), offer({ id: 'no-owner', owner: '' }), offer({ id: 'no-wallet', seller: '' })];
    expect(eventOffersFor(event, rows, now).map(row => row.id)).toEqual(['offer-one']);
  });

  it('includes only active, priced, bookable offers with authoritative availability', () => {
    const rows = [offer(), offer({ id: 'closed', active: false }), offer({ id: 'pending', bookingReady: false }), offer({ id: 'unconfirmed-capacity', reserved: undefined }), offer({ id: 'full', reserved: 1 }), offer({ id: 'late-supply', supplyBy: now - 1 }), offer({ id: 'zero-price', priceMicro: 0 }), offer({ id: 'invalid-price', priceMicro: NaN })];
    expect(eventOffersFor(event, rows, now).map(row => row.id)).toEqual(['offer-one']);
  });

  it('requires paired, finite whole-second dates in a valid bounded activation window', () => {
    const rows = [offer(), offer({ id: 'no-start', startsAt: undefined }), offer({ id: 'no-end', endsAt: null }), offer({ id: 'infinite-end', endsAt: Infinity }), offer({ id: 'fractional-start', startsAt: at('2026-11-15T17:00:00Z') + 0.5 }), offer({ id: 'reversed', endsAt: at('2026-11-15T16:30:00Z') }), offer({ id: 'too-long', endsAt: at('2027-03-01T00:00:00Z') })];
    expect(eventOffersFor(event, rows, now).map(row => row.id)).toEqual(['offer-one']);
  });

  it('requires overlap with official event timestamps, allowing partial attendance', () => {
    const rows = [offer({ id: 'before', startsAt: at('2026-11-14T00:00:00Z'), endsAt: at('2026-11-15T16:00:00Z') }), offer({ id: 'first-evening', endsAt: at('2026-11-15T22:00:00Z') }), offer({ id: 'last-day', startsAt: at('2026-11-17T10:00:00Z'), endsAt: at('2026-11-17T18:00:00Z') }), offer({ id: 'after', startsAt: at('2026-11-17T19:00:00Z'), endsAt: at('2026-11-18T00:00:00Z') })];
    expect(eventOffersFor(event, rows, now).map(row => row.id)).toEqual(['first-evening', 'last-day']);
  });

  it('hides expired events and activations whose booking window has started', () => {
    expect(eventOffersFor(event, [offer()], at(event.endAt))).toEqual([]);
    expect(eventOffersFor(event, [offer()], at('2026-11-15T17:00:00Z'))).toEqual([]);
    expect(eventOffersFor({ ...event, startAt: 'invalid' }, [offer()], now)).toEqual([]);
    expect(eventOffersFor({ ...event, endAt: event.startAt }, [offer()], now)).toEqual([]);
    expect(eventOffersFor(event, [offer()], NaN)).toEqual([]);
  });

  it('orders by activation time, then newest publication, then ID without mutating input', () => {
    const rows = Object.freeze([offer({ id: 'late', startsAt: at('2026-11-16T00:00:00Z'), endsAt: at('2026-11-16T22:00:00Z') }), offer({ id: 'older', createdAt: now - 900 }), offer({ id: 'b-new', createdAt: now - 100 }), offer({ id: 'a-new', createdAt: now - 100 })]);
    expect(eventOffersFor(event, rows, now).map(row => row.id)).toEqual(['a-new', 'b-new', 'older', 'late']);
    expect(rows.map(row => row.id)).toEqual(['late', 'older', 'b-new', 'a-new']);
  });

  it('allows legacy placement kind only when attendance and dated availability are explicit', () => {
    expect(eventOffersFor(event, [offer({ kind: undefined }), offer({ id: 'no-kind-or-attendance', kind: undefined, attendingEvent: undefined })], now).map(row => row.id)).toEqual(['offer-one']);
  });
});

describe('event offer profile identity', () => {
  it('matches both account owner and wallet, never a shared or empty wallet alone', () => {
    const matching = profile();
    expect(eventOfferProfile(offer(), [profile({ owner: 'someone-else', id: 'other' }), matching])).toBe(matching);
    expect(eventOfferProfile(offer(), [profile({ owner: 'someone-else' }), profile({ wallet: 'different-wallet' })])).toBeUndefined();
  });

  it('uses the latest owner profile and does not resurrect a stale wallet identity', () => {
    const latest = profile({ id: 'updated', updatedAt: now - 10, name: 'Updated Name' });
    expect(eventOfferProfile(offer(), [profile(), latest])).toBe(latest);
    expect(eventOfferProfile(offer(), [profile(), profile({ updatedAt: now - 5, wallet: 'new-wallet' })])).toBeUndefined();
  });
});
