// Requests a sponsor or creator raises for the AdPad agent on a sponsorDeals
// booking. Each create rings the agent (see OPENAPPS.md). A missed deadline is
// disputed on the escrow instead, so the app no longer offers missed_deadline.
import type { SponsorDeal } from './sponsor-deals';

export type DealRequestKind = 'funding_sent' | 'missed_deadline' | 'concern' | 'dispute_sent' | 'escrow_changed';
export type DealRequestStatus = 'pending' | 'handled' | 'declined';

export interface DealRequest {
  id: string;
  kind: DealRequestKind;
  dealId: string;
  raisedBy: string;
  raisedById: string;
  note: string;
  createdAt: number;
  status: DealRequestStatus;
  agentNote?: string;
  agentUpdatedAt?: number;
}

export const DEAL_REQUEST_LABEL: Record<DealRequestKind, string> = {
  funding_sent: 'Escrow funded',
  missed_deadline: 'Refund request',
  concern: 'Concern',
  dispute_sent: 'Escrow dispute',
  escrow_changed: 'Escrow update',
};

export const MAX_REQUEST_NOTE = 1000;
export const MIN_CONCERN_NOTE = 10;

/** Which requests this wallet may raise on this deal right now. Mirrors the policy rule. */
export function allowedRequests(deal: SponsorDeal, address: string | null | undefined, nowSeconds = Math.floor(Date.now() / 1000)): DealRequestKind[] {
  if (!address) return [];
  const sponsor = address === deal.sponsor;
  const creator = address === deal.creator;
  const kinds: DealRequestKind[] = [];
  if (sponsor && deal.status === 'awaiting_funding' && deal.escrowId) kinds.push('funding_sent');
  if ((sponsor || creator) && ['funded', 'proof_submitted', 'in_review', 'release_approved', 'refund_approved'].includes(deal.status)) kinds.push('concern');
  return kinds;
}

export function validateRequestNote(kind: DealRequestKind, note: string): string | null {
  const text = note.trim();
  if (text.length > MAX_REQUEST_NOTE) return `Keep the note under ${MAX_REQUEST_NOTE} characters.`;
  if (kind === 'dispute_sent' && !text) return 'Say why you are disputing this escrow.';
  if (kind === 'concern' && text.length < MIN_CONCERN_NOTE) return 'Describe the concern in at least 10 characters.';
  return null;
}

export function newRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, '')}`;
}

/** The request and its rate receipt, written together in one batch. */
export function dealRequestWrites(input: { requestId: string; kind: DealRequestKind; deal: SponsorDeal; address: string; userId: string; note: string; createdAt: unknown }) {
  return [
    { path: `dealRequests/${input.requestId}`, document: { kind: input.kind, dealId: input.deal.id, raisedBy: input.address, raisedById: input.userId, note: input.note.trim(), createdAt: input.createdAt, status: 'pending', agentNote: null, agentUpdatedAt: null } },
    { path: `dealRequestRate/${input.userId}/r/${input.requestId}`, document: { weight: 1 } },
  ];
}
