// Sponsor bookings paid through AdPad's own escrow (dealEscrows).
// The sponsorDeals record tracks the deal and keeps the brief private; the money sits in the escrow.
// The deal's id is the escrow's ref, so the agent can match the two.
import { MAX_EXPIRY_SECONDS, validateEscrowTerms, type Escrow, type EscrowTerms } from './app-escrow';

export type SponsorDealStatus = 'awaiting_funding' | 'funded' | 'proof_submitted' | 'in_review' | 'release_approved' | 'refund_approved' | 'released' | 'refunded' | 'disputed' | 'expired' | 'cancelled';

export interface SponsorDeal {
  id: string;
  sponsor: string;
  sponsorId: string;
  creator: string;
  listingId: string;
  headline: string;
  brief: string;
  amountUsdc: number;
  /** The dealEscrows id, saved once by the sponsor when the escrow is created. */
  escrowId?: string | null;
  rootAppId?: string | null;
  /** Kept on the record for its rules; AdPad's escrow pays out without a challenge window. */
  challengeSeconds: number;
  expiresAt: number;
  deadline: number;
  createdAt: number;
  status: SponsorDealStatus;
  proofUrl?: string;
  proofNote?: string;
  proofAt?: number;
  verdict?: string;
  verdictReason?: string;
  payoutAfter?: number | null;
  /** Set only once the escrow has actually paid out or returned the money. */
  settledAt?: number | null;
}

export const DEAL_STATUS_LABEL: Record<SponsorDealStatus, string> = {
  awaiting_funding: 'Waiting for USDC', funded: 'USDC locked', proof_submitted: 'Proof sent', in_review: 'Community review',
  release_approved: 'Release approved', refund_approved: 'Refund approved',
  released: 'Paid out', refunded: 'Returned', disputed: 'Disputed', expired: 'Expired', cancelled: 'Cancelled',
};

/** The sponsorDeals rule needs at least one day above 250 USDC; the escrow itself has no window. */
export const DEFAULT_CHALLENGE_SECONDS = 86_400;
/** Time after the delivery deadline before undisputed money can go back to the sponsor. */
export const REVIEW_BUFFER_SECONDS = 14 * 86_400;
const CLOCK_MARGIN = 3_600;

export function newDealId(): string {
  return `deal_${Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('')}`;
}

export interface SponsorDealDraft {
  dealId: string;
  deal: Omit<SponsorDeal, 'id' | 'createdAt' | 'status' | 'escrowId' | 'rootAppId'> & { status: 'awaiting_funding'; escrowId: null; rootAppId: null };
  terms: EscrowTerms;
  problems: string[];
}

export function draftSponsorDeal(input: {
  sponsor: string; sponsorId: string; creator: string; listingId: string; headline: string; brief: string;
  amountUsdc: number; deadline: number; nowSeconds?: number; dealId?: string;
}): SponsorDealDraft {
  const now = Math.floor(input.nowSeconds ?? Date.now() / 1000);
  const dealId = input.dealId ?? newDealId();
  const latestExpiry = now + MAX_EXPIRY_SECONDS - CLOCK_MARGIN;
  const expiresAt = Math.min(input.deadline + REVIEW_BUFFER_SECONDS, latestExpiry);
  const deadline = Math.min(input.deadline, expiresAt);
  const terms: EscrowTerms = { payee: input.creator, amountUsdc: input.amountUsdc, expiresAt, ref: dealId };
  const problems = validateEscrowTerms(terms, input.sponsor, now);
  const brief = input.brief.trim();
  if (!/^deal_[0-9a-f]{32}$/.test(dealId)) problems.push('The booking id is malformed.');
  if (brief.length < 10 || brief.length > 500) problems.push('Describe the agreed work in 10 to 500 characters.');
  if (deadline <= now + 3600) problems.push('Choose a delivery deadline at least one hour from now.');
  return {
    dealId, terms, problems,
    deal: {
      sponsor: input.sponsor, sponsorId: input.sponsorId, creator: input.creator, listingId: input.listingId,
      headline: input.headline.slice(0, 160) || 'Sponsorship', brief, amountUsdc: input.amountUsdc,
      challengeSeconds: DEFAULT_CHALLENGE_SECONDS, expiresAt, deadline, status: 'awaiting_funding', escrowId: null, rootAppId: null,
    },
  };
}

/** The escrow terms for a saved deal, only from the stored record, so a retry locks exactly the same terms. */
export function termsForDeal(deal: SponsorDeal): EscrowTerms {
  return { payee: deal.creator, amountUsdc: deal.amountUsdc, expiresAt: deal.expiresAt, ref: deal.id };
}

/** The sponsor or creator may dispute once the creator has accepted, until the expiry date. */
export function canDispute(deal: SponsorDeal, address: string | null | undefined, escrow: Escrow | null | undefined, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!address || !escrow || escrow.status !== 'accepted') return false;
  if (address !== deal.sponsor && address !== deal.creator) return false;
  return nowSeconds < escrow.expiresAt;
}

/** What the card shows: the escrow itself is the truth about where the money is. */
export function displayStatus(deal: SponsorDeal, escrow: Escrow | null | undefined): SponsorDealStatus {
  if (!escrow || deal.status === 'cancelled') return deal.status;
  if (escrow.status === 'released') return 'released';
  if (escrow.status === 'refunded') return escrow.settledKind === 'expire' ? 'expired' : 'refunded';
  if (escrow.status === 'disputed') return 'disputed';
  if ((escrow.status === 'locked' || escrow.status === 'accepted') && deal.status === 'awaiting_funding') return 'funded';
  return deal.status;
}

export function localDateTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}
