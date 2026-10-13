import { describe, expect, it } from 'vitest';
import { readOfferTerms } from '../src/OfferFields';
import { canEditListing, mergeOffer, availability } from '../src/lib/sponsorship';
import { isCommunityListing } from '../src/lib/community';
import type { Listing } from '../src/types';

describe('independently bookable offer forms', () => {
  it('keeps each offer’s dates, capacity, attendance, and merch separate', () => {
    const form = new FormData();
    for (const [name, value] of Object.entries({ 'placement.capacity': '2', 'placement.eventId': 'independent', 'placement.eventName': 'London meetup', 'placement.startsAt': '2026-11-05', 'placement.endsAt': '2026-11-05', 'placement.attendingEvent': 'on', 'placement.clothingSource': 'existing', 'placement.clothingDetails': 'My agreed branded hoodie', 'service.capacity': '5', 'service.eventId': 'independent', 'service.eventName': 'Video workshop', 'service.startsAt': '2026-11-06', 'service.endsAt': '2026-11-07' })) form.set(name, value);
    expect(readOfferTerms(form, 'placement', true, 'placement.')).toMatchObject({ capacity: 2, eventName: 'London meetup', attendingEvent: true, sponsorship: true, clothingSource: 'existing', startsAt: Date.parse('2026-11-05T00:00:00Z') / 1000 });
    const service = readOfferTerms(form, 'service', true, 'service.');
    expect(service).toMatchObject({ capacity: 5, eventName: 'Video workshop', attendingEvent: false, sponsorship: false, endsAt: Date.parse('2026-11-07T23:59:59Z') / 1000 });
    expect(service).not.toHaveProperty('clothingSource');
  });
});

describe('listing management discovery state', () => {
  const listing: Listing = { id: 'real_offer', owner: 'alice', seller: 'wallet', title: 'My ad space', publisher: 'Alice', category: 'Event', channel: 'London', audience: 'Builders', description: 'Event ad space', deliverables: 'Photo proof', priceMicro: 1000000, turnaroundDays: 7, active: true, createdAt: 1, editVersion: 1 };
  const offer = { seller: 'wallet', listingOwner: 'alice', title: listing.title, channel: listing.channel, deliverables: listing.deliverables, priceMicro: listing.priceMicro, active: true, reserved: 0, everFunded: false };
  it('requires authoritative never-funded history for in-place editing', () => {
    expect(canEditListing(mergeOffer(listing, offer))).toBe(true);
    expect(canEditListing(mergeOffer(listing, { ...offer, everFunded: true }))).toBe(false);
    expect(canEditListing(mergeOffer(listing, { ...offer, everFunded: null }))).toBe(false);
    expect(canEditListing(mergeOffer({ ...listing, editVersion: null }, offer))).toBe(false);
    expect(canEditListing(mergeOffer(listing, { ...offer, seller: 'stranger' }))).toBe(false);
  });
  it('hides a partly deleted listing while retaining its pending management state', () => {
    const partial = mergeOffer(listing, { ...offer, deleted: true, active: false });
    expect(partial).toMatchObject({ deleted: true, deletionPending: true, active: false });
    expect(availability(partial).bookable).toBe(false);
    expect(canEditListing(partial)).toBe(false);
    expect(isCommunityListing(partial)).toBe(false);
    expect(mergeOffer({ ...listing, deleted: true, active: false }, { ...offer, deleted: true, active: false }).deletionPending).toBe(false);
  });
});
