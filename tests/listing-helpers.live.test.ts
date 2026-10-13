import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { Listing, ListingInput } from '../src/types';
import { offerDocument, mergeOffer, safePublicUrl, sponsorshipTerms } from '../src/lib/sponsorship';
import { deleteListingDocuments, updateListingDocuments } from '../src/lib/listing-management';
import { publicationIntent, publicationJournal, publicationListingId, publishListingDocuments } from '../src/lib/listing-publication';
import { replaceLegacyListingDocuments } from '../src/lib/listing-replacement';

// Explicit opt-in only: public test records on Poofnet, ephemeral keys held in memory.
// ADPAD_LIVE_HELPER_TEST=1 npm test -- tests/listing-helpers.live.test.ts
it.skipIf(process.env.ADPAD_LIVE_HELPER_TEST !== '1')('reconciles real publication, updated-version, edit, and deletion helper requests on Poofnet', async () => {
  const config = JSON.parse(readFileSync(new URL('../bounded.json', import.meta.url), 'utf8'));
  expect(config.protocol).toBe('realtime_offchain');
  expect(config.appId).toBe('605ba9048f556bdd2b7ea18e');
  const { init, createWalletClient } = await import('@bounded-sh/server');
  const { serverTimestamp } = await import('@bounded-sh/core');
  const { Keypair } = await import('@solana/web3.js');
  await init({ appId: config.appId, network: config.environment === 'staging' ? 'bounded-staging' : 'bounded-production' });
  const owner = await createWalletClient({ keypair: JSON.stringify([...Keypair.generate().secretKey]) });
  const claims = JSON.parse(Buffer.from((await owner.getIdToken()).split('.')[1], 'base64url').toString('utf8'));
  const ownerId = claims['custom:userId'];
  expect(typeof ownerId).toBe('string');
  expect(claims['custom:walletAddress']).toBe(owner.address);
  const actor = { owner: ownerId, seller: owner.address };
  const read = (path: string) => owner.get(path, { bypassCache: true }) as Promise<Record<string, unknown> | null>;
  const writes: string[] = [];
  const touched = new Set<string>();
  const write = async (path: string, patch: Record<string, unknown>) => {
    touched.add(path.split('/')[1]); writes.push(path);
    return owner.set(path, patch);
  };
  const identity = () => {};
  const wait = () => new Promise(resolve => setTimeout(resolve, 600));
  const safeError = (error: unknown) => String(error instanceof Error ? error.message : error).replace(/https?:\/\/\S+/g, '[URL]').replace(/\beyJ[\w-]*\.[\w-]+\.[\w-]+\b/g, '[redacted token]').slice(0, 350);
  async function reconcile(work: () => Promise<void>) {
    for (let attempt = 0; attempt < 35; attempt++) {
      try { await work(); return; }
      catch (error) { if (!/still unconfirmed|closure is still unconfirmed/i.test(safeError(error)) || attempt === 34) throw error; }
      await wait();
    }
  }
  const retire = async (id: string) => {
    const [metadata, offer] = await Promise.all([read(`listings/${id}`), read(`bookingOffers/${id}`)]);
    if (metadata) {
      let saved: string | null = null;
      await reconcile(() => deleteListingDocuments({ listing: { ...metadata, id } as unknown as Listing, actor, adminWallet: '', saved, save: value => { saved = value; }, read, write, assertIdentity: identity }));
    } else if (offer && (offer.deleted !== true || offer.active !== false)) {
      // A failed creation may leave an offer without public metadata. This exact test path is retired.
      await owner.set(`bookingOffers/${id}`, { active: false, deleted: true });
    }
  };
  let failure: unknown;
  let phase = 'selecting an existing public photo';
  const retired: string[] = [];
  try {
    const publicRows = await owner.get('listings', { limit: 100, bypassCache: true });
    const imageUrl = publicRows.data?.map((row: Record<string, unknown>) => typeof row.imageUrl === 'string' ? safePublicUrl(row.imageUrl) : null).find((url: string | null) => url && !/[?&](token|signature|expires|credential|sig)=/i.test(url));
    expect(typeof imageUrl).toBe('string');
    const input: ListingInput = { title: 'Integration helper test placement', publisher: 'Ad Pad automated test', category: 'T-shirts', channel: 'Test environment', audience: 'No actual audience', description: 'Automated test fixture. No advertising service is available.', deliverables: 'Test-only placement. No actual work is commissioned.', priceMicro: 1_000_000, turnaroundDays: 2, kind: 'placement', sponsorship: false, clothingSource: 'existing', clothingDetails: 'Test-only clothing responsibility.' };
    const sourceId = `integration_helpers_${randomUUID().replaceAll('-', '_')}`;
    phase = 'creating a legacy test source';
    await write(`bookingOffers/${sourceId}`, offerDocument(input, actor.owner, actor.seller, serverTimestamp()));
    for (let attempt = 0; attempt < 35; attempt++) {
      const head = await read(`bookingOffers/${sourceId}`);
      if (head?.reserved === 0 && head.everFunded === false) break;
      if (attempt === 34) throw new Error('Source offer initialization remains unconfirmed.');
      await wait();
    }
    await write(`listings/${sourceId}`, { ...input, imageUrl, owner: actor.owner, seller: actor.seller, active: true, createdAt: serverTimestamp() });
    const source = { ...(await read(`listings/${sourceId}`)), id: sourceId } as unknown as Listing;
    expect(source.editVersion).toBeUndefined();
    const replacementInput = { ...input, title: 'Integration helper updated version' };
    const token = randomUUID();
    const newId = await publicationListingId(`replacement:${sourceId}:${token}`, input.kind);
    let replacementSaved: string | null = null;
    phase = 'running the actual updated-version helper';
    await reconcile(() => replaceLegacyListingDocuments({ listing: source, input: replacementInput, imageUrl, actor, publicationId: token, saved: replacementSaved, save: value => { replacementSaved = value; }, read, readLinkedDeals: async () => (await owner.get('dealRecords', { filter: { listingId: sourceId }, bypassCache: true, limit: 100 })).data || [], write, timestamp: serverTimestamp, assertIdentity: identity }));
    expect(replacementSaved).toBeNull();
    expect(await read(`listings/${sourceId}`)).toMatchObject({ deleted: true, active: false, title: input.title });
    expect(await read(`bookingOffers/${sourceId}`)).toMatchObject({ deleted: true, active: false, everFunded: false, priceMicro: input.priceMicro });
    const newMetadata = await read(`listings/${newId}`);
    const newOffer = await read(`bookingOffers/${newId}`);
    expect(newMetadata).toMatchObject({ editVersion: 1, active: true, title: replacementInput.title, imageUrl });
    expect(newOffer).toMatchObject({ reserved: 0, everFunded: false, active: true });
    phase = 'running the actual edit helper with null optional fields';
    const currentListing = mergeOffer({ ...newMetadata, id: newId } as unknown as Listing, newOffer);
    const { clothingSource: _source, clothingDetails: _details, ...withoutClothing } = replacementInput;
    const editedInput: ListingInput = { ...withoutClothing, title: 'Integration helper edited version', priceMicro: 2_000_000 };
    let editSaved: string | null = null;
    await reconcile(() => updateListingDocuments({ listing: currentListing, input: editedInput, imageUrl, actor, saved: editSaved, save: value => { editSaved = value; }, read, write, assertIdentity: identity }));
    expect(editSaved).toBeNull();
    expect(await read(`listings/${newId}`)).toMatchObject({ title: editedInput.title, priceMicro: editedInput.priceMicro, clothingSource: null, clothingDetails: null, active: true });
    expect(await read(`bookingOffers/${newId}`)).toMatchObject({ title: editedInput.title, priceMicro: editedInput.priceMicro, clothingSource: null, clothingDetails: null, active: true, everFunded: false });
    await retire(newId);
    phase = 'publishing both kinds with a stable group token';
    const group = randomUUID();
    for (const kind of ['placement', 'service'] as const) {
      const kindInput: ListingInput = { ...editedInput, title: `Integration helper ${kind}`, kind, category: kind === 'placement' ? 'T-shirts' : 'Design' };
      const id = await publicationListingId(group, kind);
      let journal = publicationJournal(null, publicationIntent(kindInput, imageUrl, actor));
      const publish = () => publishListingDocuments({ id, input: kindInput, imageUrl, journal, saveJournal: value => { journal = value; }, read, write, timestamp: serverTimestamp, assertIdentity: identity });
      await reconcile(publish);
      const previousCount = writes.length;
      await publish();
      expect(writes.length).toBe(previousCount);
      expect(await read(`listings/${id}`)).toMatchObject({ kind, editVersion: 1, active: true });
      await retire(id);
    }
    console.log('Live helper assertions passed: stable two-kind publication, legacy replacement, preserved unfunded history, canonical null-field edits, and soft deletion. No token transfers requested.');
  } catch (error) { failure = new Error(`Live helper phase ${phase}: ${safeError(error)}`); }
  finally {
    for (const id of touched) {
      try {
        await retire(id);
        const [metadata, offer] = await Promise.all([read(`listings/${id}`), read(`bookingOffers/${id}`)]);
        if (metadata && (metadata.deleted !== true || metadata.active !== false) || offer && (offer.deleted !== true || offer.active !== false)) throw new Error('Fixture retirement remains unconfirmed');
        retired.push(id);
      } catch (error) { failure ||= new Error(`Cleanup needs review for ${id}: ${safeError(error)}`); }
    }
    console.log(JSON.stringify({ retiredFixtures: retired, retained: 'Soft-deleted test offers; no keys or tokens persisted.' }));
  }
  if (failure) throw failure;
}, 240_000);
