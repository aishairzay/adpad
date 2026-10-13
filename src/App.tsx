import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, AudioLines, CalendarDays, Check, ChevronDown, Copy, CircleHelp, Clock3, Globe2, ImagePlus, LayoutGrid, LoaderCircle, Menu, LockKeyhole, Mail, Pencil, MapPin, Megaphone, MessageCircle, Plus, Search, ShieldCheck, Shirt, Sparkles, Trash2, Users, Wallet, X } from 'lucide-react';
import { useAdPad } from './lib/useAdPad';
import { formatUsdc } from './lib/money';
import { safeListingImageUrl } from './lib/listing-images';
import SolanaEvents from './SolanaEvents';
import { OfferDetail, PersonProfile, XProfileStrip } from './Sponsorship';
import CommunityPage from './Community';
import ProfileEditor from './ProfileEditor';
import HowItWorksPage from './HowItWorksPage';
import ListingForm from './ListingForm';
import EventSuggestionForm from './EventSuggestionForm';
import BuyAttention from './BuyAttention';
import AskAdpad, { AskButton } from './AskAdpad';
import type { AskAction } from './AskAdpad';
import { BrandLockup } from './Branding';
import { verifiedHandle } from './lib/x-profile';
import { XLinkPrompt, XLinkStatus } from './XLink';
import { APP_ID } from './config';
import { activationDates, availability, canEditListing, eventLabel, fallbackProfile, listingPath, profilePath } from './lib/sponsorship';
import { FEATURED_SOLANA_EVENTS } from './solana-events';
import { isCommunityListing } from './lib/community';
import { SponsorDealCard } from './SponsorDeals';
import { CallsPage, PostCallForm } from './SponsorCalls';
import type { SponsorCall } from './lib/sponsor-calls';
import { DealEmails } from './DealEmails';
import type { SponsorDeal } from './lib/sponsor-deals';
import { readWalletBalance } from './lib/wallet-balance';
import type { WalletBalance } from './lib/wallet-balance';
import { CategoryIcon, dayCount } from './lib/category-icon';
import { CATEGORIES, SERVICE_CATEGORIES } from './types';
import type { AdPadModel, Listing, ListingKind } from './types';
import { UsdcBalanceCheck } from './AddUsdc';
import { SendUsdc } from './SendUsdc';
import './launchpass.css';

type Page = 'Browse' | 'For creators' | 'Calls' | 'Solana events' | 'My campaigns' | 'My listings' | 'Offer' | 'Person' | 'Brands' | 'Insights' | 'Inspiration' | 'How it works' | 'Ask';
type Modal = { type: 'publish'; kind?: ListingKind; sponsorship?: boolean; eventId?: string; agent?: boolean } | { type: 'edit'; listing: Listing } | { type: 'delete'; listing: Listing } | { type: 'booking'; listing: Listing; brief?: string } | { type: 'account' } | { type: 'profile' } | { type: 'event-suggestion' } | { type: 'buy' } | { type: 'post-call' } | null;
const shortAddress = (address: string) => `${address.slice(0, 5)}…${address.slice(-4)}`;
const hasPendingEdit = (listing: Listing) => { try { return Boolean(localStorage.getItem(`adpad:edit:${APP_ID}:${listing.id}`)); } catch { return false; } };
const hasPendingReplacement = (listing: Listing) => { try { return Boolean(localStorage.getItem(`adpad:replace:${APP_ID}:${listing.id}`) || sessionStorage.getItem(`adpad:replacement-draft:${APP_ID}:${listing.id}`)); } catch { return false; } };
const canReplaceLegacyListing = (listing: Listing) => !listing.sample && !listing.deleted && listing.everFunded !== true && (listing.editVersion !== 1 || listing.everFunded == null);

function ChannelIcon({ category, size = 18 }: { category: string; size?: number }) {
  const Icon = category === 'Event' ? CalendarDays : category === 'T-shirts' || category === 'Hats' ? Shirt : category === 'Other' ? Sparkles : category === 'Newsletter' ? Mail : category === 'X / Social' ? MessageCircle : category === 'Podcast' ? AudioLines : category === 'Community' ? Users : Globe2;
  return <Icon size={size} strokeWidth={1.7} />;
}

function PlacementImage({ src, alt, className = '', eager = false }: { src?: string | null; alt: string; className?: string; eager?: boolean }) {
  const safe = safeListingImageUrl(src);
  const [failed, setFailed] = useState<string | null>(null);
  return safe && failed !== safe ? <img src={safe} alt={alt} className={className} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(safe)} /> : <div className={`image-fallback ${className}`} role="img" aria-label={alt}><ImagePlus size={28} strokeWidth={1} /><span>THE NEXT<br />GREAT SPACE.</span><small>Image unavailable</small></div>;
}

function Usdc({ amount, large = false }: { amount: number; large?: boolean }) {
  return <span className={`usdc-value ${large ? 'large' : ''}`}><span className="coin" aria-hidden="true">$</span><strong>{formatUsdc(amount)}</strong><span className="currency">USDC</span></span>;
}

function Dialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const targets = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') || []).filter((node) => !node.matches(':disabled') && node.getClientRects().length > 0);
      if (!targets.length) { event.preventDefault(); return; }
      const first = targets[0]; const last = targets[targets.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = bodyOverflow; document.removeEventListener('keydown', keydown); before?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className={`dialog ${wide ? 'wide' : ''}`} ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><header className="dialog-header"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={21} /></button></header>{children}</div></div>;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function AccountPanel({ model }: { model: AdPadModel }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [balanceNonce, setBalanceNonce] = useState(0);
  const address = model.user?.address;
  const [balance, setBalance] = useState<WalletBalance | null | undefined>(undefined);
  useEffect(() => { let live = true; if (address) void readWalletBalance(address).then((value) => { if (live) setBalance(value); }); return () => { live = false; }; }, [address, balanceNonce]);
  return <div className="dialog-content">
    <p className="form-intro">{model.user?.email || 'Your signed-in account'} · {model.isAdmin ? 'AdPad team account' : 'Member'}</p>
    <XLinkStatus model={model} unlink />
    <div className="field"><span>Your wallet address</span>{address ? <div className="wallet-address-row"><code className="wallet-address" title={address}>{address}</code><button type="button" className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(address); setCopied(true); setCopyError(false); } catch { setCopyError(true); } }}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy'}</button></div> : <p className="muted">Wallet setup is still in progress. Complete sign-in and refresh.</p>}</div>
    {copyError && <p className="muted">Select the address above to copy it manually.</p>}
    {address && <div className="wallet-balances"><div><span className="eyebrow">USDC</span><strong>{balance === undefined ? '…' : balance ? balance.usdc.toLocaleString('en-US', { maximumFractionDigits: 2 }) : 'Unavailable'}</strong></div><div><span className="eyebrow">SOL</span><strong>{balance === undefined ? '…' : balance ? balance.sol.toLocaleString('en-US', { maximumFractionDigits: 4 }) : 'Unavailable'}</strong></div></div>}
    {address && (sendOpen ? <div className="wallet-send-block"><SendUsdc address={address} onDone={() => { setSendOpen(false); setBalanceNonce((n) => n + 1); }} /><button className="button secondary" type="button" onClick={() => setSendOpen(false)}>Back to wallet</button></div> : <button className="button secondary" type="button" onClick={() => setSendOpen(true)}>Send USDC</button>)}
    <div className="subtle-notice"><ShieldCheck size={20} /><span>To book a listing you need enough USDC in this wallet to cover its price. AdPad pays the Solana network fee. Payments are final once they pay out.</span></div>
  </div>;
}

function InlineError({ message }: { message: string | null }) { return message ? <div className="form-error" role="alert">{message}</div> : null; }

// In-memory only: keeps a signed-out sponsor's brief and deadline while the sign-in window is open.
const BOOKING_DRAFTS = new Map<string, { brief: string; deadline: string }>();

function BookingForm({ listing, model, onSuccess, onPublish, initialBrief }: { listing: Listing; model: AdPadModel; onSuccess: () => void; onPublish: () => void; initialBrief?: string }) {
  const [error, setError] = useState<string | null>(null);
  const service = listing.kind === 'service';
  const earliest = new Date(Math.max(Date.now() + listing.turnaroundDays * 86400000, (listing.endsAt || 0) * 1000 + 86400000));
  const stock = availability(listing);
  const latest = new Date(); latest.setDate(latest.getDate() + 90);
  const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const [draft, setDraftState] = useState(() => BOOKING_DRAFTS.get(listing.id) || { brief: initialBrief || '', deadline: localDate(earliest) });
  const setDraft = (next: { brief: string; deadline: string }) => { BOOKING_DRAFTS.set(listing.id, next); setDraftState(next); };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(null);
    const form = new FormData(event.currentTarget);
    const chosen = String(form.get('deadline'));
    const deadline = Math.min(Math.floor(new Date(`${chosen}T23:59:59`).getTime() / 1000), Math.floor(Date.now() / 1000) + 90 * 86400 - 60);
    if (!Number.isFinite(deadline) || deadline <= Date.now() / 1000) { setError('Choose a future delivery deadline.'); return; }
    if (await model.startSponsorDeal(listing, String(form.get('brief')).trim(), deadline)) { BOOKING_DRAFTS.delete(listing.id); onSuccess(); }
  };
  return <form className="dialog-content" onSubmit={submit}>
    <div className="booking-summary"><span className="publisher-avatar"><CategoryIcon category={listing.category} size={20} /></span><div><strong>{listing.title}</strong><span>{listing.publisher} · {activationDates(listing)} · <Usdc amount={listing.priceMicro} /></span></div></div>
    {listing.sample ? <><div className="example-explanation"><Sparkles size={21} /><div><h4>A concept. Your next idea.</h4><p>This independent example cannot be booked. The imagery, {service ? 'creator, service' : 'creator, audience'}, and price are illustrative. No event partnership or actual inventory is implied.</p></div></div><button className="button primary full-width" type="button" onClick={onPublish}>{service ? 'Offer your skills' : 'List your own space'} <ArrowRight size={17} /></button></> : <>
      <Field label="Your brief" hint="10–500 characters. Include links to any longer creative requirements."><textarea name="brief" rows={4} value={draft.brief} onChange={(event) => setDraft({ ...draft, brief: event.target.value })} placeholder={service ? 'Tell the creator about your event or project. Include dates, creative requirements, usage rights, and links.' : 'Describe your brand, approved merch or artwork, wear hours, location, and required proof. Keep shipping addresses and personal details private.'} maxLength={500} minLength={10} required /></Field>
      <Field label="Proof deadline" hint={`The creator must post proof by the end of this day, in your time zone. The earliest date leaves the creator ${dayCount(listing.turnaroundDays)} after the activation ends; the latest is 90 days from today.`}><input type="date" name="deadline" value={draft.deadline} onChange={(event) => setDraft({ ...draft, deadline: event.target.value })} min={localDate(earliest)} max={localDate(latest)} required /></Field>
      <div className="subtle-notice"><LockKeyhole size={18} /><span>The listing, dates, deliverables, price, brief and deadline are fixed when you book. Booking moves no money. You then lock the USDC from your own wallet in an AdPad escrow at its own public address, and can take it back until the creator accepts. When the proof matches your brief, you pay the creator from the escrow. If you disagree, either side can dispute and AdPad’s agent decides. If nobody pays or disputes by the expiry date, 14 days after the deadline, the USDC comes back to you. <a className="how-link" href="/how-it-works">How payment works</a></span></div>
      <div className="subtle-notice"><Globe2 size={18} /><span>The escrow’s amount, wallet addresses and status are public on Solana, and proof is a public link. Your brief is private: only the creator and AdPad can read it. Avoid confidential information.</span></div>
      <label className="check-label"><input type="checkbox" required /><span>I agree to these deliverables and understand this booking locks real USDC from my wallet until I pay the creator, take it back before they accept, the creator returns it, a dispute is decided or the expiry date passes.</span></label>
      <InlineError message={error || model.error} />
      {model.user && !model.isAdmin && <UsdcBalanceCheck address={model.user.address} neededUsdc={listing.priceMicro} />}
      {!model.user ? <button className="button primary full-width" type="button" disabled={!model.ready || !model.configured || model.busy} onClick={() => void model.signIn()}>Sign in to book <ArrowRight size={17} /></button> : model.isAdmin ? <p className="subtle-notice">This is AdPad’s team account. Use a separate account to book listings.</p> : !model.xAccount ? <XLinkPrompt model={model} action="book this listing" /> : !model.user.address ? <div className="form-error">A wallet address is needed to create an escrow. Complete wallet setup in the sign-in flow, then refresh.</div> : model.user.address === listing.seller ? <p className="subtle-notice">This is your listing. A sponsor can book it from the marketplace.</p> : !stock.bookable ? <p className="subtle-notice">{stock.label}. Choose another listing or wait for a spot to open.</p> : earliest > latest ? <p className="subtle-notice">Bookings open when this activation’s proof deadline is within 90 days.</p> : <button className="button primary full-width" disabled={model.busy || !model.configured} type="submit">{model.busy ? <LoaderCircle size={17} className="spin" /> : <LockKeyhole size={17} />}Book, then lock USDC <ArrowRight size={17} /></button>}
    </>}
  </form>;
}

function ListingCard({ listing, index, onOpen }: { listing: Listing; index: number; onOpen: () => void }) {
  return <a href={listingPath(listing)} className={`listing-card listing-${listing.category.toLowerCase().replace(/[^a-z]+/g, '-')}`} onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return; event.preventDefault(); onOpen(); }}>
    <div className="card-photo"><PlacementImage src={listing.imageUrl} alt={`${listing.title} — ${listing.kind === 'service' ? listing.sample ? 'illustrative service concept' : 'service photo' : listing.sample ? 'illustrative placement concept' : 'placement photo'}`} /><span className="art-category"><CategoryIcon category={listing.category} size={13} />{listing.category}</span>{listing.sample && <span className="example-badge">EXAMPLE</span>}<span className="card-photo-number">{String(index + 1).padStart(2, '0')}</span><span className="art-corner" aria-hidden="true"><ArrowRight size={23} /></span></div>
    <div className="card-body"><div className="publisher-line"><span>{listing.publisher}</span><span>{listing.sample ? 'CONCEPT' : listing.bookingReady === false ? 'NOT PUBLISHED YET' : !availability(listing).bookable ? 'CLOSED' : 'BOOKABLE'}</span></div>{verifiedHandle(listing) && <span className="card-x-handle"><strong>X</strong> @{verifiedHandle(listing)}</span>}<h3>{listing.title}</h3><p className="card-audience">{eventLabel(listing)} · {activationDates(listing)}</p><div className="card-bottom"><Usdc amount={listing.priceMicro} /><span className="card-delivery"><Clock3 size={13} />{listing.startsAt ? availability(listing).label : dayCount(listing.turnaroundDays)}</span></div></div>
  </a>;
}

function CreatorSection({ model, onOpen, onPublish, fullPage = false, onExplore }: { model: AdPadModel; onOpen: (listing: Listing) => void; onPublish: () => void; fullPage?: boolean; onExplore?: () => void }) {
  const [skill, setSkill] = useState<string>('All skills');
  const Heading = fullPage ? 'h1' : 'h2';
  const [query, setQuery] = useState('');
  const liveServices = model.listings.filter((listing) => listing.active && listing.kind === 'service' && isCommunityListing(listing));
  const matchingServices = liveServices.filter((listing) => (skill === 'All skills' || listing.category === skill) && `${listing.title} ${listing.publisher} ${listing.description} ${listing.channel}`.toLowerCase().includes(query.toLowerCase()));
  const services = fullPage ? matchingServices : matchingServices.slice(0, 3);
  return <section className={`creators-section ${fullPage ? 'creator-page' : ''}`} id="creators"><div className="creator-header"><div><span className="eyebrow">03 / THE PEOPLE WHO MAKE IT HAPPEN</span><Heading>FIND YOUR<br /><span>CREATORS.</span></Heading></div><div><p>Photographers. Filmmakers. Designers. Hosts. The people who turn an idea into an event worth being at.</p><button className="text-link" onClick={onPublish}>List your skills <ArrowRight size={18} /></button></div></div><div className="creator-intro-photo"><PlacementImage src="/images/crew.webp" alt="Illustrative creative crew preparing coverage for a London event" /><span>REAL SKILLS. SHARED ENERGY.</span><small>INDEPENDENT CREATOR CONCEPT</small></div>{fullPage && <><div className="creator-filters" role="group" aria-label="Filter creators by skill">{SERVICE_CATEGORIES.map((category) => <button className={skill === category ? 'selected' : ''} key={category} onClick={() => setSkill(category)} aria-pressed={skill === category}>{category}</button>)}</div><div className="creator-search-row"><label className="search-box"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search creators, skills, locations" aria-label="Search creators" /></label><span>{String(services.length).padStart(2, '0')} {services.length === 1 ? 'LISTING' : 'LISTINGS'}</span></div></>}{services.length ? <div className="listing-grid creator-grid">{services.map((listing, index) => <ListingCard key={listing.id} listing={listing} index={index} onOpen={() => onOpen(listing)} />)}</div> : <EmptyState icon={<Users size={29} />} title="BRING YOUR KIND OF TALENT." description="No services match this filter yet. Try another skill, or be the first to put yours here." action="Offer your skills" onAction={onPublish} />}{!fullPage && <button className="button secondary creator-explore" onClick={onExplore}>Explore creators <ArrowRight size={17} /></button>}<p className="marketplace-footnote">Sponsor to creator / Clear deliverables / Paid from escrow 24 hours after the proof is approved</p></section>;
}

function EmptyState({ icon, title, description, action, onAction, disabled = false }: { icon: ReactNode; title: string; description: string; action?: string; onAction?: () => void; disabled?: boolean }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><span className="eyebrow">ROOM FOR SOMETHING GOOD</span><h3>{title}</h3><p>{description}</p>{action && <button className="button primary" disabled={disabled} onClick={onAction}>{action}<ArrowRight size={18} /></button>}</div>;
}


const PAGE_PATH: Record<Page, string> = { Browse: '/', 'For creators': '/for-creators', Calls: '/calls', 'Solana events': '/events', 'My campaigns': '/campaigns', 'My listings': '/listings', Offer: '/offers', Person: '/people', Brands: '/brands', Insights: '/insights', 'How it works': '/how-it-works', Ask: '/ask', Inspiration: '/inspiration' };
const routeId = () => { try { return decodeURIComponent(window.location.pathname.split('/')[2] || ''); } catch { return ''; } };
const pageFromLocation = (): Page => window.location.pathname.startsWith('/offers/') ? 'Offer' : window.location.pathname.startsWith('/people/') ? 'Person' : window.location.pathname.startsWith('/calls/') ? 'Calls' : (Object.entries(PAGE_PATH).find(([, path]) => path === window.location.pathname.replace(/\/$/, '') || (path === '/' && window.location.pathname === '/'))?.[0] as Page) || 'Browse';

const eventFromLocation = () => new URLSearchParams(window.location.search).get('event') || '';
const creatorModalFromLocation = (): Modal => {
  const path = window.location.pathname.replace(/\/$/, '');
  if (path !== '/for-creators' && path !== '/sponsor-me') return null;
  return new URLSearchParams(window.location.search).get('create') === '1' ? { type: 'publish', sponsorship: true, eventId: eventFromLocation() || undefined } : null;
};

const BROWSE_TYPES = ['all', 'space', 'services', 'event'] as const;
type BrowseType = typeof BROWSE_TYPES[number];
const browseTypeFromLocation = (): BrowseType => {
  const value = new URLSearchParams(window.location.search).get('type');
  return (BROWSE_TYPES as readonly string[]).includes(value || '') ? (value as BrowseType) : 'all';
};
// Old addresses find their new home without a reload: Marketplace, Find creators and Creators merged into one browse page.
const redirectLegacyLocation = () => {
  try {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    const url = new URL(window.location.href);
    if (path === '/marketplace') { url.pathname = '/'; window.history.replaceState({}, '', `${url.pathname}${url.search}`); }
    else if (path === '/creators' || path === '/sponsor-me') {
      if (path === '/sponsor-me' && url.searchParams.get('create') === '1') { url.pathname = '/for-creators'; window.history.replaceState({}, '', `${url.pathname}${url.search}`); }
      else { url.pathname = '/'; url.searchParams.set('type', 'services'); window.history.replaceState({}, '', `${url.pathname}${url.search}`); }
    }
  } catch { /* keep the current location */ }
};

function ForCreatorsPage({ onListSpace, onOfferService }: { onListSpace: () => void; onOfferService: () => void }) {
  return <section className="for-creators-page">
    <span className="eyebrow">FOR CREATORS</span>
    <h1>SELL YOUR SPACE. GET PAID AFTER THE PROOF.</h1>
    <p>Ad Pad is a direct market for ad space and creator services. You set the price and the deliverables. A sponsor books, you do the work, and the payment moves only after the proof checks out.</p>
    <div className="for-creators-grid">
      <div className="for-creators-card"><h2>What you can list</h2><ul>
        <li>Ad space you control: a T-shirt, a cap, a sticker, or a slot in your newsletter or feed.</li>
        <li>A service: a post, a photo set, a video, or wearing a brand in public.</li>
        <li>Ad space at an event: say you will be there and sell space around it.</li>
      </ul></div>
      <div className="for-creators-card"><h2>How you get paid</h2><ol>
        <li>A sponsor books and locks USDC in an OpenApps escrow. The money waits there until the proof is checked.</li>
        <li>You do the agreed work.</li>
        <li>You send a public proof link.</li>
        <li>AdPad checks the proof against the brief.</li>
        <li>The USDC is released to your wallet.</li>
      </ol><p>AdPad covers the network fee to publish a listing.</p></div>
    </div>
    <div className="for-creators-actions">
      <button className="button primary" onClick={onListSpace}><Plus size={17} />List a space</button>
      <button className="button secondary" onClick={onOfferService}><Sparkles size={17} />Offer a service</button>
      <a className="text-link" href="/how-it-works">Read how it works <ArrowRight size={16} /></a>
    </div>
  </section>;
}

export default function App() {
  redirectLegacyLocation();
  const model = useAdPad();
  const [page, setPage] = useState<Page>(pageFromLocation);
  const [navOpen, setNavOpen] = useState(false);
  const [category, setCategory] = useState<string>('All placements');
  const [skill, setSkill] = useState<string>('All skills');
  const [typeFilter, setTypeFilter] = useState<BrowseType>(browseTypeFromLocation);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const [eventFilter, setEventFilter] = useState(() => eventFromLocation() || 'all');
  const [budget, setBudget] = useState('');
  const [activationDate, setActivationDate] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [resourceId, setResourceId] = useState(routeId);
  const accountRef = useRef<HTMLDivElement>(null);
  const [modal, setModal] = useState<Modal>(creatorModalFromLocation);
  const [campaignRole, setCampaignRole] = useState('all');
  const closeRef = useRef(() => { setModal(null); const url = new URL(window.location.href); if (url.searchParams.has('create')) { url.searchParams.delete('create'); window.history.replaceState({}, '', url.pathname + url.search); } });
  const open = (next: Modal) => { model.clearMessages(); setModal(next); };
  const navigate = (next: Page) => { if (window.location.pathname + window.location.search !== PAGE_PATH[next]) window.history.pushState({}, '', PAGE_PATH[next]); setPage(next); setResourceId(''); setTypeFilter('all'); setEventFilter('all'); setAccountOpen(false); setModal(null); window.scrollTo({ top: 0, behavior: 'instant' }); };
  useEffect(() => { const back = () => { redirectLegacyLocation(); setPage(pageFromLocation()); setResourceId(routeId()); setTypeFilter(browseTypeFromLocation()); setEventFilter(eventFromLocation() || 'all'); setAccountOpen(false); setModal(creatorModalFromLocation()); }; window.addEventListener('popstate', back); return () => window.removeEventListener('popstate', back); }, []);
  useEffect(() => { const follow = (event: MouseEvent) => { const link = (event.target as HTMLElement | null)?.closest?.('a[href^="/how-it-works"]') as HTMLAnchorElement | null; if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); const href = link.getAttribute('href')!; openPath(href); const id = href.split('#')[1]; if (id) requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }))); }; document.addEventListener('click', follow); return () => document.removeEventListener('click', follow); });
  const openPath = (path: string) => { window.history.pushState({}, '', path); setPage(pageFromLocation()); setResourceId(routeId()); setTypeFilter(browseTypeFromLocation()); setEventFilter(eventFromLocation() || 'all'); setModal(creatorModalFromLocation()); setAccountOpen(false); window.scrollTo({ top: 0, behavior: 'instant' }); };
  const createOffer = (eventId?: string) => { model.clearMessages(); openPath(`/for-creators?create=1${eventId ? `&event=${encodeURIComponent(eventId)}` : ''}`); };
  const openCall = (call: SponsorCall) => openPath(`/calls/${encodeURIComponent(call.id)}`);
  const openPostCall = () => { model.clearMessages(); if (!model.user) void model.signIn(); open({ type: 'post-call' }); };
  const openListingAgent = () => { model.clearMessages(); if (!model.user) void model.signIn(); open({ type: 'publish', sponsorship: true, agent: true }); };
  const browseServices = () => openPath('/?type=services');
  const browseEvent = (eventId: string) => openPath(`/?type=event&event=${encodeURIComponent(eventId)}`);
  const setBrowseType = (next: BrowseType) => { setTypeFilter(next); try { const url = new URL(window.location.href); if (next === 'all') url.searchParams.delete('type'); else url.searchParams.set('type', next); window.history.replaceState({}, '', `${url.pathname}${url.search}`); } catch { /* keep the current location */ } };
  const openOffer = (listing: Listing) => openPath(listingPath(listing));
  const openPerson = (owner: string) => openPath(profilePath(owner));
  useEffect(() => { const close = (event: PointerEvent) => { if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false); }; const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && accountOpen) { setAccountOpen(false); accountRef.current?.querySelector('button')?.focus(); } }; document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape); return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); }; }, [accountOpen]);
  const publicListings = model.listings.filter((listing) => listing.active && !listing.deleted && !listing.sample && listing.bookingReady !== false && isCommunityListing(listing) && availability(listing).bookable);
  const filteredListings = publicListings.filter((listing) => {
    const isService = listing.kind === 'service';
    const matchesType = typeFilter === 'all' || (typeFilter === 'space' ? !isService : typeFilter === 'services' ? isService : Boolean(listing.eventId));
    const matchesCategory = typeFilter === 'services' ? (skill === 'All skills' || listing.category === skill) : (category === 'All placements' || listing.category === category);
    return matchesType && matchesCategory && (eventFilter === 'all' || listing.eventId === eventFilter) && (!activationDate || (Boolean(listing.startsAt && listing.endsAt) && Number(listing.startsAt) <= Date.parse(`${activationDate}T23:59:59Z`) / 1000 && Number(listing.endsAt) >= Date.parse(`${activationDate}T00:00:00Z`) / 1000)) && (!budget || listing.priceMicro <= Number(budget) * 1000000) && `${listing.title} ${listing.publisher} ${listing.audience} ${listing.category} ${listing.channel}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => sort === 'price-low' ? a.priceMicro - b.priceMicro : sort === 'price-high' ? b.priceMicro - a.priceMicro : b.createdAt - a.createdAt);
  const allOffers = model.listings.filter(listing => !listing.deleted);
  const selectedOffer = allOffers.find(listing => listing.id === resourceId);
  const selectedProfile = model.profiles.find(profile => profile.owner === resourceId) || fallbackProfile(resourceId, allOffers);
  useEffect(() => { document.title = page === 'Browse' ? 'Ad Pad — Get seen. Everywhere.' : `${page === 'Offer' ? selectedOffer?.title || 'Offer' : page === 'Person' ? selectedProfile?.name || 'Public profile' : page} — Ad Pad`; }, [page, selectedOffer?.title, selectedProfile?.name]);
  const ownListings = model.listings.filter(listing => (!listing.deleted || listing.deletionPending || hasPendingReplacement(listing)) && (model.isAdmin ? isCommunityListing({ ...listing, deleted: false }) : listing.owner === model.user?.id));
  const hasBrands = model.profiles.some(profile => profile.profileType === 'brand');
  // Deals that need the signed-in wallet right now: fund a booking, send proof, or news from a deal settled in the last three days.
  const nowSeconds = Math.floor(Date.now() / 1000);
  const settledRecently = (deal: SponsorDeal) => { const at = typeof deal.settledAt === 'number' ? deal.settledAt : typeof deal.payoutAfter === 'number' ? deal.payoutAfter : null; return typeof at === 'number' && at <= nowSeconds && nowSeconds - at <= 3 * 86400; };
  const address = model.user?.address || null;
  const dealActionCount = !address ? 0 : model.sponsorDeals.reduce((count, deal) => count + ((deal.sponsor === address && deal.status === 'awaiting_funding' && !deal.escrowId) || (deal.creator === address && deal.status === 'funded' && !deal.proofUrl) || ((deal.status === 'released' || deal.status === 'refunded' || deal.status === 'release_approved' || deal.status === 'refund_approved') && settledRecently(deal)) ? 1 : 0), 0);
  const dealBadgeLabel = `${dealActionCount} ${dealActionCount === 1 ? 'deal needs you' : 'deals need you'}`;
  const walletLabel = model.user?.email || (model.user?.address ? shortAddress(model.user.address) : 'Signed in');
  const browse = () => { if (page !== 'Browse') navigate('Browse'); requestAnimationFrame(() => document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };
  const askAction = (action: AskAction) => { if (action.kind === 'book') { const item = model.listings.find(listing => listing.id === action.id); if (item) open({ type: 'booking', listing: item, brief: action.brief }); } else if (action.kind === 'listing') { const item = model.listings.find(listing => listing.id === action.id); if (item) openOffer(item); } else if (action.kind === 'create_listing') openListingAgent(); else if (action.kind === 'buy') open({ type: 'buy' }); else if (action.kind === 'profile') { if (!model.user) void model.signIn(); else open({ type: 'profile' }); } else if (action.kind === 'how_it_works') navigate('How it works'); else if (action.kind === 'campaigns') navigate('My campaigns'); else if (action.kind === 'events') navigate('Solana events'); else if (action.kind === 'creators') browseServices(); else if (action.kind === 'calls') navigate('Calls'); else if (action.kind === 'post_call') openPostCall(); };
  const navClick = (event: React.MouseEvent<HTMLAnchorElement>, next: Page) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate(next); };
  return <div className="app-shell">
    <header className="site-header"><div className="header-inner"><a className="brand" href="/" aria-label="Ad Pad home" onClick={(event) => navClick(event, 'Browse')}><BrandLockup compact /></a><button className="nav-menu-button" type="button" aria-expanded={navOpen} aria-controls="main-navigation" onClick={() => setNavOpen(!navOpen)}>{navOpen ? <X size={18} /> : <Menu size={18} />}<span>Menu</span></button><nav className={`main-nav ${navOpen ? 'nav-open' : ''}`} id="main-navigation" aria-label="Main navigation" onClick={() => setNavOpen(false)}><a href="/" className={page === 'Browse' ? 'active' : ''} onClick={(event) => navClick(event, 'Browse')} aria-current={page === 'Browse' ? 'page' : undefined}>BROWSE</a><a href="/for-creators" className={page === 'For creators' ? 'active' : ''} onClick={(event) => navClick(event, 'For creators')} aria-current={page === 'For creators' ? 'page' : undefined}>FOR CREATORS</a><a href="/calls" className={page === 'Calls' ? 'active' : ''} onClick={(event) => navClick(event, 'Calls')} aria-current={page === 'Calls' ? 'page' : undefined}>CALLS</a><a href="/events" className={`events-nav ${page === 'Solana events' ? 'active' : ''}`} onClick={(event) => navClick(event, 'Solana events')} aria-current={page === 'Solana events' ? 'page' : undefined}><span>SOLANA EVENTS</span><span className="events-nav-dot" /></a><a href="/ask" className={page === 'Ask' ? 'active' : ''} onClick={(event) => navClick(event, 'Ask')} aria-current={page === 'Ask' ? 'page' : undefined}>ASK ADPAD</a><a href="/how-it-works" className={`nav-how ${page === 'How it works' ? 'active' : ''}`} onClick={(event) => navClick(event, 'How it works')} aria-current={page === 'How it works' ? 'page' : undefined}>HOW IT WORKS</a><button className="nav-mobile-action" type="button" onClick={() => open({ type: 'buy' })}><Megaphone size={16} aria-hidden="true" />Buy attention</button><button className="nav-mobile-action" type="button" disabled={!model.ready || !model.configured} onClick={openListingAgent}><Sparkles size={16} aria-hidden="true" />Become a creator</button></nav><div className="header-actions"><button className="nav-agent-button nav-buy-button" type="button" onClick={() => open({ type: 'buy' })}><Megaphone size={16} aria-hidden="true" />Buy attention</button><button className="nav-agent-button" type="button" disabled={!model.ready || !model.configured} onClick={openListingAgent}><Sparkles size={16} aria-hidden="true" />Become a creator</button>{model.user ? <div className="account-menu" ref={accountRef}><button className="account-label account-trigger" aria-expanded={accountOpen} aria-controls="account-navigation" onClick={() => setAccountOpen(!accountOpen)}><span className="account-dot" /><span className="account-email">{walletLabel}</span>{dealActionCount > 0 && <span className="nav-badge" role="status" aria-label={dealBadgeLabel}>{dealActionCount}</span>}<ChevronDown size={14} className="account-chevron" /></button>{accountOpen && <div className="account-dropdown" id="account-navigation"><button onClick={() => navigate('My campaigns')}>My campaigns{dealActionCount > 0 && <span className="nav-badge" role="status" aria-label={dealBadgeLabel}>{dealActionCount}</span>}</button><button onClick={() => navigate('My listings')}>{model.isAdmin ? 'Manage listings' : 'My listings'}</button><button onClick={() => openPerson(model.user!.id)}>My public profile</button><button onClick={() => { setAccountOpen(false); open({ type: 'profile' }); }}>Edit public profile</button><button onClick={() => { setAccountOpen(false); open({ type: 'account' }); }}>Wallet</button><button disabled={model.busy} onClick={() => { setAccountOpen(false); void model.signOut(); }}>Sign out</button></div>}</div> : <button className="button connect-button" disabled={!model.ready || model.busy || !model.configured} onClick={() => void model.signIn()}>Sign in <ArrowUpRight size={17} /></button>}</div></div></header>
    <div className="network-bar"><span><span className="network-dot" />SOLANA USDC <span className="dot-separator">/</span> WALLET ESCROW</span><button onClick={() => navigate('How it works')}><bright-text color="#d9fc4b" intensity="8">PROOF BEFORE PAYOUT</bright-text> <ArrowUpRight size={13} /></button></div>
    {model.user && model.xAccount === null && <div className="x-link-banner"><XLinkPrompt model={model} /></div>}
    {(model.error || model.notice || !model.configured) && <div className={`global-banner ${model.error ? 'error' : !model.configured ? 'preview' : 'success'}`} role={model.error ? 'alert' : 'status'}><span>{model.error || (!model.configured ? 'Local preview — sign-in and transactions are not connected yet. Explore the placement form.' : model.notice)}</span>{(model.error || model.notice) && <button className="icon-button" onClick={model.clearMessages} aria-label="Dismiss message"><X size={17} /></button>}</div>}
    <main>
      {page !== 'My campaigns' && page !== 'My listings' && page !== 'Ask' && <section className="escrow-strip" aria-label="How sponsorship works"><span><LockKeyhole size={20} /><strong className="escrow-strip-label">Proof before payout.</strong></span><p>Find ad spots. The USDC waits in escrow. The sponsor pays the creator from it once the proof matches.</p><button className="text-link" onClick={() => navigate('How it works')}>How it works <ArrowRight size={16} /></button></section>}
      {page === 'Offer' ? selectedOffer ? <OfferDetail listing={selectedOffer} profile={model.profiles.find(profile => profile.owner === selectedOffer.owner) || fallbackProfile(selectedOffer.owner, allOffers) || undefined} profiles={model.profiles} deals={model.publicDeals} onBook={() => open({ type: 'booking', listing: selectedOffer })} onProfile={() => openPerson(selectedOffer.owner)} onBack={browse} /> : <EmptyState icon={<Search size={28} />} title={model.loading ? 'FINDING THIS LISTING.' : 'LISTING NOT FOUND.'} description={model.loading ? 'Loading the marketplace.' : 'This link may be out of date. Explore the current listings.'} action="Explore marketplace" onAction={browse} /> : page === 'Person' ? selectedProfile ? <PersonProfile profile={selectedProfile} profiles={model.profiles} listings={allOffers} deals={model.publicDeals} onOpen={openOffer} onEdit={model.user?.id === resourceId ? () => open({ type: 'profile' }) : undefined} /> : <EmptyState icon={<Users size={28} />} title={model.loading ? 'FINDING THIS PERSON.' : 'TELL YOUR STORY.'} description="A public profile brings your sponsorships, skills, and collaborations together." action={model.user?.id === resourceId ? 'Create your profile' : 'Find creators'} onAction={() => model.user?.id === resourceId ? open({ type: 'profile' }) : browseServices()} /> : page === 'Calls' ? <CallsPage model={model} callId={resourceId} onOpen={openCall} onPost={openPostCall} onBack={() => navigate('Calls')} onCampaigns={() => navigate('My campaigns')} /> : page === 'Ask' ? <AskAdpad model={model} listings={publicListings} onAction={askAction} /> : page === 'How it works' ? <HowItWorksPage onBrowse={browse} onCreate={() => createOffer()} /> : page === 'Brands' || page === 'Insights' || page === 'Inspiration' ? <CommunityPage page={page} listings={model.listings} deals={model.publicDeals} profiles={model.profiles} onProfile={openPerson} onOpen={openOffer} onBrowse={browse} onSponsor={() => createOffer()} /> : page === 'Solana events' ? <SolanaEvents listings={model.listings} profiles={model.profiles} onOpen={openOffer} onCreateForEvent={createOffer} onBrowseEvent={browseEvent} onSuggestEvent={() => open({ type: 'event-suggestion' })} /> : page === 'For creators' ? <ForCreatorsPage onListSpace={() => open({ type: 'publish' })} onOfferService={() => open({ type: 'publish', kind: 'service' })} /> : page === 'Browse' ? <>
        <section className="hero"><div className="hero-topline"><span>THE PEER-TO-PEER AD MARKETPLACE</span><span>ON PEOPLE. IN PLACES. ALL OVER.</span></div><div className="hero-stage"><div className="hero-photo"><PlacementImage src="/images/tshirt.webp" alt="Concept photograph of a streetwear T-shirt as a real-world advertising placement" eager /><span className="hero-photo-label">CAMPAIGN CONCEPT / LONDON</span><span className="hero-photo-credit">YOUR LOGO. THEIR WORLD.</span></div><div className="hero-copy"><h1><span>GET SEEN.</span><span className="headline-highlight">EVERYWHERE.</span></h1><div className="hero-description"><p>The street is a channel.<br />So is your T-shirt.</p><span>Find real people with space for your brand.<br /> Lock the USDC in escrow. The creator is paid after the proof is approved.</span><div className="hero-actions"><button className="button primary" onClick={() => open({ type: 'buy' })}>Buy attention <Megaphone size={17} /></button><a className="button primary" href="/?type=services" onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); browseServices(); }}>Find creators <ArrowRight size={17} /></a><button className="button hero-secondary" onClick={() => createOffer()}>Become a creator <Plus size={18} /></button></div></div></div><button className="hero-stamp" onClick={() => navigate('How it works')}><LockKeyhole size={19} /><span>GOOD WORK.<br /><strong>GUARDED PAYMENT.</strong></span><ArrowUpRight size={20} /></button></div></section>
        <section className="marketplace-section" id="marketplace"><div className="section-heading"><div><span className="eyebrow">01 / THE MARKETPLACE</span><h2>FIND YOUR NEXT AD SPOT</h2></div><div className="marketplace-intro"><p>From a logo on a cap to a post on X, Ad Pad helps sponsors find the people who can put a brand out in the world.</p><button className="text-link" onClick={() => open({ type: 'publish' })}>Got a space? Put it here. <ArrowRight size={18} /></button></div></div>

          <div className="marketplace-toolbar"><div className="type-tabs" role="group" aria-label="Filter by listing type">{([['all', 'All'], ['space', 'Ad space'], ['services', 'Creator services'], ['event', 'At an event']] as [BrowseType, string][]).map(([value, label]) => <button key={value} className={typeFilter === value ? 'selected' : ''} aria-pressed={typeFilter === value} onClick={() => setBrowseType(value)}>{label}</button>)}</div>{typeFilter !== 'services' ? <div className="category-tabs" role="group" aria-label="Filter by placement category">{CATEGORIES.map((item) => <button key={item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)} aria-pressed={category === item}>{item === 'All placements' ? <LayoutGrid size={14} /> : <ChannelIcon category={item} size={14} />}{item}</button>)}</div> : <div className="category-tabs" role="group" aria-label="Filter creators by skill">{SERVICE_CATEGORIES.map((item) => <button key={item} className={skill === item ? 'selected' : ''} onClick={() => setSkill(item)} aria-pressed={skill === item}>{item}</button>)}</div>}<div className="marketplace-event-tabs" role="group" aria-label="Featured Solana event filters"><button type="button" className={eventFilter === 'london-hacker-house-2026' ? 'selected' : ''} aria-pressed={eventFilter === 'london-hacker-house-2026'} onClick={() => { setCategory('All placements'); setEventFilter(eventFilter === 'london-hacker-house-2026' ? 'all' : 'london-hacker-house-2026'); }}><img src="/events/hacker-house-wordmark.svg" alt="" />Hacker House London</button><button type="button" className={eventFilter === 'breakpoint-2026' ? 'selected' : ''} aria-pressed={eventFilter === 'breakpoint-2026'} onClick={() => { setCategory('All placements'); setEventFilter(eventFilter === 'breakpoint-2026' ? 'all' : 'breakpoint-2026'); }}><img src="/events/breakpoint-2026-mark.png" alt="" />Breakpoint 2026</button></div><div className="search-sort"><label className="search-box"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search spaces, people, places" aria-label="Search placements" /></label><div className="marketplace-result-count">{String(filteredListings.length).padStart(2, '0')} {filteredListings.length === 1 ? 'LISTING' : 'LISTINGS'}</div><label className="sort-box"><span className="sr-only">Sort placements</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select><ChevronDown size={14} /></label></div></div>
          <details className="marketplace-more-filters"><summary>Event, date & budget</summary><div className="discovery-filters"><label className="field"><span>Event</span><select value={eventFilter} onChange={event => setEventFilter(event.target.value)}><option value="all">All events</option>{FEATURED_SOLANA_EVENTS.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}<option value="independent">Anywhere</option></select></label><label className="field"><span>On date (UTC)</span><input type="date" value={activationDate} onInput={event => setActivationDate(event.currentTarget.value)} onChange={event => setActivationDate(event.target.value)} /></label><label className="field"><span>Maximum USDC</span><input type="number" min={0} inputMode="decimal" placeholder="Any budget" value={budget} onChange={event => setBudget(event.target.value)} /></label></div></details>
          {(publicListings.length === 0) && <div className="example-notice"><div><span className="example-label">OPEN FOR FIRSTS</span><p>This marketplace is ready for its first real placement.</p></div></div>}
          {model.loading && !model.listings.length ? <div className="loading-state"><LoaderCircle className="spin" size={23} />Loading the marketplace…</div> : filteredListings.length ? <div className="listing-grid">{filteredListings.map((listing, index) => <ListingCard key={listing.id} listing={listing} index={index} onOpen={() => openOffer(listing)} />)}</div> : <EmptyState icon={<Search size={28} />} title={query || typeFilter !== 'all' || category !== 'All placements' || skill !== 'All skills' ? 'NOT HERE. YET.' : 'YOUR SHIRT COULD BE THE FIRST BILLBOARD.'} description={query || typeFilter !== 'all' || category !== 'All placements' || skill !== 'All skills' ? 'Try another filter or search. Or bring a space nobody has thought of yet.' : 'Your T-shirt, your event, your corner of the internet. Add a photo and tell people what you can do.'} action="List a space" onAction={() => open({ type: 'publish' })} />}
          <p className="marketplace-footnote">{`${publicListings.length} live ${publicListings.length === 1 ? 'listing' : 'listings'} / Sponsor to creator`}</p>
          <XProfileStrip profiles={model.profiles} listings={model.listings} onProfile={() => open({ type: 'profile' })} />
        </section>
        <section className="event-feature"><div className="event-feature-photo"><PlacementImage src="/images/event.webp" alt="Illustrative independent London meetup concept" /><span className="event-image-label"><MapPin size={14} />LONDON, UK / CONCEPT IMAGE</span><div className="event-photo-type" aria-hidden="true">OUT OF<br />THE FEED.<br /><span>INTO IT.</span></div></div><div className="event-feature-copy"><span className="eyebrow">02 / FIND CREATORS AT YOUR NEXT EVENT</span><h2>LONDON.<br />ON THE<br /><span>RADAR.</span></h2><p>Find people heading to Solana events with ad space to sell. Sponsor their merch, their gear, or their next activation.</p><div className="event-date-list"><a href="/?type=event&event=london-hacker-house-2026" onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); browseEvent('london-hacker-house-2026'); }}><span>01–12 NOV 2026</span><strong>Hacker House London</strong><ArrowUpRight size={18} /></a><a href="/?type=event&event=breakpoint-2026" onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); browseEvent('breakpoint-2026'); }}><span>15–17 NOV 2026</span><strong>Breakpoint · Olympia</strong><ArrowUpRight size={18} /></a></div><a href="/events" className="button primary" onClick={(event) => navClick(event, 'Solana events')}>Find creators at events <ArrowUpRight size={18} /></a><small>Attendance is stated by each creator. Official dates, registration, and Solana’s calendar are on the events page.</small></div></section>
      </> : <section className="account-page"><div className="account-page-header"><div><span className="eyebrow">YOUR WORK / YOUR SPACE</span><h1>{page === 'My campaigns' ? 'OUT IN THE WORLD.' : page === 'My listings' ? model.isAdmin ? 'MANAGE LISTINGS.' : 'SPACE TO GET SEEN.' : ''}</h1><p>{page === 'My campaigns' ? 'Your bookings, your evidence, and every agreement in one place.' : page === 'My listings' ? model.isAdmin ? 'Review marketplace listings and remove them when needed.' : 'Manage your listings. Edit before the first booking, or close and delete listings at any time.' : ''}</p></div>{page === 'My listings' && !model.isAdmin ? <button className="button primary" onClick={() => open({ type: 'publish' })}><Plus size={17} />List a space</button> : <button className="button secondary" disabled={model.loading || model.busy} onClick={() => void model.refresh()}>{model.loading && <LoaderCircle className="spin" size={16} />}Refresh</button>}</div>
        {!model.user ? <EmptyState icon={<Wallet size={28} />} title="YOUR NEXT MOVE STARTS HERE." description={model.configured ? 'Sign in to publish a listing, book a creator, and follow your escrow payments.' : 'You’re exploring a local preview. Sign-in and transactions will become available when the marketplace is connected.'} action="Sign in to Ad Pad" disabled={!model.configured || !model.ready || model.busy} onAction={() => void model.signIn()} /> : page === 'My listings' ? ownListings.length ? <div className="listing-grid">{ownListings.map((listing, index) => <div key={listing.id}><ListingCard listing={listing} index={index} onOpen={() => openOffer(listing)} /><div className="listing-management"><div className="listing-management-actions">{!model.isAdmin && (!listing.deleted || hasPendingReplacement(listing)) && <><button className="text-link" disabled={model.busy || !(canEditListing(listing) || canReplaceLegacyListing(listing) || hasPendingEdit(listing) || hasPendingReplacement(listing))} onClick={() => open({ type: 'edit', listing })}><Pencil size={16} />{hasPendingReplacement(listing) ? 'Finish updated version' : canReplaceLegacyListing(listing) ? 'Create updated version' : hasPendingEdit(listing) ? 'Finish editing' : 'Edit listing'}</button><button className="text-link" disabled={model.busy || listing.deleted === true || hasPendingEdit(listing) || hasPendingReplacement(listing)} onClick={() => void model.setListingActive(listing, listing.bookingReady === false || !listing.active)}>{listing.bookingReady === false ? 'Finish publishing' : listing.active ? 'Close to bookings' : 'Reopen offer'} <ArrowUpRight size={16} /></button></>}<button className="text-link delete-listing" disabled={model.busy || hasPendingReplacement(listing)} onClick={() => open({ type: 'delete', listing })}><Trash2 size={16} />{listing.deletionPending ? 'Finish deletion' : 'Delete listing'}</button></div>{!model.isAdmin && !listing.deleted && !canEditListing(listing) && <p><LockKeyhole size={13} /> {listing.everFunded === true ? 'Details are locked after the first sponsorship.' : 'Updates to older listings publish a new version and preserve existing agreements.'}</p>}</div></div>)}</div> : <EmptyState icon={<Megaphone size={28} />} title={model.isAdmin ? "NO LISTINGS TO REVIEW." : "PUT YOUR SPACE TO WORK."} description={model.isAdmin ? "Published listings will appear here for review and deletion." : "Add a photo, set clear deliverables, and name your price. Sponsors can book your listing directly."} action={model.isAdmin ? "Refresh listings" : "List your first space"} onAction={() => model.isAdmin ? void model.refresh() : open({ type: 'publish' })} /> : <>
          {(page === 'My campaigns' || page === 'My listings') && <DealEmails user={model.user} xLinked={Boolean(model.xAccount)} />}
          {page === 'My campaigns' && <div className="deal-filters">{[['all', 'All bookings'], ['advertiser', 'As sponsor'], ['publisher', 'As creator']].map(([value, label]) => <button key={value} className={campaignRole === value ? 'active' : ''} onClick={() => setCampaignRole(value)}>{label}</button>)}</div>}
          {page === 'My campaigns' && model.sponsorDeals.length > 0 && <div className="deal-list">{model.sponsorDeals.filter(item => campaignRole === 'all' || (campaignRole === 'advertiser' ? item.sponsor === model.user?.address : item.creator === model.user?.address)).map(item => <SponsorDealCard key={item.id} deal={item} model={model} />)}</div>}
          {page === 'My campaigns' && model.sponsorDeals.length ? null : <EmptyState icon={<Megaphone size={28} />} title="MAKE YOUR FIRST MOVE." description="Book a listing to start a campaign. Follow the funding, proof and payout steps right here." action="Explore the marketplace" onAction={browse} />}
        </>}
      </section>}
    </main>
    {page !== 'Ask' && <AskButton onOpen={() => navigate('Ask')} />}
    <footer className="site-footer"><div className="footer-top"><a href="/" className="footer-brand" onClick={(event) => navClick(event, 'Browse')} aria-label="Ad Pad home"><BrandLockup /></a><p>YOUR BRAND.<br />OUT IN THE WORLD.</p><div className="footer-links"><a href="/" onClick={(event) => navClick(event, 'Browse')}>Browse <ArrowRight size={16} /></a><a href="/for-creators" onClick={(event) => navClick(event, 'For creators')}>For creators <ArrowRight size={16} /></a><a href="/events" onClick={(event) => navClick(event, 'Solana events')}>Solana events <ArrowRight size={16} /></a><button onClick={() => navigate('How it works')}>How it works <ArrowRight size={16} /></button><button onClick={() => createOffer()}>Become a creator <ArrowRight size={16} /></button></div></div><div className="footer-resources">{((hasBrands ? ['Brands', 'Insights', 'Inspiration'] : ['Insights', 'Inspiration']) as Page[]).map(item => <a key={item} href={PAGE_PATH[item]} onClick={event => navClick(event, item)}>{item}</a>)}</div><div className="footer-bottom"><span>INDEPENDENT SPACES. SPONSORS MEET CREATORS.</span><span>OPENAPPS © 2026</span></div></footer>
    {modal?.type === 'profile' && <Dialog title="YOUR PUBLIC PROFILE." onClose={closeRef.current} wide><ProfileEditor model={model} onSuccess={() => { setModal(null); if (model.user) openPerson(model.user.id); }} /></Dialog>}
    {modal?.type === 'event-suggestion' && <Dialog title="GET YOUR EVENT LISTED." onClose={closeRef.current}><EventSuggestionForm model={model} onSuccess={() => setModal(null)} /></Dialog>}
    {modal?.type === 'publish' && <Dialog title={modal.sponsorship ? "BECOME A CREATOR." : "CREATE A LISTING."} onClose={closeRef.current} wide><ListingForm model={model} initialKind={modal.kind} initialSponsorship={modal.sponsorship} initialEventId={modal.eventId} initialAgentOpen={modal.agent} onSuccess={() => { setModal(null); navigate('My listings'); }} /></Dialog>}
    {modal?.type === 'edit' && <Dialog title={canReplaceLegacyListing(modal.listing) || hasPendingReplacement(modal.listing) ? "CREATE UPDATED VERSION." : "EDIT YOUR LISTING."} onClose={closeRef.current} wide><ListingForm key={modal.listing.id} model={model} listing={modal.listing} onSuccess={() => { setModal(null); navigate('My listings'); }} /></Dialog>}
    {modal?.type === 'delete' && <Dialog title="DELETE THIS LISTING?" onClose={closeRef.current}><div className="dialog-content delete-confirmation"><h3>{modal.listing.title}</h3><p>This removes the listing from Ad Pad and stops new bookings. You can’t restore it.</p><p>Existing sponsorships, agreed terms, and escrow payments stay in My campaigns.</p>{model.error && <InlineError message={model.error} />}<div className="form-row"><button className="button secondary" disabled={model.busy} onClick={closeRef.current}>Keep listing</button><button className="button danger" disabled={model.busy} onClick={async () => { if (await model.deleteListing(modal.listing)) setModal(null); }}>{model.busy ? <LoaderCircle size={18} className="spin" /> : <Trash2 size={18} />}Delete listing</button></div></div></Dialog>}
    {modal?.type === 'booking' && <Dialog title={modal.listing.title} onClose={closeRef.current}><BookingForm listing={modal.listing} model={model} initialBrief={modal.brief} onSuccess={() => { setModal(null); navigate('My campaigns'); }} onPublish={() => open({ type: 'publish', kind: modal.listing.kind === 'service' ? 'service' : 'placement', sponsorship: Boolean(modal.listing.sponsorship) })} /></Dialog>}
    {modal?.type === 'post-call' && <Dialog title="POST A CALL." onClose={closeRef.current} wide><PostCallForm model={model} onSuccess={() => { setModal(null); navigate('Calls'); }} /></Dialog>}
    {modal?.type === 'buy' && <Dialog title="BUY ATTENTION." onClose={closeRef.current} wide><BuyAttention model={model} onPick={(listing, brief) => open({ type: 'booking', listing, brief: brief || undefined })} onBrowse={() => { setModal(null); browse(); }} /></Dialog>}
    {modal?.type === 'account' && <Dialog title="YOUR AD PAD WALLET." onClose={closeRef.current}><AccountPanel model={model} /></Dialog>}
  </div>;
}
