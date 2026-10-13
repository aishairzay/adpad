import type { Deal, DealStatus, Listing, Profile } from '../types';

export const COMMUNITY_STATUSES: readonly DealStatus[] = ['unfunded', 'funded', 'active', 'submitted', 'disputed', 'released', 'refunded'];
export const COMMUNITY_STATUS_LABELS: Record<DealStatus, string> = {
  unfunded: 'Awaiting funding', funded: 'Awaiting acceptance', active: 'In progress', submitted: 'Proof submitted', disputed: 'Under review', released: 'Paid out', refunded: 'Refunded',
};
const ESCROW_STATUSES = new Set<DealStatus>(['funded', 'active', 'submitted', 'disputed']);
const TEST_LISTING_PREFIXES = ['sponsorship_test_', 'integration_'];

/** Integration fixtures use reserved IDs and must never become public social proof. */
export function isCommunityListing(listing: Listing): boolean {
  return Boolean(!listing.sample && !listing.deleted && listing.id && listing.owner && listing.seller && !TEST_LISTING_PREFIXES.some(prefix => listing.id.startsWith(prefix)));
}

export interface LinkedActivity { deal: Deal; listing: Listing; timestamp: number; timestampLabel: string }
export interface CategoryPayout { category: string; count: number; amountMicro: bigint }
export interface BuyerRelationship { wallet: string; profile: Profile | null; completedCount: number; creatorCount: number; amountMicro: bigint }
export interface BrandActivity extends BuyerRelationship { profile: Profile }

const validTime = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 8_640_000_000_000;

/** Exact formatting even when the sum of individually safe amounts exceeds Number.MAX_SAFE_INTEGER. */
export function formatCommunityUsdc(micro: bigint): string {
  const whole = micro / 1_000_000n;
  const fraction = (micro % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return new Intl.NumberFormat('en-US').format(whole) + (fraction ? `.${fraction}` : '');
}

function activityTimestamp(deal: Deal): Pick<LinkedActivity, 'timestamp' | 'timestampLabel'> {
  const recorded = deal;
  if ((deal.status === 'released' || deal.status === 'refunded') && validTime(recorded.settledAt)) return { timestamp: recorded.settledAt, timestampLabel: 'Settled' };
  if (deal.status === 'submitted' && validTime(recorded.submittedAt)) return { timestamp: recorded.submittedAt, timestampLabel: 'Submitted' };
  if (deal.status === 'active' && validTime(recorded.acceptedAt)) return { timestamp: recorded.acceptedAt, timestampLabel: 'Accepted' };
  if (deal.status === 'funded' && validTime(recorded.fundedAt)) return { timestamp: recorded.fundedAt, timestampLabel: 'Funded' };
  // Do not invent transition dates for older records or states with no timestamp.
  return { timestamp: validTime(deal.createdAt) ? deal.createdAt : 0, timestampLabel: 'Created' };
}

/** A listing link and matching seller bind these views to real marketplace offers. */
export function linkedCommunityActivity(listings: readonly Listing[], deals: readonly Deal[]): LinkedActivity[] {
  const listingMap = new Map(listings.filter(isCommunityListing).map(listing => [listing.id, listing]));
  const heads = new Map<string, Deal>();
  for (const deal of deals) {
    if (!deal.id) continue;
    const previous = heads.get(deal.id);
    if (!previous || deal.version >= previous.version) heads.set(deal.id, deal);
  }
  const activity: LinkedActivity[] = [];
  for (const deal of heads.values()) {
    const linked = deal;
    const listing = linked.listingId ? listingMap.get(linked.listingId) : undefined;
    if (!listing || listing.seller !== deal.seller || (linked.listingOwner && linked.listingOwner !== listing.owner)) continue;
    if (!deal.buyer || deal.buyer === deal.seller || !COMMUNITY_STATUSES.includes(deal.status)) continue;
    if (!Number.isSafeInteger(deal.amount) || deal.amount <= 0) continue;
    activity.push({ deal, listing, ...activityTimestamp(deal) });
  }
  return activity.sort((left, right) => right.timestamp - left.timestamp || left.deal.id.localeCompare(right.deal.id));
}

export function communitySummary(listings: readonly Listing[], deals: readonly Deal[], profiles: readonly Profile[]) {
  const activity = linkedCommunityActivity(listings, deals);
  const statusCounts = Object.fromEntries(COMMUNITY_STATUSES.map(status => [status, 0])) as Record<DealStatus, number>;
  const categoryMap = new Map<string, CategoryPayout>();
  const buyerMap = new Map<string, { count: number; creators: Set<string>; amountMicro: bigint }>();
  let releasedMicro = 0n;
  let escrowMicro = 0n;
  let fundedCount = 0;
  let inEscrowCount = 0;
  for (const { deal, listing } of activity) {
    statusCounts[deal.status] += 1;
    const amount = BigInt(deal.amount);
    if (ESCROW_STATUSES.has(deal.status)) { escrowMicro += amount; inEscrowCount += 1; fundedCount += 1; }
    if (deal.status !== 'released') continue;
    fundedCount += 1;
    releasedMicro += amount;
    const category = listing.category || 'Other';
    const categoryTotal = categoryMap.get(category) || { category, count: 0, amountMicro: 0n };
    categoryTotal.count += 1; categoryTotal.amountMicro += amount; categoryMap.set(category, categoryTotal);
    const buyer = buyerMap.get(deal.buyer) || { count: 0, creators: new Set<string>(), amountMicro: 0n };
    buyer.count += 1; buyer.creators.add(listing.owner); buyer.amountMicro += amount; buyerMap.set(deal.buyer, buyer);
  }
  const profileByWallet = new Map<string, Profile>();
  const profilesByOwner = new Map<string, Profile>();
  for (const profile of [...profiles].sort((a, b) => a.updatedAt - b.updatedAt || a.id.localeCompare(b.id))) {
    if (profile.owner) profilesByOwner.set(profile.owner, profile);
  }
  for (const profile of [...profilesByOwner.values()].sort((a, b) => a.updatedAt - b.updatedAt || a.id.localeCompare(b.id))) if (profile.wallet) profileByWallet.set(profile.wallet, profile);
  const buyers: BuyerRelationship[] = [...buyerMap].map(([wallet, data]) => ({ wallet, profile: profileByWallet.get(wallet) || null, completedCount: data.count, creatorCount: data.creators.size, amountMicro: data.amountMicro })).sort((a, b) => b.completedCount - a.completedCount || a.wallet.localeCompare(b.wallet));
  const brands: BrandActivity[] = [...profilesByOwner.values()].filter(profile => profile.profileType === 'brand').map(profile => {
    const data = buyerMap.get(profile.wallet);
    return { profile, wallet: profile.wallet, completedCount: data?.count || 0, creatorCount: data?.creators.size || 0, amountMicro: data?.amountMicro || 0n };
  }).sort((a, b) => b.completedCount - a.completedCount || a.profile.name.localeCompare(b.profile.name));
  const categoryPayouts = [...categoryMap.values()].sort((a, b) => a.amountMicro === b.amountMicro ? a.category.localeCompare(b.category) : a.amountMicro > b.amountMicro ? -1 : 1);
  const activeListingCount = new Set(listings.filter(listing => isCommunityListing(listing) && listing.active).map(listing => listing.id)).size;
  return { activity, statusCounts, releasedMicro, escrowMicro, fundedCount, inEscrowCount, releasedCount: statusCounts.released, categoryPayouts, buyers, brands, activeListingCount };
}
