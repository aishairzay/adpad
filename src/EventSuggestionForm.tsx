import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import type { AdPadModel } from './types';

export default function EventSuggestionForm({ model, onSuccess }: { model: AdPadModel; onSuccess: () => void }) {
  const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const url = String(form.get('url') || '').trim();
    const title = String(form.get('title') || '').trim();
    const note = String(form.get('note') || '').trim();
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Enter a public HTTPS event link.');
    } catch { setError('Enter a public HTTPS event or Luma link.'); return; }
    if (await model.submitEventSuggestion({ url, title, note })) onSuccess();
  };
  return <form className="dialog-content event-suggestion-form" onSubmit={submit}>
    <p className="form-intro">Know a Solana event people should see? Send its public page or Luma link. We review submissions before featuring them on Ad Pad.</p>
    <label className="field"><span>Event or Luma link</span><input name="url" type="url" required maxLength={300} placeholder="https://lu.ma/your-event" /></label>
    <label className="field"><span>Event name (optional)</span><input name="title" maxLength={120} placeholder="What should we call it?" /></label>
    <label className="field"><span>Why should we include it? (optional)</span><textarea name="note" rows={3} maxLength={500} placeholder="Tell us how it connects to Solana and its community." /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    {model.error && <p className="form-error" role="alert">{model.error}</p>}
    {model.notice && <p className="subtle-notice" role="status">{model.notice}</p>}
    {model.user ? <button className="button primary full-width" type="submit" disabled={model.busy}>{model.busy ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}Send event for review</button> : <button className="button primary full-width" type="button" onClick={() => void model.signIn()}>Sign in to suggest an event <ArrowRight size={18} /></button>}
  </form>;
}
