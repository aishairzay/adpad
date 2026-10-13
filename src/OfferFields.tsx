import { useState } from 'react';
import type { ClothingSource, ListingKind, ListingInput, SponsorshipTerms } from './types';
import { FEATURED_SOLANA_EVENTS } from './solana-events';
import { officialEventDates } from './lib/sponsorship';

export function readOfferTerms(form: FormData, kind: ListingKind, sponsorship: boolean, prefix = ''): SponsorshipTerms & Pick<ListingInput, 'attendingEvent'> {
  const string = (name: string) => String(form.get(prefix + name) || '').trim();
  const date = (name: string, end = false) => string(name) ? Math.floor(Date.parse(`${string(name)}T${end ? '23:59:59' : '00:00:00'}Z`) / 1000) : undefined;
  return {
    sponsorship: kind === 'placement' && sponsorship,
    capacity: Number(string('capacity') || '1'),
    attendingEvent: kind === 'placement' && form.get(prefix + 'attendingEvent') === 'on',
    ...(string('eventName') ? { eventId: string('eventId') || 'independent', eventName: string('eventName') } : {}),
    ...(string('startsAt') ? { startsAt: date('startsAt'), endsAt: date('endsAt', true) } : {}),
    ...(kind === 'placement' && string('clothingSource') ? { clothingSource: string('clothingSource') as ClothingSource, clothingDetails: string('clothingDetails'), ...(string('supplyBy') ? { supplyBy: date('supplyBy', true) } : {}) } : {}),
  };
}

export function OfferFields({ sponsorship, kind, initialEventId, initialValues, prefix = '' }: { sponsorship: boolean; kind: ListingKind; initialEventId?: string; initialValues?: SponsorshipTerms & Pick<ListingInput, 'attendingEvent'>; prefix?: string }) {
  const dateValue = (value?: number | null) => value ? new Date(value * 1000).toISOString().slice(0, 10) : '';
  const name = (value: string) => prefix + value;
  const initialEvent = FEATURED_SOLANA_EVENTS.find(event => event.id === (initialValues?.eventId || initialEventId));
  const [eventId, setEventId] = useState(initialValues?.eventId || initialEvent?.id || 'independent');
  const [eventName, setEventName] = useState(initialValues?.eventName || initialEvent?.title || '');
  const [startsAt, setStartsAt] = useState(dateValue(initialValues?.startsAt) || initialEvent?.startAt.slice(0, 10) || '');
  const [endsAt, setEndsAt] = useState(dateValue(initialValues?.endsAt) || initialEvent?.endAt.slice(0, 10) || '');
  const [attending, setAttending] = useState(initialValues?.attendingEvent === true);
  const [clothingSource, setClothingSource] = useState(initialValues?.clothingSource || '');
  const today = new Date().toISOString().slice(0, 10);
  const officialEvent = FEATURED_SOLANA_EVENTS.find(item => item.id === eventId);
  const eventMin = officialEvent ? officialEvent.startAt.slice(0, 10) : undefined;
  const eventMax = officialEvent ? officialEvent.endAt.slice(0, 10) : undefined;
  const startMin = eventMin && eventMin > today ? eventMin : today;
  return <div className="offer-fields">
    <div className="form-row"><label className="field"><span>Event or activation</span><select name={name('eventId')} value={eventId} onChange={event => {
      const id = event.target.value; setEventId(id); setAttending(false);
      const selected = FEATURED_SOLANA_EVENTS.find(item => item.id === id);
      setEventName(selected?.title || ''); setStartsAt(selected?.startAt.slice(0, 10) || ''); setEndsAt(selected?.endAt.slice(0, 10) || '');
    }}><option value="independent">Independent / another event</option>{FEATURED_SOLANA_EVENTS.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label><label className="field"><span>Event / activation name</span><input name={name('eventName')} value={eventName} onChange={event => setEventName(event.target.value)} required={sponsorship || attending} maxLength={120} placeholder="London conference week / your activation" /></label></div>
    <div className="form-row"><label className="field"><span>Activation starts</span><input type="date" name={name('startsAt')} min={startMin} max={eventMax} value={startsAt} onInput={event => setStartsAt(event.currentTarget.value)} onChange={event => setStartsAt(event.target.value)} required={sponsorship || attending || Boolean(endsAt)} /></label><label className="field"><span>Activation ends</span><input type="date" name={name('endsAt')} min={startsAt || startMin} max={eventMax} value={endsAt} onInput={event => setEndsAt(event.currentTarget.value)} onChange={event => setEndsAt(event.target.value)} required={sponsorship || attending || Boolean(startsAt)} /></label></div>
    {kind === 'placement' && <label className="attendance-confirmation"><input name={name('attendingEvent')} type="checkbox" checked={attending} onChange={event => setAttending(event.target.checked)} /><span><strong>Show this listing on the event’s page</strong><small>Tick this if you’ll be at the event in person. Your listing then appears with that event’s creators on the Solana events page. Choose the days you’ll attend and put the place, hours and proof in your deliverables.</small></span></label>}
    {officialEvent && <p className="fine-print event-dates-note">Official {officialEvent.title} dates: {officialEventDates(officialEvent.id)}. Your dates must fall inside them.</p>}
    <p className="fine-print">All AdPad dates are calendar days in UTC. Describe the exact local hours, place, and event access you can provide in your deliverables. An event tag does not include admission or official sponsorship.</p>
    <label className="field"><span>Available booking spots</span><input name={name('capacity')} type="number" min={1} max={100} step={1} defaultValue={initialValues?.capacity || 1} required /><small>Use 1 for an exclusive outfit or activation. Each funded booking reserves one spot; a refund reopens it.</small></label>
    {kind === 'placement' && <><label className="field"><span>Clothing or merch arrangement</span><select name={name('clothingSource')} value={clothingSource} onChange={event => setClothingSource(event.target.value)}><option value="">This offer does not include wearing clothing</option><option value="sponsor">I’ll wear merch supplied by the sponsor</option><option value="creator">I’ll arrange custom branded clothing</option><option value="existing">I already have the agreed clothing or gear</option></select><small>A logo placement is optional. Wearing a brand’s existing merch is an advertising offer too.</small></label>{clothingSource && <><label className="field"><span>Clothing, costs & responsibilities</span><textarea name={name('clothingDetails')} rows={3} maxLength={500} defaultValue={initialValues?.clothingDetails || ''} required placeholder="e.g. Sponsor supplies one approved hoodie before the activation. I wear it for 4 hours. Shipping and the hoodie are supplied separately; this fee covers wearing it and photo proof." /><small>Agree the garment, branding, wear time, production costs, shipping, approval, and whether it is kept or returned. Keep delivery addresses and personal details out of this public listing.</small></label><label className="field"><span>Clothing ready by</span><input type="date" name={name('supplyBy')} defaultValue={dateValue(initialValues?.supplyBy)} min={today} max={startsAt || undefined} required={clothingSource !== 'existing'} /><small>Choose a date before the activation, with time for delivery and approval.</small></label></>}</>}
  </div>;
}
