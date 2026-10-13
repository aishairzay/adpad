import { describe, expect, it } from 'vitest';
import { NOT_SET, reviewSections } from '../src/lib/review-summary';
import type { Draft } from '../functions/onboarding-schema';

describe('review before publishing', () => {
  it('names the gaps plainly when nothing is filled in yet', () => {
    const sections = reviewSections({ offers: {} }, ['placement']);
    expect(sections.map(section => section.heading)).toEqual(['You', 'Ad space']);
    expect(sections[0].rows).toEqual([{ label: 'Name / crew', value: NOT_SET }, { label: 'X account', value: 'Not added' }]);
    expect(sections[1].rows.find(row => row.label === 'Title')?.value).toBe(NOT_SET);
    expect(sections[1].rows.find(row => row.label === 'Price')?.value).toBe(NOT_SET);
    expect(sections[1].rows.find(row => row.label === 'Event or activation')?.value).toBe('Independent — no event tag');
    expect(sections[1].rows.find(row => row.label === 'Clothing or merch')?.value).toBe('Not included');
  });
  it('reads back the chosen event window, merch arrangement, and price in USDC', () => {
    const draft: Draft = {
      publisher: 'Sam',
      xHandle: '@sam',
      offers: {
        placement: { title: 'I’ll wear your hoodie', category: 'T-shirts', priceMicro: 250000000, turnaroundDays: 3, capacity: 2, eventName: 'Solana Hacker House — London', startsAt: Date.parse('2026-11-01T10:00:00Z') / 1000, endsAt: Date.parse('2026-11-12T20:00:00Z') / 1000, clothingSource: 'sponsor' },
        service: { title: 'Event photography', category: 'Photography', priceMicro: 50000000, turnaroundDays: 7 },
      },
    };
    const sections = reviewSections(draft, ['placement', 'service']);
    const placement = Object.fromEntries(sections[1].rows.map(row => [row.label, row.value]));
    expect(placement['Title']).toBe('I’ll wear your hoodie');
    expect(placement['Category']).toBe('T-shirts');
    expect(placement['Price']).toBe('250 USDC');
    expect(placement['Delivery window']).toBe('3 days');
    expect(placement['Booking spots']).toBe('2');
    expect(placement['Event or activation']).toBe('Solana Hacker House — London · 1 Nov 2026 – 12 Nov 2026 (UTC)');
    expect(placement['Clothing or merch']).toBe('Sponsor supplies the merch');
    const service = Object.fromEntries(sections[2].rows.map(row => [row.label, row.value]));
    expect(service['Skill']).toBe('Photography');
    expect(service['Price']).toBe('50 USDC');
    expect(sections[0].rows[0].value).toBe('Sam');
  });
});
