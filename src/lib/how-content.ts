// Copy for the How payment works page. Every rule here matches AdPad's own escrow
// (dealEscrows): the sponsor pays out, the creator can return it, only AdPad's agent
// decides a dispute, and undisputed money returns to the sponsor after the expiry date.
import type { PaymentBranch, PaymentStepKey } from './payment-steps';

export interface StepCopy { sponsor: string; creator: string; agent: string; usdc: string; where: 'wallet' | 'escrow' | 'creator' }

export const STEP_COPY: Record<PaymentStepKey, StepCopy> = {
  book: { sponsor: 'Picks an open offer and sends a brief with a proof deadline.', creator: 'Their open offer sets the price and what they deliver.', agent: 'Nothing yet.', usdc: 'Still in the sponsor’s wallet. No money moves.', where: 'wallet' },
  lock: { sponsor: 'Presses Lock and approves the transfer in their own wallet.', creator: 'Sees the booking and reads the brief.', agent: 'Matches the escrow to the booking: amount, wallets and deal.', usdc: 'Moves from the sponsor’s wallet into an AdPad escrow account of its own, at a public Solana address. Until the creator accepts, the sponsor can take it back.', where: 'escrow' },
  accept: { sponsor: 'Can still take the USDC back until the creator accepts.', creator: 'Accepts the booking in their wallet, which commits them to the work.', agent: 'Nothing to do.', usdc: 'Locked in escrow. From here it moves only when the sponsor pays, the creator returns it, a dispute is decided or the expiry date passes.', where: 'escrow' },
  proof: { sponsor: 'Waits for the proof. Can dispute if something goes wrong.', creator: 'Does the work and sends a public proof link before the deadline.', agent: 'Is notified and can read the proof against the brief.', usdc: 'Locked in escrow.', where: 'escrow' },
  paid: { sponsor: 'Checks the proof and pays the creator from the escrow in one step.', creator: 'Receives the full locked amount in the wallet named on the deal.', agent: 'Steps in only if someone disputes.', usdc: 'In the creator’s wallet.', where: 'creator' },
};

export interface Branch { id: PaymentBranch; title: string; text: string; flow: { label: string; tone: 'neutral' | 'warn' | 'stop' | 'refund' | 'pay' }[] }

export const BRANCHES: Branch[] = [
  { id: 'takeback', title: 'The sponsor takes it back', text: 'Until the creator accepts, the sponsor can take the USDC back from the escrow. After that it moves only when the sponsor pays, the creator returns it, a dispute is decided or the expiry date passes.', flow: [{ label: 'Locked', tone: 'neutral' }, { label: 'Not accepted yet', tone: 'warn' }, { label: 'Back to sponsor', tone: 'refund' }] },
  { id: 'dispute', title: 'Someone disputes', text: 'After the creator accepts, either side can dispute before the expiry date. The escrow freezes and only AdPad’s agent decides where the money goes. The sponsor can still pay, or the creator can still return it, while it is frozen. A dispute nobody decides goes back to the sponsor 30 days after the expiry date.', flow: [{ label: 'Dispute', tone: 'warn' }, { label: 'Escrow frozen', tone: 'stop' }, { label: 'AdPad’s agent decides', tone: 'neutral' }, { label: 'Undecided: back to sponsor', tone: 'refund' }] },
  { id: 'expiry', title: 'Nobody pays by the expiry date', text: 'Every escrow has an expiry 14 days after the proof deadline, never more than 90 days after locking. If the sponsor has not paid and nobody disputed by then, the USDC goes back to the sponsor. A creator who delivered and is still unpaid should dispute before the expiry date.', flow: [{ label: 'Not paid', tone: 'warn' }, { label: 'Expiry date passes', tone: 'neutral' }, { label: 'Back to sponsor', tone: 'refund' }] },
  { id: 'unlocked', title: 'The booking is never locked', text: 'Booking alone moves no money. If the sponsor never presses Lock, or cancels first, nothing was ever in escrow and nothing needs returning.', flow: [{ label: 'Booked', tone: 'neutral' }, { label: 'Not locked or cancelled', tone: 'warn' }, { label: 'Nothing moved', tone: 'pay' }] },
];

export const EXAMPLE: { step: PaymentStepKey; when: string; what: string }[] = [
  { step: 'book', when: 'Mon 2 Nov 2026, 10:00', what: 'Maya books Leo’s “wear your logo at a side event” offer for 250 USDC, with a proof deadline of Fri 13 Nov.' },
  { step: 'lock', when: 'Mon 2 Nov, 10:04', what: 'Maya presses Lock. 250 USDC leaves her wallet for an AdPad escrow at its own public address. Its expiry is set to Fri 27 Nov, 14 days after the deadline.' },
  { step: 'accept', when: 'Mon 2 Nov, 12:15', what: 'Leo accepts the booking. Maya can no longer take the USDC back on her own.' },
  { step: 'proof', when: 'Tue 10 Nov, 19:00', what: 'Leo wears the shirt at the event, posts a photo on X and sends the link as proof.' },
  { step: 'paid', when: 'Wed 11 Nov, 09:00', what: 'Maya checks the post against her brief and pays from the escrow. 250.00 USDC lands in Leo’s wallet.' },
];
