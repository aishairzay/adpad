import { useEffect, useId, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, AtSign, CalendarDays, Check, CheckCircle2, ChevronDown, Copy, Download, ExternalLink, Globe2, ImagePlus, Link2, LockKeyhole, MapPin, Package, Plus, Search, Shirt, Users } from 'lucide-react';
import type { Deal, Listing, Profile } from './types';
import { formatUsdc } from './lib/money';
import { isCommunityListing, linkedCommunityActivity } from './lib/community';
import { safeListingImageUrl } from './lib/listing-images';
import { activationDates, availability, eventLabel, listingPath, profilePath, safePublicUrl } from './lib/sponsorship';
import { CategoryIcon } from './lib/category-icon';
import { FEATURED_SOLANA_EVENTS } from './solana-events';
import { eventOffersFor } from './lib/event-offers';
import { isXProfileUrl, normalizeXHandle, normalizeXPostUrl, verifiedHandle, xHandleFor, xProfileUrl } from './lib/x-profile';
import { PoweredByOpenApps } from './Branding';
import './sponsorship.css';

const CANONICAL_ORIGIN = 'https://adpad.fyi';
const BADGE_PATH = '/badges/ad-pad-sponsor.svg';
const shortWallet = (wallet: string) => wallet.length > 13 ? `${wallet.slice(0, 5)}…${wallet.slice(-4)}` : wallet;
const displayDate = (timestamp?: number | null) => timestamp && Number.isFinite(timestamp) ? new Date(timestamp * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null;
const personFor = (listing: Listing, profiles: Profile[]) => profiles.find(profile => profile.owner === listing.owner || profile.wallet === listing.seller);
const eventKey = (listing: Listing) => listing.eventId ? `id:${listing.eventId}` : listing.eventName ? `name:${listing.eventName}` : 'unspecified';
function coversUtcDate(listing: Listing, date: string): boolean {
  if (!date) return true;
  if (!listing.startsAt || !listing.endsAt) return false;
  const start = Date.parse(`${date}T00:00:00Z`) / 1000;
  return Number.isFinite(start) && listing.startsAt <= start + 86_399 && listing.endsAt >= start;
}

function useCurrentSeconds() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { const refresh = () => setNow(Math.floor(Date.now() / 1000)); const timer = window.setInterval(refresh, 60_000); window.addEventListener('focus', refresh); return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); }; }, []);
  return now;
}

function PublicImage({ src, alt, className = '', eager = false }: { src?: string | null; alt: string; className?: string; eager?: boolean }) {
  const safe = safeListingImageUrl(src);
  const [failed, setFailed] = useState<string | null>(null);
  return safe && failed !== safe ? <img className={className} src={safe} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(safe)} /> : <div className={`sp-image-fallback ${className}`} role="img" aria-label={alt}><ImagePlus size={29} strokeWidth={1.3} /><span>YOUR SPACE.<br />THEIR BRAND.</span><small>Photo unavailable</small></div>;
}

function Price({ amount }: { amount: number }) {
  return <span className="sp-price"><strong>{formatUsdc(amount)}</strong><span>USDC</span></span>;
}

function XProfileLink({ profile, handle: listingHandle, compact = false }: { profile?: Profile; handle?: string | null; compact?: boolean }) {
  const handle = normalizeXHandle(listingHandle || '') || xHandleFor(profile);
  return handle ? <a className={`sp-x-link${compact ? ' sp-x-link-compact' : ''}`} href={xProfileUrl(handle)} target="_blank" rel="noopener noreferrer" aria-label={`${profile?.name || handle} on X`}><strong>X</strong> @{handle}<ArrowUpRight size={compact ? 12 : 14} /></a> : null;
}

export function XProfileStrip({ profiles, listings, onProfile }: { profiles: Profile[]; listings: Listing[]; onProfile: () => void }) {
  const posts = listings.filter(listing => !listing.sample && listing.active && normalizeXPostUrl(listing.xPostUrl || '')).sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
  const profileChips = profiles.filter(profile => xHandleFor(profile)).sort((a, b) => b.updatedAt - a.updatedAt).map(profile => ({ key: profile.owner, handle: xHandleFor(profile), label: profile.profileType === 'brand' ? 'Sponsor' : 'Creator', href: profilePath(profile.owner), image: profile.imageUrl }));
  const listedChips = listings.filter(listing => !listing.sample && listing.active && verifiedHandle(listing) && !profileChips.some(chip => chip.handle.toLowerCase() === verifiedHandle(listing).toLowerCase())).sort((a, b) => b.createdAt - a.createdAt).map(listing => ({ key: listing.id, handle: verifiedHandle(listing), label: listing.kind === 'service' ? 'Creator' : 'Ad space', href: xProfileUrl(verifiedHandle(listing)), image: listing.imageUrl || '' }));
  const chips = [...profileChips, ...listedChips].slice(0, 12);
  return <section className="sp-x-discovery" aria-labelledby="sp-x-discovery-title"><div className="sp-x-discovery-heading"><div><span className="sp-x-mark" aria-hidden="true">X</span><div><span className="sp-kicker">SOCIAL / DIRECT CONNECTIONS</span><h2 id="sp-x-discovery-title">LIVE FROM X.</h2></div></div><button type="button" onClick={onProfile}>Link your X account <ArrowRight size={16} /></button></div>{posts.length > 0 && <div className="sp-x-latest"><strong>LATEST POSTS</strong><div className="sp-x-posts">{posts.map(listing => { const handle = verifiedHandle(listing) || normalizeXHandle(new URL(listing.xPostUrl!).pathname.split('/')[1] || ''); return <a key={listing.id} href={normalizeXPostUrl(listing.xPostUrl || '')} target="_blank" rel="noopener noreferrer"><span className="sp-x-mini">X</span><strong>@{handle}</strong><span>{listing.title}</span><ArrowUpRight size={14} /></a>; })}</div></div>}<div className="sp-x-new"><strong>NEW ON AD PAD</strong>{chips.length ? <div className="sp-x-profiles">{chips.map(chip => <a key={chip.key} href={chip.href} target={chip.href.startsWith('https:') ? '_blank' : undefined} rel={chip.href.startsWith('https:') ? 'noopener noreferrer' : undefined}><span className="sp-x-avatar">{chip.image ? <PublicImage src={chip.image} alt="" /> : chip.handle.slice(0, 1).toUpperCase()}</span><span><b>@{chip.handle}</b><small>{chip.label}</small></span></a>)}</div> : <p className="sp-x-empty">Creators and sponsors with verified X accounts appear here.</p>}</div></section>;
}

function handleLocalLink(event: MouseEvent<HTMLAnchorElement>, action: () => void) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault(); action();
}

function canonicalShareUrl(path: string): string {
  try {
    const url = new URL(path, CANONICAL_ORIGIN);
    if (url.origin !== CANONICAL_ORIGIN || url.username || url.password) return CANONICAL_ORIGIN;
    return url.href;
  } catch { return CANONICAL_ORIGIN; }
}

const hostnameOf = (value: string) => { try { return new URL(value).hostname.replace(/^www\./, '') || value.trim(); } catch { return value; } };
const isHttpUrl = (value: string) => { try { const url = new URL(value.trim()); return url.protocol === 'https:' || url.protocol === 'http:'; } catch { return false; } };

export function ShareTools({ path, title, label = 'Take it to your people.' }: { path: string; title: string; label?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<'link' | 'embed' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panelId = useId();
  const href = canonicalShareUrl(path);
  const embed = useMemo(() => {
    // DOM properties escape arbitrary titles and URLs before serializing the snippet.
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.setAttribute('aria-label', title);
    const badge = document.createElement('img');
    badge.src = new URL(BADGE_PATH, CANONICAL_ORIGIN).href;
    badge.alt = 'Sponsor me on Ad Pad';
    badge.width = 320;
    badge.height = 80;
    anchor.appendChild(badge);
    return anchor.outerHTML;
  }, [href, title]);
  const copy = async (kind: 'link' | 'embed') => {
    setError(null);
    try { await navigator.clipboard.writeText(kind === 'link' ? href : embed); setCopied(kind); }
    catch { setExpanded(true); setError('Select and copy the link or embed code below. Clipboard access is unavailable here.'); }
  };
  return <section className="sp-share" aria-label="Share this page">
    <div className="sp-share-top"><div><span className="sp-kicker">PASS IT ON</span><h3>{label}</h3></div><button className="sp-button sp-button-outline" type="button" onClick={() => void copy('link')}>{copied === 'link' ? <Check size={16} /> : <Link2 size={16} />}{copied === 'link' ? 'Link copied' : 'Copy link'}</button></div>
    <button className="sp-share-toggle" type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)}>Get a badge for your site or socials <ChevronDown size={15} className={expanded ? 'sp-chevron-open' : ''} /></button>
    {expanded && <div className="sp-share-panel" id={panelId}><div className="sp-badge-preview"><img src={BADGE_PATH} width="320" height="80" alt="Sponsor me on Ad Pad — downloadable badge" /><a className="sp-text-link" href={BADGE_PATH} download="ad-pad-sponsor.svg"><Download size={15} />Download SVG badge</a></div><div className="sp-embed-fields"><label><span>Public page link</span><input value={href} readOnly onFocus={event => event.currentTarget.select()} /></label><label><span>Embed this linked badge</span><textarea value={embed} rows={4} readOnly spellCheck={false} onFocus={event => event.currentTarget.select()} /></label><button className="sp-text-link" type="button" onClick={() => void copy('embed')}>{copied === 'embed' ? <Check size={14} /> : <Copy size={14} />}{copied === 'embed' ? 'Embed code copied' : 'Copy embed code'}</button><p>The embedded badge links to this page on Ad Pad. The downloaded SVG is an image; link it to your page wherever you use it.</p></div></div>}
    <span className="sp-sr-only" role="status">{copied === 'link' ? 'Page link copied to clipboard.' : copied === 'embed' ? 'Badge embed code copied to clipboard.' : ''}</span>
    {error && <p className="sp-copy-error" role="status">{error}</p>}
  </section>;
}

function ShareButton({ path, title }: { path: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const url = canonicalShareUrl(path);
  const share = async () => {
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ title, url }); return; } catch { /* visitor dismissed the share sheet */ }
    }
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* clipboard unavailable */ }
  };
  return <button className="sp-button sp-button-outline" type="button" onClick={() => void share()}>{copied ? <Check size={16} /> : <Link2 size={16} />}{copied ? 'Link copied' : 'Share'}</button>;
}

function SponsorCard({ listing, profile, completed, onOpen }: { listing: Listing; profile?: Profile; completed: number; onOpen: (listing: Listing) => void }) {
  const state = availability(listing);
  const displayName = profile?.name || listing.publisher;
  return <article className="sp-card"><a href={listingPath(listing)} className="sp-card-link" onClick={event => handleLocalLink(event, () => onOpen(listing))}>
    <div className="sp-card-photo"><PublicImage src={listing.imageUrl} alt={`${listing.title} — ${listing.sample ? 'illustrative sponsorship concept' : 'sponsorship listing photo'}`} /><span className="sp-card-category"><CategoryIcon category={listing.category} size={13} />{listing.category}</span><span className={`sp-availability ${listing.sample ? 'sp-concept-status' : state.bookable ? 'sp-is-open' : ''}`}>{listing.sample ? 'EXAMPLE / NOT BOOKABLE' : state.label}</span><span className="sp-card-arrow" aria-hidden="true"><ArrowRight size={25} /></span></div>
    <div className="sp-card-content"><div className="sp-person-line"><span>{displayName}</span><span>{listing.sample ? 'CONCEPT' : listing.bookingReady === false ? 'NOT PUBLISHED YET' : state.bookable ? 'BOOKABLE' : state.label.toUpperCase()}</span></div>{(verifiedHandle(listing) || xHandleFor(profile)) && <span className="sp-card-x"><strong>X</strong> @{verifiedHandle(listing) || xHandleFor(profile)}</span>}<h3>{listing.title}</h3><div className="sp-card-context"><span><MapPin size={13} />{eventLabel(listing)}</span><span><CalendarDays size={13} />{activationDates(listing)}</span></div><div className="sp-card-bottom"><Price amount={listing.priceMicro} /><span>{completed > 0 ? `${completed} ${completed === 1 ? 'delivery' : 'deliveries'}` : 'Terms agreed on acceptance'}</span></div></div>
  </a></article>;
}

export function SponsorCollection({ listings, socialListings = listings, deals, profiles, onOpen, onPublish, onProfile = onPublish, featured = false, onViewAll, initialEventId = '', onEventChange }: { listings: Listing[]; socialListings?: Listing[]; deals: Deal[]; profiles: Profile[]; onOpen: (listing: Listing) => void; onPublish: () => void; onProfile?: () => void; featured?: boolean; onViewAll?: () => void; initialEventId?: string; onEventChange?: (eventId: string) => void }) {
  const [query, setQuery] = useState('');
  const [event, setEvent] = useState(initialEventId ? `id:${initialEventId}` : 'any');
  const [date, setDate] = useState('');
  const [budget, setBudget] = useState('any');
  const [format, setFormat] = useState<'all' | 'x-social'>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const now = useCurrentSeconds();
  const eligible = listings.filter(listing => listing.active && listing.kind !== 'service' && (listing.sponsorship === true || listing.attendingEvent === true || Boolean(initialEventId)) && (listing.sample || isCommunityListing(listing)));
  const released = linkedCommunityActivity(listings, deals).filter(({ deal }) => deal.status === 'released');
  const events = Array.from(new Map([...FEATURED_SOLANA_EVENTS.map(item => [`id:${item.id}`, item.title] as [string, string]), ...eligible.map(listing => [eventKey(listing), eventLabel(listing)] as [string, string])]).entries()).sort((a, b) => a[1].localeCompare(b[1]));
  const selectedEvent = FEATURED_SOLANA_EVENTS.find(item => `id:${item.id}` === event);
  const eventMatches = selectedEvent ? new Set(eventOffersFor(selectedEvent, eligible, now).map(listing => listing.id)) : null;
  const filtered = eligible.filter(listing => {
    if (featured) return true;
    const profile = personFor(listing, profiles);
    const haystack = `${listing.title} ${listing.publisher} ${listing.description} ${listing.channel} ${eventLabel(listing)} ${profile?.name || ''} ${profile?.location || ''} ${verifiedHandle(listing)} ${xHandleFor(profile)}`.toLowerCase();
    return haystack.includes(query.toLowerCase().trim()) && (format === 'all' || listing.category === 'X / Social') && (event === 'any' || (eventMatches ? eventMatches.has(listing.id) : eventKey(listing) === event && listing.attendingEvent === true && !listing.sample && availability(listing, now).bookable)) && coversUtcDate(listing, date) && (budget === 'any' || listing.priceMicro <= Number(budget));
  }).sort((a, b) => Number(!b.sample && availability(b, now).bookable) - Number(!a.sample && availability(a, now).bookable) || b.createdAt - a.createdAt);
  const visible = featured ? filtered.slice(0, 3) : filtered;
  const Heading = featured ? 'h2' : 'h1';
  return <section className={`sp-collection ${featured ? 'sp-featured' : 'sp-full-collection'}`} id={featured ? 'sponsor-spotlight' : 'sponsor-collection'}>
    <header className="sp-collection-header"><div><span className="sp-kicker">REAL PEOPLE / DIRECT SPONSORSHIPS</span><Heading>SPONSOR <span>SOMEONE.</span></Heading><p>You do not need to be famous.<br /> You need a place to be, something to wear, and proof you did the work.</p></div><div className="sp-header-callout"><span className="sp-header-symbol" aria-hidden="true">↗</span><p>Your merch. Their next event.<br /><strong>Find the person who’ll wear it.</strong></p><button className="sp-button sp-button-dark" type="button" onClick={onPublish}>Become a creator <Plus size={17} /></button></div></header>
    {!featured && selectedEvent && <div className="sp-event-context"><span><MapPin size={16} /><strong>Creators at {selectedEvent.title}</strong></span><p>Available ad space from people who say they’ll be there. Attendance is self-reported.</p><a href="/events">Event details <ArrowRight size={14} /></a></div>}
    {!featured && <><XProfileStrip profiles={profiles} listings={socialListings} onProfile={onProfile} /><div className="sp-format-tabs" role="group" aria-label="Filter sponsorship formats"><button type="button" className={format === 'all' ? 'selected' : ''} aria-pressed={format === 'all'} onClick={() => setFormat('all')}>All listings</button><button type="button" className={format === 'x-social' ? 'selected' : ''} aria-pressed={format === 'x-social'} onClick={() => setFormat('x-social')}><AtSign size={15} />X / social posts</button></div></>}
    {!featured && <button type="button" className="sp-filters-toggle" aria-expanded={filtersOpen} aria-controls="sp-filters" onClick={() => setFiltersOpen(value => !value)}><span>Filters</span><ChevronDown size={15} className={filtersOpen ? 'sp-chevron-open' : ''} /></button>}{!featured && <div className={filtersOpen ? 'sp-filters sp-filters-open' : 'sp-filters'} id="sp-filters"><label className="sp-search"><Search size={18} /><input type="search" placeholder="Find a person, place, or idea" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search sponsorship listings" /></label><label className="sp-filter-field"><span>Event</span><select value={event} onChange={change => { setEvent(change.target.value); onEventChange?.(change.target.value === 'any' ? '' : change.target.value.replace(/^id:/, '')); }}><option value="any">All events & places</option>{events.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="sp-filter-field"><span>On date <span className="sp-date-zone">(UTC)</span></span><input type="date" value={date} onInput={event => setDate(event.currentTarget.value)} onChange={event => setDate(event.target.value)} aria-label="Activation on date in UTC" /></label><label className="sp-filter-field"><span>Budget</span><select value={budget} onChange={event => setBudget(event.target.value)}><option value="any">Any budget</option><option value="100000000">Up to 100 USDC</option><option value="250000000">Up to 250 USDC</option><option value="500000000">Up to 500 USDC</option><option value="1000000000">Up to 1,000 USDC</option></select></label></div>}
    <div className="sp-results-bar"><span>{String(visible.length).padStart(2, '0')} {featured ? 'IN THE SPOTLIGHT' : 'SPONSORSHIP LISTINGS'}</span>{visible.some(listing => listing.sample) && <span>EXAMPLES ARE CONCEPTS, NOT LIVE LISTINGS</span>}{featured && onViewAll && <button className="sp-text-link" type="button" onClick={onViewAll}>View {filtered.length === 1 ? '1 listing' : `all ${filtered.length} listings`} <ArrowRight size={16} /></button>}</div>
    {visible.length ? <div className="sp-offer-grid">{visible.map(listing => <SponsorCard key={listing.id} listing={listing} profile={personFor(listing, profiles)} completed={released.filter(record => record.listing.id === listing.id).length} onOpen={onOpen} />)}</div> : <div className="sp-empty"><Shirt size={33} strokeWidth={1.4} /><h3>{event !== 'any' ? 'THE FIRST SPOT IS YOURS.' : eligible.length ? 'NO MATCH. YET.' : 'BE THE FIRST FACE.'}</h3><p>{event !== 'any' ? 'No available listings match this event and your filters yet. Going? List your ad space and confirm your attendance to appear here.' : eligible.length ? 'Try another date or budget, or explore concept listings.' : 'Create a clear listing around a place you’ll be, clothing you can wear, and proof you can share.'}</p><button className="sp-button sp-button-dark" type="button" onClick={onPublish}>Become a creator <Plus size={17} /></button></div>}
  </section>;
}

const CLOTHING = {
  sponsor: { title: 'THE SPONSOR SUPPLIES IT.', body: 'The sponsor provides the agreed merch. Confirm the size, handover or shipping, and any delivery costs in the terms.' },
  creator: { title: 'CUSTOM-MADE, AS AGREED.', body: 'The wearer arranges the custom branded clothing. Agree on the artwork, production, costs, and approval before work starts.' },
  existing: { title: 'ALREADY IN THE WARDROBE.', body: 'The wearer uses clothing or gear they already have. The sponsor must approve the exact item and branding in the agreement.' },
};

function DeliveryHistory({ deals, profiles = [], title = 'THE WORK, ON RECORD.', perspective = 'seller' }: { deals: Deal[]; profiles?: Profile[]; title?: string; perspective?: 'seller' | 'buyer' }) {
  return <section className="sp-delivery-history"><div className="sp-history-heading"><span className="sp-kicker">PUBLIC DELIVERY HISTORY</span><h2>{title}</h2><p>Completed escrow records only.</p></div>{deals.length ? <div className="sp-history-list">{deals.map(deal => {
    const counterpartWallet = perspective === 'buyer' ? deal.seller : deal.buyer;
    const counterpart = profiles.find(profile => profile.wallet === counterpartWallet);
    const proof = safePublicUrl(deal.proofUrl);
    return <article className="sp-history-item" key={deal.id}><span className="sp-history-check" aria-hidden="true"><CheckCircle2 size={22} /></span><div><span className="sp-kicker">COMPLETED DELIVERY</span><h3>{deal.headline}</h3>{deal.settledAt && <time className="sp-history-date" dateTime={new Date(deal.settledAt * 1000).toISOString()}>Completed {displayDate(deal.settledAt)}</time>}<p>{perspective === 'buyer' ? 'Delivered by' : deal.listingKind === 'service' ? 'Client' : 'Sponsor'}: {counterpart ? <a href={profilePath(counterpart.owner)}>{counterpart.name}</a> : <span title={counterpartWallet}>Wallet {shortWallet(counterpartWallet)}</span>}</p>{deal.proofNote && <p className="sp-history-note">{deal.proofNote}</p>}</div>{proof ? <a className="sp-text-link" href={proof} target="_blank" rel="noopener noreferrer">View public proof <ExternalLink size={14} /></a> : <span className="sp-history-unavailable">No public proof link</span>}</article>;
  })}</div> : <div className="sp-history-empty"><CheckCircle2 size={23} strokeWidth={1.4} /><p>No completed deliveries to show yet.</p><span>Approved work appears here once its escrow payment is released.</span></div>}</section>;
}

export function OfferDetail({ listing, profile, profiles = [], deals, onBook, onProfile, onBack, isOwner = false }: { listing: Listing; profile?: Profile; profiles?: Profile[]; deals: Deal[]; onBook: () => void; onProfile: () => void; onBack: () => void; isOwner?: boolean }) {
  const now = useCurrentSeconds();
  const state = availability(listing, now);
  const clothing = listing.clothingSource ? CLOTHING[listing.clothingSource] : null;
  const publicProfile = profile || personFor(listing, profiles);
  const completed = linkedCommunityActivity([listing], deals).filter(({ deal }) => deal.status === 'released').map(({ deal }) => deal);
  const supplyDate = displayDate(listing.supplyBy);
  const profileName = publicProfile?.name || listing.publisher;
  return <div className="sp-offer-detail"><button className="sp-back" type="button" onClick={onBack}><ArrowLeft size={15} />Back to the marketplace</button><div className="sp-detail-layout"><div className="sp-detail-photo"><PublicImage src={listing.imageUrl} alt={`${listing.title} — ${listing.sample ? 'illustrative concept' : 'listing photo'}`} eager /><span className="sp-detail-photo-label">{listing.sample ? 'INDEPENDENT CONCEPT / NOT BOOKABLE' : `${listing.category} / ${availability(listing).bookable ? 'BOOKABLE' : availability(listing).label.toUpperCase()}`}</span><span className="sp-photo-mark" aria-hidden="true"><img src="/brand/adpad-symbol.png" width={280} height={269} alt="" /><PoweredByOpenApps inverse /></span></div><div className="sp-detail-main"><span className="sp-kicker">{listing.sponsorship ? 'SPONSOR THIS PERSON' : listing.kind === 'service' ? 'WORK WITH A CREATOR' : 'A SPACE TO SPONSOR'}</span><h1>{listing.title}</h1><div className="sp-detail-person">{publicProfile ? <a href={profilePath(publicProfile.owner)} onClick={event => handleLocalLink(event, onProfile)}><span className="sp-person-initial">{profileName.slice(0, 1).toUpperCase()}</span><span>Offered by <strong>{profileName}</strong></span><ArrowRight size={16} /></a> : <span>Offered by <strong>{profileName}</strong></span>}{listing.sample && <span className="sp-example-tag">EXAMPLE</span>}</div>{(verifiedHandle(listing) || xHandleFor(publicProfile)) && <XProfileLink profile={publicProfile} handle={verifiedHandle(listing)} />}{normalizeXPostUrl(listing.xPostUrl || '') && <a className="sp-x-post-link" href={normalizeXPostUrl(listing.xPostUrl || '')} target="_blank" rel="noopener noreferrer"><strong>X</strong> View the related post <ArrowUpRight size={15} /></a>}<p className="sp-description">{listing.description}</p><dl className="sp-detail-facts"><div><dt><MapPin size={15} />EVENT / LOCATION</dt><dd>{eventLabel(listing)}</dd></div><div><dt><CalendarDays size={15} />WHEN</dt><dd>{activationDates(listing)}</dd></div><div><dt><Users size={15} />AVAILABILITY</dt><dd>{listing.sample ? 'Illustrative concept — not bookable' : state.label}</dd></div></dl><div className="sp-booking-box"><div><span className="sp-kicker">THE AGREED TERMS</span><Price amount={listing.priceMicro} /></div><button type="button" className="sp-button sp-button-dark" disabled={listing.sample || !state.bookable} onClick={onBook}>{listing.sample ? 'Example — not bookable' : state.bookable ? listing.kind === 'service' ? 'Book this creator' : 'Sponsor this spot' : state.label}{!listing.sample && state.bookable && <ArrowRight size={19} />}</button><p><LockKeyhole size={14} />Payment waits in escrow until the AdPad agent checks the public proof.</p><small><a className="how-link" href="/how-it-works">How payment works</a></small></div></div></div>
    <div className="sp-detail-body"><section className="sp-deliverables"><span className="sp-kicker">EXACTLY WHAT YOU’RE AGREEING TO</span><h2>THE DEAL.<br /><span>IN BLACK & WHITE.</span></h2><div className="sp-deliverables-copy"><h3>Deliverables & public proof</h3><p>{listing.deliverables}</p><div className="sp-audience"><span>{listing.kind === 'service' ? 'WHO IT REACHES' : 'WHO WILL SEE IT'} (IN THE CREATOR’S WORDS)</span><p>{listing.audience}</p><small>This description is supplied by the person making the listing.</small></div></div></section>{listing.clothingSource && <section className="sp-clothing"><div className="sp-clothing-icon"><Package size={30} strokeWidth={1.4} /></div><div><span className="sp-kicker">WHO BRINGS THE MERCH?</span><h2>{clothing?.title || 'GET THE SUPPLY PLAN CLEAR.'}</h2><p>{clothing?.body || 'Agree who supplies or prepares the clothing before the listing is accepted.'}</p>{listing.clothingDetails && <div className="sp-clothing-details"><h3>Clothing & handover details</h3><p>{listing.clothingDetails}</p></div>}{supplyDate && <span className="sp-supply-date"><CalendarDays size={14} />Clothing needed by {supplyDate}</span>}</div></section>}</div>
    <DeliveryHistory deals={completed} profiles={profiles} />
    {isOwner ? <ShareTools path={listingPath(listing)} title={`${listing.title} — Ad Pad`} label="Let the right sponsor find you." /> : <ShareButton path={listingPath(listing)} title={`${listing.title} — Ad Pad`} />}
    {listing.sample && <p className="sp-concept-note">An independent concept. The imagery, person, price, and placement are illustrative. No event partnership or actual availability is implied.</p>}
  </div>;
}

export function PersonProfile({ profile, profiles = [], listings, deals, onOpen, onEdit }: { profile: Profile; profiles?: Profile[]; listings: Listing[]; deals: Deal[]; onOpen: (listing: Listing) => void; onEdit?: () => void }) {
  const [kind, setKind] = useState<'all' | 'placement' | 'service'>('all');
  const isBrand = profile.profileType === 'brand';
  const ownListings = listings.filter(listing => listing.owner === profile.owner && (listing.sample || isCommunityListing(listing)));
  const isConcept = ownListings.length > 0 && ownListings.every(listing => listing.sample);
  const released = linkedCommunityActivity(listings, deals).filter(({ deal }) => deal.status === 'released');
  const sellerActivity = released.filter(({ deal, listing }) => deal.seller === profile.wallet && listing.owner === profile.owner);
  // Every paid booking on AdPad is a sponsorship of the creator's space or service, so all of them count here.
  const buyerSponsorships = released.filter(({ deal }) => deal.buyer === profile.wallet);
  const sellerCompleted = sellerActivity.map(({ deal }) => deal);
  const completed = isBrand ? buyerSponsorships.map(({ deal }) => deal) : sellerCompleted;
  const currentListings = ownListings.filter(listing => listing.active);
  const relationships = isBrand ? buyerSponsorships : sellerActivity;
  const relationshipWallets = Array.from(new Set(relationships.map(({ deal }) => isBrand ? deal.seller : deal.buyer)));
  const shown = currentListings.filter(listing => kind === 'all' || (listing.kind || 'placement') === kind);
  const website = safePublicUrl(profile.website);
  const social = safePublicUrl(profile.socialUrl);
  return <div className="sp-person-profile"><header className="sp-profile-hero"><div className="sp-profile-image"><PublicImage src={profile.imageUrl || ownListings.find(listing => listing.imageUrl)?.imageUrl} alt={`${profile.name} — ${isConcept ? 'illustrative concept profile image' : 'public profile image'}`} eager /><span className="sp-profile-image-label">{isConcept ? 'ILLUSTRATIVE PROFILE / NOT A REAL LISTING' : isBrand ? 'SPONSOR PROFILE' : 'ONE PERSON. MANY POSSIBILITIES.'}</span></div><div className="sp-profile-intro"><div className="sp-profile-topline"><span className="sp-kicker">{isConcept ? 'AN INDEPENDENT CONCEPT PROFILE' : isBrand ? 'THE SPONSOR / THE PEOPLE IT BACKS' : 'THE PERSON / THE POSSIBILITIES'}</span>{onEdit && <button type="button" className="sp-text-link" onClick={onEdit}>Edit profile <ArrowRight size={14} /></button>}</div><h1>{profile.name}</h1>{profile.location && (isHttpUrl(profile.location) ? <a className="sp-profile-location" href={profile.location.trim()} target="_blank" rel="noopener noreferrer"><Globe2 size={15} />{hostnameOf(profile.location)}</a> : <span className="sp-profile-location"><MapPin size={15} />{profile.location}</span>)}{profile.bio ? <p className="sp-profile-bio">{profile.bio}</p> : onEdit && <p className="sp-profile-bio sp-profile-bio-empty">Add a bio so sponsors know you.</p>}{isConcept && <div className="sp-profile-concept-notice"><span>ILLUSTRATIVE PROFILE</span><p>The name, imagery, and listings are examples of what is possible. This is not a real person’s availability or an active sponsorship relationship.</p></div>}<div className="sp-profile-socials">{xHandleFor(profile) && <XProfileLink profile={profile} />}{website && <a href={website} target="_blank" rel="noopener noreferrer"><Globe2 size={15} />{hostnameOf(website)} <ArrowUpRight size={15} /></a>}{social && !isXProfileUrl(social) && <a href={social} target="_blank" rel="noopener noreferrer"><Link2 size={15} />Other social profile <ArrowUpRight size={15} /></a>}</div><div className="sp-profile-summary"><span><strong>{currentListings.length}</strong>{isConcept ? currentListings.length === 1 ? 'example listing' : 'example listings' : currentListings.length === 1 ? 'public listing' : 'public listings & services'}</span>{!isConcept && <span><strong>{completed.length}</strong>{isBrand ? `completed ${completed.length === 1 ? 'sponsorship' : 'sponsorships'}` : `completed ${completed.length === 1 ? 'delivery' : 'deliveries'}`}</span>}</div><p className="sp-profile-disclosure">{isConcept ? 'Concept listings cannot be booked. No event partnership or real-world results are implied.' : isBrand ? 'Sponsor information is self-reported. Sponsorship history includes listings funded by this wallet and completed through escrow.' : 'Profile information is self-reported. Delivery records below come from completed AdPad campaigns.'}</p></div></header>
    <section className="sp-profile-offers"><div className="sp-section-topline"><div><span className="sp-kicker">ONE IDENTITY. EVERY KIND OF LISTING.</span><h2>{isConcept ? 'THE CONCEPT LISTINGS.' : isBrand ? 'OUR PUBLIC LISTINGS.' : 'HERE’S WHAT I DO.'}</h2></div><div className="sp-kind-tabs" role="group" aria-label="Filter this profile’s listings">{(['all', 'placement', 'service'] as const).map(value => <button type="button" key={value} className={kind === value ? 'selected' : ''} aria-pressed={kind === value} onClick={() => setKind(value)}>{value === 'all' ? 'Everything' : value === 'placement' ? 'Ad spaces' : 'Creator services'}</button>)}</div></div>{shown.length ? <div className="sp-offer-grid">{shown.map(listing => <SponsorCard key={listing.id} listing={listing} profile={profile} completed={sellerCompleted.filter(deal => deal.listingId === listing.id).length} onOpen={onOpen} />)}</div> : <div className="sp-profile-empty"><Plus size={27} strokeWidth={1.3} /><p>{currentListings.length ? 'No listings in this category yet.' : 'No public listings yet. A new possibility starts here.'}</p></div>}</section>
    <section className="sp-past-sponsors"><div><span className="sp-kicker">FROM COMPLETED BOOKINGS</span><h2>{isBrand ? 'PEOPLE WE’VE SPONSORED.' : 'PAST SPONSORS.'}</h2><p>{isBrand ? 'Actual completed buyer sponsorships on AdPad. Names appear only for matching public profiles.' : 'Recorded activity. Names appear when a matching public profile exists.'}</p></div>{relationshipWallets.length ? <div className="sp-sponsor-list">{relationshipWallets.map(wallet => {
      const counterpart = profiles.find(candidate => candidate.wallet === wallet);
      return counterpart ? <a className="sp-sponsor-chip" href={profilePath(counterpart.owner)} key={wallet}><span>{counterpart.name.slice(0, 1).toUpperCase()}</span><div><strong>{counterpart.name}</strong><small>{counterpart.profileType === 'brand' ? 'Sponsor' : isBrand ? 'Creator' : 'Sponsor'} · Collaboration</small></div><ArrowRight size={17} /></a> : <div className="sp-sponsor-chip" key={wallet}><span><Users size={20} /></span><div><strong title={wallet}>Wallet {shortWallet(wallet)}</strong><small>{isBrand ? 'Sponsored wallet' : 'Sponsor'} · No public profile</small></div></div>;
    })}</div> : <p className="sp-no-sponsors">{isBrand ? 'No completed buyer sponsorships to show yet.' : 'No completed sponsorships to show yet.'}</p>}</section>
    <DeliveryHistory deals={completed} profiles={profiles} perspective={isBrand ? 'buyer' : 'seller'} title={isBrand ? 'SPONSORSHIPS, DELIVERED.' : 'PROOF BEHIND THE PROFILE.'} />
    {onEdit ? <ShareTools path={profilePath(profile.owner)} title={`${profile.name} — Ad Pad`} label={isBrand ? 'Share the people you back.' : 'One link. Every possibility.'} /> : <ShareButton path={profilePath(profile.owner)} title={`${profile.name} — Ad Pad`} />}
  </div>;
}
