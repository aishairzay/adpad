import type { Listing, ListingInput } from '../types';
import { deleteListingDocuments } from './listing-management';
import { definitivelyRejected } from './chain-errors';
import { publicationIntent, publicationJournal, publicationListingId, publishListingDocuments, readPublicationIntentInput, type PublicationIdentity, type PublicationJournal } from './listing-publication';

type Document = Record<string, unknown>;
interface ReplacementJournal {
  version: 1;
  sourceId: string;
  publicationId: string;
  newId: string;
  sourceHadOffer: boolean;
  attempted: { closeOffer: boolean; closeMetadata: boolean };
  publication: PublicationJournal;
  deletion: string | null;
}
interface ReplacementOptions {
  listing: Listing;
  input: ListingInput;
  imageUrl: string;
  actor: PublicationIdentity;
  publicationId: string;
  saved: string | null;
  save: (journal: string | null) => void;
  read: (path: string) => Promise<Document | null>;
  readLinkedDeals: () => Promise<Document[]>;
  write: (path: string, patch: Document) => Promise<unknown>;
  timestamp: () => unknown;
  assertIdentity: () => void;
}
const PENDING = 'The original offer’s closure is still unconfirmed. Retry this same updated version to check its state before publishing another copy.';

function parseJournal(saved: string): ReplacementJournal {
  let journal: ReplacementJournal;
  try { journal = JSON.parse(saved); } catch { throw new Error('The saved updated-version draft cannot be read. Keep the draft and ask the admin to inspect it.'); }
  if (!journal || journal.version !== 1 || typeof journal.sourceId !== 'string' || typeof journal.publicationId !== 'string' || typeof journal.newId !== 'string' || typeof journal.sourceHadOffer !== 'boolean' || !journal.publication || !journal.attempted || typeof journal.attempted.closeOffer !== 'boolean' || typeof journal.attempted.closeMetadata !== 'boolean' || journal.deletion !== null && typeof journal.deletion !== 'string') throw new Error('The saved updated-version draft cannot be read. Keep the draft and ask the admin to inspect it.');
  return journal;
}

export function readPendingReplacementInput(saved: string | null, identity: PublicationIdentity): { input: ListingInput; imageUrl: string; publicationId: string } | null {
  if (!saved) return null;
  const journal = parseJournal(saved);
  return { ...readPublicationIntentInput(journal.publication.intent, identity), publicationId: journal.publicationId };
}

/** Unfunded drafts are not sponsorships; every later or uncertain linked state blocks this route. */
export function hasFundedLinkedHistory(records: readonly Document[], listingId: string): boolean {
  return records.some(record => record.listingId === listingId && (record.status !== 'unfunded' || record.version !== 0 || ['fundedAt', 'acceptedAt', 'submittedAt', 'settledAt'].some(key => record[key] != null)));
}

/** Create a separate editable version. Never rewrite the original terms or migrate its agreements. */
export async function replaceLegacyListingDocuments(options: ReplacementOptions): Promise<void> {
  const { listing, input, imageUrl, actor, publicationId, read, readLinkedDeals, write, save, timestamp, assertIdentity } = options;
  if (listing.owner !== actor.owner || listing.seller !== actor.seller) throw new Error('Only the original offer owner and publisher wallet can create its updated version.');
  const sourcePaths = { offer: `bookingOffers/${listing.id}`, listing: `listings/${listing.id}` };
  const readSource = async () => {
    const [offer, metadata] = await Promise.all([read(sourcePaths.offer), read(sourcePaths.listing)]);
    assertIdentity();
    if (!metadata || metadata.owner !== actor.owner || metadata.seller !== actor.seller || offer && (offer.seller !== actor.seller || offer.listingOwner !== actor.owner)) throw new Error('The original offer changed identity or is unavailable. Refresh before continuing.');
    return { offer, metadata };
  };
  let source = await readSource();
  const intent = publicationIntent(input, imageUrl, actor);
  if (publicationId.length < 16 || publicationId.length > 128 || !publicationId.trim()) throw new Error('The updated-version identifier is invalid. Restore its original draft before retrying.');
  const newId = await publicationListingId(`replacement:${listing.id}:${publicationId}`, input.kind);
  let journal: ReplacementJournal;
  if (options.saved) {
    journal = parseJournal(options.saved);
    if (journal.sourceId !== listing.id || journal.publicationId !== publicationId || journal.newId !== newId) throw new Error('This updated-version identifier does not match the pending original offer. Restore its saved draft before retrying.');
    journal.publication = publicationJournal(JSON.stringify(journal.publication), intent);
  } else {
    if (source.metadata.deleted === true || source.offer?.deleted === true) throw new Error('The original offer is already deleted. Create a separate new offer instead.');
    journal = { version: 1, sourceId: listing.id, publicationId, newId, sourceHadOffer: Boolean(source.offer), attempted: { closeOffer: false, closeMetadata: false }, publication: publicationJournal(null, intent), deletion: null };
  }
  if (source.metadata.editVersion === 1 && (!source.offer || source.offer.everFunded != null)) throw new Error('This offer already uses the current edit rules. Edit it directly if it has never been funded; otherwise create a separate offer.');
  if (source.offer?.everFunded === true) {
    if (!journal.publication.attempted.offer && !journal.publication.attempted.listing) save(null);
    throw new Error('The original offer has already had a funded campaign. Its terms stay fixed; you may create a separate offer.');
  }
  const persist = () => save(JSON.stringify(journal));
  persist();
  for (const [part, attempt] of [['offer', 'closeOffer'], ['metadata', 'closeMetadata']] as const) {
    source = await readSource();
    const document = source[part];
    if (!document) {
      if (part === 'offer' && journal.sourceHadOffer) throw new Error(PENDING);
      continue;
    }
    if (document.active === false) continue;
    if (journal.attempted[attempt]) throw new Error(PENDING);
    journal.attempted[attempt] = true; persist();
    try { await write(part === 'offer' ? sourcePaths.offer : sourcePaths.listing, { active: false }); }
    catch (error) {
      if (definitivelyRejected(error)) { journal.attempted[attempt] = false; persist(); }
      throw error;
    }
  }
  source = await readSource();
  if (source.metadata.active !== false || source.offer && source.offer.active !== false || journal.sourceHadOffer && !source.offer) throw new Error(PENDING);
  const history = await readLinkedDeals(); assertIdentity();
  source = await readSource();
  if (source.metadata.active !== false || source.offer && source.offer.active !== false || journal.sourceHadOffer && !source.offer) throw new Error(PENDING);
  // Missing legacy flags never become false: known historical funding simply blocks copying here.
  if (source.offer?.everFunded === true || hasFundedLinkedHistory(history, listing.id)) {
    if (!journal.publication.attempted.offer && !journal.publication.attempted.listing) save(null);
    throw new Error('A funded campaign is recorded for the original offer. Its terms and agreements remain unchanged. Create a separate offer instead.');
  }
  await publishListingDocuments({ id: newId, input, imageUrl, journal: journal.publication, saveJournal: publication => { journal.publication = publication; persist(); }, read, write, timestamp, assertIdentity });
  // Delete only after the new offer and metadata have both been authoritatively confirmed.
  await deleteListingDocuments({ listing, actor, adminWallet: '', saved: journal.deletion, save: deletion => { journal.deletion = deletion; persist(); }, read, write, assertIdentity });
  save(null);
}
