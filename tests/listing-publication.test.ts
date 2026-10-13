import { describe, expect, it, vi } from 'vitest';
import type { ListingInput } from '../src/types';
import { inspectPublication, publicationIntent, publicationJournal, publicationListingId, publishListingDocuments } from '../src/lib/listing-publication';
import { offerDocument } from '../src/lib/sponsorship';

const input: ListingInput = { title: 'Wear your shirt', publisher: 'Alice', category: 'T-shirts', channel: 'London', audience: 'Event attendees', description: 'A day in your merch', deliverables: 'Wear your shirt and provide three photos', priceMicro: 100_000_000, turnaroundDays: 3, kind: 'placement', attendingEvent: true, sponsorship: true, eventId: 'independent', eventName: 'A meetup', startsAt: 10_000, endsAt: 20_000, capacity: 3, clothingSource: 'sponsor', clothingDetails: 'Sponsor provides a shirt', supplyBy: 9_000 };
const identity = { owner: 'alice', seller: 'alice-wallet' };
const imageUrl = 'https://realtime.bounded.sh/storage/public/photo';
const intent = publicationIntent(input, imageUrl, identity);
const offer = () => ({ ...offerDocument(input, identity.owner, identity.seller, 1_000), reserved: 0, everFunded: false });
const listing = () => ({ ...input, imageUrl, owner: identity.owner, seller: identity.seller, active: true, createdAt: 1_000 });

function harness(options: { offerReady?: boolean } = {}) {
  const documents = new Map<string, Record<string, unknown>>();
  let saved: string | null = null;
  const read = vi.fn(async (path: string) => documents.get(path) || null);
  const write = vi.fn(async (path: string, document: Record<string, unknown>) => {
    documents.set(path, path.startsWith('bookingOffers/') && options.offerReady !== false ? { ...document, reserved: 0, everFunded: false } : { ...document });
  });
  const saveJournal = vi.fn((journal: ReturnType<typeof publicationJournal>) => { saved = JSON.stringify(journal); });
  const assertIdentity = vi.fn(() => {});
  const run = (nextInput = input, nextImage = imageUrl, nextIdentity = identity) => publishListingDocuments({ id: 'stable-id', input: nextInput, imageUrl: nextImage, journal: publicationJournal(saved, publicationIntent(nextInput, nextImage, nextIdentity)), saveJournal, read, write, timestamp: () => 1_000, assertIdentity });
  return { documents, read, write, saveJournal, assertIdentity, run, saved: () => saved };
}

describe('publication identity and original terms', () => {
  it('keeps X references in public listing metadata, outside escrow terms', () => {
    const withX = publicationIntent({ ...input, verifiedXHandle: 'creator_one', verifiedXId: '1234', xPostUrl: 'https://x.com/creator_one/status/123456' }, imageUrl, identity);
    expect(withX.metadata.verifiedXHandle).toBe('creator_one');
    expect(withX.metadata.verifiedXId).toBe('1234');
    expect(withX.metadata.xPostUrl).toBe('https://x.com/creator_one/status/123456');
    expect(withX.terms).not.toHaveProperty('verifiedXHandle');
    expect(withX.terms).not.toHaveProperty('xPostUrl');
  });
  it('derives stable IDs from a token and kind, with distinct IDs for each offer type', async () => {
    const token = '39e7c6f0-5687-4124-86b1-7f280a3b21e8';
    const placement = await publicationListingId(token, 'placement');
    expect(await publicationListingId(token, 'placement')).toBe(placement);
    expect(await publicationListingId(token)).toBe(placement);
    expect(await publicationListingId(token, 'service')).not.toBe(placement);
    expect(await publicationListingId('another-unguessable-draft-token', 'placement')).not.toBe(placement);
    expect(placement).toMatch(/^listing_pub_[a-f0-9]{64}$/);
    expect(placement.length).toBeLessThanOrEqual(80);
    await expect(publicationListingId('short')).rejects.toThrow('invalid');
  });

  it('refuses both wallet and user-identity mismatches in either saved half', () => {
    expect(() => inspectPublication(intent, { ...offer(), seller: 'other-wallet' }, listing())).toThrow('different account');
    expect(() => inspectPublication(intent, { ...offer(), listingOwner: 'other-user' }, listing())).toThrow('different account');
    expect(() => inspectPublication(intent, offer(), { ...listing(), owner: 'other-user' })).toThrow('different account');
    expect(() => inspectPublication(intent, offer(), { ...listing(), seller: 'other-wallet' })).toThrow('different account');
  });

  it('checks authoritative terms and every saved metadata field, including image and event attendance', () => {
    const changedTerms = { title: 'Changed title', channel: 'Elsewhere', deliverables: 'Other work', priceMicro: 200_000_000, kind: 'service', sponsorship: false, eventId: 'changed', eventName: 'Other event', startsAt: 10_001, endsAt: 20_001, capacity: 4, clothingSource: 'creator', clothingDetails: 'Different responsibility', supplyBy: 9_001 };
    for (const [key, value] of Object.entries(changedTerms)) expect(() => inspectPublication(intent, { ...offer(), [key]: value }, listing()), key).toThrow('different saved terms');
    const changedMetadata = { ...changedTerms, publisher: 'Someone else', category: 'Hats', audience: 'Other audience', description: 'Different description', turnaroundDays: 4, attendingEvent: false, imageUrl: 'https://example.com/other.png' };
    for (const [key, value] of Object.entries(changedMetadata)) expect(() => inspectPublication(intent, offer(), { ...listing(), [key]: value }), key).toThrow('different saved terms');
  });

  it('requires initialized authoritative state and never reopens an already closed offer', () => {
    expect(inspectPublication(intent, offer(), listing()).complete).toBe(true);
    for (const reserved of [null, undefined, -1, 0.5, NaN, 4]) expect(inspectPublication(intent, { ...offer(), reserved }, listing()).complete).toBe(false);
    expect(inspectPublication(intent, { ...offer(), reserved: 2 }, listing()).complete).toBe(true);
    expect(() => inspectPublication(intent, { ...offer(), active: false }, listing())).toThrow('closed');
    expect(() => inspectPublication(intent, offer(), { ...listing(), active: false })).toThrow('closed');
  });

  it('retains original intent across reloads and rejects changed terms even before metadata was saved', () => {
    const original = publicationJournal(null, intent);
    original.attempted.offer = true;
    const saved = JSON.stringify(original);
    expect(publicationJournal(saved, intent)).toEqual(original);
    expect(() => publicationJournal(saved, publicationIntent({ ...input, description: 'Edited while pending' }, imageUrl, identity))).toThrow('different saved terms');
    expect(() => publicationJournal(saved, publicationIntent(input, 'https://example.com/new.png', identity))).toThrow('different saved terms');
    expect(() => publicationJournal(saved, publicationIntent(input, imageUrl, { ...identity, owner: 'another-user' }))).toThrow('different signed-in account');
    expect(() => publicationJournal('{broken', intent)).toThrow('cannot be read');
  });
});

describe('publication reconciliation', () => {
  it('publishes once and makes identical repeats read-only, preserving original dates and reservations', async () => {
    const h = harness();
    await h.run();
    expect(h.write).toHaveBeenCalledTimes(2);
    h.documents.get('bookingOffers/stable-id')!.reserved = 1;
    await h.run();
    expect(h.write).toHaveBeenCalledTimes(2);
    expect(h.documents.get('bookingOffers/stable-id')).toMatchObject({ reserved: 1, createdAt: 1_000 });
  });

  it('creates only the missing listing when the authoritative offer already exists', async () => {
    const h = harness();
    h.documents.set('bookingOffers/stable-id', offer());
    await h.run();
    expect(h.write).toHaveBeenCalledTimes(1);
    expect(h.write.mock.calls[0][0]).toBe('listings/stable-id');
  });

  it('creates only the missing authoritative offer when matching metadata already exists', async () => {
    const h = harness();
    h.documents.set('listings/stable-id', listing());
    await h.run();
    expect(h.write).toHaveBeenCalledTimes(1);
    expect(h.write.mock.calls[0][0]).toBe('bookingOffers/stable-id');
  });

  it('waits for initialized funding history before creating metadata with the edit marker', async () => {
    const h = harness({ offerReady: false });
    await expect(h.run()).rejects.toThrow('still unconfirmed');
    expect(h.documents.has('listings/stable-id')).toBe(false);
    expect(h.write).toHaveBeenCalledTimes(1);
    h.documents.get('bookingOffers/stable-id')!.reserved = 0;
    await expect(h.run()).rejects.toThrow('still unconfirmed');
    expect(h.write).toHaveBeenCalledTimes(1);
    h.documents.get('bookingOffers/stable-id')!.everFunded = false;
    await h.run();
    expect(h.documents.get('listings/stable-id')!.editVersion).toBe(1);
    expect(h.write).toHaveBeenCalledTimes(2);
  });

  it('waits for an early metadata save and pending offer hook, then confirms without more writes', async () => {
    const h = harness({ offerReady: false });
    h.documents.set('listings/stable-id', listing());
    await expect(h.run()).rejects.toThrow('still unconfirmed');
    expect(h.documents.has('listings/stable-id')).toBe(true);
    expect(h.write).toHaveBeenCalledTimes(1);
    await expect(h.run()).rejects.toThrow('still unconfirmed');
    h.documents.get('bookingOffers/stable-id')!.reserved = 0;
    h.documents.get('bookingOffers/stable-id')!.everFunded = false;
    await h.run();
    expect(h.write).toHaveBeenCalledTimes(1);
  });

  it('reconciles a lost response after metadata persisted without writing it twice', async () => {
    const h = harness();
    h.documents.set('bookingOffers/stable-id', offer());
    h.write.mockImplementationOnce(async (path, document) => { h.documents.set(path, document); throw new Error('Connection lost'); });
    await expect(h.run()).rejects.toThrow('Connection lost');
    await h.run();
    expect(h.write).toHaveBeenCalledTimes(1);
  });

  it('does not resend an ambiguous offer write while its authoritative head is absent', async () => {
    const h = harness();
    h.write.mockRejectedValueOnce(new Error('Connection lost'));
    await expect(h.run()).rejects.toThrow('Connection lost');
    await expect(h.run()).rejects.toThrow('still unconfirmed');
    expect(h.write).toHaveBeenCalledTimes(1);
    h.documents.set('bookingOffers/stable-id', offer());
    await h.run();
    expect(h.write).toHaveBeenCalledTimes(2);
    expect(h.write.mock.calls[1][0]).toBe('listings/stable-id');
  });

  it('allows only the definitively rejected half to be retried at the same identifier', async () => {
    const h = harness();
    h.documents.set('bookingOffers/stable-id', offer());
    h.write.mockRejectedValueOnce(new Error('Request rejected with 422'));
    await expect(h.run()).rejects.toThrow('422');
    await h.run();
    expect(h.write.mock.calls.map(call => call[0])).toEqual(['listings/stable-id', 'listings/stable-id']);
  });

  it('lets a publish retry after the wallet had no SOL for the network fee', async () => {
    const h = harness();
    h.write.mockRejectedValueOnce(new Error('Transaction simulation failed: Attempt to debit an account but found no record of a prior credit.. Logs: []'));
    await expect(h.run()).rejects.toThrow('prior credit');
    await h.run();
    expect(h.write.mock.calls.map(call => call[0])).toEqual(['bookingOffers/stable-id', 'bookingOffers/stable-id', 'listings/stable-id']);
  });

  it('does not create or change either half when an existing document conflicts', async () => {
    const h = harness();
    h.documents.set('bookingOffers/stable-id', { ...offer(), deliverables: 'Previously agreed work' });
    await expect(h.run()).rejects.toThrow('different saved terms');
    expect(h.write).not.toHaveBeenCalled();
    expect(h.saveJournal).not.toHaveBeenCalled();
  });

  it('checks sign-in again after reads before sending any publication write', async () => {
    const h = harness();
    h.assertIdentity.mockImplementation(() => { throw new Error('Sign-in changed'); });
    await expect(h.run()).rejects.toThrow('Sign-in changed');
    expect(h.write).not.toHaveBeenCalled();
  });
});
