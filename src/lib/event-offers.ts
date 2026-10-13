import type { Listing, Profile } from '../types';
import type { SolanaEvent } from '../solana-events';
import { isCommunityListing } from './community';
import { availability } from './sponsorship';

const MAX_ACTIVATION_SECONDS = 90 * 86_400;
const validTimestamp = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** Real, bookable ad-space offers with explicit attendance and dates overlapping this official event. */
export function eventOffersFor(event: Pick<SolanaEvent, 'id' | 'startAt' | 'endAt'>, listings: readonly Listing[], nowSeconds = Math.floor(Date.now() / 1000)): Listing[] {
  const eventStart = Date.parse(event.startAt) / 1000;
  const eventEnd = Date.parse(event.endAt) / 1000;
  if (!event.id || !Number.isFinite(eventStart) || !Number.isFinite(eventEnd) || eventEnd <= eventStart || !Number.isFinite(nowSeconds) || nowSeconds < 0 || nowSeconds >= eventEnd) return [];

  return listings.filter(listing => {
    if (!isCommunityListing(listing) || !listing.active || listing.attendingEvent !== true || listing.eventId !== event.id) return false;
    if (listing.kind != null && listing.kind !== 'placement') return false;
    if (!validTimestamp(listing.startsAt) || !validTimestamp(listing.endsAt) || listing.endsAt < listing.startsAt || listing.endsAt - listing.startsAt > MAX_ACTIVATION_SECONDS) return false;
    if (listing.startsAt >= eventEnd || listing.endsAt <= eventStart) return false;
    if (!Number.isSafeInteger(listing.priceMicro) || listing.priceMicro <= 0) return false;
    return availability(listing, nowSeconds).bookable;
  }).sort((left, right) => left.startsAt! - right.startsAt! || right.createdAt - left.createdAt || left.id.localeCompare(right.id));
}

/** Match the account identity first, then its wallet; never borrow another person's profile. */
export function eventOfferProfile(listing: Listing, profiles: readonly Profile[]): Profile | undefined {
  const latest = profiles.filter(profile => profile.owner === listing.owner)
    .sort((left, right) => right.updatedAt - left.updatedAt || right.id.localeCompare(left.id))[0];
  return latest?.wallet === listing.seller ? latest : undefined;
}
