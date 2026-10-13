// One list of payment steps shared by the How payment works page and every
// deal card, so the two always use the same names, icons and anchors.
import { BadgeCheck, FileText, LockKeyhole, Send, Wallet, type LucideIcon } from 'lucide-react';
import type { EscrowStatus } from './app-escrow';
import type { SponsorDealStatus } from './sponsor-deals';

export type PaymentStepKey = 'book' | 'lock' | 'accept' | 'proof' | 'paid';
export type PaymentBranch = 'takeback' | 'dispute' | 'expiry' | 'unlocked';

export interface PaymentStep { key: PaymentStepKey; name: string; short: string; icon: LucideIcon }

export const PAYMENT_STEPS: PaymentStep[] = [
  { key: 'book', name: 'Book', short: 'Book', icon: FileText },
  { key: 'lock', name: 'Lock', short: 'Lock', icon: LockKeyhole },
  { key: 'accept', name: 'The creator accepts', short: 'Accept', icon: BadgeCheck },
  { key: 'proof', name: 'Do the work and send proof', short: 'Proof', icon: Send },
  { key: 'paid', name: 'The sponsor pays out', short: 'Paid', icon: Wallet },
];

export const HOW_IT_WORKS_PATH = '/how-it-works';
export const stepHref = (key: PaymentStepKey | PaymentBranch) => `${HOW_IT_WORKS_PATH}#${key === 'takeback' || key === 'dispute' || key === 'expiry' || key === 'unlocked' ? `if-${key}` : `step-${key}`}`;

// How far a deal has come: every step before `current` is done.
// `current` null means the deal is finished (paid out or returned).
export function dealProgress(status: SponsorDealStatus, escrow: { status: EscrowStatus; settledKind: string | null } | null | undefined, hasProof: boolean): { current: PaymentStepKey | null; branch: PaymentBranch | null } {
  switch (status) {
    case 'awaiting_funding': return { current: 'lock', branch: null };
    case 'cancelled': return { current: 'lock', branch: 'unlocked' };
    case 'released': return { current: null, branch: null };
    case 'refunded': return { current: null, branch: escrow?.settledKind === 'withdraw' ? 'takeback' : escrow?.settledKind === 'resolve' || escrow?.settledKind === 'fallback' ? 'dispute' : null };
    case 'expired': return { current: null, branch: 'expiry' };
    case 'disputed': return { current: 'paid', branch: 'dispute' };
    default:
      if (escrow?.status === 'locked') return { current: 'accept', branch: null };
      return { current: hasProof ? 'paid' : 'proof', branch: null };
  }
}
