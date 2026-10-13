import { CATEGORIES, SERVICE_CATEGORIES } from '../types';
import type { ListingInput } from '../types';
import { validateSponsorship } from './sponsorship';
import { normalizeXHandle, normalizeXPostUrl } from './x-profile';

const MAX_PRICE_MICRO = 100_000_000_000;
const REQUIRED_TEXT = [
  ['title', 'Offer title', 3, 80],
  ['publisher', 'Your name / crew', 1, 80],
  ['category', 'Category', 1, 50],
  ['channel', 'Location, event or profile', 1, 100],
  ['audience', 'Audience', 1, 250],
  ['description', 'Offer description', 1, 1000],
  ['deliverables', 'Deliverables & proof', 1, 500],
] as const;
const OPTIONAL_TEXT = [
  ['eventId', 'Event identifier', 80],
  ['eventName', 'Event / activation name', 120],
  ['clothingDetails', 'Clothing responsibilities', 500],
] as const;

function integer(value: unknown, label: string, minimum: number, maximum: number): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be a whole number between ${minimum.toLocaleString('en-US')} and ${maximum.toLocaleString('en-US')}.`);
  }
}

/** Validate every submitted field before saving a retry journal. Never mutate its exact values. */
export function validateListingFields(input: ListingInput): void {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Enter valid offer details.');
  for (const [key, label, minimum, maximum] of REQUIRED_TEXT) {
    const value = input[key];
    // Both checks matter: whitespace cannot satisfy required content, while the
    // raw value must also fit policy if a caller has not trimmed it yet.
    if (typeof value !== 'string' || value.trim().length < minimum || value.length > maximum) {
      throw new Error(`${label} must contain ${minimum === 1 ? '1' : `at least ${minimum}`} non-blank ${minimum === 1 ? 'character' : 'characters'} and be no longer than ${maximum} characters.`);
    }
  }
  if (input.kind != null && input.kind !== 'placement' && input.kind !== 'service') throw new Error('Choose ad space or creator service.');
  const categories: readonly string[] = input.kind === 'service' ? SERVICE_CATEGORIES.slice(1) : CATEGORIES.slice(1);
  if (!categories.includes(input.category)) throw new Error(`Choose a valid ${input.kind === 'service' ? 'creator skill' : 'placement category'}.`);
  if (typeof input.priceMicro !== 'number' || !Number.isSafeInteger(input.priceMicro) || input.priceMicro < 1 || input.priceMicro > MAX_PRICE_MICRO) {
    throw new Error('Price must be between 0.000001 and 100,000 USDC, with at most 6 decimal places.');
  }
  integer(input.turnaroundDays, 'Delivery window in days', 1, 90);
  if (input.verifiedXHandle && normalizeXHandle(input.verifiedXHandle) !== input.verifiedXHandle) throw new Error('Link your X account again; its handle could not be read.');
  if (input.xPostUrl && normalizeXPostUrl(input.xPostUrl) !== input.xPostUrl) throw new Error('Enter a public X post URL.');

  for (const [key, label, maximum] of OPTIONAL_TEXT) {
    const value = input[key];
    if (value == null) continue;
    if (typeof value !== 'string' || value.length > maximum || value.length > 0 && !value.trim()) {
      throw new Error(`${label} must be text of no more than ${maximum} characters; leave it empty when it does not apply.`);
    }
  }
  for (const key of ['sponsorship', 'attendingEvent'] as const) {
    if (input[key] != null && typeof input[key] !== 'boolean') throw new Error(`${key === 'sponsorship' ? 'Sponsor me selection' : 'Event attendance'} must be a checked or unchecked choice.`);
  }
  if (input.capacity != null) integer(input.capacity, 'Available booking spots', 1, 100);
  for (const [key, label] of [['startsAt', 'Activation start'], ['endsAt', 'Activation end'], ['supplyBy', 'Clothing supply date']] as const) {
    if (input[key] != null) integer(input[key], label, 1, Number.MAX_SAFE_INTEGER);
  }
  if (input.clothingSource != null && !['sponsor', 'creator', 'existing'].includes(input.clothingSource)) throw new Error('Choose who supplies the clothing.');

  // Reconciliation must still accept structurally valid dates that elapsed after
  // an attempt. Zero retains all shared term checks without imposing today's date.
  validateSponsorship(input, 0);
}

/** Validate a new or changed offer, including its future activation/supply dates. */
export function validateListingInput(input: ListingInput, nowSeconds = Math.floor(Date.now() / 1000)): void {
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) throw new Error('The current time could not be checked. Refresh before publishing.');
  validateListingFields(input);
  validateSponsorship(input, nowSeconds);
}
