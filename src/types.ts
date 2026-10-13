export const CATEGORIES = ['All placements', 'Event', 'T-shirts', 'Hats', 'X / Social', 'Other', 'Newsletter', 'Podcast', 'Community', 'Website'] as const;
export const SERVICE_CATEGORIES = ['All skills', 'Photography', 'Video', 'Design', 'Content', 'Hosting', 'Music', 'Community', 'Development', 'Other'] as const;
export type PlacementCategory = Exclude<typeof CATEGORIES[number], 'All placements'>;
export type ServiceCategory = Exclude<typeof SERVICE_CATEGORIES[number], 'All skills'>;
export type Category = PlacementCategory | ServiceCategory;
export type ListingKind = 'placement' | 'service';
export type ClothingSource = 'sponsor' | 'creator' | 'existing';
export interface SponsorshipTerms {
  sponsorship?: boolean | null;
  eventId?: string | null;
  eventName?: string | null;
  startsAt?: number | null;
  endsAt?: number | null;
  capacity?: number | null;
  clothingSource?: ClothingSource | null;
  clothingDetails?: string | null;
  supplyBy?: number | null;
}
export type DealStatus = 'unfunded' | 'funded' | 'active' | 'submitted' | 'disputed' | 'released' | 'refunded';
export interface Listing extends SponsorshipTerms {
  attendingEvent?: boolean | null;
  id: string;
  owner: string;
  seller: string;
  title: string;
  publisher: string;
  category: Category;
  channel: string;
  audience: string;
  description: string;
  deliverables: string;
  priceMicro: number;
  turnaroundDays: number;
  active: boolean;
  createdAt: number;
  sample?: boolean;
  imageUrl?: string | null;
  /** Typed before linking existed: an unverified claim, never displayed. */
  xHandle?: string | null;
  /** Copied from the publisher's linked X account; the policy refuses any other value. */
  verifiedXHandle?: string | null;
  verifiedXId?: string | null;
  xPostUrl?: string | null;
  kind?: ListingKind | null;
  reserved?: number | null;
  bookingReady?: boolean;
  hasBookingOffer?: boolean;
  everFunded?: boolean | null;
  editVersion?: number | null;
  deleted?: boolean | null;
  deletionPending?: boolean;
}
export type ListingInput = Pick<Listing, 'title' | 'publisher' | 'category' | 'channel' | 'audience' | 'description' | 'deliverables' | 'priceMicro' | 'turnaroundDays' | 'kind' | 'attendingEvent'> & SponsorshipTerms & Pick<Listing, 'verifiedXHandle' | 'verifiedXId' | 'xPostUrl'>;
export interface Profile {
  id: string;
  owner: string;
  wallet: string;
  name: string;
  bio: string;
  location: string;
  website: string;
  socialUrl: string;
  /** Typed before linking existed: an unverified claim, never displayed. */
  xHandle?: string;
  /** Copied from the owner's linked X account; the policy refuses any other value. */
  verifiedXHandle?: string | null;
  verifiedXId?: string | null;
  imageUrl: string;
  profileType: 'person' | 'brand';
  createdAt: number;
  updatedAt: number;
}
export type ProfileInput = Pick<Profile, 'name' | 'bio' | 'location' | 'website' | 'socialUrl' | 'profileType'>;
export interface Deal extends SponsorshipTerms {
  id: string;
  headline: string;
  brief: string;
  deliverables: string;
  placement: string;
  buyer: string;
  seller: string;
  arbitrator: string;
  version: number;
  amount: number;
  deadline: number;
  createdAt: number;
  status: DealStatus;
  proofUrl: string;
  proofNote: string;
  disputeReason: string;
  resolutionNote: string;
  listingId?: string | null;
  listingOwner?: string | null;
  listingKind?: ListingKind | null;
  fundedAt?: number | null;
  acceptedAt?: number | null;
  submittedAt?: number | null;
  settledAt?: number | null;
  aiRelease?: boolean | null;
  resolvedBy?: string | null;
}
export interface SessionUser { id: string; address: string | null; email?: string | null }
export interface AdPadModel {
  user: SessionUser | null;
  ready: boolean;
  loading: boolean;
  busy: boolean;
  error: string | null;
  notice: string | null;
  listings: Listing[];
  /** Agent-written public records of sponsor bookings, for listing and profile history. */
  publicDeals: Deal[];
  sponsorDeals: import('./lib/sponsor-deals').SponsorDeal[];
  dealRequests: import('./lib/deal-requests').DealRequest[];
  /** AdPad's own escrow per deal id (dealEscrows); null when the escrow is not found. */
  escrows: Record<string, import('./lib/app-escrow').Escrow | null>;
  /** Sponsor calls: what sponsors want promoted, with the USDC locked before any creator is named. */
  calls: import('./lib/sponsor-calls').SponsorCall[];
  /** Each call's escrow by call id; null when it is not found. */
  callEscrows: Record<string, import('./lib/app-escrow').Escrow | null>;
  /** Responses the signed-in wallet can read, by call id: every response to its own calls, its own response to others. */
  callResponses: Record<string, import('./lib/sponsor-calls').CallResponse[]>;
  profiles: Profile[];
  isAdmin: boolean;
  configured: boolean;
  /** The X account the signed-in user linked through X itself; undefined while it loads. Every action requires one. */
  xAccount: import('@bounded-sh/client').Connection | null | undefined;
  linkX: () => Promise<void>;
  unlinkX: () => Promise<boolean>;
  refresh: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  clearMessages: () => void;
  publishListing: (input: ListingInput, image?: File, publicationId?: string) => Promise<boolean>;
  updateListing: (listing: Listing, input: ListingInput, image?: File) => Promise<boolean>;
  replaceLegacyListing: (listing: Listing, input: ListingInput, image?: File, publicationId?: string) => Promise<boolean>;
  deleteListing: (listing: Listing) => Promise<boolean>;
  saveProfile: (input: ProfileInput, image?: File) => Promise<boolean>;
  submitEventSuggestion: (input: { title: string; url: string; note: string }) => Promise<boolean>;
  setListingActive: (listing: Listing, active: boolean) => Promise<boolean>;
  startSponsorDeal: (listing: Listing, brief: string, deadline: number) => Promise<boolean>;
  lockSponsorDeal: (deal: import('./lib/sponsor-deals').SponsorDeal) => Promise<boolean>;
  disputeSponsorDeal: (deal: import('./lib/sponsor-deals').SponsorDeal, reason: string) => Promise<boolean>;
  /** One escrow action signed by the signed-in wallet: the creator accepts or returns, the sponsor takes back or pays, anyone expires or ends an undecided dispute. */
  escrowAction: (deal: import('./lib/sponsor-deals').SponsorDeal, action: 'accept' | 'withdraw' | 'release' | 'refund' | 'expire' | 'fallback') => Promise<boolean>;
  /** Post a call: create its escrow with no creator named, lock the USDC from the sponsor's wallet, then open it. */
  postCall: (input: import('./lib/sponsor-calls').CallInput) => Promise<boolean>;
  /** Finish a call whose USDC was not locked yet. */
  lockCall: (call: import('./lib/sponsor-calls').SponsorCall) => Promise<boolean>;
  respondToCall: (call: import('./lib/sponsor-calls').SponsorCall, pitch: string, link: string) => Promise<boolean>;
  /** Assign the call's escrow to a creator who responded and start the booking it names. */
  pickCallResponse: (call: import('./lib/sponsor-calls').SponsorCall, response: import('./lib/sponsor-calls').CallResponse) => Promise<boolean>;
  /** Take the USDC back and close an open call, or abandon one never locked. */
  closeCall: (call: import('./lib/sponsor-calls').SponsorCall) => Promise<boolean>;
  addUsdc: () => Promise<boolean>;
  submitDealProof: (deal: import('./lib/sponsor-deals').SponsorDeal, url: string, note: string) => Promise<boolean>;
  cancelSponsorDeal: (deal: import('./lib/sponsor-deals').SponsorDeal) => Promise<boolean>;
  raiseDealRequest: (deal: import('./lib/sponsor-deals').SponsorDeal, kind: import('./lib/deal-requests').DealRequestKind, note: string) => Promise<boolean>;
}
