import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { ArrowRight, BadgeCheck, CirclePlus, ExternalLink, Flag, Gavel, LoaderCircle, LockKeyhole, RotateCcw, ShieldCheck, Undo2, Vote, Wallet } from 'lucide-react';
import type { AdPadModel } from './types';
import { dealProgress, PAYMENT_STEPS, stepHref, type PaymentBranch } from './lib/payment-steps';
import { canDispute, DEAL_STATUS_LABEL, displayStatus, type SponsorDeal, type SponsorDealStatus } from './lib/sponsor-deals';
import { formatUsdc } from './lib/money';
import { findUsdcTransfer } from './lib/solana-tx';
import { DISPUTE_FALLBACK_SECONDS, ESCROW_STATUS_LABEL, escrowAddress, MAX_DISPUTE_REASON, MIN_DISPUTE_REASON, type Escrow } from './lib/app-escrow';
import { allowedRequests, MAX_REQUEST_NOTE, type DealRequest } from './lib/deal-requests';
import { UsdcBalanceCheck } from './AddUsdc';
import './deal-card.css';


const usdc = (base: number) => (base / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (seconds: number) => new Date(seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const when = (seconds: number) => new Date(seconds * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** A short local stamp for plain sentences: 'Oct 8 at 10:14 PM'. */
const stamp = (seconds: number) => {
  const at = new Date(seconds * 1000);
  return `${at.toLocaleString('en-US', { month: 'short', day: 'numeric' })} at ${at.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};

const dayStamp = (seconds: number) => new Date(seconds * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric' });

interface TimelineItem { key: string; at: number; title: string }

const SETTLED_TITLE: Record<string, string> = {
  release: 'Paid out to the creator', withdraw: 'Taken back by the sponsor', refund: 'Returned by the creator',
  resolve: 'Dispute decided', expire: 'Expired, back to the sponsor', fallback: 'Undecided dispute, back to the sponsor',
};

/** The user-facing events of a deal, newest first. Agent-internal notes and requests stay off the card. */
export function dealTimeline(deal: SponsorDeal, escrow: Escrow | null | undefined, _requests?: readonly DealRequest[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  const add = (key: string, at: number | null | undefined, title: string) => { if (typeof at === 'number' && at > 0) items.push({ key, at, title }); };
  add('booked', deal.createdAt, 'Booked');
  add('locked', escrow?.fundedAt, 'USDC locked');
  add('accepted', escrow?.acceptedAt, 'Creator accepted');
  add('proof', deal.proofAt, 'Proof sent');
  add('disputed', escrow?.disputedAt, 'Disputed');
  const settledAt = escrow?.settledAt ?? deal.settledAt;
  const kind = escrow?.settledKind === 'resolve' ? (escrow.status === 'released' ? 'release' : 'refund') : escrow?.settledKind;
  add('settled', settledAt, escrow?.settledKind === 'resolve' ? `${SETTLED_TITLE.resolve}: ${kind === 'release' ? 'paid to the creator' : 'back to the sponsor'}` : SETTLED_TITLE[escrow?.settledKind || (deal.status === 'refunded' ? 'withdraw' : 'release')]);
  return items.sort((a, b) => b.at - a.at);
}

/** One or two plain sentences for the current state, in the right tense, with the real dates and amounts. */
function explain(deal: SponsorDeal, status: SponsorDealStatus, sponsor: boolean, escrow: Escrow | null | undefined): string {
  const amount = formatUsdc(deal.amountUsdc);
  const expiry = dayStamp(escrow?.expiresAt ?? deal.expiresAt);
  switch (status) {
    case 'awaiting_funding':
      if (escrow?.status === 'unfunded') return sponsor ? 'The escrow is created but the USDC is not locked yet. Press Lock to finish.' : 'Waiting for the sponsor to lock the USDC. Do not start yet.';
      if (sponsor) return `Booked on ${stamp(deal.createdAt)}. Lock ${amount} USDC from your wallet. You can take it back until the creator accepts.`;
      return `Booked on ${dayStamp(deal.createdAt)}. Waiting for the sponsor to lock the USDC. Do not start yet.`;
    case 'funded': case 'proof_submitted': case 'in_review': case 'release_approved': case 'refund_approved':
      if (escrow?.status === 'locked') return sponsor
        ? `USDC locked${escrow.fundedAt ? ` on ${stamp(escrow.fundedAt)}` : ''}. Waiting for the creator to accept; until they do, you can take it back.`
        : `${amount} USDC is locked for you. Accept the booking to commit to the work by ${dayStamp(deal.deadline)}.`;
      if (deal.proofUrl) return sponsor
        ? `Proof sent${deal.proofAt ? ` on ${stamp(deal.proofAt)}` : ''}. If it matches your brief, pay the creator. If not, dispute before ${expiry}.`
        : `Proof sent. Waiting for the sponsor to pay. If they have not paid by ${expiry}, dispute before then, or the USDC goes back to them.`;
      return sponsor
        ? `The creator accepted. Pay them from the escrow when the work matches your brief, or dispute before ${expiry}.`
        : `You accepted. Do the work by ${dayStamp(deal.deadline)} and send your proof link. The sponsor pays from the escrow.`;
    case 'disputed':
      return `Disputed${escrow?.disputedAt ? ` on ${stamp(escrow.disputedAt)}` : ''}. The escrow is frozen and AdPad’s agent decides where the money goes. ${sponsor ? 'You can still pay the creator.' : 'You can still return it to the sponsor.'} If it is still undecided ${dayStamp((escrow?.expiresAt ?? deal.expiresAt) + DISPUTE_FALLBACK_SECONDS)}, it goes back to the sponsor.`;
    case 'released': {
      const settledAt = escrow?.settledAt ?? deal.settledAt;
      return settledAt ? `Paid out on ${stamp(settledAt)}. ${amount} USDC sent to the creator.` : `Paid out. ${amount} USDC sent to the creator.`;
    }
    case 'refunded': {
      const settledAt = escrow?.settledAt ?? deal.settledAt;
      return settledAt ? `Returned on ${stamp(settledAt)}. ${amount} USDC is back with the sponsor.` : `Returned. ${amount} USDC is back with the sponsor.`;
    }
    case 'expired': return 'Nobody paid or disputed by the expiry date, so the USDC went back to the sponsor.';
    case 'cancelled': return 'Cancelled before any USDC was locked.';
  }
}

type ConfirmAction = 'withdraw' | 'release' | 'refund';
const CONFIRM_TEXT: Record<ConfirmAction, (amount: string) => string> = {
  withdraw: amount => `Take ${amount} USDC back to your wallet and close this booking?`,
  release: amount => `Pay ${amount} USDC from the escrow to the creator now? This is final.`,
  refund: amount => `Return ${amount} USDC from the escrow to the sponsor? You will not be paid for this booking.`,
};

export function SponsorDealCard({ deal, model }: { deal: SponsorDeal; model: AdPadModel }) {
  const [proofOpen, setProofOpen] = useState(false);
  const [concernOpen, setConcernOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [sigs, setSigs] = useState<Record<string, string>>({});
  const lookedUp = useRef(new Set<string>());
  const escrow = model.escrows[deal.id];
  const status = displayStatus(deal, escrow);
  const shown = status === deal.status ? deal : { ...deal, status };
  const reasonLength = disputeReason.trim().length;
  const me = model.user?.address;
  const now = Math.floor(Date.now() / 1000);
  const requests = model.dealRequests.filter(item => item.dealId === deal.id);
  // One open request of a kind at a time: a concern can be raised again, the others wait for AdPad's answer.
  const canRaise = allowedRequests(shown, me ?? undefined).filter(kind => kind === 'concern' || !requests.some(item => item.kind === kind && item.status === 'pending'));
  const sendConcern = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (await model.raiseDealRequest(deal, 'concern', String(form.get('note') || ''))) setConcernOpen(false);
  };
  const sponsor = me === deal.sponsor;
  const creator = me === deal.creator;
  const timeline = dealTimeline(deal, escrow, requests);
  const mayDispute = canDispute(shown, me, escrow, now);
  const open = escrow && (escrow.status === 'locked' || escrow.status === 'accepted' || escrow.status === 'disputed');
  const sendDispute = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await model.disputeSponsorDeal(deal, disputeReason)) { setDisputeOpen(false); setDisputeReason(''); }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (await model.submitDealProof(deal, String(form.get('url') || ''), String(form.get('note') || ''))) setProofOpen(false);
  };
  const run = async (action: 'accept' | 'withdraw' | 'release' | 'refund' | 'expire' | 'fallback') => { if (await model.escrowAction(deal, action)) setConfirm(null); };
  // The escrow account's public address, once per escrow.
  useEffect(() => {
    let live = true;
    if (escrow && escrow.status !== 'unfunded') void escrowAddress(escrow.escrowId).then(value => { if (live) setAddress(value); });
    return () => { live = false; };
  }, [escrow?.escrowId, escrow?.status]);
  // Lazily find the lock and payout transactions on chain, once per deal.
  const lockAt = escrow?.fundedAt ?? null;
  const settledAt = escrow?.settledAt ?? deal.settledAt ?? null;
  const settledToSponsor = escrow ? escrow.status === 'refunded' : deal.status === 'refunded';
  useEffect(() => {
    const candidates: { key: string; owner: string; around: number }[] = [];
    if (typeof lockAt === 'number' && lockAt > 0) candidates.push({ key: 'locked', owner: deal.sponsor, around: lockAt });
    if (typeof settledAt === 'number' && settledAt > 0) candidates.push({ key: 'settled', owner: settledToSponsor ? deal.sponsor : deal.creator, around: settledAt });
    let cancelled = false;
    for (const item of candidates) {
      const memoKey = `${deal.id}:${item.key}:${item.around}`;
      if (lookedUp.current.has(memoKey)) continue;
      lookedUp.current.add(memoKey);
      void findUsdcTransfer(item.owner, item.around).then(sig => {
        if (cancelled || !sig) return;
        setSigs(prev => ({ ...prev, [memoKey]: sig }));
      });
    }
    return () => { cancelled = true; };
  }, [deal.id, deal.sponsor, deal.creator, lockAt, settledAt, settledToSponsor]);
  const solanaLink = (key: string, at: number) => {
    const sig = sigs[`${deal.id}:${key}:${at}`];
    return sig ? <a className="text-link solana-link" href={`https://solscan.io/tx/${sig}`} target="_blank" rel="noopener noreferrer">View on Solana <ExternalLink size={14} /></a> : null;
  };
  const busyIcon = (icon: ReactElement) => model.busy ? <LoaderCircle className="spin" size={17} /> : icon;
  return <article className="deal-card sponsor-deal" aria-label={deal.headline}>
    <div className="deal-card-main">
      <span className="eyebrow">{sponsor ? 'You’re sponsoring' : creator ? 'You’re delivering the work' : 'Escrow deal'} · Due {day(deal.deadline)}</span>
      <h3>{deal.headline}</h3>
      <p className="muted">{deal.brief}</p>
      <DealProgress status={status} escrow={escrow} hasProof={!!deal.proofUrl} />
      <p className="subtle-notice">{status === 'disputed' ? <ShieldCheck size={17} /> : status === 'in_review' ? <Vote size={17} /> : <LockKeyhole size={17} />}<span>{explain(deal, status, sponsor, escrow)}</span></p>
      {deal.proofUrl && <a className="text-link" href={deal.proofUrl} target="_blank" rel="noopener noreferrer">View proof <ExternalLink size={14} /></a>}
      {deal.escrowId && <p className="muted escrow-state">{escrow ? ESCROW_STATUS_LABEL[escrow.status] : escrow === null ? 'Escrow not found yet' : 'Checking the escrow…'}{address && <> · <a className="text-link" href={`https://solscan.io/account/${address}`} target="_blank" rel="noopener noreferrer">Escrow address {address.slice(0, 4)}…{address.slice(-4)} <ExternalLink size={13} /></a></>}</p>}
      {sponsor && deal.status === 'awaiting_funding' && (!deal.escrowId || escrow?.status === 'unfunded') && <UsdcBalanceCheck address={me} neededUsdc={deal.amountUsdc} />}
      {sponsor && deal.status === 'awaiting_funding' && (!deal.escrowId || escrow?.status === 'unfunded') && <div className="secondary-actions">
        <button className="button primary" disabled={model.busy} onClick={() => void model.lockSponsorDeal(deal)}>{busyIcon(<LockKeyhole size={17} />)}{`Lock ${usdc(deal.amountUsdc)} USDC`}</button>
        <button className="button" disabled={model.busy} onClick={() => void model.addUsdc()}><CirclePlus size={17} />Add USDC</button>
        {!deal.escrowId && <button className="text-button" disabled={model.busy} onClick={() => void model.cancelSponsorDeal(deal)}>Cancel booking</button>}
      </div>}
      {creator && escrow?.status === 'locked' && escrow.payee === me && <button className="button primary" disabled={model.busy} onClick={() => void run('accept')}>{busyIcon(<BadgeCheck size={17} />)}Accept the booking</button>}
      {creator && escrow?.status === 'accepted' && deal.status === 'funded' && !proofOpen && <button className="button primary" disabled={model.busy} onClick={() => setProofOpen(true)}>Submit proof <ArrowRight size={17} /></button>}
      {proofOpen && <form className="action-form" onSubmit={submit}>
        <label className="field"><span>Public proof link</span><input name="url" type="url" placeholder="https://…" maxLength={300} required /></label>
        <label className="field"><span>What it shows (optional)</span><textarea name="note" rows={3} maxLength={500} placeholder="Where and when the placement ran, and how it matches the brief." /></label>
        <button className="button primary" disabled={model.busy} type="submit">{model.busy && <LoaderCircle className="spin" size={17} />}Send proof to the sponsor</button>
        <button className="text-button" type="button" onClick={() => setProofOpen(false)}>Cancel</button>
      </form>}
      {open && !confirm && <div className="secondary-actions">
        {sponsor && escrow.payee && <button className="button primary" disabled={model.busy} onClick={() => setConfirm('release')}><Wallet size={17} />Pay the creator</button>}
        {sponsor && escrow.status === 'locked' && <button className="button" disabled={model.busy} onClick={() => setConfirm('withdraw')}><Undo2 size={17} />Take the USDC back</button>}
        {creator && escrow.payee === me && <button className="text-button" disabled={model.busy} onClick={() => setConfirm('refund')}><RotateCcw size={15} />Return it to the sponsor</button>}
        {(sponsor || creator) && escrow.status !== 'disputed' && now >= escrow.expiresAt && <button className="button" disabled={model.busy} onClick={() => void run('expire')}>{busyIcon(<RotateCcw size={17} />)}Expired: return it to the sponsor</button>}
        {(sponsor || creator) && escrow.status === 'disputed' && now >= escrow.expiresAt + DISPUTE_FALLBACK_SECONDS && <button className="button" disabled={model.busy} onClick={() => void run('fallback')}>{busyIcon(<RotateCcw size={17} />)}Undecided: return it to the sponsor</button>}
      </div>}
      {confirm && <div className="action-form">
        <p className="muted">{CONFIRM_TEXT[confirm](usdc(deal.amountUsdc))} Your wallet signs it.</p>
        <button className="button primary" disabled={model.busy} onClick={() => void run(confirm)}>{busyIcon(<Wallet size={17} />)}{confirm === 'release' ? 'Pay now' : confirm === 'withdraw' ? 'Take it back' : 'Return it'}</button>
        <button className="text-button" type="button" disabled={model.busy} onClick={() => setConfirm(null)}>Cancel</button>
      </div>}
      {((canRaise.includes('concern') && !concernOpen) || (mayDispute && !disputeOpen)) && <div className="deal-raise-row">
        {canRaise.includes('concern') && !concernOpen && <button className="text-button" disabled={model.busy} onClick={() => setConcernOpen(true)}><Flag size={15} />Flag a concern</button>}
        {mayDispute && !disputeOpen && <button className="text-button" disabled={model.busy} onClick={() => setDisputeOpen(true)}><Gavel size={15} />Dispute this escrow</button>}
        <p className="muted deal-raise-note">A concern is a note for AdPad. A dispute freezes the USDC so AdPad’s agent decides where it goes.</p>
      </div>}
      {concernOpen && <form className="action-form" onSubmit={sendConcern}>
        <label className="field"><span>What should AdPad know?</span><textarea name="note" rows={3} minLength={10} maxLength={MAX_REQUEST_NOTE} required placeholder="For example: the post was removed after a day, or the brief asked for a different spot." /></label>
        <button className="button primary" disabled={model.busy} type="submit">{model.busy && <LoaderCircle className="spin" size={17} />}Send to AdPad</button>
        <button className="text-button" type="button" onClick={() => setConcernOpen(false)}>Cancel</button>
      </form>}
      {mayDispute && disputeOpen && <form className="action-form" onSubmit={sendDispute}>
        <p className="muted">A dispute freezes the USDC and AdPad’s agent decides where it goes. The sponsor can still pay, and the creator can still return it. If nobody decides, it goes back to the sponsor 30 days after the expiry date. Your wallet signs it.</p>
        <label className="field"><span>Why are you disputing?</span><textarea name="reason" rows={3} value={disputeReason} onChange={event => setDisputeReason(event.target.value)} required placeholder="For example: the deadline passed with no proof, or I delivered and have not been paid." /></label>
        <span className={reasonLength > MAX_DISPUTE_REASON ? 'field-error' : 'muted'}>{reasonLength}/{MAX_DISPUTE_REASON} characters</span>
        <button className="button primary" disabled={model.busy || reasonLength < MIN_DISPUTE_REASON || reasonLength > MAX_DISPUTE_REASON} type="submit">{model.busy && <LoaderCircle className="spin" size={17} />}Freeze and dispute</button>
        <button className="text-button" type="button" onClick={() => setDisputeOpen(false)}>Cancel</button>
      </form>}
      {timeline.length > 0 && <div className="deal-timeline"><span className="eyebrow">Activity, newest first</span><ol>{timeline.map(item => <li key={item.key}><time dateTime={new Date(item.at * 1000).toISOString()}>{when(item.at)}</time><span><strong>{item.title}</strong>{solanaLink(item.key, item.at)}</span></li>)}</ol></div>}
    </div>
    <span className={`status status-${status}`}>{DEAL_STATUS_LABEL[status]}</span>
    <strong className="usdc-amount">{usdc(deal.amountUsdc)} USDC</strong>
  </article>;
}

const BRANCH_TEXT: Record<PaymentBranch, string> = { takeback: 'Taken back before the creator accepted', dispute: 'Disputed: what happens now', expiry: 'Back to the sponsor at expiry: why', unlocked: 'Never locked: nothing moved' };

function DealProgress({ status, escrow, hasProof }: { status: SponsorDealStatus; escrow: Escrow | null | undefined; hasProof: boolean }) {
  const { current, branch } = dealProgress(status, escrow, hasProof);
  const currentIndex = current ? PAYMENT_STEPS.findIndex(step => step.key === current) : PAYMENT_STEPS.length;
  return <div className="deal-progress-wrap">
    <ol className="deal-progress" aria-label="Payment progress">{PAYMENT_STEPS.map((step, index) => { const Icon = step.icon; const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : ''; return <li key={step.key} className={state} aria-current={state === 'current' ? 'step' : undefined}>
      <Icon size={13} aria-hidden="true" />{state === 'current' ? <a href={stepHref(step.key)}>{step.short}</a> : step.short}
    </li>; })}</ol>
    {branch && <a className="deal-progress-branch how-link" href={stepHref(branch)}>{BRANCH_TEXT[branch]}<ArrowRight size={13} aria-hidden="true" /></a>}
  </div>;
}
