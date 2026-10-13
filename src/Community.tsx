import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, Laptop, MapPin, Search, Shirt, Sparkles, Users } from 'lucide-react';
import type { Deal, Listing, Profile } from './types';
import { COMMUNITY_STATUSES, COMMUNITY_STATUS_LABELS, communitySummary, formatCommunityUsdc, isCommunityListing } from './lib/community';
import { ESCROW_BUCKETS, ESCROW_BUCKET_LABELS, formatBaseUsdc, readPublicEscrows, summarizeEscrows, type EscrowBucket, type PublicEscrow } from './lib/escrow-insights';
import { safePublicUrl } from './lib/sponsorship';
import { xHandleFor, xProfileUrl } from './lib/x-profile';
import './community.css';

export interface CommunityPageProps {
  page: 'Brands' | 'Insights' | 'Inspiration';
  listings: Listing[];
  deals: Deal[];
  profiles: Profile[];
  onProfile: (owner: string) => void;
  onOpen: (listing: Listing) => void;
  onBrowse: () => void;
  onSponsor: () => void;
  onCreateBrandProfile?: () => void;
}
const shortWallet = (wallet: string) => wallet.length > 14 ? `${wallet.slice(0, 6)}…${wallet.slice(-5)}` : wallet;
const countLabel = (count: number, single: string, plural = `${single}s`) => `${count} ${count === 1 ? single : plural}`;
const dateLabel = (timestamp: number) => timestamp > 0 ? new Date(timestamp * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable';

function ProfileImage({ profile }: { profile: Profile }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = safePublicUrl(profile.imageUrl);
  return <span className="co-brand-avatar">{src && failedSrc !== src ? <img src={src} alt="" loading="lazy" onError={() => setFailedSrc(src)} /> : <span aria-hidden="true">{(profile.name || profile.wallet || '?').slice(0, 1).toUpperCase()}</span>}</span>;
}

function EmptyCommunity({ title, children, buttonLabel = 'Explore the marketplace', onAction }: { title: string; children: string; buttonLabel?: string; onAction: () => void }) {
  return <div className="co-empty"><span className="co-empty-symbol" aria-hidden="true">✳</span><h2>{title}</h2><p>{children}</p><button className="button primary" onClick={onAction}>{buttonLabel}<ArrowRight size={17} /></button></div>;
}

function Brands(props: CommunityPageProps) {
  const [search, setSearch] = useState('');
  const summary = useMemo(() => communitySummary(props.listings, props.deals, props.profiles), [props.listings, props.deals, props.profiles]);
  const query = search.trim().toLocaleLowerCase();
  const brands = summary.brands.filter(({ profile }) => `${profile.name} ${profile.bio} ${profile.location} ${xHandleFor(profile)}`.toLocaleLowerCase().includes(query));
  return <>
    <header className="co-hero"><div><p className="co-eyebrow">The people behind the brief</p><h1>Meet the<br /><span>brands.</span></h1></div><div className="co-hero-aside"><Users size={40} strokeWidth={1.2} /><p>Discover brand profiles on Ad Pad. See their recorded collaborations and find the people behind the name.</p><button className="co-text-button" onClick={props.onBrowse}>Find your next collaboration<ArrowUpRight size={17} /></button></div></header>
    <div className="co-directory-tools"><label className="co-search"><Search size={17} /><span className="co-sr-only">Search brand profiles</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search brands, location, or interests" type="search" /></label><p>{countLabel(brands.length, 'brand profile')}<span>Self-described profiles · Open marketplace</span></p></div>
    {summary.brands.length === 0 ? <EmptyCommunity title="Be the first brand here." buttonLabel="Create a brand profile" onAction={() => (props.onCreateBrandProfile ? props.onCreateBrandProfile() : props.onBrowse())}>No brand profiles yet. Sponsors can create a brand profile to appear in this directory with their recorded collaborations.</EmptyCommunity> : brands.length === 0 ? <div className="co-no-results"><p>No brand profiles match “{search}”.</p><button className="co-text-button" onClick={() => setSearch('')}>Clear search<ArrowRight size={15} /></button></div> : <div className="co-brand-grid">{brands.map(brand => {
      const { profile } = brand; const website = safePublicUrl(profile.website); const social = safePublicUrl(profile.socialUrl); const xHandle = xHandleFor(profile);
      return <article className="co-brand-card" key={profile.owner}>
        <div className="co-brand-card-top"><ProfileImage profile={profile} /><span>Brand profile</span></div>
        <h2><button onClick={() => props.onProfile(profile.owner)}>{profile.name || shortWallet(profile.wallet)}<ArrowUpRight size={23} /></button></h2>
        {profile.location && <p className="co-location"><MapPin size={13} />{profile.location}</p>}
        <p className="co-brand-bio">{profile.bio || 'This brand hasn’t added a bio yet.'}</p>
        <div className="co-brand-counts"><div><strong>{brand.completedCount}</strong><span>Completed bookings</span></div><div><strong>{brand.creatorCount}</strong><span>Creator relationships</span></div></div>
        <div className="co-brand-links"><button className="co-text-button" onClick={() => props.onProfile(profile.owner)}>View profile<ArrowRight size={16} /></button>{xHandle && <a className="co-x-link" href={xProfileUrl(xHandle)} target="_blank" rel="noopener noreferrer"><strong>X</strong> @{xHandle}<ArrowUpRight size={13} /></a>}{website && <a href={website} target="_blank" rel="noopener noreferrer">Website<ArrowUpRight size={13} /></a>}{social && <a href={social} target="_blank" rel="noopener noreferrer">Social<ArrowUpRight size={13} /></a>}</div>
      </article>;
    })}</div>}
    {summary.buyers.length > 0 && <section className="co-buyers" aria-labelledby="co-buyers-heading"><div className="co-section-title"><div><p className="co-eyebrow">Recorded, not assumed</p><h2 id="co-buyers-heading">Behind the completed briefs.</h2></div><p>Buyers with at least one paid-out booking. A wallet or profile is not an endorsement.</p></div><div className="co-buyer-rows">{summary.buyers.slice(0, 8).map(buyer => <div className="co-buyer-row" key={buyer.wallet}><span className="co-buyer-mark" aria-hidden="true"><Users size={20} /></span><div>{buyer.profile ? <button className="co-text-button" onClick={() => props.onProfile(buyer.profile!.owner)}>{buyer.profile.name || shortWallet(buyer.wallet)}<ArrowUpRight size={14} /></button> : <span className="co-wallet" title={buyer.wallet}>{shortWallet(buyer.wallet)}</span>}<small>{buyer.profile ? 'Published profile' : 'Buyer wallet · no published profile'}</small></div><span>{countLabel(buyer.completedCount, 'completed booking')}</span><strong>{formatCommunityUsdc(buyer.amountMicro)}<small>USDC paid out</small></strong></div>)}</div></section>}
    <p className="co-method-note">Brand profiles are self-described. Counts include only paid-out bookings on real listings by the same creator. They reflect recorded activity, not verified brand endorsements or real-world results.</p>
  </>;
}

function Insights(props: CommunityPageProps) {
  const [escrows, setEscrows] = useState<PublicEscrow[] | null | undefined>(undefined);
  useEffect(() => { let live = true; void readPublicEscrows().then(rows => { if (live) setEscrows(rows); }); return () => { live = false; }; }, []);
  const summary = useMemo(() => escrows ? summarizeEscrows(escrows) : null, [escrows]);
  const activeListings = useMemo(() => props.listings.filter(isCommunityListing).filter(listing => listing.active).length, [props.listings]);
  const usdc = (bucket: EscrowBucket) => summary ? formatBaseUsdc(summary.totals[bucket]) : '…';
  return <>
    <header className="co-hero"><div><p className="co-eyebrow">A look inside the marketplace</p><h1>Follow the<br /><span>money.</span></h1></div><div className="co-hero-aside"><span className="co-test-tag">Public escrow records</span><p>Every booking locks USDC in a public AdPad escrow, each at its own Solana address. These totals are read straight from those records.</p></div></header>
    {escrows === null ? <div className="co-panel-empty co-escrow-unavailable"><Sparkles size={28} strokeWidth={1.4} /><p>Escrow totals could not be loaded right now.</p><span>Try again in a minute.</span></div> : <>
    <div className="co-metrics co-metrics-4"><article><span>In escrow</span><strong>{usdc('in_escrow')}</strong><small>USDC · {summary ? countLabel(summary.counts.in_escrow, 'booking') : '…'} locked, waiting on the work and the payout</small></article><article><span>Disputed</span><strong>{usdc('disputed')}</strong><small>USDC · {summary ? countLabel(summary.counts.disputed, 'booking') : '…'} frozen until AdPad’s agent decides</small></article><article><span>Paid out</span><strong>{usdc('paid_out')}</strong><small>USDC · {summary ? countLabel(summary.counts.paid_out, 'booking') : '…'} paid to creators</small></article><article><span>Returned</span><strong>{usdc('refunded')}</strong><small>USDC · {summary ? countLabel(summary.counts.refunded, 'booking') : '…'} returned to sponsors</small></article></div>
    <div className="co-insight-columns"><section className="co-status-panel" aria-labelledby="co-status-heading"><div className="co-panel-title"><p className="co-eyebrow">Escrow snapshot</p><h2 id="co-status-heading">Where the USDC is.</h2></div><ul>{ESCROW_BUCKETS.map(bucket => <li key={bucket}><span><i className={`co-status-dot co-dot-${bucket}`} />{ESCROW_BUCKET_LABELS[bucket]}</span><strong>{summary ? `${summary.counts[bucket]} · ${formatBaseUsdc(summary.totals[bucket])} USDC` : '…'}</strong></li>)}</ul><p className="co-small-note">Each escrow appears once, in its current state.</p></section>
      <section className="co-category-panel" aria-labelledby="co-category-heading"><div className="co-panel-title"><p className="co-eyebrow">Listings</p><h2 id="co-category-heading">Open for booking.</h2></div><div className="co-listing-count"><strong>{activeListings}</strong><span>{activeListings === 1 ? 'published listing' : 'published listings'}</span></div><button className="co-text-button" onClick={props.onBrowse}>Explore listings<ArrowRight size={17} /></button></section></div>
    <section className="co-recent" aria-labelledby="co-recent-heading"><div className="co-section-title"><div><p className="co-eyebrow">From the public escrow records</p><h2 id="co-recent-heading">Latest escrow activity.</h2></div></div>{!summary ? <p className="co-small-note">Loading escrow records…</p> : summary.recent.length === 0 ? <EmptyCommunity title="A clean slate." onAction={props.onBrowse}>No escrow has been funded yet.</EmptyCommunity> : <div className="co-activity-table"><table><caption className="co-sr-only">Latest escrow records</caption><thead><tr><th>Escrow</th><th>Current state</th><th>Date</th><th>USDC</th></tr></thead><tbody>{summary.recent.slice(0, 10).map(({ escrow, bucket, time }) => <tr key={escrow.escrowId}><td><code>{escrow.escrowId.slice(0, 8)}…</code></td><td><span className={`co-status-label co-status-${bucket}`}>{ESCROW_BUCKET_LABELS[bucket]}</span></td><td>{time ? dateLabel(time) : '—'}</td><td>{formatBaseUsdc(escrow.amountUsdc)}</td></tr>)}</tbody></table></div>}</section>
    <details className="co-methodology"><summary>What these numbers mean</summary><div><p>All amounts are USDC, read from AdPad’s public escrow records. “In escrow” is locked USDC the sponsor has not paid out yet. “Disputed” is frozen until AdPad’s agent decides. “Paid out” and “Returned” count escrows that have settled.</p><p>Booking briefs and who booked whom stay with the sponsor and creator, so they are not shown here. Recorded activity is not an endorsement or a guarantee of real-world results.</p></div></details>
    </>}
  </>;
}

const RECIPES = [
  { id: 'merch', title: 'Wear their merch.', tag: 'An event-day offer', image: '/images/tshirt.webp', alt: 'Concept image of a person wearing a shirt with sponsor space', description: 'Offer a day in a sponsor’s shirt or hat at an event you already plan to attend.', scope: 'Name the event, dates, time window, and who supplies the merch.', proof: 'Agree on dated photos and a short written delivery recap.' },
  { id: 'outfit', title: 'Make it your own.', tag: 'A custom branded outfit', image: '/images/designer.webp', alt: 'Concept image of a designer developing a visual identity', description: 'Design an outfit around a brand’s colors or a clearly defined logo placement.', scope: 'Agree the design, production costs, approval deadline, and wear date.', proof: 'Share the approved design and photos of the finished outfit in use.' },
  { id: 'everyday', title: 'Claim a little space.', tag: 'A laptop or bag placement', image: '', alt: '', description: 'Turn a patch, sticker, or small everyday surface into a specific placement.', scope: 'Specify the surface, placement dimensions, duration, and locations.', proof: 'Use clear, dated photos that show the agreed placement and setting.' },
  { id: 'social', title: 'Give it a moment.', tag: 'A social placement', image: '/images/social.webp', alt: 'Concept image of a social profile on a phone', description: 'Create a sponsored post, profile placement, or a short event-day story.', scope: 'Define the channel, format, number of posts, live duration, and disclosure.', proof: 'Provide public post links and agreed screenshots after publication.' },
  { id: 'coverage', title: 'Bring the room online.', tag: 'Event coverage', image: '/images/creator.webp', alt: 'Concept image of an independent event photographer', description: 'Capture a launch, meetup, or event with a focused photo or video package.', scope: 'Specify access, hours, edit count, delivery date, usage rights, and travel.', proof: 'Deliver the agreed files through a public review link or agreed portfolio page.' },
] as const;

function Inspiration(props: CommunityPageProps) {
  const offers = props.listings.filter(listing => listing.active && isCommunityListing(listing)).slice(0, 3);
  return <>
    <header className="co-hero co-inspiration-hero"><div><p className="co-eyebrow">The offer starts with you</p><h1>Ordinary space.<br /><span>New possibilities.</span></h1></div><div className="co-hero-aside"><Shirt size={43} strokeWidth={1.1} /><p>A shirt. A bag. A day at an event. Start with something specific you can deliver, then make it easy for a brand to say yes.</p><button className="button primary" onClick={props.onSponsor}>Create your offer<ArrowUpRight size={17} /></button></div></header>
    <div className="co-editorial-label"><Sparkles size={15} /><p>Offer ideas, not available inventory. Images are original generated concepts, not booking evidence.</p></div>
    <div className="co-recipe-grid">{RECIPES.map((recipe, index) => <article className={`co-recipe co-recipe-${recipe.id}`} key={recipe.id}><div className="co-recipe-art">{recipe.image ? <img src={recipe.image} alt={recipe.alt} loading="lazy" /> : <div className="co-type-art"><Laptop size={74} strokeWidth={1} /><span>YOUR<br />SPACE.<br />YOUR<br />TERMS.</span></div>}<span className="co-concept-label">Concept / 0{index + 1}</span></div><div className="co-recipe-content"><p className="co-eyebrow">{recipe.tag}</p><h2>{recipe.title}</h2><p>{recipe.description}</p><dl><div><dt>Define the offer</dt><dd>{recipe.scope}</dd></div><div><dt>Agree the proof</dt><dd>{recipe.proof}</dd></div></dl><button className="co-text-button" onClick={props.onSponsor}>Build an offer like this<ArrowUpRight size={17} /></button></div></article>)}</div>
    <aside className="co-offer-note"><span aria-hidden="true">↗</span><div><h2>Promise the ad spot.<br />Be clear about the proof.</h2><p>Describe what you’ll do, where you’ll do it, and how the sponsor can review it. Agree any event permissions, disclosure, access, and production costs before booking. Audience size is not a guarantee of views or sales.</p></div><button className="button primary" onClick={props.onSponsor}>Create your offer<ArrowRight size={17} /></button></aside>
    <section className="co-history" aria-labelledby="co-history-heading"><div className="co-section-title"><div><p className="co-eyebrow">A little independent sponsorship history</p><h2 id="co-history-heading">Small format. Original idea.</h2></div><p>Inspiration from earlier projects.<br />These are not Ad Pad bookings.</p></div><div className="co-history-grid"><article><span>2005</span><h3>The Million Dollar Homepage</h3><p>Alex Tew’s original site made a grid of pixels into advertising space. The useful idea: give a placement a clear shape and a simple offer.</p><a href="https://milliondollarhomepage.com/" target="_blank" rel="noopener noreferrer">See the original project<ArrowUpRight size={15} /></a></article><article><span>2009</span><h3>IWearYourShirt</h3><p>Jason Zook built a daily sponsorship format around wearing a brand’s shirt and making content about it. Start with a repeatable deliverable you can actually sustain.</p><a href="https://jasondoesstuff.com/" target="_blank" rel="noopener noreferrer">Read the creator’s account<ArrowUpRight size={15} /></a></article></div></section>
    {offers.length > 0 && <section className="co-real-offers" aria-labelledby="co-offers-heading"><div className="co-section-title"><div><p className="co-eyebrow">From ideas to actual offers</p><h2 id="co-offers-heading">Explore the marketplace.</h2></div><button className="co-text-button" onClick={props.onBrowse}>Browse all offers<ArrowRight size={17} /></button></div><div>{offers.map(listing => <button key={listing.id} onClick={() => props.onOpen(listing)}><span>{listing.category}</span><strong>{listing.title}</strong><small>{listing.publisher}</small><ArrowUpRight size={22} /></button>)}</div></section>}
  </>;
}

export default function CommunityPage(props: CommunityPageProps) {
  return <div className={`community-page community-${props.page.toLowerCase()}`}>{props.page === 'Brands' ? <Brands {...props} /> : props.page === 'Insights' ? <Insights {...props} /> : <Inspiration {...props} />}</div>;
}
