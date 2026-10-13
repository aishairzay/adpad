import { afterEach, describe, expect, it, vi } from 'vitest';
import sponsorWrite, { declineReason, decide, describeWrite } from '../functions/sponsorWrite';

const signer = 'B9bQJmvkY6mL9HcRkqkP3eMahbgzgentzhpXC7MoDXrx';
// The real quote for a listing publish on mainnet.
const quote = { feeLamportsMax: 18556, rentLamportsMax: 4704080, microUsdMax: 580_000, solPriceMicroUsd: 120_000_000 };
const recent = { signer: { day: 0, outstanding: 0 }, prefix: { key: 'bookingOffers', day: 3, signerDay: 0 } };
const publish = [{ path: 'bookingOffers/listing_pub_abc', op: 'set' }];
// Args shaped like production: { writes, signer, quote, recent }.
const args = (writes: unknown[] = publish, extra: Record<string, unknown> = {}) => ({ writes, signer, quote, recent, ...extra });
const YES = { sponsor: true, attribution: 'adpad' };
const NO = { sponsor: false };

afterEach(() => vi.restoreAllMocks());

describe('sponsorWrite', () => {
  it('pays for a listing publish and a deal booking with the real quote', async () => {
    expect(await sponsorWrite(args())).toEqual(YES);
    expect(await sponsorWrite(args([{ path: 'sponsorDeals/deal_1', op: 'set' }]))).toEqual(YES);
    expect(await sponsorWrite(args([{ path: '/bookingOffers/a', op: 'SET' }, { path: 'sponsorDeals/d', op: 'set' }]))).toEqual(YES);
  });

  it('is pure: no reads or writes on ctx', async () => {
    const ctx = new Proxy({}, { get: () => { throw new Error('ctx touched'); } });
    expect(await sponsorWrite(args(), ctx)).toEqual(YES);
  });

  it('only sponsors set ops on bookingOffers and sponsorDeals', async () => {
    for (const writes of [
      [{ path: 'bookingOffers/a', op: 'delete' }],
      [{ path: 'bookingOffers/a', op: 'create' }],
      [{ path: 'sponsorDeals/a', op: 'remove' }],
      [{ path: 'listings/a', op: 'set' }],
      [{ path: 'profiles/a', op: 'set' }],
      [{ path: 'dealRequests/a', op: 'set' }],
      [{ path: 'dealEscrows/a', op: 'set' }],
      [{ path: 'bookingOffers/a', op: 'set' }, { path: 'dealEscrows/a', op: 'set' }],
      [{ path: 'bookingOffers/a', op: 'set' }, { path: 'bookingOffers/b', op: 'delete' }],
      [{ path: 'bookingOffers/a/b', op: 'set' }],
      [{ path: 'bookingOffers/a' }],
    ]) expect(decide(args(writes))).toEqual(NO);
    expect(declineReason(args([{ path: 'listings/a', op: 'set' }]))).toBe('unsponsored_write');
  });

  it('caps fee plus rent at 0.02 SOL', () => {
    expect(decide(args(publish, { quote: { feeLamportsMax: 5000, rentLamportsMax: 19_995_000 } }))).toEqual(YES);
    expect(declineReason(args(publish, { quote: { feeLamportsMax: 5001, rentLamportsMax: 19_995_000 } }))).toBe('over_lamport_cap');
    expect(decide(args(publish, { quote: { feeLamportsMax: '18556', rentLamportsMax: '4704080' } }))).toEqual(YES);
    expect(declineReason(args(publish, { quote: { microUsdMax: 1000 } }))).toBe('quote_missing_lamports');
    expect(declineReason(args(publish, { quote: null }))).toBe('no_quote');
  });

  it('uses realtime counts: fewer than 5 a day and fewer than 2 outstanding per signer', () => {
    const at = (day: unknown, outstanding: unknown) => args(publish, { recent: { ...recent, signer: { day, outstanding } } });
    expect(decide(at(4, 1))).toEqual(YES);
    expect(declineReason(at(5, 0))).toBe('signer_daily_cap');
    expect(declineReason(at(0, 2))).toBe('signer_outstanding_cap');
    expect(declineReason(at(-1, 0))).toBe('malformed_recent');
    expect(declineReason(at('x', 0))).toBe('malformed_recent');
    expect(declineReason(at(1.5, 0))).toBe('malformed_recent');
    expect(declineReason(at(undefined, 0))).toBe('malformed_recent');
    expect(declineReason(args(publish, { recent: undefined }))).toBe('no_recent');
    expect(declineReason(args(publish, { recent: { prefix: recent.prefix } }))).toBe('no_recent');
    expect(declineReason(args(publish, { recent: 'busy' }))).toBe('no_recent');
  });

  it('never throws on bad input', async () => {
    expect(await sponsorWrite(null)).toEqual(NO);
    expect(await sponsorWrite(undefined)).toEqual(NO);
    expect(await sponsorWrite('x')).toEqual(NO);
    expect(await sponsorWrite(args([]))).toEqual(NO);
    expect(await sponsorWrite(args(new Array(11).fill(publish[0])))).toEqual(NO);
    const hostile = { get writes() { throw new Error('boom'); } };
    expect(await sponsorWrite(hostile)).toEqual(NO);
  });

  it('logs one line per decline with reason and quote, never an address, and nothing on yes', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => { lines.push(line); });
    decide(args());
    expect(lines).toHaveLength(0);
    decide(args(publish, { quote: { ...quote, rentLamportsMax: 30_000_000 } }));
    decide(args([{ path: `sponsorDeals/${signer}`, op: 'set' }], { recent: { signer: { day: 5, outstanding: 0 } } }));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^sponsorWrite declined reason=over_lamport_cap writes=\[set bookingOffers\/\*\] quote=\{.*"rentLamportsMax":30000000.*recent=day=0,outstanding=0/);
    expect(lines[1]).toMatch(/reason=signer_daily_cap/);
    for (const line of lines) expect(line).not.toContain(signer);
    expect(describeWrite({ path: `bookingOffers/${signer}`, op: 'set' })).toBe('set bookingOffers/*');
  });
});
