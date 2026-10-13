import { useCallback, useEffect, useRef, useState } from 'react';
import { coalesce } from './coalesce';
import { bookedSpots, parseDealRecord, recordAsDeal, withBookedSpots } from './deal-records';
import { canDispute, draftSponsorDeal, termsForDeal, type SponsorDeal } from './sponsor-deals';
import { callDeal, canRespond, draftSponsorCall, isCallId, validateCallResponse, type CallInput, type CallResponse, type SponsorCall } from './sponsor-calls';
import { ADPAD_ROOT_APP_ID, createEscrow, isEscrowId, newEscrowId, readEscrow, runEscrowAction, validateDisputeReason, validateEscrowTerms, type Escrow, type EscrowAction } from './app-escrow';
import { completeConnection, completeLoginFromRedirect, connect, ConnectionError, disconnect, getConnections, onramp, get, getCurrentUser, init, openBoundedWidget, serverTimestamp, set, setMany, subscribe, useAuth, type Connection } from '@bounded-sh/client';
import { APP_ID, ADMIN_WALLET, LIVE_HOSTS, NETWORK } from '../config';
import { allowedRequests, dealRequestWrites, newRequestId, validateRequestNote, type DealRequest, type DealRequestKind } from './deal-requests';
import type { AdPadModel, Deal, Listing, ListingInput, Profile, ProfileInput } from '../types';
import { uploadListingImage } from './upload-listing-image';
import { availability, mergeOffer, offerDocument, safePublicUrl, validateSponsorship } from './sponsorship';
import { publicationIntent, publicationJournal, publicationListingId, publishListingDocuments } from './listing-publication';
import { validateListingFields } from './listing-input';
import { needsSol, needsSolMessage } from './chain-errors';
import { deleteListingDocuments, readPendingEditInput, updateListingDocuments } from './listing-management';
import { readPendingReplacementInput, replaceLegacyListingDocuments } from './listing-replacement';
import { pinSessionWallet, rememberSessionWallet } from './wallet-choice';

let initializing: Promise<void> | undefined;
function initialize() {
  if (!APP_ID) return Promise.reject(new Error('Ad Pad is being connected to its backend. Please try again shortly.'));
  initializing ??= init({ appId: APP_ID, network: NETWORK, walletLogin: true, ...(LIVE_HOSTS.has(location.hostname) ? { chain: 'solana_mainnet' as const } : {}), loginWidget: { title: 'Welcome to Ad Pad', subtitle: 'Sign in to offer ad space, share your skills, or start a campaign.' } }).then(async () => { await completeLoginFromRedirect(); }).catch(error => { initializing = undefined; throw error; });
  return initializing;
}

const ESCROW_DONE: Record<'accept' | 'withdraw' | 'release' | 'refund' | 'expire' | 'fallback', string> = {
  accept: 'You accepted the booking. Do the work by the deadline, then send your proof.',
  withdraw: 'The USDC is back in your wallet. The booking is closed.',
  release: 'Paid. The USDC is in the creator’s wallet.',
  refund: 'Returned. The USDC is back in the sponsor’s wallet.',
  expire: 'The escrow expired and the USDC went back to the sponsor.',
  fallback: 'The undecided dispute ran out and the USDC went back to the sponsor.',
};

const X_REQUIRED = 'Link your X account first. AdPad verifies every buyer and seller through X before they can book, list, or act on a deal.';

function connectionMessage(error: unknown): string {
  const code = error instanceof ConnectionError ? error.code : '';
  if (code === 'cancelled') return 'X linking was cancelled. Link your X account to take part in deals.';
  if (code === 'x_link_expired') return 'The X sign-in took too long. Press Link X account to try again.';
  return `Your X account could not be linked${code ? ` (${code})` : ''}. Try again.`;
}

function message(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (needsSol(text)) return needsSolMessage(signedInUser()?.address);
  if (/insufficient.*(balance|funds)/i.test(text)) return 'Your wallet does not hold enough USDC for this payment. Add USDC to it and try again.';
  if (/403|denied|not allowed/i.test(text)) return 'This action is not permitted for your account or the campaign has changed. Refresh and check its current status.';
  return text;
}

/** A row's own id: the SDK names the full path in _id, not an id field. */
function rowId(row: Record<string, unknown>): string {
  if (typeof row.id === 'string' && row.id) return row.id;
  return String(row._id ?? row.pathId ?? '').split('/').pop() || '';
}

/** Listings carry the publisher's verified X account, never a typed handle. */
function withVerifiedX(input: ListingInput, x: Connection): ListingInput {
  return { ...input, verifiedXHandle: x.handle, verifiedXId: x.id };
}

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** A wallet login's id is its wallet address; some sessions leave address empty on the client, so fall back to it. */
function walletAddressOf(u: { id?: string | null; address?: string | null } | null | undefined): string | null {
  if (!u) return null;
  if (u.address) return u.address;
  return u.id && SOLANA_ADDRESS.test(u.id) ? u.id : null;
}

function signedInUser() {
  const current = getCurrentUser();
  return current ? { ...current, address: walletAddressOf(current) } : null;
}

async function readAll(path: string, filter?: Record<string, unknown>) {
  const rows: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  do {
    const page = await get(path, { filter, limit: 100, cursor, bypassCache: true });
    rows.push(...(page.data || []));
    cursor = page.nextCursor || undefined;
  } while (cursor);
  return rows;
}

export function useAdPad(): AdPadModel {
  const { user: authUser, logout } = useAuth();
  const user = authUser && (authUser.id || authUser.address) ? { id: authUser.id || authUser.address!, address: walletAddressOf(authUser), email: authUser.email } : null;
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [publicDeals, setPublicDeals] = useState<Deal[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sponsorDeals, setSponsorDeals] = useState<SponsorDeal[]>([]);
  const [dealRequests, setDealRequests] = useState<DealRequest[]>([]);
  const [escrows, setEscrows] = useState<Record<string, Escrow | null>>({});
  const [calls, setCalls] = useState<SponsorCall[]>([]);
  const [callEscrows, setCallEscrows] = useState<Record<string, Escrow | null>>({});
  const [callResponses, setCallResponses] = useState<Record<string, CallResponse[]>>({});
  const [xAccount, setXAccountState] = useState<Connection | null | undefined>(undefined);
  // Actions read the ref so a link that just finished counts without waiting for a re-render.
  const xRef = useRef<Connection | null | undefined>(undefined);
  const setXAccount = (next: Connection | null | undefined) => { xRef.current = next; setXAccountState(next); };
  const locked = useRef(false);
  const generation = useRef(0);
  // Right after a wallet login the chosen wallet holds the address; note which one for later reloads.
  useEffect(() => { rememberSessionWallet(user?.address); }, [user?.address]);
  const isAdmin = user?.address === ADMIN_WALLET;

  const refresh = useCallback(async () => {
    if (!APP_ID) { setLoading(false); return; }
    const run = ++generation.current;
    try {
      await initialize();
      const [listingRows, offerRows, profileRows, recordRows, callRows] = await Promise.all([
        readAll('listings'), readAll('bookingOffers'), readAll('profiles'),
        readAll('dealRecords').catch(() => [] as Record<string, unknown>[]),
        readAll('sponsorCalls').catch(() => [] as Record<string, unknown>[]),
      ]);
      if (run !== generation.current) return;
      const offers = new Map(offerRows.map(row => [String(row.id), row]));
      const merged = (listingRows as unknown as Listing[]).map(row => mergeOffer(row, offers.get(row.id)));
      const records = recordRows.map(row => parseDealRecord(row, rowId(row))).filter((record): record is NonNullable<typeof record> => record !== null);
      const spots = bookedSpots(records, merged);
      setListings(merged.map(listing => withBookedSpots(listing, spots)).sort((a, b) => b.createdAt - a.createdAt));
      const byListing = new Map(merged.map(listing => [listing.id, listing]));
      setPublicDeals(records.map(record => recordAsDeal(record, byListing.get(record.listingId))));
      setProfiles(profileRows as unknown as Profile[]);
      const allCalls = callRows.map(row => ({ ...row, id: rowId(row) }) as unknown as SponsorCall).filter(call => isCallId(call.id)).sort((a, b) => b.createdAt - a.createdAt);
      // The escrow is the truth about a call's money, as it is on a deal card.
      const liveCalls = allCalls.filter(call => call.status !== 'closed');
      const callStates = await Promise.all(liveCalls.map(call => readEscrow(call.escrowId).then(escrow => [call.id, escrow] as const, () => null)));
      if (run !== generation.current) return;
      setCalls(allCalls);
      setCallEscrows(Object.fromEntries(callStates.filter((entry): entry is readonly [string, Escrow | null] => entry !== null)));
      const current = signedInUser();
      const myAddress = current?.address;
      if (myAddress) {
        const [asSponsor, asCreator] = await Promise.all([readAll('sponsorDeals', { sponsor: myAddress }), readAll('sponsorDeals', { creator: myAddress })]);
        if (run !== generation.current) return;
        const byId = new Map([...asSponsor, ...asCreator].map(row => [rowId(row), { ...row, id: rowId(row) } as unknown as SponsorDeal]));
        const mine = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
        setSponsorDeals(mine);
        const withEscrow = mine.filter(deal => isEscrowId(deal.escrowId));
        const states = await Promise.all(withEscrow.map(deal => readEscrow(deal.escrowId!).then(escrow => [deal.id, escrow] as const, () => null)));
        if (run !== generation.current) return;
        setEscrows(Object.fromEntries(states.filter((entry): entry is readonly [string, Escrow | null] => entry !== null)));
        const requestRows = await readAll('dealRequests', { raisedBy: myAddress });
        if (run !== generation.current) return;
        setDealRequests(requestRows.map(row => ({ ...row, id: rowId(row) }) as unknown as DealRequest).sort((a, b) => b.createdAt - a.createdAt));
        // A sponsor reads every response to their own calls; anyone else, only their own response.
        const responseRows = await Promise.all(liveCalls.map(call => (call.sponsor === myAddress
          ? readAll(`sponsorCalls/${call.id}/responses`)
          : get(`sponsorCalls/${call.id}/responses/${myAddress}`, { bypassCache: true }).then(row => row ? [row as Record<string, unknown>] : [])
        ).then(rows => [call.id, rows as unknown as CallResponse[]] as const, () => [call.id, [] as CallResponse[]] as const)));
        if (run !== generation.current) return;
        setCallResponses(Object.fromEntries(responseRows.filter(([, rows]) => rows.length > 0).map(([id, rows]) => [id, [...rows].sort((a, b) => a.createdAt - b.createdAt)])));
      } else { setSponsorDeals([]); setDealRequests([]); setEscrows({}); setCallResponses({}); }
      setReady(true);
    } catch (caught) { if (run === generation.current) setError(message(caught)); }
    finally { if (run === generation.current) setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh, authUser?.id, authUser?.address]);

  // Finish a return from X's consent screen, then read the linked account. Guests cannot link.
  useEffect(() => {
    let live = true;
    setXAccount(undefined);
    if (!authUser?.id && !authUser?.address) { setXAccount(null); return; }
    void (async () => {
      try {
        await initialize();
        if (signedInUser()?.isAnonymous) { if (live) setXAccount(null); return; }
        try {
          const done = await completeConnection();
          if (live && done?.connection) setNotice(`X account @${done.connection.handle} is linked. You can now book, list, and act on deals.`);
        } catch (caught) { if (live) setError(connectionMessage(caught)); }
        const { x } = await getConnections();
        if (live) setXAccount(x);
      } catch { if (live) setXAccount(null); }
    })();
    return () => { live = false; };
  }, [authUser?.id, authUser?.address]);

  /** The linked X account, or an error naming the requirement. */
  function requireX(): Connection {
    const x = xRef.current;
    if (!x) throw new Error(X_REQUIRED);
    return x;
  }

  useEffect(() => {
    if (!ready) return;
    let disposed = false;
    const stops: (() => Promise<void>)[] = [];
    // One reload per burst of live updates, never two at once (see coalesce.ts).
    const reload = coalesce(refresh, 400);
    const timer = setInterval(reload, 20_000);
    const attach = (path: string, filter?: Record<string, unknown>) => {
      // The first delivery right after attach is the snapshot refresh() just read; reloading on it doubled every page load's reads.
      // A later first delivery (an empty collection may send no snapshot) is a real change, so only an early one is skipped.
      const attachedAt = Date.now();
      let snapshot = true;
      void subscribe(path, { filter, limit: 100, onData: () => { const skip = snapshot && Date.now() - attachedAt < 3000; snapshot = false; if (skip) return; if (!disposed) reload(); }, onError: () => { /* Periodic reads keep the UI current if the live connection drops. */ } }).then(stop => { if (disposed) void stop().catch(() => {}); else stops.push(stop); }).catch(() => {});
    };
    attach('listings');
    attach('bookingOffers');
    attach('profiles');
    attach('dealRecords');
    attach('sponsorCalls');
    if (user?.address) { attach('sponsorDeals', { sponsor: user.address }); attach('sponsorDeals', { creator: user.address }); attach('dealRequests', { raisedBy: user.address }); }
    return () => { disposed = true; reload.cancel(); clearInterval(timer); stops.forEach(stop => void stop().catch(() => { /* already closed */ })); };
  }, [ready, user?.address, isAdmin, refresh]);

  async function writeDealRequest(kind: DealRequestKind, deal: SponsorDeal, note: string) {
    const current = signedInUser();
    if (!current?.address || !current.id) throw new Error('Sign in with your wallet first.');
    const problem = validateRequestNote(kind, note);
    if (problem) throw new Error(problem);
    await setMany(dealRequestWrites({ requestId: newRequestId(), kind, deal, address: current.address, userId: current.id, note, createdAt: serverTimestamp() }));
  }

  async function perform(work: () => Promise<void>, success: string, { needsX = true }: { needsX?: boolean } = {}): Promise<boolean> {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      await initialize();
      const current = signedInUser();
      if (!current || current.isAnonymous || !current.address) throw new Error('Sign in with email or a wallet before continuing. A wallet is required for USDC escrow.');
      if (needsX) requireX();
      // A restored session would otherwise sign with Phantom-first discovery, not the wallet the user signed in with.
      await pinSessionWallet(current.address, LIVE_HOSTS.has(location.hostname) ? 'solana:mainnet' : null).catch(() => { /* keep the SDK default */ });
      await work();
      await refresh();
      setNotice(success);
      return true;
    } catch (caught) { setError(message(caught)); await refresh(); return false; }
    finally { locked.current = false; setBusy(false); }
  }

  async function saveEscrowOnDeal(deal: SponsorDeal, escrowId: string, rootAppId: string) {
    let last: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try { await set(`sponsorDeals/${deal.id}`, { escrowId, rootAppId }); return; }
      catch (caught) {
        last = caught;
        const head = await get(`sponsorDeals/${deal.id}`, { bypassCache: true }).catch(() => null) as Partial<SponsorDeal> | null;
        if (head?.escrowId === escrowId) return;
        await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
      }
    }
    throw new Error(`Your escrow was created, but AdPad could not save it on this booking. Press Lock again to finish; it will not charge you twice. (${message(last)})`);
  }

  return {
    user, ready, loading, busy, error, notice, listings, publicDeals, sponsorDeals, dealRequests, escrows, calls, callEscrows, callResponses, profiles, isAdmin, configured: Boolean(APP_ID), xAccount, refresh,
    clearMessages() { setError(null); setNotice(null); },
    async linkX() {
      setError(null);
      try {
        await initialize();
        const current = signedInUser();
        if (!current || current.isAnonymous) { await openBoundedWidget({ methods: ['email', 'google'], wallet: true, title: 'Welcome to Ad Pad' }); return; }
        // Leaves for X's consent screen; the effect above finishes the link on return.
        await connect('x', { returnUrl: window.location.href });
      } catch (caught) { setError(caught instanceof ConnectionError ? connectionMessage(caught) : message(caught)); }
    },
    unlinkX() {
      return perform(async () => { await disconnect('x'); setXAccount(null); }, 'Your X account is unlinked. Link one again before your next action.', { needsX: false });
    },
    async signIn() {
      try { await initialize(); await openBoundedWidget({ methods: ['email', 'google'], wallet: true, title: 'Welcome to Ad Pad' }); rememberSessionWallet(signedInUser()?.address); await refresh(); }
      catch (caught) { if (message(caught) !== 'cancelled') setError(message(caught)); }
    },
    async signOut() { try { await logout(); setPublicDeals([]); setError(null); setNotice(null); } catch (caught) { setError(message(caught)); } },
    publishListing(input: ListingInput, image?: File, publicationId?: string) {
      return perform(async () => {
        const current = signedInUser()!;
        if (current.address === ADMIN_WALLET) throw new Error('The dispute admin cannot trade through the same wallet. Use a separate publisher account.');
        input = withVerifiedX(input, requireX());
        validateListingFields(input);
        if (!image) throw new Error('Add a photo of yourself, your space, or your work before publishing.');
        const imageUrl = await uploadListingImage(image, current.id || current.address!);
        const assertIdentity = () => {
          const signedIn = signedInUser();
          if (signedIn?.id !== current.id || signedIn?.address !== current.address) throw new Error('Your sign-in changed while publishing. Sign in with the original account before retrying.');
        };
        assertIdentity();
        const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ input, imageUrl }))))).map(byte => byte.toString(16).padStart(2, '0')).join('');
        const pendingKey = `adpad:publish:${APP_ID}:${current.id}:${fingerprint}`;
        const id = publicationId !== undefined ? await publicationListingId(publicationId, input.kind) : localStorage.getItem(pendingKey) || `listing_${crypto.randomUUID().replaceAll('-', '_')}`;
        if (publicationId === undefined) localStorage.setItem(pendingKey, id);
        const journalKey = `adpad:publication:${APP_ID}:${id}`;
        const intent = publicationIntent(input, imageUrl, { owner: current.id!, seller: current.address! });
        const savedJournal = localStorage.getItem(journalKey);
        if (!savedJournal) validateSponsorship(input);
        const journal = publicationJournal(savedJournal, intent);
        const saveJournal = (next: typeof journal) => localStorage.setItem(journalKey, JSON.stringify(next));
        await publishListingDocuments({ id, input, imageUrl, journal, saveJournal, read: path => get(path, { bypassCache: true }), write: (path, document) => set(path, document), timestamp: serverTimestamp, assertIdentity });
        // Group tokens remain reusable after success; legacy calls may intentionally publish again.
        if (publicationId === undefined) { localStorage.removeItem(pendingKey); localStorage.removeItem(journalKey); }
      }, 'Your offer is live. Share its page to find your next sponsor or client.');
    },
    saveProfile(input: ProfileInput, image?: File) {
      return perform(async () => {
        const current = signedInUser()!;
        const path = `profiles/${current.id}`;
        if (input.website && !safePublicUrl(input.website)) throw new Error('Enter a public HTTPS website address.');
        if (input.socialUrl && !safePublicUrl(input.socialUrl)) throw new Error('Enter a public HTTPS social profile address.');
        const x = requireX();
        const existing = await get(path, { bypassCache: true });
        const imageUrl = image ? await uploadListingImage(image, current.id!) : existing?.imageUrl || '';
        if (signedInUser()?.id !== current.id) throw new Error('Your sign-in changed. Sign in again before saving.');
        await set(path, { ...input, verifiedXHandle: x.handle, verifiedXId: x.id, imageUrl, owner: current.id, wallet: current.address, createdAt: existing?.createdAt || serverTimestamp(), updatedAt: serverTimestamp() });
      }, 'Your public profile is saved.');
    },
    submitEventSuggestion(input: { title: string; url: string; note: string }) {
      return perform(async () => {
        const current = signedInUser()!;
        if (!safePublicUrl(input.url) || input.url.length > 300) throw new Error('Enter a public HTTPS event or Luma link.');
        if (input.title.length > 120 || input.note.length > 500) throw new Error('Shorten the event title or note.');
        const id = `event_${crypto.randomUUID().replaceAll('-', '_')}`;
        await set(`eventSuggestions/${id}`, { owner: current.id, url: input.url, title: input.title, note: input.note, status: 'pending', createdAt: serverTimestamp() });
      }, 'Thanks — your event link was sent for review.');
    },
    updateListing(listing: Listing, input: ListingInput, image?: File) {
      return perform(async () => {
        const current = signedInUser()!;
        if (listing.owner !== current.id || listing.seller !== current.address) throw new Error('Only the offer owner using the original publisher wallet can edit it.');
        input = withVerifiedX(input, requireX());
        validateListingFields(input);
        const key = `adpad:edit:${APP_ID}:${listing.id}`;
        const saved = localStorage.getItem(key);
        const actor = { owner: current.id!, seller: current.address! };
        const pending = readPendingEditInput(saved, actor);
        if (!pending) validateSponsorship(input);
        const imageUrl = image ? await uploadListingImage(image, current.id!) : pending?.imageUrl || listing.imageUrl || '';
        if (!imageUrl) throw new Error('Add a photo before saving this offer.');
        await updateListingDocuments({ listing, input, imageUrl, actor, saved, save: journal => journal === null ? localStorage.removeItem(key) : localStorage.setItem(key, journal), read: path => get(path, { bypassCache: true }), write: (path, patch) => set(path, patch), assertIdentity() {
          const signedIn = signedInUser();
          if (signedIn?.id !== current.id || signedIn?.address !== current.address) throw new Error('Your sign-in changed. Use the original account to reconcile this edit.');
        } });
      }, 'Your offer changes are saved.');
    },
    deleteListing(listing: Listing) {
      return perform(async () => {
        const current = signedInUser()!;
        if (localStorage.getItem(`adpad:replace:${APP_ID}:${listing.id}`)) throw new Error('Finish the pending updated version before deleting the original offer.');
        const key = `adpad:delete:${APP_ID}:${listing.id}`;
        await deleteListingDocuments({ listing, actor: { owner: current.id!, seller: current.address! }, adminWallet: ADMIN_WALLET, saved: localStorage.getItem(key), save: journal => journal === null ? localStorage.removeItem(key) : localStorage.setItem(key, journal), read: path => get(path, { bypassCache: true }), write: (path, patch) => set(path, patch), assertIdentity() {
          const signedIn = signedInUser();
          if (signedIn?.id !== current.id || signedIn?.address !== current.address) throw new Error('Your sign-in changed. Use the original account to reconcile this deletion.');
        } });
        localStorage.removeItem(`adpad:edit:${APP_ID}:${listing.id}`);
      }, 'Your offer is deleted. Existing agreements and campaign history are preserved.');
    },
    replaceLegacyListing(listing: Listing, input: ListingInput, image?: File, publicationId?: string) {
      return perform(async () => {
        const current = signedInUser()!;
        const actor = { owner: current.id!, seller: current.address! };
        if (listing.owner !== actor.owner || listing.seller !== actor.seller) throw new Error('Only the original offer owner and publisher wallet can create its updated version.');
        input = withVerifiedX(input, requireX());
        validateListingFields(input);
        const key = `adpad:replace:${APP_ID}:${listing.id}`;
        const saved = localStorage.getItem(key);
        const pending = readPendingReplacementInput(saved, actor);
        if (!pending) validateSponsorship(input);
        const imageUrl = image ? await uploadListingImage(image, current.id!) : pending?.imageUrl || listing.imageUrl || '';
        if (!safePublicUrl(imageUrl)) throw new Error('Add a publicly viewable photo before publishing this updated version.');
        const token = publicationId ?? pending?.publicationId ?? crypto.randomUUID();
        await replaceLegacyListingDocuments({ listing, input, imageUrl, actor, publicationId: token, saved, save: journal => journal === null ? localStorage.removeItem(key) : localStorage.setItem(key, journal), read: path => get(path, { bypassCache: true }), readLinkedDeals: () => readAll('dealRecords', { listingId: listing.id }), write: (path, patch) => set(path, patch), timestamp: serverTimestamp, assertIdentity() {
          const signedIn = signedInUser();
          if (signedIn?.id !== current.id || signedIn?.address !== current.address) throw new Error('Your sign-in changed. Use the original account to finish this updated version.');
        } });
      }, 'Your updated offer has a new page. The original is deleted from discovery, and its existing agreements stay with the original.');
    },
    setListingActive(listing: Listing, active: boolean) {
      return perform(async () => {
        const current = signedInUser()!;
        if (listing.owner !== current.id || listing.seller !== current.address) throw new Error('Only the offer owner can change its availability.');
        if (localStorage.getItem(`adpad:edit:${APP_ID}:${listing.id}`) || localStorage.getItem(`adpad:delete:${APP_ID}:${listing.id}`) || localStorage.getItem(`adpad:replace:${APP_ID}:${listing.id}`)) throw new Error('Finish the pending edit, updated version, or deletion before changing this offer’s availability.');
        const offer = await get(`bookingOffers/${listing.id}`, { bypassCache: true });
        if (listing.deleted || offer?.deleted === true) throw new Error('Deleted offers cannot be reopened or changed.');
        if (offer) await set(`bookingOffers/${listing.id}`, { active });
        else if (active && listing.capacity != null) await set(`bookingOffers/${listing.id}`, offerDocument(listing, current.id!, current.address!, serverTimestamp()));
        await set(`listings/${listing.id}`, { active });
      }, active ? 'Your offer is open for bookings.' : 'Your offer is closed to new bookings. Existing agreements remain active.');
    },
    startSponsorDeal(listing: Listing, brief: string, deadline: number) {
      return perform(async () => {
        const current = signedInUser()!;
        if (!availability(listing).bookable) throw new Error('This offer is not currently available. Check its dates and remaining spots.');
        if (listing.seller === current.address) throw new Error('Use a different account to sponsor your own offer.');
        if (listing.endsAt && deadline < listing.endsAt) throw new Error('Choose a proof deadline after the activation ends.');
        const latest = await get(`listings/${listing.id}`, { bypassCache: true }) as Partial<Listing> | null;
        if (!latest) throw new Error('This offer is no longer available.');
        if (latest.priceMicro !== listing.priceMicro || latest.seller !== listing.seller) throw new Error('The creator changed this offer. Reload it and review the new terms.');
        const draft = draftSponsorDeal({ sponsor: current.address!, sponsorId: current.id!, creator: listing.seller, listingId: listing.id, headline: listing.title, brief, amountUsdc: listing.priceMicro, deadline });
        if (draft.problems.length) throw new Error(draft.problems[0]);
        await set(`sponsorDeals/${draft.dealId}`, { ...draft.deal, createdAt: serverTimestamp() });
      }, 'Booking saved. Press Lock on it below to put the USDC in escrow from your wallet.');
    },
    lockSponsorDeal(deal: SponsorDeal) {
      return perform(async () => {
        const current = signedInUser()!;
        if (deal.sponsor !== current.address) throw new Error('Only the sponsor wallet that booked this deal can lock the USDC.');
        if (deal.status !== 'awaiting_funding') throw new Error('This deal is no longer waiting for USDC.');
        let escrowId = deal.escrowId || null;
        if (!escrowId) {
          const problems = validateEscrowTerms(termsForDeal(deal), current.address, Math.floor(Date.now() / 1000));
          if (problems.length) throw new Error(problems[0]);
          escrowId = newEscrowId();
          await createEscrow(escrowId, current.address!, termsForDeal(deal));
          await saveEscrowOnDeal(deal, escrowId, ADPAD_ROOT_APP_ID);
        }
        const escrow = await readEscrow(escrowId);
        if (!escrow) throw new Error('The escrow is still being created. Press Lock again in a moment.');
        if (escrow.funder !== current.address || escrow.payee !== deal.creator || escrow.amountUsdc !== deal.amountUsdc || escrow.ref !== deal.id) throw new Error('This escrow does not match the booking. Flag a concern so AdPad can look at it.');
        if (escrow.status === 'unfunded') await runEscrowAction(escrowId, 'fund', current.address!);
        await writeDealRequest('funding_sent', { ...deal, escrowId, rootAppId: ADPAD_ROOT_APP_ID }, '').catch(() => { /* the deal record's own update also rings AdPad */ });
      }, 'Your USDC is locked in escrow. You can take it back until the creator accepts.');
    },
    disputeSponsorDeal(deal: SponsorDeal, reason: string) {
      return perform(async () => {
        const current = signedInUser()!;
        const escrow = escrows[deal.id];
        if (!canDispute(deal, current.address, escrow)) throw new Error(escrow?.status === 'disputed' ? 'This escrow is already disputed.' : 'Only the sponsor or the creator can dispute, after the creator accepts and before the expiry date.');
        const problem = validateDisputeReason(reason);
        if (problem) throw new Error(problem);
        const text = reason.trim();
        await runEscrowAction(deal.escrowId!, 'dispute', current.address!, { reason: text });
        await writeDealRequest('dispute_sent', deal, text).catch(() => { /* the escrow itself is frozen either way */ });
      }, 'Dispute sent. The escrow is frozen until AdPad’s agent decides.', { needsX: false });
    },
    escrowAction(deal: SponsorDeal, action: Extract<EscrowAction, 'accept' | 'withdraw' | 'release' | 'refund' | 'expire' | 'fallback'>) {
      return perform(async () => {
        const current = signedInUser()!;
        if (!isEscrowId(deal.escrowId)) throw new Error('This booking has no escrow yet.');
        await runEscrowAction(deal.escrowId, action, current.address!);
        // Escrow actions do not ring AdPad's agent; this request does, so the deal catches up.
        await writeDealRequest('escrow_changed', deal, action).catch(() => { /* the agent also reads open escrows on every run */ });
      }, ESCROW_DONE[action], { needsX: action === 'accept' }); // paying out or returning money never waits on an X link
    },
    postCall(input: CallInput) {
      return perform(async () => {
        const current = signedInUser()!;
        const x = requireX();
        const draft = draftSponsorCall({ ...input, sponsor: current.address!, sponsorId: current.id!, verifiedXHandle: x.handle, verifiedXId: x.id });
        if (draft.problems.length) throw new Error(draft.problems[0]);
        const escrowId = newEscrowId();
        await createEscrow(escrowId, current.address!, draft.terms);
        const { where, ...call } = draft.call;
        await set(`sponsorCalls/${draft.callId}`, { ...call, ...(where ? { where } : {}), escrowId, status: 'funding', createdAt: serverTimestamp() });
        await runEscrowAction(escrowId, 'fund', current.address!);
        await set(`sponsorCalls/${draft.callId}`, { status: 'open', updatedAt: serverTimestamp() });
      }, 'Your call is up and the USDC is locked. Creators can respond now. You pick one, and you can take the USDC back until the creator you pick accepts.');
    },
    lockCall(call: SponsorCall) {
      return perform(async () => {
        const current = signedInUser()!;
        if (call.sponsor !== current.address) throw new Error('Only the sponsor wallet that posted this call can lock its USDC.');
        if (call.status !== 'funding') throw new Error('This call is no longer waiting for USDC.');
        const escrow = await readEscrow(call.escrowId);
        if (!escrow) throw new Error('The escrow is still being created. Try again in a moment.');
        if (escrow.funder !== current.address || escrow.payee || escrow.amountUsdc !== call.amountUsdc || escrow.ref !== call.dealId) throw new Error('This escrow does not match the call. Close the call and post it again.');
        if (escrow.status === 'unfunded') await runEscrowAction(call.escrowId, 'fund', current.address!);
        await set(`sponsorCalls/${call.id}`, { status: 'open', updatedAt: serverTimestamp() });
      }, 'The USDC is locked and your call is open for creators.');
    },
    respondToCall(call: SponsorCall, pitch: string, link: string) {
      return perform(async () => {
        const current = signedInUser()!;
        const x = requireX();
        if (!canRespond(call, current.address)) throw new Error(call.sponsor === current.address ? 'This is your own call.' : 'This call is not taking responses.');
        const problem = validateCallResponse(pitch, link);
        if (problem) throw new Error(problem);
        await set(`sponsorCalls/${call.id}/responses/${current.address}`, {
          responder: current.address, responderId: current.id, verifiedXHandle: x.handle, verifiedXId: x.id, pitch: pitch.trim(),
          ...(link.trim() ? { link: link.trim() } : {}), createdAt: serverTimestamp(),
        });
      }, 'Response sent. If the sponsor picks you, the booking appears in My campaigns with the USDC already locked for you to accept.');
    },
    pickCallResponse(call: SponsorCall, response: CallResponse) {
      return perform(async () => {
        const current = signedInUser()!;
        if (call.sponsor !== current.address) throw new Error('Only the sponsor who posted this call can pick a creator.');
        if (call.status === 'picked' && call.creator !== response.responder) throw new Error('This call already has a creator.');
        if (call.status !== 'open' && call.status !== 'picked') throw new Error('This call is not open.');
        const escrow = await readEscrow(call.escrowId);
        if (!escrow || escrow.funder !== current.address || escrow.ref !== call.dealId) throw new Error('This call’s escrow could not be read. Refresh and try again.');
        if (escrow.payee && escrow.payee !== response.responder) throw new Error('The escrow is already assigned to another creator.');
        if (!(escrow.status === 'locked' || (escrow.status === 'accepted' && escrow.payee === response.responder))) throw new Error('The USDC is no longer locked for this call.');
        // The booking the escrow already names, for the picked creator.
        const terms = callDeal(call, response.responder);
        const booking = { ...terms, id: call.dealId, createdAt: Math.floor(Date.now() / 1000) } as SponsorDeal;
        const existing = await get(`sponsorDeals/${call.dealId}`, { bypassCache: true }) as Partial<SponsorDeal> | null;
        if (existing && existing.creator !== response.responder) throw new Error('This call already has a booking with another creator.');
        if (!existing) await set(`sponsorDeals/${call.dealId}`, { ...terms, createdAt: serverTimestamp() });
        if (!existing?.escrowId) await saveEscrowOnDeal(booking, call.escrowId, ADPAD_ROOT_APP_ID);
        if (escrow.payee !== response.responder) await runEscrowAction(call.escrowId, 'assign', current.address!, { payee: response.responder });
        if (call.status !== 'picked') await set(`sponsorCalls/${call.id}`, { status: 'picked', creator: response.responder, updatedAt: serverTimestamp() });
        // As after any lock: AdPad's agent checks the escrow and marks the booking funded.
        await writeDealRequest('funding_sent', { ...booking, escrowId: call.escrowId, rootAppId: ADPAD_ROOT_APP_ID }, '').catch(() => { /* the booking's own writes also ring AdPad */ });
      }, `You picked @${response.verifiedXHandle}. The USDC is assigned to them; once they accept, they do the work and you pay them from the escrow. Follow it in My campaigns.`);
    },
    closeCall(call: SponsorCall) {
      return perform(async () => {
        const current = signedInUser()!;
        if (call.sponsor !== current.address) throw new Error('Only the sponsor who posted this call can close it.');
        if (call.status !== 'funding' && call.status !== 'open') throw new Error('Only a call without a picked creator can be closed.');
        const escrow = await readEscrow(call.escrowId);
        if (escrow?.status === 'locked' && !escrow.payee) await runEscrowAction(call.escrowId, 'withdraw', current.address!);
        else if (escrow && escrow.status !== 'unfunded' && escrow.status !== 'refunded') throw new Error('This call’s USDC is committed to a creator. Follow the booking in My campaigns.');
        await set(`sponsorCalls/${call.id}`, { status: 'closed', updatedAt: serverTimestamp() });
      }, 'Your call is closed. Any USDC it held is back in your wallet.', { needsX: false });
    },
    addUsdc() {
      return perform(async () => { await onramp({ asset: 'USDC' }); }, 'When the purchase completes, the USDC lands in the wallet you are signed in with. Then press Lock.', { needsX: false });
    },
    submitDealProof(deal: SponsorDeal, url: string, note: string) {
      return perform(async () => {
        const current = signedInUser()!;
        if (deal.creator !== current.address) throw new Error('Only the creator wallet on this deal can submit proof.');
        if (deal.status !== 'funded') throw new Error('Proof opens once the sponsor has locked USDC in escrow.');
        if (!/^https?:\/\/\S{4,}$/.test(url.trim()) || url.trim().length > 300) throw new Error('Add a public proof link starting with http.');
        await set(`sponsorDeals/${deal.id}`, { status: 'proof_submitted', proofUrl: url.trim(), proofNote: note.trim().slice(0, 500) || null, proofAt: serverTimestamp() });
      }, 'Proof submitted. AdPad reviews it and releases the USDC when it matches the brief.');
    },
    raiseDealRequest(deal: SponsorDeal, kind: DealRequestKind, note: string) {
      return perform(async () => {
        const current = signedInUser()!;
        if (!allowedRequests(deal, current.address).includes(kind)) throw new Error('That request is not open on this deal right now.');
        await writeDealRequest(kind, deal, note);
      }, kind === 'missed_deadline' ? 'Refund request sent. AdPad checks the deadline and the escrow, then refunds if no proof arrived.' : kind === 'concern' ? 'Concern sent. AdPad weighs it with the proof before deciding.' : 'Sent. AdPad checks the escrow and marks the deal locked once it confirms.');
    },
    cancelSponsorDeal(deal: SponsorDeal) {
      return perform(async () => {
        const current = signedInUser()!;
        if (deal.sponsor !== current.address || deal.status !== 'awaiting_funding') throw new Error('Only an unfunded booking can be cancelled by its sponsor.');
        await set(`sponsorDeals/${deal.id}`, { status: 'cancelled' });
      }, 'Booking cancelled. No USDC was locked.');
    },
  };
}
