import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, CalendarDays, ImagePlus, MapPin, Plus, Users } from 'lucide-react';
import { SOLANA_CALENDAR_EMBED_URL, SOLANA_CALENDAR_URL, SOLANA_EVENTS_URL, upcomingSolanaEvents } from './solana-events';
import type { SolanaEvent } from './solana-events';
import type { Listing, Profile } from './types';
import { eventOfferProfile, eventOffersFor } from './lib/event-offers';
import { activationDates, availability, listingPath } from './lib/sponsorship';

/** Luma embeds honor theme=light; appended only to Luma embed URLs so the calendar matches the light page. */
const calendarEmbedUrl = /https:\/\/(lu\.ma|luma\.com)\/embed/.test(SOLANA_CALENDAR_EMBED_URL)
  ? `${SOLANA_CALENDAR_EMBED_URL}${SOLANA_CALENDAR_EMBED_URL.includes('?') ? '&' : '?'}theme=light`
  : SOLANA_CALENDAR_EMBED_URL;
import { safeListingImageUrl } from './lib/listing-images';
import { formatUsdc } from './lib/money';
import { verifiedHandle, xHandleFor } from './lib/x-profile';
import './events.css';

function EventCard({ event, index }: { event: SolanaEvent; index: number }) {
  const [coverFailed, setCoverFailed] = useState(false);
  return <article className={`se-event se-event-${index + 1}`} aria-labelledby={`event-${event.id}`}>
    <a className="se-event-cover" href={event.registrationUrl} target="_blank" rel="noopener noreferrer" aria-label={`${event.title}: open official event page`}>
      {coverFailed ? <span className="se-cover-fallback" role="img" aria-label={`Official artwork for ${event.title} is unavailable. Open the event page for details.`}><ImagePlus size={30} strokeWidth={1.3} /><small>OFFICIAL ARTWORK</small><small>UNAVAILABLE</small></span> : <img src={event.coverUrl} alt="" width="600" height="600" loading="lazy" decoding="async" onError={() => setCoverFailed(true)} />}
    </a>
    <div className="se-event-content">
      <div className="se-event-topline"><span className="se-kicker">{event.kind}</span><span className="se-event-index" aria-hidden="true">0{index + 1}</span></div>
      <h3 id={`event-${event.id}`}>{event.displayTitle.split('\n').map((line, lineIndex) => <span key={line}>{lineIndex > 0 && <br />}{line}</span>)}</h3>
      <p className="se-event-description">{event.description}</p>
      <div className="se-event-details">
        <span><CalendarDays size={16} aria-hidden="true" /><time dateTime={event.startAt}>{event.dateLabel}</time></span>
        <span><MapPin size={16} aria-hidden="true" />{event.venue} · {event.city}</span>
      </div>
      <div className="se-event-actions">
        <a className="se-button se-button-dark" href={event.registrationUrl} target="_blank" rel="noopener noreferrer">{event.registrationLabel}<ArrowUpRight size={19} aria-hidden="true" /></a>
        <a className="se-source-link" href={event.sourceUrl} target="_blank" rel="noopener noreferrer">Official details<ArrowUpRight size={13} aria-hidden="true" /></a>
      </div>
    </div>
    <div className="se-date-strip" aria-hidden="true"><strong>{event.dateNumerals}</strong><span>November<br />2026</span></div>
  </article>;
}

interface EventOfferActions {
  listings: Listing[];
  profiles: Profile[];
  onOpen: (listing: Listing) => void;
  onCreateForEvent: (eventId: string) => void;
  onBrowseEvent: (eventId: string) => void;
}

function AttendeeOfferCard({ listing, profile, now, onOpen }: { listing: Listing; profile?: Profile; now: number; onOpen: (listing: Listing) => void }) {
  const image = safeListingImageUrl(profile?.imageUrl) || safeListingImageUrl(listing.imageUrl);
  const [failed, setFailed] = useState<string | null>(null);
  const name = profile?.name || listing.publisher;
  const state = availability(listing, now);
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault(); onOpen(listing);
  };
  return <article className="se-attendee-card"><a href={listingPath(listing)} onClick={open}>
    <div className="se-attendee-photo">{image && failed !== image ? <img src={image} alt="" loading="lazy" decoding="async" onError={() => setFailed(image)} /> : <span role="img" aria-label="Offer image unavailable"><ImagePlus size={25} strokeWidth={1.3} /></span>}</div>
    <div className="se-attendee-content"><div className="se-attendee-name"><span>{name}</span><ArrowRight size={16} aria-hidden="true" /></div>{(verifiedHandle(listing) || xHandleFor(profile)) && <span className="se-attendee-x"><strong>X</strong> @{verifiedHandle(listing) || xHandleFor(profile)}</span>}<h4>{listing.title}</h4><span className="se-attendee-dates"><CalendarDays size={12} aria-hidden="true" />{activationDates(listing)}</span><span className="se-attendee-availability">{state.label}</span><span className="se-attendee-price"><strong>{formatUsdc(listing.priceMicro)}</strong> USDC</span></div>
  </a></article>;
}

function EventAdSpaces({ event, listings, profiles, now, onOpen, onCreateForEvent, onBrowseEvent }: EventOfferActions & { event: SolanaEvent; now: number }) {
  const offers = eventOffersFor(event, listings, now);
  return <section className="se-attendees" aria-labelledby={`attendees-${event.id}`}><div className="se-attendees-heading"><div><p className="se-kicker"><Users size={14} aria-hidden="true" />People going / ad space available</p><h4 id={`attendees-${event.id}`}>TAKE YOUR BRAND WITH THEM.</h4></div>{offers.length > 0 && <button className="se-attendee-browse" type="button" onClick={() => onBrowseEvent(event.id)}>View all {offers.length} {offers.length === 1 ? 'offer' : 'offers'} <ArrowRight size={16} aria-hidden="true" /></button>}</div>
    {offers.length > 0 ? <><div className="se-attendee-grid">{offers.slice(0, 3).map(listing => <AttendeeOfferCard key={listing.id} listing={listing} profile={eventOfferProfile(listing, profiles)} now={now} onOpen={onOpen} />)}</div><div className="se-attendee-footer"><p>Self-declared attendance · Independent offers · USDC escrow</p><button className="se-attendee-browse" type="button" onClick={() => onCreateForEvent(event.id)}>I’ll be there — list my space <Plus size={15} aria-hidden="true" /></button></div></> : <div className="se-attendees-empty"><div><strong>No creators have published ad space for this event yet.</strong><p>Going? Add your dates and the space you can offer. Regular people are welcome.</p></div><button type="button" className="se-button se-button-dark" onClick={() => onCreateForEvent(event.id)}>I’ll be there — list my space <Plus size={16} aria-hidden="true" /></button></div>}
    <p className="se-attendance-note">Attendance is declared by the person publishing the offer. It does not confirm registration or an official event partnership.</p>
  </section>;
}

export default function SolanaEvents({ listings, profiles, onOpen, onCreateForEvent, onBrowseEvent, onSuggestEvent }: EventOfferActions & { onSuggestEvent: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [calendarLoaded, setCalendarLoaded] = useState(false);
  const [calendarFailed, setCalendarFailed] = useState(false);
  const [calendarSlow, setCalendarSlow] = useState(false);
  const [calendarUnlocked, setCalendarUnlocked] = useState(false);
  const showCalendarFallback = !calendarLoaded && (calendarSlow || calendarFailed);
  const events = upcomingSolanaEvents(now);
  const hasHackerHouse = events.some(event => event.id === 'london-hacker-house-2026');

  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, []);

  useEffect(() => {
    if (calendarLoaded || calendarFailed) return;
    const timer = window.setTimeout(() => setCalendarSlow(true), 15_000);
    return () => window.clearTimeout(timer);
  }, [calendarLoaded, calendarFailed]);

  return <div className="solana-events" id="solana-events">
    <header className="se-hero">
      <div className="se-hero-top"><p className="se-kicker"><span className="se-dot" />Ad Pad community board</p><a href={SOLANA_EVENTS_URL} target="_blank" rel="noopener noreferrer">Solana’s official events<ArrowUpRight size={16} aria-hidden="true" /></a></div>
      <div className="se-hero-main">
        <div><h1>Good things<br />happen <span><bright-text color="#d9fc4b" intensity="10">IRL.</bright-text></span></h1><p className="se-hero-copy">Find people headed to the room.<br />Sponsor their shirt, hat, post, sign, or side quest.</p></div>
        <div className="se-hero-side"><a className="se-button se-button-lime" href="#solana-calendar">Explore the calendar<ArrowDown size={19} aria-hidden="true" /></a></div>
      </div>
      <div className="se-hero-bottom"><span>Builders. Creators. Community.</span><span>Independent ad space around Solana events.</span></div>
    </header>

    {events.length > 0 && <section className="se-featured" id="featured-events" aria-labelledby="se-featured-heading">
      <div className="se-section-heading"><div><p className="se-kicker">Put London on the calendar</p><h2 id="se-featured-heading">{hasHackerHouse ? 'First, we build.' : 'The next stop.'}<br /><span>{hasHackerHouse ? 'Then, we meet.' : 'London.'}</span></h2></div><p>{hasHackerHouse && <>Hacker House leads the way.{' '}<br /></>}Breakpoint brings us together.</p></div>
      <div className="se-event-list">{events.map((event, index) => <div className="se-event-group" key={event.id}><EventCard event={event} index={index} /><EventAdSpaces event={event} listings={listings} profiles={profiles} now={Math.floor(now / 1000)} onOpen={onOpen} onCreateForEvent={onCreateForEvent} onBrowseEvent={onBrowseEvent} /></div>)}</div>
      <p className="se-event-footnote">Dates and venues are from Solana’s official announcements. Check each event page for the latest details and entry requirements.</p>
    </section>}

    <section className="se-calendar-section" id="solana-calendar" aria-labelledby="se-calendar-heading">
      <div className="se-calendar-intro"><p className="se-kicker"><span className="se-dot" />From Solana’s Luma</p><h2 id="se-calendar-heading">Find your{' '}<br />next <span>room.</span></h2><p>Browse Solana’s official calendar for the next meetup, workshop, or gathering. Event details and registration live with the organizers.</p><a className="se-button se-button-dark" href={SOLANA_CALENDAR_URL} target="_blank" rel="noopener noreferrer">Open Solana on Luma<ArrowUpRight size={18} aria-hidden="true" /></a><a className="se-source-link" href={SOLANA_EVENTS_URL} target="_blank" rel="noopener noreferrer">More events on solana.com<ArrowUpRight size={13} aria-hidden="true" /></a><div className="se-calendar-note"><CalendarDays size={23} aria-hidden="true" /><span>The calendar is maintained by Solana.<br />Ad Pad helps you find it.</span></div></div>
      <div className="se-calendar-panel">
        <div className="se-calendar-bar"><span>Solana / Upcoming events</span><a href={SOLANA_CALENDAR_URL} target="_blank" rel="noopener noreferrer" aria-label="Open Solana calendar in a new tab"><ArrowUpRight size={19} /></a></div>
        <div className={`se-calendar-frame${showCalendarFallback ? ' se-calendar-compact' : ''}`}>
          {!calendarLoaded && !showCalendarFallback && <p className="se-calendar-loading" role="status">Loading Solana’s calendar…</p>}
          {showCalendarFallback && <div className="se-calendar-direct" role="status"><span className="se-calendar-direct-icon" aria-hidden="true"><CalendarDays size={27} /></span><h3>Open the live<br />Solana calendar.</h3><p>The embedded view hasn’t loaded here. Browse upcoming events and registration directly on Solana’s Luma page.</p><a className="se-button se-button-dark" href={SOLANA_CALENDAR_URL} target="_blank" rel="noopener noreferrer">View upcoming events<ArrowUpRight size={18} aria-hidden="true" /></a></div>}
          {/* A cross-origin load event only hides the loading cue; it cannot verify calendar contents. */}
          <iframe src={calendarEmbedUrl} title="Solana’s official upcoming events calendar on Luma" width="100%" height="640" loading="eager" aria-hidden={showCalendarFallback || undefined} tabIndex={showCalendarFallback ? -1 : 0} onLoad={() => { setCalendarLoaded(true); setCalendarFailed(false); }} onError={() => setCalendarFailed(true)} />
          {/* The overlay keeps the page scroll free until clicked; Luma captures the wheel otherwise. */}
          {!showCalendarFallback && !calendarUnlocked && <button type="button" className="se-calendar-scroll-lock" onClick={() => setCalendarUnlocked(true)}><span>Click to scroll the calendar</span></button>}
        </div>
        <p className="se-calendar-fallback">Calendar not displaying? <a href={SOLANA_CALENDAR_URL} target="_blank" rel="noopener noreferrer">Open it on Luma<ArrowUpRight size={12} aria-hidden="true" /></a></p>
      </div>
    </section>

    <aside className="se-community-note"><div className="se-community-symbol" aria-hidden="true">↗</div><div><p className="se-kicker">Already planning to go?</p><h2>Your event.<br />Their next ad space.</h2><p>Wear agreed merch, offer a placement, and get paid after approved proof. Choose the event you’ll attend and publish a clear offer.</p></div><div className="se-community-actions">{events.length > 0 ? <><button type="button" className="se-button se-button-dark" onClick={() => onCreateForEvent(events[0].id)}>List for {events[0].displayTitle.split('\n')[0]}<ArrowRight size={19} aria-hidden="true" /></button><a className="se-button se-button-outline" href="#featured-events">Choose another event<ArrowRight size={17} aria-hidden="true" /></a></> : <a className="se-button se-button-dark" href="#solana-calendar">Find your next event<ArrowRight size={19} aria-hidden="true" /></a>}</div></aside>
    <section className="se-suggest-event"><div><p className="se-kicker">HELP THE COMMUNITY FIND IT</p><h2>GET YOUR EVENT LISTED HERE.</h2><p>Have a Solana meetup, workshop, or gathering? Share the public event link or Luma page for review.</p></div><button type="button" className="se-button se-button-dark" onClick={onSuggestEvent}>Suggest an event <ArrowRight size={18} /></button></section>
    <p className="se-independent-note">An independent community resource from Ad Pad, made to help more people discover Solana. Event organizers manage their own events and registrations.</p>
  </div>;
}
