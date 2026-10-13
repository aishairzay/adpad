import type { ListingInput, ListingKind } from '../types';
import { offerDocument, TERM_KEYS } from './sponsorship';
import { validateListingFields } from './listing-input';
import { definitivelyRejected } from './chain-errors';

type Document = Record<string, unknown>;
type PublicationPart = 'offer' | 'listing';
export interface PublicationIdentity { owner: string; seller: string }
export interface PublicationIntent extends PublicationIdentity { metadata: Document; terms: Document }
export interface PublicationJournal {
  version: 1;
  intent: PublicationIntent;
  attempted: Record<PublicationPart, boolean>;
}

const OFFER_KEYS = ['title', 'channel', 'deliverables', 'priceMicro', 'kind', ...TERM_KEYS] as const;
const METADATA_KEYS = [...OFFER_KEYS, 'publisher', 'category', 'audience', 'description', 'turnaroundDays', 'attendingEvent', 'imageUrl', 'verifiedXHandle', 'verifiedXId', 'xPostUrl'] as const;
const MISMATCH = 'This publication already has different saved terms. Restore the original draft to retry, or start a separate offer; the saved offer has not been changed.';
const PENDING = 'Your publication is still unconfirmed. Retry this same draft to check its saved offer; do not start a duplicate. If it remains pending, ask the admin to inspect it.';


function canonicalFields(document: Document, keys: readonly string[]): Document {
  return Object.fromEntries(keys.map(key => [key, key === 'kind' ? document[key] || 'placement' : key === 'attendingEvent' || key === 'sponsorship' ? document[key] ?? false : document[key] ?? null]));
}
const identical = (left: Document, right: Document) => Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(key => left[key] === right[key]);

export function matchesPublicationFields(intent: PublicationIntent, part: PublicationPart, document: Document): boolean {
  return identical(canonicalFields(document, part === 'offer' ? OFFER_KEYS : METADATA_KEYS), part === 'offer' ? intent.terms : intent.metadata);
}

export function offerInitialized(offer: Document | null): boolean {
  const reserved = offer?.reserved;
  return typeof reserved === 'number' && Number.isSafeInteger(reserved) && reserved >= 0 && (offer?.capacity == null || reserved <= Number(offer.capacity));
}

/** The token must be generated once by the caller and retained for the entire draft. */
export async function publicationListingId(publicationId: string, kind?: ListingKind | null): Promise<string> {
  if (publicationId.length < 16 || publicationId.length > 256 || !publicationId.trim()) throw new Error('The publication identifier is invalid. Restore the original draft or start a new one.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([publicationId, kind || 'placement'])));
  return `listing_pub_${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function publicationIntent(input: ListingInput, imageUrl: string, identity: PublicationIdentity): PublicationIntent {
  const source = { ...input, imageUrl };
  return { ...identity, metadata: canonicalFields(source, METADATA_KEYS), terms: canonicalFields(source, OFFER_KEYS) };
}

export function readPublicationIntentInput(intent: PublicationIntent, identity: PublicationIdentity): { input: ListingInput; imageUrl: string } {
  if (!intent?.metadata || !intent.terms) throw new Error('The saved publication draft cannot be read. Keep the draft and ask the admin to inspect it.');
  const { imageUrl, ...fields } = intent.metadata;
  if (typeof imageUrl !== 'string' || !imageUrl) throw new Error('The saved draft photo is unavailable. Keep the draft and ask the admin to inspect it.');
  const input = fields as unknown as ListingInput;
  validateListingFields(input);
  publicationJournal(JSON.stringify({ version: 1, intent, attempted: { offer: false, listing: false } }), publicationIntent(input, imageUrl, identity));
  return { input, imageUrl };
}

/** Preserve the initial identity, exact field values, image, and attempted writes across reloads. */
export function publicationJournal(saved: string | null, intent: PublicationIntent): PublicationJournal {
  if (!saved) return { version: 1, intent, attempted: { offer: false, listing: false } };
  let journal: PublicationJournal;
  try { journal = JSON.parse(saved); } catch { throw new Error('The saved publication draft cannot be read. Keep this draft and ask the admin to inspect it before publishing again.'); }
  if (!journal || journal.version !== 1 || !journal.intent || !journal.intent.metadata || !journal.intent.terms || !journal.attempted || typeof journal.attempted.offer !== 'boolean' || typeof journal.attempted.listing !== 'boolean') throw new Error('The saved publication draft cannot be read. Keep this draft and ask the admin to inspect it before publishing again.');
  if (journal.intent.owner !== intent.owner || journal.intent.seller !== intent.seller) throw new Error('This publication belongs to a different signed-in account. Sign in with the original account before retrying.');
  if (!identical(journal.intent.metadata, intent.metadata) || !identical(journal.intent.terms, intent.terms)) throw new Error(MISMATCH);
  return journal;
}

export function inspectPublication(intent: PublicationIntent, offer: Document | null, listing: Document | null) {
  if (offer && (offer.seller !== intent.seller || offer.listingOwner !== intent.owner) || listing && (listing.seller !== intent.seller || listing.owner !== intent.owner)) throw new Error('This publication identifier belongs to a different account. No saved offer has been changed.');
  if (offer && !matchesPublicationFields(intent, 'offer', offer) || listing && !matchesPublicationFields(intent, 'listing', listing)) throw new Error(MISMATCH);
  if (offer?.deleted === true || listing?.deleted === true) throw new Error('This offer was deleted. It cannot be republished with the same publication identifier.');
  if (offer && offer.active !== true || listing && listing.active !== true) throw new Error('This saved offer is closed. Review it in My listings; retrying publication will not reopen it.');
  return { createOffer: !offer, createListing: !listing, complete: Boolean(offer && listing && offerInitialized(offer)) };
}

interface PublishDocumentsOptions {
  id: string;
  input: ListingInput;
  imageUrl: string;
  journal: PublicationJournal;
  saveJournal: (journal: PublicationJournal) => void;
  read: (path: string) => Promise<Document | null>;
  write: (path: string, document: Document) => Promise<unknown>;
  timestamp: () => unknown;
  assertIdentity: () => void;
}

/** Reconcile both public metadata and the authoritative offer before reporting success. */
export async function publishListingDocuments(options: PublishDocumentsOptions): Promise<void> {
  const { id, input, imageUrl, journal, saveJournal, read, write, timestamp, assertIdentity } = options;
  const paths = { offer: `bookingOffers/${id}`, listing: `listings/${id}` };
  let [offer, listing] = await Promise.all([read(paths.offer), read(paths.listing)]);
  assertIdentity();
  inspectPublication(journal.intent, offer, listing);
  saveJournal(journal);
  for (const part of ['offer', 'listing'] as const) {
    // A prior ambiguous write is only reconciled, never blindly submitted a second time.
    if (part === 'offer' ? offer : listing) continue;
    if (journal.attempted[part]) throw new Error(PENDING);
    // Recheck immediately before each creation so a newly visible saved half is reused.
    [offer, listing] = await Promise.all([read(paths.offer), read(paths.listing)]);
    assertIdentity();
    inspectPublication(journal.intent, offer, listing);
    if (part === 'offer' ? offer : listing) continue;
    if (part === 'listing' && (!offerInitialized(offer) || offer?.everFunded !== false)) throw new Error(PENDING);
    journal.attempted[part] = true;
    saveJournal(journal);
    const { owner, seller } = journal.intent;
    const document = part === 'offer' ? offerDocument(input, owner, seller, timestamp()) : { ...input, imageUrl, owner, seller, active: true, editVersion: 1, createdAt: timestamp() };
    try { await write(paths[part], document); }
    catch (error) {
      const description = error instanceof Error ? error.message : String(error);
      // A definitive admission rejection is retryable at the same ID; lost responses are not.
      if (definitivelyRejected(error)) { journal.attempted[part] = false; saveJournal(journal); }
      throw error;
    }
  }
  [offer, listing] = await Promise.all([read(paths.offer), read(paths.listing)]);
  assertIdentity();
  if (!inspectPublication(journal.intent, offer, listing).complete) throw new Error(PENDING);
}
