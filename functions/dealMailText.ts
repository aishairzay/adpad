// What each deal email says. One message per party per status change, only
// for the party who should know or act. The brief never goes into an email.

export type Role = 'sponsor' | 'creator';

export interface MailDeal {
  headline?: string | null;
  amountUsdc: number;
  deadline: number;
  status: string;
  payoutAfter?: number | null;
  verdictReason?: string | null;
}

export interface MailText { subject: string; text: string }

export const SITE = 'https://adpad.fyi';
export const DEALS_URL = `${SITE}/campaigns`;

const usdc = (base: number) => (base / 1_000_000).toFixed(2).replace(/\.00$/, '');

export function utcStamp(seconds: number): string {
  const d = new Date(seconds * 1000);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${hh}:${mm} UTC`;
}

const clean = (value: string | null | undefined, max: number) =>
  (value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** The lines for one party, or null when this change needs nothing from them. */
function body(deal: MailDeal, role: Role, isNew: boolean): { subject: string; lines: string[] } | null {
  const what = clean(deal.headline, 80) || 'your AdPad deal';
  const amount = `${usdc(deal.amountUsdc)} USDC`;
  const due = utcStamp(deal.deadline);
  const after = deal.payoutAfter ? utcStamp(deal.payoutAfter) : null;
  const reason = clean(deal.verdictReason, 240);
  switch (deal.status) {
    case 'awaiting_funding':
      if (role !== 'creator' || !isNew) return null;
      return { subject: `New booking: ${what}`, lines: [
        `A sponsor booked "${what}" for ${amount}.`,
        'They still need to lock the USDC. Wait for the next email before you start the work.'] };
    case 'funded':
      return role === 'creator'
        ? { subject: `USDC locked, start the work: ${what}`, lines: [
          `${isNew ? 'You have a new booking. ' : ''}The sponsor locked ${amount} for "${what}".`,
          `Do the work and submit your proof link from the deal card by ${due}.`] }
        : { subject: `Your USDC is locked: ${what}`, lines: [
          `Your ${amount} is locked in escrow for "${what}".`,
          `The creator has until ${due} to deliver and send proof.`] };
    case 'proof_submitted':
      if (role !== 'sponsor') return null;
      return { subject: `Proof arrived: ${what}`, lines: [
        `The creator sent proof for "${what}".`,
        'AdPad is checking it against your brief. You can open the proof from the deal card.'] };
    case 'in_review':
      return { subject: `Proof under a second look: ${what}`, lines: [
        `The proof for "${what}" was not clear-cut, so AdPad asked for a second opinion before deciding.`,
        'Nothing is needed from you unless you want to add a note on the deal card.'] };
    case 'release_approved':
      return role === 'creator'
        ? { subject: `Approved: ${what}`, lines: [
          `AdPad approved your proof for "${what}".`,
          after ? `${amount} pays out to your wallet after ${after}.` : `${amount} pays out once the challenge window ends.`] }
        : { subject: `Payout approved: ${what}`, lines: [
          `AdPad approved the proof for "${what}".`,
          after ? `${amount} goes to the creator after ${after}. If something is wrong, dispute it from the deal card before then.`
            : `${amount} goes to the creator after the challenge window. Dispute it from the deal card if something is wrong.`] };
    case 'refund_approved':
      return role === 'sponsor'
        ? { subject: `Refund approved: ${what}`, lines: [
          `AdPad approved a refund for "${what}".${reason ? ` Reason: ${reason}` : ''}`,
          after ? `${amount} returns to your wallet after ${after}.` : `${amount} returns to your wallet once the challenge window ends.`] }
        : { subject: `Refund to the sponsor approved: ${what}`, lines: [
          `AdPad approved a refund to the sponsor for "${what}".${reason ? ` Reason: ${reason}` : ''}`,
          after ? `If you think this is wrong, dispute it from the deal card before ${after}.` : 'If you think this is wrong, dispute it from the deal card.'] };
    case 'released':
      return role === 'creator'
        ? { subject: `Paid: ${amount} for ${what}`, lines: [`${amount} for "${what}" was paid to your wallet.`] }
        : { subject: `Deal complete: ${what}`, lines: [`"${what}" is complete. ${amount} was paid to the creator.`] };
    case 'refunded':
      return role === 'sponsor'
        ? { subject: `Refunded: ${amount} for ${what}`, lines: [`${amount} for "${what}" was refunded to your wallet.`] }
        : { subject: `Deal refunded: ${what}`, lines: [`"${what}" was refunded to the sponsor.`] };
    case 'disputed':
      return { subject: `Deal disputed: ${what}`, lines: [
        `The escrow for "${what}" is disputed, so the ${amount} is frozen.`,
        "AdPad's treasury owner decides it. Add any evidence on the deal card."] };
    case 'expired':
      return { subject: `Deal expired: ${what}`, lines: [`"${what}" expired without a payout.`] };
    case 'cancelled':
      if (role !== 'creator' || isNew) return null;
      return { subject: `Booking cancelled: ${what}`, lines: [`The sponsor cancelled "${what}" before locking any USDC. No work is needed.`] };
    default:
      return null;
  }
}

export function dealMail(deal: MailDeal, role: Role, isNew: boolean): MailText | null {
  const b = body(deal, role, isNew);
  if (!b) return null;
  const text = [
    ...b.lines, '',
    `Open your deals: ${DEALS_URL}`, '',
    "You get this because you turned on deal emails in AdPad. To stop them, switch off \"Email me when my deals move\" on your My campaigns page.",
  ].join('\n');
  return { subject: `AdPad: ${b.subject}`.slice(0, 160), text };
}
