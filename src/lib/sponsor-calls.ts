// Sponsor calls: a sponsor says what they want promoted and locks the USDC in AdPad's escrow
// before any creator is named. Creators respond with a short pitch; the sponsor picks one, the
// escrow is assigned to them, and the pick becomes an ordinary booking (sponsorDeals). The escrow's
// ref is that booking's id from the start, so funding, acceptance, proof, payout and disputes run
// exactly as for a booked listing. The booking's listingId holds the call's id.
import { MAX_EXPIRY_SECONDS, validateEscrowTerms, type Escrow, type EscrowTerms } from './app-escrow';
import { DEFAULT_CHALLENGE_SECONDS, REVIEW_BUFFER_SECONDS, newDealId, type SponsorDeal } from './sponsor-deals';
import { CATEGORIES, SERVICE_CATEGORIES } from '../types';

export type CallStatus = 'funding' | 'open' | 'picked' | 'closed';

export interface SponsorCall {
  id: string;
  sponsor: string;
  sponsorId: string;
  /** Copied from the sponsor's linked X account; the policy refuses any other value. */
  verifiedXHandle: string;
  verifiedXId: string;
  title: string;
  brief: string;
  category: string;
  /** An event, a city or a channel, in the sponsor's words. */
  where?: string | null;
  amountUsdc: number;
  deadline: number;
  expiresAt: number;
  escrowId: string;
  /** The booking a pick creates; the escrow names it as its ref from the start. */
  dealId: string;
  status: CallStatus;
  /** The creator picked, once the escrow is assigned to them. */
  creator?: string | null;
  createdAt: number;
  updatedAt?: number | null;
}

export interface CallResponse {
  /** The responder's wallet, which is also the response's key under the call. */
  responder: string;
  responderId: string;
  verifiedXHandle: string;
  verifiedXId: string;
  pitch: string;
  link?: string | null;
  createdAt: number;
}

export const CALL_STATUS_LABEL: Record<CallStatus, string> = {
  funding: 'Waiting for USDC', open: 'Open for creators', picked: 'Creator picked', closed: 'Closed',
};

export const CALL_CATEGORIES: readonly string[] = [...CATEGORIES, ...SERVICE_CATEGORIES].filter((item, index, all) => !item.startsWith('All ') && all.indexOf(item) === index);

const CLOCK_MARGIN = 3_600;
const CALL_ID = /^call_[0-9a-f]{32}$/;

export const isCallId = (value: unknown): value is string => typeof value === 'string' && CALL_ID.test(value);

export function newCallId(): string {
  return `call_${Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('')}`;
}

export interface CallInput { title: string; brief: string; category: string; where: string; amountUsdc: number; deadline: number }

export interface SponsorCallDraft {
  callId: string;
  call: Omit<SponsorCall, 'id' | 'createdAt' | 'status' | 'creator' | 'escrowId' | 'updatedAt'>;
  terms: EscrowTerms;
  problems: string[];
}

/** The call and the escrow terms the sponsor locks: no payee yet, and the future booking's id as ref. */
export function draftSponsorCall(input: CallInput & {
  sponsor: string; sponsorId: string; verifiedXHandle: string; verifiedXId: string; nowSeconds?: number; callId?: string; dealId?: string;
}): SponsorCallDraft {
  const now = Math.floor(input.nowSeconds ?? Date.now() / 1000);
  const callId = input.callId ?? newCallId();
  const dealId = input.dealId ?? newDealId();
  const expiresAt = Math.min(input.deadline + REVIEW_BUFFER_SECONDS, now + MAX_EXPIRY_SECONDS - CLOCK_MARGIN);
  const deadline = Math.min(input.deadline, expiresAt);
  const terms: EscrowTerms = { payee: null, amountUsdc: input.amountUsdc, expiresAt, ref: dealId };
  const problems = validateEscrowTerms(terms, input.sponsor, now);
  const title = input.title.trim();
  const brief = input.brief.trim();
  const where = input.where.trim();
  if (!isCallId(callId)) problems.push('The call id is malformed.');
  if (title.length < 3 || title.length > 120) problems.push('Give the call a title of 3 to 120 characters.');
  if (brief.length < 10 || brief.length > 500) problems.push('Describe what you want promoted in 10 to 500 characters.');
  if (!CALL_CATEGORIES.includes(input.category)) problems.push('Pick a category.');
  if (where.length > 80) problems.push('Keep where it happens under 80 characters.');
  if (deadline <= now + CLOCK_MARGIN) problems.push('Choose a deadline at least one hour from now.');
  return {
    callId, terms, problems,
    call: {
      sponsor: input.sponsor, sponsorId: input.sponsorId, verifiedXHandle: input.verifiedXHandle, verifiedXId: input.verifiedXId,
      title, brief, category: input.category, where: where || null, amountUsdc: input.amountUsdc, deadline, expiresAt, dealId,
    },
  };
}

export function validateCallResponse(pitch: string, link: string): string | null {
  const text = pitch.trim();
  if (text.length < 10 || text.length > 500) return 'Say what you would do in 10 to 500 characters.';
  const url = link.trim();
  if (url && (!/^https?:\/\/\S{4,}$/.test(url) || url.length > 300)) return 'Add a link starting with http, or leave it empty.';
  return null;
}

/** Creators other than the sponsor respond while the call is open and its deadline is ahead. */
export function canRespond(call: SponsorCall, address: string | null | undefined, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return Boolean(address) && address !== call.sponsor && call.status === 'open' && nowSeconds < call.deadline;
}

/** What a call shows: the escrow is the truth about the money, as it is on a deal card. */
export function callState(call: SponsorCall, escrow: Escrow | null | undefined): CallStatus {
  if (call.status === 'closed' || call.status === 'picked') return call.status;
  if (escrow && escrow.status === 'refunded') return 'closed';
  if (call.status === 'funding' && escrow && escrow.status === 'locked') return 'open';
  return call.status;
}

/** The booking a pick creates: the call's own terms, the picked creator, and the id the escrow already names. */
export function callDeal(call: SponsorCall, creator: string): Omit<SponsorDeal, 'id' | 'createdAt'> {
  return {
    sponsor: call.sponsor, sponsorId: call.sponsorId, creator, listingId: call.id, headline: call.title.slice(0, 160), brief: call.brief,
    amountUsdc: call.amountUsdc, challengeSeconds: DEFAULT_CHALLENGE_SECONDS, expiresAt: call.expiresAt, deadline: call.deadline,
    status: 'awaiting_funding', escrowId: null, rootAppId: null,
  };
}
