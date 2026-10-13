import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Globe2, LoaderCircle, LockKeyhole, Megaphone, Plus, Undo2, UserCheck } from 'lucide-react';
import type { AdPadModel } from './types';
import { CALL_CATEGORIES, CALL_STATUS_LABEL, callState, validateCallResponse, type CallResponse, type SponsorCall } from './lib/sponsor-calls';
import { ESCROW_STATUS_LABEL } from './lib/app-escrow';
import { formatUsdc } from './lib/money';
import { XLinkPrompt } from './XLink';
import { UsdcBalanceCheck } from './AddUsdc';
import './sponsor-calls.css';

const day = (seconds: number) => new Date(seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const where = (call: SponsorCall) => `${call.category}${call.where ? ` · ${call.where}` : ''}`;

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

/** The Calls page: open calls for creators, and the signed-in sponsor's own. */
export function CallsPage({ model, callId, onOpen, onPost, onBack, onCampaigns }: { model: AdPadModel; callId: string; onOpen: (call: SponsorCall) => void; onPost: () => void; onBack: () => void; onCampaigns: () => void }) {
  if (callId) {
    const call = model.calls.find(item => item.id === callId);
    return call ? <CallDetail call={call} model={model} onBack={onBack} onCampaigns={onCampaigns} />
      : <section className="calls-page"><button className="text-link" onClick={onBack}><ArrowLeft size={16} />All calls</button><p className="calls-empty">{model.loading ? 'Loading this call…' : 'This call was not found. It may have been closed.'}</p></section>;
  }
  const me = model.user?.address;
  const mine = model.calls.filter(call => call.sponsor === me && call.status !== 'closed');
  const open = model.calls.filter(call => call.sponsor !== me && callState(call, model.callEscrows[call.id]) === 'open' && call.deadline > Date.now() / 1000);
  return <section className="calls-page">
    <div className="section-heading"><div><span className="eyebrow">CALLS FOR CREATORS</span><h2>SAY WHAT YOU WANT SEEN.</h2></div><div className="marketplace-intro"><p>Sponsors post what they want promoted, where and by when, and lock the USDC up front. Creators respond, the sponsor picks one, and it runs like any booking.</p><button className="button primary" onClick={onPost}><Plus size={17} />Post a call</button></div></div>
    {mine.length > 0 && <><h3 className="calls-subhead">Your calls</h3><div className="calls-grid">{mine.map(call => <CallCard key={call.id} call={call} model={model} onOpen={() => onOpen(call)} />)}</div></>}
    <h3 className="calls-subhead">Open calls</h3>
    {open.length ? <div className="calls-grid">{open.map(call => <CallCard key={call.id} call={call} model={model} onOpen={() => onOpen(call)} />)}</div>
      : <p className="calls-empty">{model.loading ? 'Loading calls…' : 'No open calls right now. Sponsors: post the first one.'}</p>}
  </section>;
}

function CallCard({ call, model, onOpen }: { call: SponsorCall; model: AdPadModel; onOpen: () => void }) {
  const state = callState(call, model.callEscrows[call.id]);
  const count = model.callResponses[call.id]?.length ?? 0;
  const mine = call.sponsor === model.user?.address;
  return <button className="call-card" onClick={onOpen}>
    <span className="eyebrow">{where(call)}</span>
    <h3>{call.title}</h3>
    <p>{call.brief}</p>
    <div className="call-card-meta"><strong>{formatUsdc(call.amountUsdc)} USDC</strong><span>Proof by {day(call.deadline)}</span><span>@{call.verifiedXHandle}</span></div>
    <span className={`call-status call-status-${state}`}>{CALL_STATUS_LABEL[state]}{mine && state === 'open' ? ` · ${count} ${count === 1 ? 'response' : 'responses'}` : ''}</span>
  </button>;
}

function CallDetail({ call, model, onBack, onCampaigns }: { call: SponsorCall; model: AdPadModel; onBack: () => void; onCampaigns: () => void }) {
  const escrow = model.callEscrows[call.id];
  const state = callState(call, escrow);
  const sponsor = model.user?.address === call.sponsor;
  return <section className="calls-page call-detail">
    <button className="text-link" onClick={onBack}><ArrowLeft size={16} />All calls</button>
    <span className="eyebrow">{where(call)} · posted by @{call.verifiedXHandle}</span>
    <h1>{call.title}</h1>
    <p className="call-brief">{call.brief}</p>
    <dl className="call-terms">
      <div><dt>Pays</dt><dd>{formatUsdc(call.amountUsdc)} USDC</dd></div>
      <div><dt>Proof by</dt><dd>{day(call.deadline)}</dd></div>
      <div><dt>The USDC</dt><dd>{escrow ? ESCROW_STATUS_LABEL[escrow.status] : 'Escrow not found'}</dd></div>
      <div><dt>Status</dt><dd>{CALL_STATUS_LABEL[state]}</dd></div>
    </dl>
    {model.error && <div className="form-error" role="alert">{model.error}</div>}
    {model.notice && <div className="subtle-notice" role="status">{model.notice}</div>}
    {sponsor ? <SponsorView call={call} model={model} state={state} onCampaigns={onCampaigns} /> : <CreatorView call={call} model={model} state={state} onCampaigns={onCampaigns} />}
  </section>;
}

function SponsorView({ call, model, state, onCampaigns }: { call: SponsorCall; model: AdPadModel; state: SponsorCall['status']; onCampaigns: () => void }) {
  const [picking, setPicking] = useState<CallResponse | null>(null);
  const responses = model.callResponses[call.id] || [];
  const busy = (icon: ReactNode) => model.busy ? <LoaderCircle size={17} className="spin" /> : icon;
  if (state === 'funding') return <div className="call-panel">
    <p>Your USDC is not locked yet, so creators cannot see this call. Lock it from your wallet to open the call.</p>
    <UsdcBalanceCheck address={model.user?.address} neededUsdc={call.amountUsdc} />
    <div className="secondary-actions"><button className="button primary" disabled={model.busy} onClick={() => void model.lockCall(call)}>{busy(<LockKeyhole size={17} />)}Lock {formatUsdc(call.amountUsdc)} USDC</button><button className="button secondary" disabled={model.busy} onClick={() => void model.closeCall(call)}>Close this call</button></div>
  </div>;
  if (state === 'picked') return <div className="call-panel"><p><UserCheck size={17} /> You picked a creator. The booking is in My campaigns: once they accept, they do the work and you pay them from the escrow.</p><button className="button primary" onClick={onCampaigns}>My campaigns <ArrowRight size={17} /></button></div>;
  if (state === 'closed') return <div className="call-panel"><p>This call is closed. Any USDC it held is back in your wallet.</p></div>;
  return <div className="call-panel">
    <h3 className="calls-subhead">{responses.length ? `${responses.length} ${responses.length === 1 ? 'creator' : 'creators'} responded` : 'No responses yet'}</h3>
    {responses.length === 0 && <p>Creators see your call on the Calls page. You can take the USDC back while nobody is picked.</p>}
    <div className="call-responses">{responses.map(response => <article className="call-response" key={response.responder}>
      <strong>@{response.verifiedXHandle}</strong>
      <p>{response.pitch}</p>
      {response.link && <a href={response.link} target="_blank" rel="noreferrer noopener">{response.link} <ExternalLink size={13} /></a>}
      {picking?.responder === response.responder
        ? <div className="call-confirm"><p>Pick @{response.verifiedXHandle}? The {formatUsdc(call.amountUsdc)} USDC in escrow is assigned to them. Until they accept you can still take it back; after that you pay them from the escrow, they can return it, or either of you can dispute.</p><div className="secondary-actions"><button className="button primary" disabled={model.busy} onClick={async () => { if (await model.pickCallResponse(call, response)) setPicking(null); }}>{busy(<UserCheck size={17} />)}Pick @{response.verifiedXHandle}</button><button className="button secondary" disabled={model.busy} onClick={() => setPicking(null)}>Back</button></div></div>
        : <button className="button secondary" disabled={model.busy} onClick={() => setPicking(response)}><UserCheck size={17} />Pick this creator</button>}
    </article>)}</div>
    <button className="text-link call-close" disabled={model.busy} onClick={() => void model.closeCall(call)}><Undo2 size={16} />Take the USDC back and close this call</button>
  </div>;
}

function CreatorView({ call, model, state, onCampaigns }: { call: SponsorCall; model: AdPadModel; state: SponsorCall['status']; onCampaigns: () => void }) {
  const [pitch, setPitch] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const me = model.user?.address;
  const mine = (model.callResponses[call.id] || []).find(response => response.responder === me);
  if (call.creator && call.creator === me) return <div className="call-panel"><p><UserCheck size={17} /> The sponsor picked you. The USDC is locked for you: accept the booking in My campaigns, do the work by {day(call.deadline)} and send your proof.</p><button className="button primary" onClick={onCampaigns}>My campaigns <ArrowRight size={17} /></button></div>;
  if (mine) return <div className="call-panel"><p>You responded. The sponsor reads every response and picks one creator.</p><blockquote>{mine.pitch}</blockquote></div>;
  if (state !== 'open' || call.deadline <= Date.now() / 1000) return <div className="call-panel"><p>This call is not taking responses.</p></div>;
  if (!model.user) return <div className="call-panel"><p>Sign in to respond. The sponsor sees your pitch and your linked X account.</p><button className="button primary" disabled={!model.ready || model.busy} onClick={() => void model.signIn()}>Sign in to respond <ArrowRight size={17} /></button></div>;
  if (!model.xAccount) return <div className="call-panel"><XLinkPrompt model={model} action="respond to calls" /></div>;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = validateCallResponse(pitch, link);
    setError(problem);
    if (!problem && await model.respondToCall(call, pitch, link)) { setPitch(''); setLink(''); }
  };
  return <form className="call-panel call-respond" onSubmit={submit}>
    <h3 className="calls-subhead">Respond</h3>
    <Field label="What you would do" hint="10–500 characters. Only the sponsor reads it."><textarea rows={4} value={pitch} onChange={event => setPitch(event.target.value)} maxLength={500} placeholder="Where you would show it, to whom, and what proof you would post." required /></Field>
    <Field label="A link (optional)" hint="Your past work, a profile, or the event page."><input type="url" value={link} onChange={event => setLink(event.target.value)} maxLength={300} placeholder="https://" /></Field>
    {error && <div className="form-error" role="alert">{error}</div>}
    <button className="button primary" type="submit" disabled={model.busy}>{model.busy ? <LoaderCircle size={17} className="spin" /> : <Megaphone size={17} />}Send response</button>
  </form>;
}

/** Post a call: the USDC is locked from the sponsor's wallet before any creator is named. */
export function PostCallForm({ model, onSuccess }: { model: AdPadModel; onSuccess: () => void }) {
  const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const earliest = new Date(Date.now() + 86_400_000);
  const latest = new Date(Date.now() + 75 * 86_400_000);
  const [form, setForm] = useState({ title: '', brief: '', category: 'Event', where: '', amount: '100', deadline: localDate(new Date(Date.now() + 14 * 86_400_000)) });
  const [error, setError] = useState<string | null>(null);
  const update = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  const amountUsdc = Math.round(Number(form.amount) * 1_000_000);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const deadline = Math.floor(new Date(`${form.deadline}T23:59:59`).getTime() / 1000);
    if (!Number.isFinite(deadline) || deadline <= Date.now() / 1000) { setError('Choose a future proof deadline.'); return; }
    if (!Number.isFinite(amountUsdc) || amountUsdc < 1_000_000 || amountUsdc > 1_000_000_000) { setError('Calls pay from 1 to 1,000 USDC.'); return; }
    setError(null);
    if (await model.postCall({ title: form.title, brief: form.brief, category: form.category, where: form.where, amountUsdc, deadline })) onSuccess();
  };
  return <form className="dialog-content" onSubmit={submit}>
    <Field label="Title" hint="3–120 characters, shown on the Calls page."><input value={form.title} onChange={update('title')} maxLength={120} placeholder="Wear our cap at Breakpoint" required /></Field>
    <Field label="What you want" hint="10–500 characters: what to show, the key message or link, and the proof you expect."><textarea rows={4} value={form.brief} onChange={update('brief')} maxLength={500} required /></Field>
    <div className="form-row">
      <Field label="Category"><select value={form.category} onChange={update('category')}>{CALL_CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Where (optional)" hint="An event, a city or a channel."><input value={form.where} onChange={update('where')} maxLength={80} /></Field>
    </div>
    <div className="form-row">
      <Field label="Pays (USDC)" hint="1 to 1,000. Locked when you post."><input type="number" min={1} max={1000} step="0.01" value={form.amount} onChange={update('amount')} required /></Field>
      <Field label="Proof deadline" hint="The picked creator posts proof by the end of this day."><input type="date" value={form.deadline} onChange={update('deadline')} min={localDate(earliest)} max={localDate(latest)} required /></Field>
    </div>
    <div className="subtle-notice"><LockKeyhole size={18} /><span>Posting locks the USDC from your own wallet in an AdPad escrow at its own public address, before any creator is named. Creators respond and you pick one; until the creator you pick accepts, you can take the USDC back. Then it runs like any booking: you pay the creator from the escrow when the proof matches, either side can dispute and AdPad’s agent decides, and money nobody pays out returns to you 14 days after the deadline.</span></div>
    <div className="subtle-notice"><Globe2 size={18} /><span>Your call is public: its title, what you want, where, the amount and your X handle. Responses are private to you and the creator who wrote them. Posting signs two Solana transactions from your wallet (creating the escrow, then locking the USDC), and picking a creator or taking the USDC back signs one more, so keep a little SOL for network fees.</span></div>
    <label className="check-label"><input type="checkbox" required /><span>I understand posting locks {Number.isFinite(amountUsdc) && amountUsdc > 0 ? formatUsdc(amountUsdc) : 'the'} USDC from my wallet until I take it back before a creator accepts, pay the creator, the creator returns it, a dispute is decided or the expiry date passes.</span></label>
    {(error || model.error) && <div className="form-error" role="alert">{error || model.error}</div>}
    {model.user && Number.isFinite(amountUsdc) && amountUsdc > 0 && <UsdcBalanceCheck address={model.user.address} neededUsdc={amountUsdc} />}
    {!model.user ? <button className="button primary full-width" type="button" disabled={!model.ready || model.busy} onClick={() => void model.signIn()}>Sign in to post a call <ArrowRight size={17} /></button>
      : !model.xAccount ? <XLinkPrompt model={model} action="post a call" />
      : !model.user.address ? <div className="form-error">A wallet address is needed to lock USDC. Complete wallet setup in the sign-in flow, then refresh.</div>
      : <button className="button primary full-width" type="submit" disabled={model.busy}>{model.busy ? <LoaderCircle size={17} className="spin" /> : <LockKeyhole size={17} />}Post and lock USDC <ArrowRight size={17} /></button>}
  </form>;
}
