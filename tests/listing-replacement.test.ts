import { describe, expect, it, vi } from 'vitest';
import type { Listing, ListingInput } from '../src/types';
import { hasFundedLinkedHistory, readPendingReplacementInput, replaceLegacyListingDocuments } from '../src/lib/listing-replacement';
import { offerDocument } from '../src/lib/sponsorship';

const original: Listing = { id: 'legacy-offer', owner: 'alice', seller: 'wallet-alice', title: 'Wear a sponsor shirt', publisher: 'Alice', category: 'T-shirts', channel: 'London', audience: 'Event attendees', description: 'A day in a supplied shirt', deliverables: 'Wear shirt and send photos', priceMicro: 100_000_000, turnaroundDays: 3, active: true, createdAt: 1_000, kind: 'placement', imageUrl: 'https://realtime.bounded.sh/storage/public/photo' };
const next: ListingInput = { title: 'Wear a sponsor hoodie', publisher: 'Alice', category: 'T-shirts', channel: 'London', audience: 'Event attendees', description: 'A day in a supplied hoodie', deliverables: 'Wear hoodie and send four photos', priceMicro: 150_000_000, turnaroundDays: 4, kind: 'placement' };
const actor = { owner: 'alice', seller: 'wallet-alice' };
const token = 'ca856fbb-d40f-4334-a9f8-56d9285ef606';

function harness(ready = true) {
  const documents = new Map<string, Record<string, unknown>>([
    ['listings/legacy-offer', { ...original }],
    ['bookingOffers/legacy-offer', { ...offerDocument(original, original.owner, original.seller, 1_000), reserved: 0 }],
  ]);
  const history: Record<string, unknown>[] = [];
  let saved: string | null = null;
  const read = vi.fn(async (path: string) => documents.get(path) || null);
  const write = vi.fn(async (path: string, patch: Record<string, unknown>) => {
    const previous = documents.get(path);
    documents.set(path, { ...previous, ...patch, ...(!previous && path.startsWith('bookingOffers/') && ready ? { everFunded: false, reserved: 0 } : {}) });
  });
  const save = vi.fn((value: string | null) => { saved = value; });
  const readLinkedDeals = vi.fn(async () => {
    expect(documents.get('listings/legacy-offer')!.active).toBe(false);
    if (documents.has('bookingOffers/legacy-offer')) expect(documents.get('bookingOffers/legacy-offer')!.active).toBe(false);
    return history;
  });
  const run = (input = next, publicationId = token) => replaceLegacyListingDocuments({ listing: original, input, imageUrl: original.imageUrl!, actor, publicationId, saved, save, read, readLinkedDeals, write, timestamp: () => 2_000, assertIdentity() {} });
  const newPaths = () => [...documents.keys()].filter(path => !path.endsWith('/legacy-offer'));
  return { documents, history, read, write, readLinkedDeals, save, run, newPaths, saved: () => saved };
}

describe('creating an updated legacy version', () => {
  it('closes the source, confirms a separate editable copy, then deletes only source discovery records', async () => {
    const h = harness();
    await h.run();
    expect(h.write.mock.calls.map(([path, patch]) => [path.split('/')[0], patch.deleted ? 'delete' : patch.active === false ? 'close' : 'create'])).toEqual([
      ['bookingOffers', 'close'], ['listings', 'close'], ['bookingOffers', 'create'], ['listings', 'create'], ['bookingOffers', 'delete'], ['listings', 'delete'],
    ]);
    expect(h.newPaths()).toHaveLength(2);
    const newMetadata = h.documents.get(h.newPaths().find(path => path.startsWith('listings/'))!)!;
    expect(newMetadata).toMatchObject({ title: next.title, imageUrl: original.imageUrl, editVersion: 1, active: true });
    expect(h.documents.get('bookingOffers/legacy-offer')).toMatchObject({ title: original.title, deliverables: original.deliverables, priceMicro: original.priceMicro, createdAt: 1_000, deleted: true, active: false });
    expect(h.documents.get('bookingOffers/legacy-offer')!.everFunded).toBeUndefined();
    expect(h.write.mock.calls.some(([path]) => path.startsWith('escrows/'))).toBe(false);
    expect(h.saved()).toBeNull();
  });

  it('supports a legacy listing with no companion without creating one at the old ID', async () => {
    const h = harness(); h.documents.delete('bookingOffers/legacy-offer');
    await h.run();
    expect(h.documents.has('bookingOffers/legacy-offer')).toBe(false);
    expect(h.documents.get('listings/legacy-offer')!.deleted).toBe(true);
    expect(h.newPaths()).toHaveLength(2);
  });

  it('rejects funded history after closing, including refunded campaigns, before publishing a new copy', async () => {
    const h = harness(); h.history.push({ id: 'campaign', listingId: original.id, status: 'refunded', version: 2 });
    await expect(h.run()).rejects.toThrow('funded campaign');
    expect(h.newPaths()).toEqual([]);
    expect(h.documents.get('listings/legacy-offer')!.deleted).not.toBe(true);
    expect(h.saved()).toBeNull();
  });

  it('rechecks the original funding flag after the history read before any new publication', async () => {
    const h = harness();
    h.readLinkedDeals.mockImplementationOnce(async () => { h.documents.get('bookingOffers/legacy-offer')!.everFunded = true; return []; });
    await expect(h.run()).rejects.toThrow('funded campaign');
    expect(h.newPaths()).toEqual([]);
    expect(h.saved()).toBeNull();
  });

  it('never treats unlinked legacy records as proof about this source, and recognizes only pristine unfunded drafts as unfunded', () => {
    expect(hasFundedLinkedHistory([{ status: 'released', version: 3 }], original.id)).toBe(false);
    expect(hasFundedLinkedHistory([{ listingId: original.id, status: 'unfunded', version: 0 }], original.id)).toBe(false);
    for (const record of [{ status: 'unfunded', version: 1 }, { status: 'unfunded', version: 0, fundedAt: 5 }, { status: 'unfunded' }, { status: 'future-state', version: 0 }]) expect(hasFundedLinkedHistory([{ listingId: original.id, ...record }], original.id)).toBe(true);
  });

  it('does not delete the source while the new offer hook remains pending', async () => {
    const h = harness(false);
    await expect(h.run()).rejects.toThrow('still unconfirmed');
    expect(h.documents.get('listings/legacy-offer')!.deleted).not.toBe(true);
    const newOfferPath = h.newPaths().find(path => path.startsWith('bookingOffers/'))!;
    Object.assign(h.documents.get(newOfferPath)!, { everFunded: false, reserved: 0 });
    await h.run();
    expect(h.newPaths()).toHaveLength(2);
    expect(h.write.mock.calls.filter(([path, patch]) => path === newOfferPath && patch.title)).toHaveLength(1);
    expect(h.documents.get('listings/legacy-offer')!.deleted).toBe(true);
  });

  it('reconciles a partially deleted source without republishing the new version', async () => {
    const h = harness(); const normalWrite = h.write.getMockImplementation()!; let lose = true;
    h.write.mockImplementation(async (path, patch) => {
      await normalWrite(path, patch);
      if (path === 'bookingOffers/legacy-offer' && patch.deleted && lose) { lose = false; throw new Error('Connection lost'); }
    });
    await expect(h.run()).rejects.toThrow('Connection lost');
    expect(h.documents.get('bookingOffers/legacy-offer')!.deleted).toBe(true);
    expect(h.documents.get('listings/legacy-offer')!.deleted).not.toBe(true);
    const creations = h.write.mock.calls.filter(([, patch]) => patch.title).length;
    await h.run();
    expect(h.write.mock.calls.filter(([, patch]) => patch.title)).toHaveLength(creations);
    expect(h.documents.get('listings/legacy-offer')!.deleted).toBe(true);
  });

  it('keeps unknown source closure pending and restores the identical input, image, and token', async () => {
    const h = harness(); h.write.mockRejectedValueOnce(new Error('Connection lost'));
    await expect(h.run()).rejects.toThrow('Connection lost');
    await expect(h.run()).rejects.toThrow('still unconfirmed');
    expect(h.write).toHaveBeenCalledTimes(1);
    expect(h.newPaths()).toEqual([]);
    expect(readPendingReplacementInput(h.saved(), actor)).toMatchObject({ input: next, imageUrl: original.imageUrl, publicationId: token });
    expect(() => readPendingReplacementInput(h.saved(), { owner: 'someone-else', seller: 'another-wallet' })).toThrow('different signed-in account');
    await expect(h.run({ ...next, title: 'A changed draft' })).rejects.toThrow('different saved terms');
    await expect(h.run(next, 'another-stable-uuid-token')).rejects.toThrow('identifier does not match');
  });

  it('does not offer replacement for an already editable or known-funded source', async () => {
    const current = harness(); current.documents.get('listings/legacy-offer')!.editVersion = 1; current.documents.get('bookingOffers/legacy-offer')!.everFunded = false;
    await expect(current.run()).rejects.toThrow('already uses'); expect(current.write).not.toHaveBeenCalled();
    const funded = harness(); funded.documents.get('bookingOffers/legacy-offer')!.everFunded = true;
    await expect(funded.run()).rejects.toThrow('already had a funded'); expect(funded.write).not.toHaveBeenCalled();
  });
});
