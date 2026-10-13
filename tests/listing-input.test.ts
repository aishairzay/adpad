import { describe, expect, it } from 'vitest';
import { CATEGORIES, SERVICE_CATEGORIES } from '../src/types';
import type { ListingInput } from '../src/types';
import { validateListingFields, validateListingInput } from '../src/lib/listing-input';

const now = Date.parse('2026-09-21T12:00:00Z') / 1000;
const input: ListingInput = {
  kind: 'placement', publisher: 'Alice', title: 'Wear your merch', category: 'T-shirts',
  channel: 'London', audience: 'Conference attendees', description: 'Wear an approved sponsor shirt.',
  deliverables: 'Wear the shirt for four hours and share dated public photos.', priceMicro: 100_000_000,
  turnaroundDays: 7,
};
const invalid = (patch: Record<string, unknown>) => ({ ...input, ...patch }) as ListingInput;
const terms: ListingInput = {
  ...input, sponsorship: true, attendingEvent: true, eventId: 'independent', eventName: 'London meetup',
  startsAt: now + 86400, endsAt: now + 2 * 86400, capacity: 1,
};

describe('listing text before journal creation', () => {
  it.each([
    ['title', 3, 80], ['publisher', 1, 80], ['category', 1, 50], ['channel', 1, 100],
    ['audience', 1, 250], ['description', 1, 1000], ['deliverables', 1, 500],
  ] as const)('rejects blank, wrong-type, and oversized %s values', (key, minimum, maximum) => {
    for (const value of ['', ' \t\n ', '\u00a0', null, undefined, 42, [], {}, 'x'.repeat(maximum + 1)]) {
      expect(() => validateListingInput(invalid({ [key]: value }), now)).toThrow();
    }
    if (key !== 'category') {
      expect(() => validateListingInput(invalid({ [key]: 'x'.repeat(minimum) }), now)).not.toThrow();
      expect(() => validateListingInput(invalid({ [key]: 'x'.repeat(maximum) }), now)).not.toThrow();
    }
  });
  it('checks title length after trimming and raw maximum length before persisting', () => {
    expect(() => validateListingInput({ ...input, title: ' a ' }, now)).toThrow('Offer title');
    expect(() => validateListingInput({ ...input, title: '  abc  ' }, now)).not.toThrow();
    expect(() => validateListingInput({ ...input, title: ` ${'a'.repeat(80)}` }, now)).toThrow('Offer title');
  });
  it('never trims or mutates the exact caller draft', () => {
    const frozen = Object.freeze({ ...input, title: '  Valid title  ', description: 'First line\nSecond line' });
    expect(() => validateListingInput(frozen, now)).not.toThrow();
    expect(frozen.title).toBe('  Valid title  ');
    expect(frozen.description).toBe('First line\nSecond line');
  });
  it.each([['eventId', 80], ['eventName', 120], ['clothingDetails', 500]] as const)('checks optional %s types and boundary', (key, maximum) => {
    for (const value of [undefined, null, '', 'x'.repeat(maximum)]) {
      expect(() => validateListingInput(invalid({ [key]: value }), now)).not.toThrow();
    }
    for (const value of ['   ', 12, true, {}, 'x'.repeat(maximum + 1)]) {
      expect(() => validateListingInput(invalid({ [key]: value }), now)).toThrow();
    }
  });
});

describe('listing kind, category, price and delivery boundaries', () => {
  it('accepts only kind-appropriate choices and supports legacy placement kind', () => {
    for (const category of CATEGORIES.slice(1)) expect(() => validateListingInput(invalid({ category }), now)).not.toThrow();
    for (const category of SERVICE_CATEGORIES.slice(1)) expect(() => validateListingInput(invalid({ kind: 'service', category }), now)).not.toThrow();
    for (const kind of [undefined, null, 'placement']) expect(() => validateListingInput(invalid({ kind }), now)).not.toThrow();
    for (const patch of [{ kind: '' }, { kind: 'both' }, { kind: 1 }, { category: 'All placements' }, { category: 'All skills' }, { category: 'Photography' }, { kind: 'service', category: 'T-shirts' }, { category: ' T-shirts ' }]) {
      expect(() => validateListingInput(invalid(patch), now)).toThrow();
    }
  });
  it('requires safe integer micro-USDC within the exact policy limit', () => {
    for (const priceMicro of [1, 100_000_000_000]) expect(() => validateListingInput({ ...input, priceMicro }, now)).not.toThrow();
    for (const priceMicro of [0, -1, 1.1, 100_000_000_001, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '1000000', null]) {
      expect(() => validateListingInput(invalid({ priceMicro }), now)).toThrow('Price');
    }
  });
  it('checks integer day and capacity bounds', () => {
    for (const turnaroundDays of [1, 90]) expect(() => validateListingInput({ ...input, turnaroundDays }, now)).not.toThrow();
    for (const turnaroundDays of [0, 91, 1.5, NaN, Infinity, '7', null]) expect(() => validateListingInput(invalid({ turnaroundDays }), now)).toThrow('Delivery window');
    for (const capacity of [undefined, null, 1, 100]) expect(() => validateListingInput({ ...input, capacity }, now)).not.toThrow();
    for (const capacity of [0, 101, 1.5, NaN, Infinity, '1']) expect(() => validateListingInput(invalid({ capacity }), now)).toThrow('booking spots');
  });
  it('rejects nonboolean choices instead of coercing truthy strings', () => {
    for (const key of ['sponsorship', 'attendingEvent']) {
      for (const value of [undefined, null, false]) expect(() => validateListingInput(invalid({ [key]: value }), now)).not.toThrow();
      for (const value of ['false', 'true', 0, 1, {}]) expect(() => validateListingInput(invalid({ [key]: value }), now)).toThrow('choice');
    }
    expect(() => validateListingInput(terms, now)).not.toThrow();
  });
});

describe('shared activation and clothing validation', () => {
  it('rejects malformed, partial, reversed and longer-than-90-day windows', () => {
    for (const value of [0, -1, 1.5, NaN, Infinity, '2000000000', Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => validateListingInput({ ...terms, startsAt: value } as ListingInput, now)).toThrow();
      expect(() => validateListingInput({ ...terms, endsAt: value } as ListingInput, now)).toThrow();
    }
    expect(() => validateListingInput({ ...input, startsAt: now + 100 }, now)).toThrow('both');
    expect(() => validateListingInput({ ...input, endsAt: now + 100 }, now)).toThrow('both');
    expect(() => validateListingInput({ ...terms, endsAt: terms.startsAt! - 1 }, now)).toThrow('activation window');
    expect(() => validateListingInput({ ...terms, endsAt: terms.startsAt! + 90 * 86400 }, now)).not.toThrow();
    expect(() => validateListingInput({ ...terms, endsAt: terms.startsAt! + 90 * 86400 + 1 }, now)).toThrow('90 days');
  });
  it('uses the shared sponsorship and explicit attendance rules', () => {
    expect(() => validateListingInput({ ...input, sponsorship: true }, now)).toThrow('sponsorship needs');
    expect(() => validateListingInput({ ...terms, kind: 'service', category: 'Photography' }, now)).toThrow('ad-space');
    expect(() => validateListingInput({ ...terms, eventId: 'breakpoint-2026' }, now)).toThrow('overlap');
    expect(() => validateListingInput({ ...terms, sponsorship: false, eventName: '' }, now)).toThrow('attendance dates');
  });
  it('checks source, responsibilities and unsigned supply dates against the activation', () => {
    for (const clothingSource of ['sponsor', 'creator', 'existing'] as const) {
      expect(() => validateListingInput({ ...terms, clothingSource, clothingDetails: 'Supply approved shirt', supplyBy: terms.startsAt }, now)).not.toThrow();
      expect(() => validateListingInput({ ...terms, clothingSource }, now)).toThrow('Describe the clothing');
    }
    for (const clothingSource of ['', 'brand', 1, {}]) expect(() => validateListingInput(invalid({ clothingSource }), now)).toThrow('supplies');
    for (const supplyBy of [0, -1, 1.5, NaN, Infinity, '123']) expect(() => validateListingInput({ ...terms, supplyBy } as ListingInput, now)).toThrow();
    expect(() => validateListingInput({ ...terms, supplyBy: terms.startsAt! + 1 }, now)).toThrow('supply date');
    expect(() => validateListingInput({ ...input, supplyBy: now + 1 }, now)).toThrow('supply date');
  });
  it('validates new dates in the future but allows elapsed valid terms for journal reconciliation', () => {
    const elapsed = { ...terms, startsAt: now - 86400, endsAt: now - 100, supplyBy: now - 2 * 86400 };
    expect(() => validateListingFields(elapsed)).not.toThrow();
    expect(() => validateListingInput(elapsed, now)).toThrow('future activation');
    expect(() => validateListingInput({ ...terms, startsAt: now }, now)).toThrow('future activation');
    expect(() => validateListingInput({ ...terms, supplyBy: now }, now)).toThrow('supply date');
  });
  it('rejects invalid current-time values and malformed root inputs', () => {
    for (const time of [-1, 1.5, NaN, Infinity]) expect(() => validateListingInput(input, time)).toThrow('current time');
    for (const value of [null, undefined, [], 'offer']) expect(() => validateListingFields(value as unknown as ListingInput)).toThrow('valid offer details');
  });
});
