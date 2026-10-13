import { useEffect, useRef, useState } from 'react';
import { functions } from '@bounded-sh/client';
import { cleanDraft } from '../functions/onboarding-schema';
import type { Draft } from '../functions/onboarding-schema';
import { headlineSolanaEvents } from './solana-events';
import type { SolanaEvent } from './solana-events';
import { normalizeXHandle } from './lib/x-profile';
import { formatUsdc } from './lib/money';
import { dayCount } from './lib/category-icon';
import './creator-onboarding.css';

type Message = { role: 'user' | 'assistant'; content: string };
type Request = { requestId: string; messages: Message[]; draft: Draft };
type Kind = 'placement' | 'service';
const KINDS: Kind[] = ['placement', 'service'];
const KIND_LABEL: Record<Kind, string> = { placement: 'ad space', service: 'creator service' };
const KIND_ANSWERS: Record<string, string> = { placement: 'I want to offer ad space.', service: 'I want to offer a creator service.', both: 'I want to offer both ad space and a creator service.' };
const GREETING = 'What can a sponsor book you for? Tell me below, or tap a quick chip.';
const EVENT_QUESTION = 'Which event is it for? Tap a chip and I’ll fill its official dates, or type another.';
const IDENTITY_QUESTION = 'What should I call you? Name or crew. Your offer shows the X account you linked. Everything else waits in the form.';
const NO_EVENT_ANSWER = 'No specific event — it’s an independent activation.';
const OTHER_EVENT_ANSWER = 'Another event — I’ll type it.';
const OTHER_EVENT_PROMPT = 'Which event? Type its name below, the city helps. No exact dates needed, you can set any in the form.';
const REVIEW_INVITE = 'That’s your offer drafted. Review in form ↓ to add your photo and the words that sell it. Nothing is published yet.';
const CLOTHING_OPTIONS: [string, string][] = [['sponsor', 'Sponsor supplies the merch'], ['creator', 'I’ll arrange custom clothing'], ['existing', 'I already have it']];
const CLOTHING_LABEL: Record<string, string> = Object.fromEntries(CLOTHING_OPTIONS);
const PRICE_SUGGESTIONS = [50, 100, 250, 500, 1000];
const PLACEHOLDERS: Record<string, string> = { kind: 'I’ll wear your merch for the event weekend…', event: 'Another event — which one?', identity: 'Sam or Sam’s Crew · @sam', price: '250 USDC', review: 'Anything else to add? (optional)' };
const eventSeconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const MAX_PRICE_MICRO = 100_000_000_000;
const NAME_OPENERS = new Set(['i', "i'm", 'im', "i'll", 'ill', 'we', "we're", 'my', 'the', 'a', 'an', 'it', "it's", 'its', 'call', 'me', 'hello', 'hi', 'hey', 'name', 'names', "name's"]);
const NAME_TOPICS = /wear|offer|sell|book|sponsor|deliver|photograph|podcast|newsletter|space|logo|brand|price|budget|usdc|event|handle|photo|video|design|content|hosting|music|development/i;

/** A plain typed price ("250", "$250.50", "250 usdc") answers the price step instantly; everything else goes to the assistant. */
export function parseQuickPrice(text: string): number | null {
  const match = text.trim().match(/^\$?\s*(\d{1,7})(?:[.,](\d{1,2}))?\s*(?:usdc)?$/i);
  if (!match) return null;
  const fraction = match[2] || '';
  const micro = Number(match[1]) * 1000000 + (fraction ? Number(fraction) * 10 ** (6 - fraction.length) : 0);
  if (!Number.isSafeInteger(micro) || micro <= 0 || micro > MAX_PRICE_MICRO) return null;
  return micro;
}

/** A short plain name answer ("Sam", "Sam's Crew · @sam") answers the identity step instantly; anything else goes to the assistant. */
export function parseQuickName(text: string): { publisher: string; xHandle?: string } | null {
  const value = text.trim();
  if (!value || value.length > 60 || /[.!?;:,]/.test(value)) return null;
  const parts = value.split(/\s*·\s*|\s+(?=@)/).map(part => part.trim()).filter(Boolean);
  if (!parts.length || parts.length > 2) return null;
  const name = parts[0];
  const words = name.split(/\s+/);
  if (words.length > 4 || name.length < 2 || name.length > 40) return null;
  if (NAME_OPENERS.has(words[0].replace(/[’‘]/g, "'").toLowerCase()) || NAME_TOPICS.test(name) || /^\$?\d+([.,]\d+)?$/.test(name)) return null;
  let xHandle: string | undefined;
  if (parts[1]) {
    xHandle = normalizeXHandle(parts[1]);
    if (!xHandle) return null;
  }
  return { publisher: name, ...(xHandle ? { xHandle } : {}) };
}

/** The chat asks one thing at a time; this says which quick choices the current draft still needs. */
export function onboardingStep(draft: Draft, upcomingEventCount: number, eventDeclined: boolean): 'kind' | 'event' | 'identity' | 'price' | 'review' {
  const activeKinds = KINDS.filter(kind => draft.offers[kind]);
  const eventStep = upcomingEventCount > 0 && !eventDeclined && activeKinds.length > 0 && activeKinds.some(kind => !draft.offers[kind].eventId && !draft.offers[kind].eventName);
  return !activeKinds.length ? 'kind' : eventStep ? 'event' : !draft.publisher ? 'identity' : activeKinds.some(kind => typeof draft.offers[kind].priceMicro !== 'number') ? 'price' : 'review';
}
const dayLabel = (value: string | number | boolean | undefined) => {
  const date = new Date(Number(value) * 1000);
  return Number(value) > 0 && Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
};

export default function CreatorOnboarding({ storageKey, initialDraft, onApply, onClose }: { storageKey: string; initialDraft: Draft; onApply: (draft: Draft) => void; onClose: () => void }) {
  const [eventChoices] = useState(() => headlineSolanaEvents());
  const [saved] = useState(() => { try { return JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { return null; } });
  const [messages, setMessages] = useState<Message[]>(() => Array.isArray(saved?.messages) && saved.messages.every((m: Message) => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string') ? saved.messages.slice(0, 31) : [{ role: 'assistant', content: GREETING }]);
  const [draft, setDraft] = useState<Draft>(() => {
    const hasFormEdits = Boolean(initialDraft.publisher || initialDraft.xHandle || Object.values(initialDraft.offers).some(offer => offer.title || offer.description || offer.priceMicro));
    return saved && (!saved.reviewed || !hasFormEdits) ? cleanDraft(saved.draft) : initialDraft;
  });
  const [eventDeclined, setEventDeclined] = useState(saved?.eventDeclined === true);
  const [answer, setAnswer] = useState('');
  const [pending, setPending] = useState<Request | null>(saved?.pending || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const log = useRef<HTMLDivElement>(null);
  const answerBox = useRef<HTMLTextAreaElement>(null);
  const choicesLocked = busy || Boolean(pending) || messages.length >= 30;
  // The chat asks one thing at a time; option chips answer the current question, then disappear.
  const activeKinds = KINDS.filter(kind => draft.offers[kind]);
  const step = onboardingStep(draft, eventChoices.length, eventDeclined);
  // The price question names the first offer still missing one; the chips target that same offer.
  const priceKind = step === 'price' ? activeKinds.find(kind => typeof draft.offers[kind].priceMicro !== 'number') : undefined;
  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify({ messages, draft, pending, eventDeclined })); } catch { /* The current draft remains usable when storage is unavailable. */ } }, [storageKey, messages, draft, pending, eventDeclined]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [messages, busy]);
  function review() {
    // After review, manual edits become the source of truth when chat reopens.
    try { sessionStorage.setItem(storageKey, JSON.stringify({ messages, draft, pending, eventDeclined, reviewed: true })); } catch { /* Keep the in-memory draft usable. */ }
    onApply(draft); onClose();
  }
  function appendLocal(userText: string, assistantText: string) {
    if (messages.length >= 30) return;
    setMessages(current => [...current, { role: 'user', content: userText }, { role: 'assistant', content: assistantText }]);
  }
  function patchOffer(kind: Kind, fields: Record<string, string | number>) {
    setDraft(current => cleanDraft({ ...current, offers: { ...current.offers, [kind]: { ...current.offers[kind], ...fields } } }));
  }
  function pickKind(value: string) {
    if (choicesLocked || !KIND_ANSWERS[value]) return;
    const kinds = value === 'both' ? KINDS : [value as Kind];
    setDraft(current => cleanDraft({ ...current, offers: { ...current.offers, ...Object.fromEntries(kinds.map(kind => [kind, { ...current.offers[kind] }])) } }));
    appendLocal(KIND_ANSWERS[value], eventChoices.length ? EVENT_QUESTION : IDENTITY_QUESTION);
  }
  function pickEvent(event: SolanaEvent) {
    if (choicesLocked) return;
    const startsAt = eventSeconds(event.startAt);
    const endsAt = eventSeconds(event.endAt);
    setDraft(current => cleanDraft({ ...current, offers: Object.fromEntries(activeKinds.map(kind => [kind, { ...current.offers[kind], eventId: event.id, eventName: event.title, startsAt, endsAt }])) }));
    appendLocal(`My offer is for ${event.title} (${event.dateLabel}, ${event.venue}, ${event.city}).`, `Dates filled from the official window. ${IDENTITY_QUESTION}`);
  }
  function declineEvent() {
    if (choicesLocked) return;
    setEventDeclined(true);
    appendLocal(NO_EVENT_ANSWER, `Independent works. ${IDENTITY_QUESTION}`);
  }
  function askOtherEvent() {
    if (choicesLocked) return;
    appendLocal(OTHER_EVENT_ANSWER, OTHER_EVENT_PROMPT);
    answerBox.current?.focus();
  }
  function priceReply(kind: Kind): string {
    const remaining = activeKinds.filter(item => item !== kind && typeof draft.offers[item].priceMicro !== 'number');
    return remaining.length ? `Got it. And your ${KIND_LABEL[remaining[0]]} price? Tap a suggestion or type it below.` : messages.at(-1)?.content === REVIEW_INVITE ? 'Updated.' : REVIEW_INVITE;
  }
  function applyTypedPrice(micro: number) {
    const kind = activeKinds.find(item => typeof draft.offers[item].priceMicro !== 'number');
    if (!kind) return;
    patchOffer(kind, { priceMicro: micro });
    appendLocal(`${formatUsdc(micro)} USDC for my ${KIND_LABEL[kind]}.`, priceReply(kind));
  }
  function applyQuickName(parsed: { publisher: string; xHandle?: string }, raw: string) {
    setDraft(current => cleanDraft({ ...current, publisher: parsed.publisher, ...(parsed.xHandle ? { xHandle: parsed.xHandle } : {}) }));
    const pricesLeft = activeKinds.some(kind => typeof draft.offers[kind].priceMicro !== 'number');
    appendLocal(raw, `Nice to meet you, ${parsed.publisher}.${pricesLeft ? ' Last thing: your price — tap a suggestion or type it below.' : ` That’s your offer drafted. ${REVIEW_INVITE}`}`);
  }
  function pickPrice(kind: Kind, amount: number) {
    if (choicesLocked) return;
    patchOffer(kind, { priceMicro: amount * 1000000 });
    appendLocal(`${amount} USDC for my ${KIND_LABEL[kind]}.`, priceReply(kind));
  }
  async function sendText(text: string) {
    text = text.trim();
    if (inFlight.current || (!pending && !text)) return;
    // Impatient users: plain price and name answers apply instantly, with no assistant round trip.
    if (!pending) {
      const quickPrice = step === 'price' ? parseQuickPrice(text) : null;
      if (quickPrice != null) { applyTypedPrice(quickPrice); return; }
      const quickName = step === 'identity' ? parseQuickName(text) : null;
      if (quickName) { applyQuickName(quickName, text); return; }
    }
    const request: Request = pending || { requestId: crypto.randomUUID(), messages: [...messages.slice(1).slice(-6), { role: 'user', content: text }], draft };
    if (!pending) { setMessages(current => [...current, { role: 'user', content: text }]); setPending(request); }
    inFlight.current = true; setBusy(true); setError('');
    try {
      const result = await functions.invoke<{ message: string; draft: Draft }>('creatorOnboarding', request, { headers: { 'Idempotency-Key': request.requestId } });
      if (!result || typeof result.message !== 'string') throw new Error('Invalid assistant response');
      setDraft(cleanDraft(result.draft)); setMessages(current => [...current, { role: 'assistant', content: result.message }]); setPending(null);
    } catch (cause) {
      const code = (cause as { details?: { code?: string } })?.details?.code;
      setError(code === 'invocation_replayed' ? 'That answer already ran, but could not be recovered. Your saved draft is below; continue in the form.' : 'The assistant couldn’t finish this answer. Retry, or use your saved draft in the form.');
    }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function send() { if (!answer.trim()) return; const text = answer; setAnswer(''); await sendText(text); }
  return <section className="creator-ai" aria-label="Become a creator">
    <div className="creator-ai-heading"><strong>BECOME A CREATOR</strong><button type="button" onClick={review} disabled={busy}>Use the form</button></div>
    <p>AI helps with the words. You make the calls. Draft saved in this browser tab. Only share details you want in your public offer.</p>
    <div className="creator-ai-log" ref={log} role="log" aria-live="polite" aria-relevant="additions">{messages.map((message, index) => <div key={index} className={`creator-ai-message ${message.role}`}><strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong><p>{message.content}</p></div>)}{busy && <p role="status">Working on your draft…</p>}</div>
    {error && <p role="alert">{error}</p>}
    {!choicesLocked && (step === 'kind' || step === 'event' || step === 'price') && <div className="creator-ai-quick">
      {step === 'kind' && <div className="creator-ai-chips" role="group" aria-label="What are you offering?">
        <button type="button" className="chip" onClick={() => pickKind('placement')}><strong>Ad space</strong><small>Your presence, gear, or audience.</small></button>
        <button type="button" className="chip" onClick={() => pickKind('service')}><strong>Creator service</strong><small>Your skills, craft, or expertise.</small></button>
        <button type="button" className="chip" onClick={() => pickKind('both')}><strong>Both</strong><small>One profile, two offers.</small></button>
      </div>}
      {step === 'event' && <div className="creator-ai-chips" role="group" aria-label="Which event is this offer for?">
        {eventChoices.map(event => <button type="button" className="chip" key={event.id} onClick={() => pickEvent(event)}><strong>{event.title}</strong><small>{event.dateLabel} · {event.venue}</small></button>)}
        <button type="button" className="chip ghost" onClick={askOtherEvent}><strong>Another event</strong><small>I’ll type it. No exact dates needed.</small></button>
        <button type="button" className="chip ghost" onClick={declineEvent}><strong>No specific event</strong><small>Anywhere you choose.</small></button>
      </div>}
      {step === 'price' && priceKind && <div className="creator-ai-chips" role="group" aria-label={`Suggested ${KIND_LABEL[priceKind]} prices`}>
        {PRICE_SUGGESTIONS.map(amount => <button type="button" className="chip" key={amount} onClick={() => pickPrice(priceKind, amount)}><strong>{amount} USDC</strong><small>for my {KIND_LABEL[priceKind]}</small></button>)}
      </div>}
    </div>}
    <label className="field"><span>Your answer</span><textarea ref={answerBox} value={answer} onChange={event => setAnswer(event.target.value)} maxLength={2000} rows={3} disabled={busy || Boolean(pending) || messages.length >= 30} placeholder={PLACEHOLDERS[step] || ''} /></label>
    <div className="creator-ai-actions"><button type="button" className="button primary" disabled={busy || (!pending && (!answer.trim() || messages.length >= 30))} onClick={() => void send()}>{busy ? 'Thinking…' : pending ? 'Retry answer' : 'Send answer'}</button><button type="button" className="button" disabled={busy} onClick={review}>Review in form ↓</button></div>
    {messages.length >= 30 && <p>Let’s finish the details in the form.</p>}
    <details className="creator-ai-preview"><summary>Your draft · nothing published</summary><p><strong>{draft.publisher || 'Your name / crew'}</strong>{draft.xHandle && ` · ${draft.xHandle}`}</p>{Object.entries(draft.offers).map(([kind, offer]) => <article key={kind}><strong>{kind === 'service' ? 'Creator service' : 'Ad space'}: {offer.title || 'Title to come'}</strong><p>{offer.description || 'Tell me what you want to offer.'}</p><p>{[offer.category, offer.channel].filter(Boolean).join(' · ') || 'Location to confirm'} · {typeof offer.priceMicro === 'number' ? `${offer.priceMicro / 1000000} USDC` : 'Price to confirm'}</p>{offer.eventName && <p><strong>Event:</strong> {offer.eventName}{Number(offer.startsAt) > 0 && Number(offer.endsAt) > 0 ? ` · ${dayLabel(offer.startsAt)} – ${dayLabel(offer.endsAt)}` : ''}</p>}{offer.clothingSource && <p><strong>Clothing:</strong> {CLOTHING_LABEL[String(offer.clothingSource)]}</p>}{(typeof offer.turnaroundDays === 'number' || typeof offer.capacity === 'number') && <p>{typeof offer.turnaroundDays === 'number' ? `Delivery in ${dayCount(offer.turnaroundDays)}` : ''}{typeof offer.turnaroundDays === 'number' && typeof offer.capacity === 'number' ? ' · ' : ''}{typeof offer.capacity === 'number' ? `${offer.capacity} booking ${offer.capacity === 1 ? 'spot' : 'spots'}` : ''}</p>}{offer.deliverables && <p><strong>Deliverables & proof:</strong> {offer.deliverables}</p>}</article>)}</details>
  </section>;
}
