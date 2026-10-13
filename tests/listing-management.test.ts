import { describe, expect, it, vi } from 'vitest';
import type { Listing, ListingInput } from '../src/types';
import { deleteListingDocuments, readPendingEditInput, updateListingDocuments } from '../src/lib/listing-management';
import { offerDocument } from '../src/lib/sponsorship';

const original: Listing = { id: 'an-offer', owner: 'alice', seller: 'wallet-alice', title: 'Wear a sponsor shirt', publisher: 'Alice', category: 'T-shirts', channel: 'London', audience: 'Event attendees', description: 'A day in a supplied shirt', deliverables: 'Wear shirt and send photos', priceMicro: 100_000_000, turnaroundDays: 3, active: true, createdAt: 1_000, kind: 'placement', imageUrl: 'https://realtime.bounded.sh/storage/public/photo', editVersion: 1, everFunded: false };
const next: ListingInput = { title: 'Wear a sponsor hoodie', publisher: 'Alice', category: 'T-shirts', channel: 'London', audience: 'Event attendees', description: 'A day in a supplied hoodie', deliverables: 'Wear hoodie and send four photos', priceMicro: 150_000_000, turnaroundDays: 4, kind: 'placement' };
const actor = { owner: 'alice', seller: 'wallet-alice' };

function harness(active = true) {
  const listing = { ...original, active };
  const documents = new Map<string, Record<string, unknown>>([
    ['listings/an-offer', { ...listing }],
    ['bookingOffers/an-offer', { ...offerDocument(listing, listing.owner, listing.seller, 1_000), active, reserved: 0, everFunded: false }],
  ]);
  let saved: string | null = null;
  const read = vi.fn(async (path: string) => documents.get(path) || null);
  const write = vi.fn(async (path: string, patch: Record<string, unknown>) => { documents.set(path, { ...documents.get(path), ...patch }); });
  const save = vi.fn((value: string | null) => { saved = value; });
  const assertIdentity = vi.fn(() => {});
  const edit = (input = next, imageUrl = listing.imageUrl!) => updateListingDocuments({ listing, actor, input, imageUrl, saved, save, read, write, assertIdentity });
  const remove = (user = actor) => deleteListingDocuments({ listing, actor: user, adminWallet: 'admin-wallet', saved, save, read, write, assertIdentity });
  return { listing, documents, read, write, save, assertIdentity, edit, remove, saved: () => saved };
}

describe('editing before first funding', () => {
  it('closes the authoritative offer, edits both halves while closed, and reopens the offer last', async () => {
    const h = harness();
    await h.edit();
    expect(h.write.mock.calls.map(([path, patch]) => [path, patch.active])).toEqual([
      ['bookingOffers/an-offer', false], ['listings/an-offer', false], ['bookingOffers/an-offer', false], ['listings/an-offer', true], ['bookingOffers/an-offer', true],
    ]);
    expect(h.documents.get('listings/an-offer')).toMatchObject({ title: next.title, priceMicro: next.priceMicro, editVersion: 1, active: true, createdAt: 1_000 });
    expect(h.documents.get('bookingOffers/an-offer')).toMatchObject({ title: next.title, priceMicro: next.priceMicro, everFunded: false, reserved: 0, active: true, createdAt: 1_000 });
    expect(h.saved()).toBeNull();
  });

  it('keeps a previously closed offer closed', async () => {
    const h = harness(false);
    await h.edit();
    expect(h.write).toHaveBeenCalledTimes(2);
    expect(h.write.mock.calls.every(([, patch]) => patch.active === false)).toBe(true);
    expect(h.documents.get('bookingOffers/an-offer')!.active).toBe(false);
  });

  it('clears removed optional terms instead of retaining old values through a merge', async () => {
    const h = harness();
    Object.assign(h.listing, { clothingSource: 'existing', clothingDetails: 'Previously supplied' });
    for (const document of h.documents.values()) Object.assign(document, { clothingSource: 'existing', clothingDetails: 'Previously supplied' });
    await h.edit();
    expect(h.documents.get('listings/an-offer')).toMatchObject({ clothingSource: null, clothingDetails: null });
    expect(h.documents.get('bookingOffers/an-offer')).toMatchObject({ clothingSource: null, clothingDetails: null });
  });

  it('locks all edits for funded, refunded-history, unknown-history, and legacy offers', async () => {
    for (const flag of [true, undefined, null]) {
      const h = harness(); h.documents.get('bookingOffers/an-offer')!.everFunded = flag;
      await expect(h.edit()).rejects.toThrow('cannot be edited');
      expect(h.write).not.toHaveBeenCalled();
    }
    const h = harness(); delete h.documents.get('listings/an-offer')!.editVersion;
    await expect(h.edit()).rejects.toThrow('cannot be edited');
    expect(h.write).not.toHaveBeenCalled();
  });

  it('rejects another owner, deleted offers, and stale terms before writing', async () => {
    const h = harness(); h.documents.get('listings/an-offer')!.owner = 'someone-else';
    await expect(h.edit()).rejects.toThrow('changed identity'); expect(h.write).not.toHaveBeenCalled();
    const deleted = harness(); deleted.documents.get('bookingOffers/an-offer')!.deleted = true;
    await expect(deleted.edit()).rejects.toThrow('Deleted'); expect(deleted.write).not.toHaveBeenCalled();
    const stale = harness(); stale.documents.get('bookingOffers/an-offer')!.priceMicro = 42;
    await expect(stale.edit()).rejects.toThrow('changed after'); expect(stale.write).not.toHaveBeenCalled();
  });

  it('stops before content changes if funding wins the race with closure', async () => {
    const h = harness();
    h.write.mockImplementationOnce(async (path, patch) => { Object.assign(h.documents.get(path)!, patch, { everFunded: true, reserved: 1 }); });
    await expect(h.edit()).rejects.toThrow('cannot be edited');
    expect(h.write).toHaveBeenCalledTimes(1);
    expect(h.documents.get('bookingOffers/an-offer')!.active).toBe(false);
    expect(h.documents.get('listings/an-offer')!.title).toBe(original.title);
  });

  it('reconciles metadata saved before a lost response, without writing it twice', async () => {
    const h = harness();
    h.write.mockImplementation(async (path, patch) => { Object.assign(h.documents.get(path)!, patch); if (path === 'listings/an-offer' && patch.title) throw new Error('Connection lost'); });
    await expect(h.edit()).rejects.toThrow('Connection lost');
    expect(h.documents.get('bookingOffers/an-offer')!.active).toBe(false);
    await h.edit();
    expect(h.write.mock.calls.filter(([path, patch]) => path === 'listings/an-offer' && patch.title)).toHaveLength(1);
    expect(h.documents.get('bookingOffers/an-offer')!.active).toBe(true);
  });

  it('keeps an absent ambiguous content write pending and rejects a different retry draft', async () => {
    const h = harness();
    h.write.mockImplementation(async (path, patch) => { if (patch.title) throw new Error('Connection lost'); Object.assign(h.documents.get(path)!, patch); });
    await expect(h.edit()).rejects.toThrow('Connection lost');
    await expect(h.edit()).rejects.toThrow('still unconfirmed');
    expect(h.write).toHaveBeenCalledTimes(2);
    await expect(h.edit({ ...next, title: 'Another draft' })).rejects.toThrow('different saved terms');
    expect(h.documents.get('bookingOffers/an-offer')!.active).toBe(false);
  });

  it('restores the original pending input and new photo for the correct account', async () => {
    const h = harness();
    h.write.mockImplementation(async (path, patch) => { if (patch.title) throw new Error('Connection lost'); Object.assign(h.documents.get(path)!, patch); });
    const newPhoto = 'https://realtime.bounded.sh/storage/public/new-photo';
    await expect(h.edit(next, newPhoto)).rejects.toThrow('Connection lost');
    expect(readPendingEditInput(h.saved(), actor)).toMatchObject({ input: next, imageUrl: newPhoto });
    expect(() => readPendingEditInput(h.saved(), { owner: 'mallory', seller: 'wallet-mallory' })).toThrow('different signed-in account');
    expect(readPendingEditInput(null, actor)).toBeNull();
  });

  it('allows revising a definitively rejected draft only after confirming no content was written', async () => {
    const h = harness(); let reject = true;
    h.write.mockImplementation(async (path, patch) => {
      if (path === 'listings/an-offer' && patch.title && reject) { reject = false; throw new Error('Rejected with 422'); }
      Object.assign(h.documents.get(path)!, patch);
    });
    await expect(h.edit()).rejects.toThrow('422');
    expect(h.saved()).toBeNull();
    expect(h.documents.get('bookingOffers/an-offer')!.active).toBe(false);
    await h.edit({ ...next, title: 'A corrected offer title' });
    expect(h.documents.get('bookingOffers/an-offer')!.title).toBe('A corrected offer title');
  });

  it('retains the original intent after a rejected second content write when metadata already changed', async () => {
    const h = harness(); let reject = true;
    h.write.mockImplementation(async (path, patch) => {
      if (path === 'bookingOffers/an-offer' && patch.title && reject) { reject = false; throw new Error('Rejected with 422'); }
      Object.assign(h.documents.get(path)!, patch);
    });
    await expect(h.edit()).rejects.toThrow('422');
    expect(h.saved()).not.toBeNull();
    await expect(h.edit({ ...next, title: 'A changed draft' })).rejects.toThrow('different saved terms');
    await h.edit();
    expect(h.documents.get('bookingOffers/an-offer')!.title).toBe(next.title);
  });

  it('resumes a partially reopened offer without replaying earlier content writes', async () => {
    const h = harness(); let rejectOnce = true;
    h.write.mockImplementation(async (path, patch) => {
      if (path === 'bookingOffers/an-offer' && patch.active === true && rejectOnce) { rejectOnce = false; throw new Error('Rejected with 403'); }
      Object.assign(h.documents.get(path)!, patch);
    });
    await expect(h.edit()).rejects.toThrow('403');
    expect(h.documents.get('listings/an-offer')!.active).toBe(true);
    expect(h.documents.get('bookingOffers/an-offer')!.active).toBe(false);
    await h.edit();
    expect(h.write.mock.calls.filter(([, patch]) => patch.title)).toHaveLength(2);
    expect(h.documents.get('bookingOffers/an-offer')!.active).toBe(true);
  });

  it('confirms an ambiguous final reopen even if a campaign funded immediately afterwards', async () => {
    const h = harness();
    h.write.mockImplementation(async (path, patch) => {
      Object.assign(h.documents.get(path)!, patch);
      if (path === 'bookingOffers/an-offer' && patch.active === true) { h.documents.get(path)!.everFunded = true; throw new Error('Connection lost'); }
    });
    await expect(h.edit()).rejects.toThrow('Connection lost');
    await h.edit();
    expect(h.write).toHaveBeenCalledTimes(5);
    expect(h.saved()).toBeNull();
  });
});

describe('owner and admin soft deletion', () => {
  it('deletes the authoritative offer first while preserving all original terms and campaign-related fields', async () => {
    const h = harness(); h.documents.get('bookingOffers/an-offer')!.everFunded = true; h.documents.get('bookingOffers/an-offer')!.reserved = 2;
    await h.remove();
    expect(h.write.mock.calls).toEqual([
      ['bookingOffers/an-offer', { deleted: true, active: false }], ['listings/an-offer', { deleted: true, active: false }],
    ]);
    expect(h.documents.get('bookingOffers/an-offer')).toMatchObject({ title: original.title, seller: original.seller, priceMicro: original.priceMicro, everFunded: true, reserved: 2, deleted: true, active: false });
    expect(h.saved()).toBeNull();
  });

  it('allows only the owner with the bound wallet or the configured admin', async () => {
    const other = harness(); await expect(other.remove({ owner: 'other', seller: 'other-wallet' })).rejects.toThrow('Only the offer owner'); expect(other.write).not.toHaveBeenCalled();
    const changedWallet = harness(); await expect(changedWallet.remove({ owner: 'alice', seller: 'other-wallet' })).rejects.toThrow('Only the offer owner');
    const admin = harness(); await admin.remove({ owner: 'admin-user', seller: 'admin-wallet' }); expect(admin.write).toHaveBeenCalledTimes(2);
  });

  it('deletes legacy metadata without a companion, without inventing an authoritative offer', async () => {
    const h = harness(); h.documents.delete('bookingOffers/an-offer'); delete h.documents.get('listings/an-offer')!.editVersion;
    await h.remove();
    expect(h.write.mock.calls).toEqual([['listings/an-offer', { deleted: true, active: false }]]);
  });

  it('reconciles a partially completed deletion without repeating the first write', async () => {
    const h = harness(); h.write.mockImplementationOnce(async (path, patch) => { Object.assign(h.documents.get(path)!, patch); throw new Error('Connection lost'); });
    await expect(h.remove()).rejects.toThrow('Connection lost');
    await h.remove();
    expect(h.write.mock.calls.map(([path]) => path)).toEqual(['bookingOffers/an-offer', 'listings/an-offer']);
  });

  it('never deletes metadata until a lost authoritative deletion has been confirmed', async () => {
    const h = harness(); h.write.mockRejectedValueOnce(new Error('Connection lost'));
    await expect(h.remove()).rejects.toThrow('Connection lost');
    await expect(h.remove()).rejects.toThrow('still unconfirmed');
    expect(h.write).toHaveBeenCalledTimes(1);
    expect(h.documents.get('listings/an-offer')!.deleted).not.toBe(true);
  });

  it('does not treat a missing modern companion as a deletable legacy listing', async () => {
    const h = harness(); h.documents.delete('bookingOffers/an-offer');
    await expect(h.remove()).rejects.toThrow('closure cannot be confirmed');
    expect(h.write).not.toHaveBeenCalled();
  });
});
