import type { Listing, ListingInput, Profile, SponsorshipTerms } from '../types';
import { safeListingImageUrl } from './listing-images';
import { FEATURED_SOLANA_EVENTS } from '../solana-events';

export const TERM_KEYS = ['sponsorship', 'eventId', 'eventName', 'startsAt', 'endsAt', 'capacity', 'clothingSource', 'clothingDetails', 'supplyBy'] as const;
export function sponsorshipTerms(input: SponsorshipTerms): Record<string, unknown> {
  return Object.fromEntries(TERM_KEYS.filter(key => input[key] != null).map(key => [key, input[key]]));
}
export function safePublicUrl(value: string | null | undefined): string | null {
  if (!value || value.startsWith('/')) return null;
  return safeListingImageUrl(value);
}
export const listingPath = (listing: Pick<Listing, 'id'>) => `/offers/${encodeURIComponent(listing.id)}`;
export const profilePath = (owner: string) => `/people/${encodeURIComponent(owner)}`;
export const eventLabel = (listing: SponsorshipTerms) => listing.eventName || 'Anywhere';
export function activationDates(listing: SponsorshipTerms): string {
  if (!listing.startsAt || !listing.endsAt) return 'Dates agreed in the brief';
  const format = (timestamp: number) => new Date(timestamp * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return listing.startsAt === listing.endsAt || format(listing.startsAt) === format(listing.endsAt) ? format(listing.startsAt) : `${format(listing.startsAt)} – ${format(listing.endsAt)}`;
}
/** The official event a listing is tagged to, if any. */
export const officialEvent = (listing: Pick<SponsorshipTerms, 'eventId'>) => FEATURED_SOLANA_EVENTS.find(item => item.id === listing.eventId);
const dayStart = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 1000;
const dayEnd = (iso: string) => Date.parse(`${iso.slice(0, 10)}T23:59:59Z`) / 1000;
/** "1 Nov 2026 – 12 Nov 2026" for an official event id. */
export function officialEventDates(eventId: string): string {
  const event = FEATURED_SOLANA_EVENTS.find(item => item.id === eventId);
  return event ? activationDates({ startsAt: dayStart(event.startAt), endsAt: dayStart(event.endAt) }) : '';
}
/** True when a listing's dates sit outside the official event it is tagged to. */
export function outsideOfficialDates(listing: SponsorshipTerms): boolean {
  const event = officialEvent(listing);
  return Boolean(event && listing.startsAt && listing.endsAt && (listing.startsAt < dayStart(event.startAt) || listing.endsAt > dayEnd(event.endAt)));
}

export function availability(listing: Listing, now = Math.floor(Date.now() / 1000)): { remaining: number | null; label: string; bookable: boolean } {
  const capacity = listing.capacity;
  const reserved = listing.reserved;
  const tracked = Number.isSafeInteger(capacity) && Number(capacity) > 0 && Number.isSafeInteger(reserved) && Number(reserved) >= 0 && Number(reserved) <= Number(capacity);
  const remaining = tracked ? Number(capacity) - Number(reserved) : null;
  if (listing.deleted) return { remaining, label: 'Deleted', bookable: false };
  if (listing.sample) return { remaining: null, label: 'Concept · not bookable', bookable: false };
  if (!listing.active) return { remaining, label: 'Closed', bookable: false };
  if (listing.endsAt && listing.endsAt < now) return { remaining, label: 'Activation ended', bookable: false };
  if (listing.startsAt && listing.startsAt <= now) return { remaining, label: 'Bookings closed · activation started', bookable: false };
  if (listing.supplyBy && listing.supplyBy < now) return { remaining, label: 'Supply deadline passed', bookable: false };
  if (listing.bookingReady === false || (capacity != null && !tracked)) return { remaining: null, label: 'Publication pending', bookable: false };
  if (remaining === 0) return { remaining, label: 'Fully booked', bookable: false };
  return { remaining, label: remaining === null ? 'Availability agreed on acceptance' : `${remaining} of ${capacity} ${capacity === 1 ? 'spot' : 'spots'} available`, bookable: true };
}
export function validateSponsorship(input: ListingInput, now = Math.floor(Date.now() / 1000)): void {
  if (input.attendingEvent && (input.kind === 'service' || !input.eventId || !input.eventName?.trim() || !input.startsAt || !input.endsAt)) throw new Error('To appear at an event, choose an ad-space offer, name the event, and set your attendance dates.');
  const event = input.attendingEvent ? FEATURED_SOLANA_EVENTS.find(item => item.id === input.eventId) : undefined;
  if (event && (Number(input.startsAt) >= Date.parse(event.endAt) / 1000 || Number(input.endsAt) <= Date.parse(event.startAt) / 1000)) throw new Error('Choose attendance dates that overlap this event.');
  if (outsideOfficialDates(input)) throw new Error(`Choose dates inside the official ${officialEvent(input)?.title} dates (${officialEventDates(input.eventId || '')}).`);
  if (input.kind === 'service' && input.sponsorship) throw new Error('Creator services and personal sponsorships are separate offer types.');
  if (input.capacity != null && (!Number.isSafeInteger(input.capacity) || input.capacity < 1 || input.capacity > 100)) throw new Error('Choose between 1 and 100 available spots.');
  if (Boolean(input.startsAt) !== Boolean(input.endsAt)) throw new Error('Choose both the start and end dates.');
  if (input.startsAt && input.endsAt && (!Number.isSafeInteger(input.startsAt) || !Number.isSafeInteger(input.endsAt) || input.endsAt < input.startsAt || input.startsAt <= now)) throw new Error('Choose a valid future activation window.');
  if (input.startsAt && input.endsAt && input.endsAt - input.startsAt > 90 * 86400) throw new Error('Keep each activation within 90 days.');
  if (input.sponsorship && (!input.startsAt || !input.endsAt || !input.capacity || !input.eventId || !input.eventName?.trim())) throw new Error('A sponsorship needs an event or activation name, dates, and available spots.');
  if (input.clothingSource && !['sponsor', 'creator', 'existing'].includes(input.clothingSource)) throw new Error('Choose who supplies the clothing.');
  if (input.clothingSource && !input.clothingDetails?.trim()) throw new Error('Describe the clothing, who supplies it, and what costs are included.');
  if (input.supplyBy && (!input.startsAt || input.supplyBy > input.startsAt || input.supplyBy <= now)) throw new Error('The clothing supply date must be in the future and no later than the activation start.');
}
export function offerDocument(input: ListingInput, owner: string, seller: string, createdAt: unknown) {
  return { seller, listingOwner: owner, title: input.title, channel: input.channel, deliverables: input.deliverables, priceMicro: input.priceMicro, kind: input.kind || 'placement', ...sponsorshipTerms(input), active: true, createdAt };
}
export function mergeOffer(listing: Listing, offer?: Record<string, unknown> | null): Listing {
  if (!offer || offer.seller !== listing.seller || offer.listingOwner !== listing.owner) return { ...listing, hasBookingOffer: false, bookingReady: listing.capacity == null && !listing.sponsorship, reserved: undefined, everFunded: null };
  const terms = Object.fromEntries(TERM_KEYS.map(key => [key, offer[key] ?? null]));
  return { ...listing, ...terms, title: String(offer.title), channel: String(offer.channel), deliverables: String(offer.deliverables), priceMicro: Number(offer.priceMicro), kind: offer.kind === 'service' ? 'service' : 'placement', active: !listing.deleted && offer.deleted !== true && listing.active && offer.active === true, deleted: listing.deleted === true || offer.deleted === true, deletionPending: (listing.deleted === true) !== (offer.deleted === true), everFunded: typeof offer.everFunded === 'boolean' ? offer.everFunded : null, reserved: typeof offer.reserved === 'number' ? offer.reserved : undefined, hasBookingOffer: true, bookingReady: typeof offer.reserved === 'number' } as Listing;
}
export function canEditListing(listing: Listing): boolean {
  return !listing.sample && !listing.deleted && listing.editVersion === 1 && listing.everFunded === false && listing.hasBookingOffer === true;
}
export function fallbackProfile(owner: string, listings: Listing[]): Profile | null {
  const first = listings.find(listing => listing.owner === owner);
  if (!first) return null;
  return { id: owner, owner, wallet: first.seller, name: first.publisher, bio: '', location: first.channel, website: '', socialUrl: '', imageUrl: first.imageUrl || '', profileType: 'person', createdAt: first.createdAt, updatedAt: first.createdAt };
}
