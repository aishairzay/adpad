import type { Listing, ListingInput } from '../types';
import { matchesPublicationFields, offerInitialized, publicationIntent, publicationJournal, readPublicationIntentInput, type PublicationIdentity, type PublicationIntent } from './listing-publication';
import { definitivelyRejected } from './chain-errors';

type Document = Record<string, unknown>;
type State = { offer: Document | null; listing: Document | null };
type EditStep = 'close' | 'metadata' | 'terms' | 'openMetadata' | 'openOffer';
interface EditJournal { version: 1; intent: PublicationIntent; original: PublicationIntent; reopen: boolean; attempted: Partial<Record<EditStep, boolean>> }
interface DeleteJournal { version: 1; actor: PublicationIdentity; owner: string; seller: string; attempted: { offer: boolean; listing: boolean } }
interface Operations {
  listing: Listing;
  actor: PublicationIdentity;
  read: (path: string) => Promise<Document | null>;
  write: (path: string, patch: Document) => Promise<unknown>;
  saved: string | null;
  save: (journal: string | null) => void;
  assertIdentity: () => void;
}
const PENDING = 'This offer change is still unconfirmed. Retry the same edit to check its saved state; do not submit different terms while it is pending.';
const LOCKED = 'This offer cannot be edited after its first funded campaign, or while its funding history is unconfirmed. You can close it or create a separate offer.';

function parseSaved<T>(saved: string): T {
  try { return JSON.parse(saved); } catch { throw new Error('The saved offer operation cannot be read. Keep the draft and ask the admin to inspect it before continuing.'); }
}
function sameIntent(saved: PublicationIntent, expected: PublicationIntent) {
  publicationJournal(JSON.stringify({ version: 1, intent: saved, attempted: { offer: false, listing: false } }), expected);
}

/** Restore the exact target draft/photo after a partial edit, only for its original identity. */
export function readPendingEditInput(saved: string | null, identity: PublicationIdentity): { input: ListingInput; imageUrl: string } | null {
  if (!saved) return null;
  const journal = parseSaved<EditJournal>(saved);
  if (!journal || journal.version !== 1 || !journal.intent?.metadata || !journal.intent.terms || !journal.original || !journal.attempted || typeof journal.reopen !== 'boolean') throw new Error('The saved edit cannot be read. Keep the draft and ask the admin to inspect it.');
  return readPublicationIntentInput(journal.intent, identity);
}
function identityMatches(state: State, listing: Listing) {
  if (!state.listing || state.listing.owner !== listing.owner || state.listing.seller !== listing.seller || state.offer && (state.offer.listingOwner !== listing.owner || state.offer.seller !== listing.seller)) throw new Error('This offer changed identity or is unavailable. Refresh before continuing.');
}
function knownTerms(state: State, journal: EditJournal) {
  if (!state.offer || !state.listing) throw new Error('This offer is missing its original publication records. Refresh before editing.');
  if (![journal.original, journal.intent].some(intent => matchesPublicationFields(intent, 'offer', state.offer!)) || ![journal.original, journal.intent].some(intent => matchesPublicationFields(intent, 'listing', state.listing!))) throw new Error('This offer was changed outside this edit. No further terms have been overwritten; review the saved offer before continuing.');
}
function editable(state: State) {
  if (state.listing?.deleted === true || state.offer?.deleted === true) throw new Error('Deleted offers cannot be edited or reopened.');
  if (state.listing?.editVersion !== 1 || state.offer?.everFunded !== false || !offerInitialized(state.offer)) throw new Error(LOCKED);
}
function confirmedEdit(state: State, journal: EditJournal) {
  return Boolean(state.offer && state.listing && !state.offer.deleted && !state.listing.deleted && state.listing.editVersion === 1 && matchesPublicationFields(journal.intent, 'offer', state.offer) && matchesPublicationFields(journal.intent, 'listing', state.listing) && state.offer.active === journal.reopen && state.listing.active === journal.reopen);
}

/** Close bookings, edit both halves, then reopen last. Pending writes are reconciled, not replayed. */
export async function updateListingDocuments(options: Operations & { input: ListingInput; imageUrl: string }): Promise<void> {
  const { listing, actor, input, imageUrl, read, write, save, assertIdentity } = options;
  if (listing.owner !== actor.owner || listing.seller !== actor.seller) throw new Error('Only the offer owner using the original publisher wallet can edit it.');
  const paths = { offer: `bookingOffers/${listing.id}`, listing: `listings/${listing.id}` };
  const readState = async (): Promise<State> => {
    const [offer, metadata] = await Promise.all([read(paths.offer), read(paths.listing)]);
    assertIdentity();
    const state = { offer, listing: metadata }; identityMatches(state, listing); return state;
  };
  let state = await readState();
  const intent = publicationIntent(input, imageUrl, actor);
  let journal: EditJournal;
  if (options.saved) {
    journal = parseSaved<EditJournal>(options.saved);
    if (!journal || journal.version !== 1 || !journal.original || !journal.intent || typeof journal.reopen !== 'boolean' || !journal.attempted || Object.values(journal.attempted).some(value => typeof value !== 'boolean')) throw new Error('The saved edit cannot be read. Keep the draft and ask the admin to inspect it.');
    sameIntent(journal.intent, intent);
    // Funding can legitimately occur after the final reopen; a completed edit may still be confirmed.
    if (confirmedEdit(state, journal)) { save(null); return; }
  } else {
    editable(state);
    const original = publicationIntent(listing, listing.imageUrl || '', actor);
    if (!state.offer || !matchesPublicationFields(original, 'offer', state.offer) || !matchesPublicationFields(original, 'listing', state.listing!)) throw new Error('This offer changed after you opened it. Refresh and review its latest terms before editing.');
    journal = { version: 1, intent, original, reopen: state.offer.active === true && state.listing!.active === true, attempted: {} };
  }
  knownTerms(state, journal); editable(state); save(JSON.stringify(journal));
  async function step(name: EditStep, part: 'offer' | 'listing', done: (current: State) => boolean, patch: Document) {
    state = await readState(); knownTerms(state, journal); editable(state);
    if (done(state)) return;
    if (name !== 'close' && state.offer?.active !== false) throw new Error('The offer has reopened while this edit is incomplete. Refresh and reconcile the saved edit before changing any terms.');
    if (journal.attempted[name]) throw new Error(PENDING);
    journal.attempted[name] = true; save(JSON.stringify(journal));
    try { await write(paths[part], patch); }
    catch (error) {
      if (definitivelyRejected(error)) {
        journal.attempted[name] = false; save(JSON.stringify(journal));
        if (!journal.attempted.metadata && !journal.attempted.terms && !journal.attempted.openMetadata && !journal.attempted.openOffer) {
          try {
            const unchanged = await readState();
            if (unchanged.offer && unchanged.listing && matchesPublicationFields(journal.original, 'offer', unchanged.offer) && matchesPublicationFields(journal.original, 'listing', unchanged.listing)) save(null);
          } catch { /* A failed reconciliation cannot prove that this draft is safe to abandon. */ }
        }
      }
      throw error;
    }
    state = await readState(); knownTerms(state, journal);
    if (!done(state)) throw new Error(PENDING);
  }
  await step('close', 'offer', current => current.offer?.active === false, { active: false });
  await step('metadata', 'listing', current => matchesPublicationFields(intent, 'listing', current.listing!) && (current.listing?.active === false || journal.attempted.openMetadata === true), { ...intent.metadata, active: false });
  await step('terms', 'offer', current => matchesPublicationFields(intent, 'offer', current.offer!) && current.offer?.active === false, { ...intent.terms, active: false });
  if (journal.reopen) {
    await step('openMetadata', 'listing', current => current.listing?.active === true, { active: true });
    await step('openOffer', 'offer', current => current.offer?.active === true, { active: true });
  }
  state = await readState();
  if (!confirmedEdit(state, journal)) throw new Error(PENDING);
  save(null);
}

/** Soft deletion preserves all terms and agreements, and closes the authoritative offer first. */
export async function deleteListingDocuments(options: Operations & { adminWallet: string }): Promise<void> {
  const { listing, actor, adminWallet, read, write, save, assertIdentity } = options;
  if (actor.seller !== adminWallet && (listing.owner !== actor.owner || listing.seller !== actor.seller)) throw new Error('Only the offer owner or the app admin can delete it.');
  const paths = { offer: `bookingOffers/${listing.id}`, listing: `listings/${listing.id}` };
  const readState = async (): Promise<State> => {
    const [offer, metadata] = await Promise.all([read(paths.offer), read(paths.listing)]);
    assertIdentity(); const state = { offer, listing: metadata }; identityMatches(state, listing); return state;
  };
  const journal = options.saved ? parseSaved<DeleteJournal>(options.saved) : { version: 1 as const, actor, owner: listing.owner, seller: listing.seller, attempted: { offer: false, listing: false } };
  if (!journal || journal.version !== 1 || journal.actor?.owner !== actor.owner || journal.actor?.seller !== actor.seller || journal.owner !== listing.owner || journal.seller !== listing.seller || !journal.attempted || typeof journal.attempted.offer !== 'boolean' || typeof journal.attempted.listing !== 'boolean') throw new Error('This pending deletion belongs to another account or offer. Use the original account to reconcile it.');
  let state = await readState(); save(JSON.stringify(journal));
  for (const part of ['offer', 'listing'] as const) {
    state = await readState();
    const document = state[part];
    if (!document) {
      if (journal.attempted[part] || part === 'offer' && state.listing?.editVersion === 1) throw new Error('The authoritative offer is unavailable and its closure cannot be confirmed. Retry this same deletion before removing its listing.');
      continue;
    }
    if (document.deleted === true && document.active === false) continue;
    if (part === 'listing' && state.offer && (state.offer.deleted !== true || state.offer.active !== false)) throw new Error('The offer has not confirmed its closure yet. Retry the same deletion to check its state.');
    if (journal.attempted[part]) throw new Error('This deletion is still unconfirmed. Retry the same deletion to check its saved state; the campaign history will be retained.');
    journal.attempted[part] = true; save(JSON.stringify(journal));
    try { await write(paths[part], { deleted: true, active: false }); }
    catch (error) { if (definitivelyRejected(error)) { journal.attempted[part] = false; save(JSON.stringify(journal)); } throw error; }
  }
  state = await readState();
  if (state.offer && (state.offer.deleted !== true || state.offer.active !== false) || state.listing?.deleted !== true || state.listing.active !== false) throw new Error('This deletion is still unconfirmed. Retry the same deletion to check its saved state; the campaign history will be retained.');
  save(null);
}
