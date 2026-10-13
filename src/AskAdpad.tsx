import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { functions } from '@bounded-sh/client';
import { ArrowUp, LoaderCircle, MessageCircle, RotateCcw } from 'lucide-react';
import type { AdPadModel, Listing } from './types';
import { formatUsdc } from './lib/money';
import './ask-adpad.css';

type Message = { role: 'user' | 'assistant'; content: string; actions?: AskAction[] };
export type AskAction = { kind: 'listing'; id: string } | { kind: 'book'; id: string; brief: string } | { kind: 'create_listing' | 'buy' | 'how_it_works' | 'profile' | 'campaigns' | 'events' | 'creators' | 'calls' | 'post_call' };

const STARTERS = ['How does payment work?', 'I’m a sponsor. Plan a sponsorship with me.', 'I’m a creator. How do I get sponsored?', 'What if the work isn’t delivered?'];
const ACTION_LABEL: Record<Exclude<AskAction['kind'], 'listing' | 'book'>, string> = { create_listing: 'Draft my listing', buy: 'Buy attention', how_it_works: 'How it works', profile: 'Set up my profile', campaigns: 'My campaigns', events: 'Solana events', creators: 'Browse creator services', calls: 'Open calls', post_call: 'Post a call' };
const newId = () => (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9-]/g, '');

const catalogFor = (listings: Listing[]) => listings.filter(item => item.active && !item.deleted && !item.sample).slice(0, 60).map(item => ({ id: item.id, title: item.title, kind: item.kind, category: item.category, publisher: item.publisher, eventName: item.eventName || '', channel: item.channel || '', priceMicro: item.priceMicro }));

export default function AskAdpad({ model, listings, onAction }: { model: AdPadModel; listings: Listing[]; onAction: (action: AskAction) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const log = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);

  const send = async (raw: string) => {
    const content = raw.trim();
    if (!content || busy) return;
    if (!model.user) { void model.signIn(); return; }
    const next: Message[] = [...messages, { role: 'user', content: content.slice(0, 1500) }];
    setMessages(next); setInput(''); setError(''); setBusy(true);
    const requestId = newId();
    try {
      const result = await functions.invoke<{ message: string; actions: AskAction[] }>('askAdpad', { requestId, messages: next.map(({ role, content: text }) => ({ role, content: text })), catalog: catalogFor(listings) }, { headers: { 'Idempotency-Key': requestId } });
      setMessages([...next, { role: 'assistant', content: result.message, actions: Array.isArray(result.actions) ? result.actions : [] }]);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'AdPad could not answer just now. Try again.');
    } finally { setBusy(false); requestAnimationFrame(() => box.current?.focus()); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void send(input); };
  const byId = new Map(listings.map(item => [item.id, item]));

  return <section className="ask-page" aria-label="Ask AdPad">
    <div className="ask-head">
      <div><span className="eyebrow">ASK ADPAD</span><h1>ASK ANYTHING.</h1><p>How payment works, finding creators for your brand, or getting your own listing up. I suggest and draft; anything that publishes or moves USDC is a normal screen you confirm with your wallet.</p></div>
      {messages.length > 0 && <button className="text-link" type="button" onClick={() => { setMessages([]); setError(''); }}><RotateCcw size={15} />New chat</button>}
    </div>
    <div className="ask-log" ref={log} aria-live="polite">
      {messages.length === 0 && <div className="ask-empty"><MessageCircle size={26} strokeWidth={1.6} /><p>Start with a question, or tap one of these.</p><div className="ask-starters">{STARTERS.map(text => <button key={text} type="button" className="chip" onClick={() => void send(text)}>{text}</button>)}</div></div>}
      {messages.map((message, index) => <div key={index} className={`ask-msg ${message.role}`}>
        <span className="ask-who">{message.role === 'user' ? 'You' : 'AdPad'}</span>
        <p>{message.content}</p>
        {!!message.actions?.length && <div className="ask-actions">{message.actions.map(action => {
          if (action.kind === 'book') { const item = byId.get(action.id); return item ? <div key={`b:${action.id}`} className="ask-brief"><span className="ask-brief-label">Draft brief for {item.title}</span><p>{action.brief}</p><button type="button" className="button primary" onClick={() => onAction(action)}>Book with this brief</button></div> : null; }
          if (action.kind === 'listing') { const item = byId.get(action.id); return item ? <button key={`l:${action.id}`} type="button" className="ask-listing" onClick={() => onAction(action)}><strong>{item.title}</strong><span>{item.publisher} · {formatUsdc(item.priceMicro)} USDC</span></button> : null; }
          return <button key={action.kind} type="button" className="button secondary" onClick={() => onAction(action)}>{ACTION_LABEL[action.kind]}</button>;
        })}</div>}
      </div>)}
      {busy && <div className="ask-msg assistant pending"><span className="ask-who">AdPad</span><p><LoaderCircle className="spin" size={16} /> Thinking…</p></div>}
    </div>
    {error && <p className="ask-error" role="alert">{error}</p>}
    <form className="ask-form" onSubmit={submit}>
      <label className="sr-only" htmlFor="ask-input">Message AdPad</label>
      <textarea id="ask-input" ref={box} rows={1} maxLength={1500} value={input} placeholder={model.user ? 'Message AdPad' : 'Sign in to chat with AdPad'} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(input); } }} />
      <button className="ask-send" type="submit" disabled={busy || (!!model.user && !input.trim()) || !model.configured} aria-label={model.user ? 'Send' : 'Sign in'}>{model.user ? <ArrowUp size={20} /> : 'Sign in'}</button>
    </form>
  </section>;
}

export function AskButton({ onOpen }: { onOpen: () => void }) {
  return <button type="button" className="ask-fab" onClick={onOpen}><MessageCircle size={19} />Ask AdPad</button>;
}
