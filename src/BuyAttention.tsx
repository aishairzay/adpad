import { useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, LoaderCircle, LockKeyhole, Search, Sparkles } from 'lucide-react';
import type { AdPadModel, Listing } from './types';
import { CATEGORIES } from './types';
import { FEATURED_SOLANA_EVENTS } from './solana-events';
import { ATTENTION_BUDGETS, attentionBrief, attentionSuggestions, matchAttention } from './lib/buy-attention';
import { activationDates, availability, eventLabel } from './lib/sponsorship';
import { CategoryIcon } from './lib/category-icon';
import { formatUsdc } from './lib/money';
import { safeListingImageUrl } from './lib/listing-images';
import './buy-attention.css';

const KIND_CHIPS = CATEGORIES.slice(1);
const ANY = 'any';

function MatchRow({ listing, index, onPick }: { listing: Listing; index: number; onPick: () => void }) {
  const image = safeListingImageUrl(listing.imageUrl);
  const stock = availability(listing);
  return <button type="button" className="buy-match" onClick={onPick}>
    <span className="buy-match-photo">{image ? <img src={image} alt="" loading="lazy" decoding="async" /> : <Sparkles size={20} aria-hidden="true" />}</span>
    <span className="buy-match-main">
      <span className="buy-match-kind"><CategoryIcon category={listing.category} size={13} />{listing.category} · {listing.publisher}</span>
      <strong>{listing.title}</strong>
      <span className="buy-match-when"><CalendarDays size={13} aria-hidden="true" />{eventLabel(listing)}{listing.startsAt && listing.endsAt ? ` · ${activationDates(listing)}` : ''}</span>
    </span>
    <span className="buy-match-side">
      <strong>{formatUsdc(listing.priceMicro)} <small>USDC</small></strong>
      <small>{stock.bookable ? 'Bookable now' : stock.label}</small>
      <span className="buy-match-number">{String(index + 1).padStart(2, '0')}</span>
    </span>
  </button>;
}

/**
 * The guided buyer flow: three quick questions, then bookable placements from discovery.
 * Signed out the whole way until the funding step, which the buyer opens by picking a match.
 */
export default function BuyAttention({ model, onPick, onBrowse }: { model: AdPadModel; onPick: (listing: Listing, brief: string) => void; onBrowse: () => void }) {
  const [category, setCategory] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const answers = { category, eventId, date, budgetMicro: budget };
  const now = Math.floor(Date.now() / 1000);
  const matches = useMemo(() => matchAttention(model.listings, answers, now), [model.listings, category, eventId, date, budget]);
  const suggestions = useMemo(() => (matches.length ? { sameKind: [], nearestCategories: [] } : attentionSuggestions(model.listings, answers, now)), [model.listings, matches.length, category, eventId, date, budget]);
  const brief = attentionBrief(answers);
  const answered = Boolean(category || eventId || date || budget);
  const chooseCategory = (next: string) => { setCategory(next); };
  return <div className="dialog-content buy-attention">
    <p className="form-intro">Three quick questions, then bookable ad space from real people. No account needed until you fund the escrow.</p>
    <fieldset className="buy-question">
      <legend>1 · What kind of attention?</legend>
      <div className="buy-chips" role="group" aria-label="Kind of attention">
        <button type="button" className={!category ? 'selected' : ''} aria-pressed={!category} onClick={() => setCategory(null)}>Any kind</button>
        {KIND_CHIPS.map(item => <button type="button" key={item} className={category === item ? 'selected' : ''} aria-pressed={category === item} onClick={() => chooseCategory(item)}>{item}</button>)}
      </div>
    </fieldset>
    <fieldset className="buy-question">
      <legend>2 · Where or when?</legend>
      <div className="buy-chips" role="group" aria-label="Where or when">
        <button type="button" className={!eventId && !date ? 'selected' : ''} aria-pressed={!eventId && !date} onClick={() => { setEventId(null); setDate(null); setDateOpen(false); }}>Anytime</button>
        {FEATURED_SOLANA_EVENTS.map(event => <button type="button" key={event.id} className={eventId === event.id ? 'selected' : ''} aria-pressed={eventId === event.id} onClick={() => { setEventId(event.id); setDate(null); setDateOpen(false); }}><strong>{event.title}</strong><small>{event.dateLabel}</small></button>)}
        <button type="button" className={date ? 'selected' : ''} aria-pressed={Boolean(date)} onClick={() => { setDateOpen(true); setEventId(null); if (date) return; setTimeout(() => document.querySelector<HTMLInputElement>('.buy-date-input input')?.focus(), 0); }}>On a date</button>
      </div>
      {(dateOpen || date) && <label className="buy-date-input"><span>Pick a day (UTC)</span><input type="date" value={date || ''} onChange={event => { setDate(event.target.value || null); setEventId(null); }} /></label>}
    </fieldset>
    <fieldset className="buy-question">
      <legend>3 · Budget</legend>
      <div className="buy-chips" role="group" aria-label="Budget">
        <button type="button" className={!budget ? 'selected' : ''} aria-pressed={!budget} onClick={() => setBudget(null)}>Any budget</button>
        {ATTENTION_BUDGETS.map(amount => <button type="button" key={amount} className={budget === amount * 1000000 ? 'selected' : ''} aria-pressed={budget === amount * 1000000} onClick={() => setBudget(amount * 1000000)}>Up to {amount} USDC</button>)}
      </div>
    </fieldset>
    <div className="buy-results" aria-live="polite">
      <div className="buy-results-head">
        <strong>{model.loading && !model.listings.length ? <><LoaderCircle className="spin" size={16} /> Finding placements…</> : `${String(matches.length).padStart(2, '0')} ${matches.length === 1 ? 'placement' : 'placements'} ${matches.length === 1 ? 'matches' : 'match'}`}</strong>
        {answered && <button type="button" className="text-button" onClick={() => { setCategory(null); setEventId(null); setDate(null); setBudget(null); setDateOpen(false); }}>Start over</button>}
      </div>
      {matches.length ? <div className="buy-match-list">
        {matches.map((listing, index) => <MatchRow key={listing.id} listing={listing} index={index} onPick={() => onPick(listing, brief)} />)}
        <p className="buy-fine-print"><LockKeyhole size={14} aria-hidden="true" />Picking one opens the booking form. Your payment stays in escrow until you approve the proof.</p>
      </div> : suggestions.sameKind.length ? <div className="buy-empty">
        <strong>NO EXACT MATCH. CLOSE THOUGH.</strong>
        <p>Same kind of attention, bookable now, any time or budget:</p>
        <div className="buy-match-list">{suggestions.sameKind.map((listing, index) => <MatchRow key={listing.id} listing={listing} index={index} onPick={() => onPick(listing, '')} />)}</div>
        <button type="button" className="text-button" onClick={onBrowse}>Browse the whole marketplace <ArrowRight size={15} /></button>
      </div> : suggestions.nearestCategories.length ? <div className="buy-empty">
        <strong>NOTHING MATCHES THOSE ANSWERS.</strong>
        <p>These kinds of attention have bookable space right now:</p>
        <div className="buy-chips">{suggestions.nearestCategories.map(item => <button type="button" key={item.category} onClick={() => { setCategory(item.category); setEventId(null); setDate(null); setBudget(null); setDateOpen(false); }}>{item.category} <small>{item.count}</small></button>)}</div>
        <button type="button" className="text-button" onClick={onBrowse}>Browse the whole marketplace <ArrowRight size={15} /></button>
      </div> : <div className="buy-empty">
        <strong>NOTHING BOOKABLE RIGHT NOW.</strong>
        <p>Real placements are still arriving. Browse everything, or check back shortly.</p>
        <button type="button" className="text-button" onClick={onBrowse}><Search size={15} />Browse the marketplace <ArrowRight size={15} /></button>
      </div>}
    </div>
  </div>;
}
