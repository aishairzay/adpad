import { describe, expect, it } from 'vitest';
import { activationDates, availability, listingPath, mergeOffer, offerDocument, safePublicUrl, validateSponsorship } from '../src/lib/sponsorship';
import { readOfferTerms } from '../src/OfferFields';
import type { Listing } from '../src/types';

const listing: Listing = { id: 'one', owner: 'alice', seller: 'wallet', title: 'Wear your merch', publisher: 'Alice', category: 'T-shirts', channel: 'London', audience: 'Builders', description: 'A merch activation', deliverables: 'Wear a hoodie and provide photos', priceMicro: 100000000, turnaroundDays: 7, active: true, createdAt: 10, kind: 'placement', sponsorship: true, eventId: 'independent', eventName: 'London meetup', startsAt: 3000, endsAt: 4000, capacity: 2, reserved: 1, bookingReady: true };

describe('bookable inventory', () => {
  it('uses only initialized authoritative capacity', () => {
    expect(availability(listing, 1000)).toEqual({ remaining: 1, label: '1 of 2 spots available', bookable: true });
    expect(availability({ ...listing, reserved: undefined }, 1000).bookable).toBe(false);
    expect(availability({ ...listing, reserved: 3 }, 1000).bookable).toBe(false);
    expect(availability({ ...listing, reserved: 2 }, 1000).label).toBe('Fully booked');
  });
  it('does not sell concepts, closed offers, or late activations', () => {
    expect(availability({ ...listing, sample: true }, 1000).remaining).toBe(null);
    expect(availability({ ...listing, active: false }, 1000).bookable).toBe(false);
    expect(availability(listing, 3000).bookable).toBe(false);
    expect(availability({ ...listing, supplyBy: 900 }, 1000).bookable).toBe(false);
  });
  it('does not fabricate remaining spots for legacy offers', () => {
    const old = { ...listing, sponsorship: undefined, startsAt: undefined, endsAt: undefined, capacity: undefined, reserved: undefined };
    expect(availability(old, 1000).remaining).toBe(null);
    expect(availability(old, 1000).label).toContain('agreed on acceptance');
  });
});

describe('authoritative offer pairing', () => {
  const offer = { seller: 'wallet', listingOwner: 'alice', title: 'Confirmed title', channel: 'London', deliverables: 'Wear the supplied hoodie', priceMicro: 250000000, active: true, capacity: 3, reserved: 2, kind: 'placement', startsAt: 3000, endsAt: 4000 };
  it('displays authoritative terms and counter', () => {
    expect(mergeOffer(listing, offer)).toMatchObject({ priceMicro: 250000000, capacity: 3, reserved: 2, title: 'Confirmed title', bookingReady: true });
  });
  it('refuses a companion belonging to another wallet or identity', () => {
    expect(mergeOffer(listing, { ...offer, seller: 'attacker' }).bookingReady).toBe(false);
    expect(mergeOffer(listing, { ...offer, listingOwner: 'mallory' }).hasBookingOffer).toBe(false);
  });
  it('keeps pending publication and closed metadata out of booking', () => {
    expect(mergeOffer(listing).bookingReady).toBe(false);
    expect(mergeOffer(listing, { ...offer, reserved: null }).bookingReady).toBe(false);
    expect(mergeOffer({ ...listing, active: false }, offer).active).toBe(false);
  });
});

describe('sponsorship terms', () => {
  it('requires named activation, dates, and capacity', () => {
    expect(() => validateSponsorship(listing, 1000)).not.toThrow();
    expect(() => validateSponsorship({ ...listing, eventName: '' }, 1000)).toThrow();
    expect(() => validateSponsorship({ ...listing, endsAt: 2000 }, 1000)).toThrow();
    expect(() => validateSponsorship({ ...listing, capacity: 0 }, 1000)).toThrow();
    expect(() => validateSponsorship({ ...listing, kind: 'service' }, 1000)).toThrow();
    expect(() => validateSponsorship({ ...listing, startsAt: 900 }, 1000)).toThrow();
    expect(() => validateSponsorship({ ...listing, endsAt: 3000 + 91 * 86400 }, 1000)).toThrow('90 days');
  });
  it('requires clothing responsibilities and a feasible supply date', () => {
    expect(() => validateSponsorship({ ...listing, clothingSource: 'sponsor' }, 1000)).toThrow();
    expect(() => validateSponsorship({ ...listing, clothingSource: 'sponsor', clothingDetails: 'Advertiser supplies the hoodie', supplyBy: 2000 }, 1000)).not.toThrow();
    expect(() => validateSponsorship({ ...listing, supplyBy: 3500 }, 1000)).toThrow();
  });
  it('formats calendar dates consistently in UTC', () => {
    expect(activationDates({ startsAt: Date.parse('2026-11-15T00:00:00Z') / 1000, endsAt: Date.parse('2026-11-15T23:59:59Z') / 1000 })).toBe('15 Nov 2026');
  });
});

describe('share links', () => {
  it('encodes IDs and excludes unsafe public destinations', () => {
    expect(listingPath({ id: 'a/b' })).toBe('/offers/a%2Fb');
    expect(safePublicUrl('javascript:alert(1)')).toBe(null);
    expect(safePublicUrl('https://name:password@example.com/')).toBe(null);
    expect(safePublicUrl('https://localhost/')).toBe(null);
    expect(safePublicUrl('/images/local.webp')).toBe(null);
    expect(safePublicUrl('https://example.com/')).toBe('https://example.com/');
  });
});

describe('explicit event attendance', () => {
  it('requires ad space, event details and dates; never implies attendance from selecting an event', () => {
    expect(() => validateSponsorship({ ...listing, attendingEvent: true }, 1000)).not.toThrow();
    expect(() => validateSponsorship({ ...listing, sponsorship: false, attendingEvent: true, kind: 'service' }, 1000)).toThrow();
    expect(() => validateSponsorship({ ...listing, attendingEvent: true, eventName: '' }, 1000)).toThrow();
    const form = new FormData(); form.set('eventId', 'breakpoint-2026'); form.set('eventName', 'Breakpoint');
    expect(readOfferTerms(form, 'placement', true).attendingEvent).toBe(false);
    form.set('attendingEvent', 'on');
    expect(readOfferTerms(form, 'placement', true).attendingEvent).toBe(true);
    expect(readOfferTerms(form, 'service', false).attendingEvent).toBe(false);
  });
  it('keeps the attendance statement in public metadata, with fixed work in the existing escrow terms', () => {
    expect(offerDocument({ ...listing, attendingEvent: true }, 'alice', 'wallet', 1000)).not.toHaveProperty('attendingEvent');
    expect(() => validateSponsorship({ ...listing, attendingEvent: true, eventId: 'breakpoint-2026' }, 1000)).toThrow('overlap');
  });
});
