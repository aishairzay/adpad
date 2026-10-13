# Community destinations

`src/Community.tsx` exports the default `CommunityPage` component. The app supplies the route and the current public records:

```tsx
<CommunityPage
  page="Brands" // /brands; also "Insights" (/insights), "Inspiration" (/inspiration)
  listings={model.listings}
  deals={model.deals}
  profiles={model.profiles}
  onProfile={openProfileByOwner}
  onOpen={openListing}
  onBrowse={browseMarketplace}
  onSponsor={createSponsorshipOffer}
/>
```

The component owns no authentication, network requests, mutations, or navigation history. The app owns the surrounding main element and route. Browsing these pages does not itself trigger sign-in; existing preview access controls are unchanged. Offer creation uses the app's authorized publishing flow.

## Brands

The directory displays only current, self-described `profileType: 'brand'` profiles. Search matches their published name, bio, and location. Profile links use the owner ID; website, social, and image URLs go through `safePublicUrl`. Missing or failed profile images show a letter avatar. Profiles are not marked verified.

Completed campaign counts and creator relationships derive from linked released campaigns where the profile wallet is the buyer. A relationship is a distinct listing owner among those released campaigns. A brand with no released campaigns shows zero. A separate recorded-buyers list also includes buyers without profiles, displaying a shortened wallet, never an inferred brand name or endorsement. Profile and wallet data are self-published or recorded activity, not proof of affiliation, reach, delivery quality, or endorsement.

## Insights and aggregation

All amounts are explicitly **SIMULATED USDC** and all activity is test activity. There are no manufactured audience, conversion, sales, customer, or revenue metrics.

`src/lib/community.ts` applies the following rules before counting campaign activity:

1. De-duplicate each campaign ID to the highest supplied head version.
2. Require `listingId` to resolve to an actual non-example listing. Listings need an ID, owner, and seller. Historical inactive user offers remain eligible.
3. Exclude reserved integration-fixture listing prefixes `sponsorship_test_` and `integration_`. Test scripts deliberately create these records to verify execution; treating them as customer activity would be misleading. Older integration records without a listing ID are already excluded by the linkage requirement.
4. Require the campaign seller to match the listing seller, and any supplied `listingOwner` to match the listing owner. Require a buyer different from the seller, a recognized campaign status, and a positive safe-integer amount in micro-USDC.
5. Count a qualifying campaign exactly once in its current state. `released` contributes to paid-out totals and completed relationships. `funded`, `active`, `submitted`, and `disputed` contribute to currently-in-escrow totals. `unfunded` and `refunded` contribute to their status counts but never funded or payout totals.

Sums use `bigint` so individually valid integer amounts remain exact even when their sum exceeds JavaScript's safe-number limit. Display formatting preserves up to six decimals and uses no floating-point conversion. Category distributions include released campaigns only and use the linked listing's **current** category, explicitly labeled because this is not an immutable category snapshot. The visual bars show relative payout amounts, with textual amounts and counts alongside them.

Active-offer totals and the inspiration page's real-offer links exclude examples and the same reserved fixtures. Inactive user offers are excluded from active counts, but their valid campaign history is retained. Profile records de-duplicate by owner using the most recent update before resolving buyer wallets.

Latest activity is a view of current heads, not an event log. Settlement, submission, acceptance, and funding timestamps are used only for the corresponding current states; otherwise the record's creation timestamp is displayed as “Created.” Unsupported or invalid dates display “Date unavailable.” No dispute timestamp is inferred from unrelated transitions.

No linked activity produces zero totals and plain empty states. No profiles produces an empty brand directory. These views do not silently substitute example campaigns for missing activity.

## Inspiration and provenance

The five editorial offer recipes cover wearing sponsor-provided merch, a custom branded outfit, a laptop or bag placement, a social placement, and event coverage. Each defines a concrete scope and reviewable proof. They are ideas, not available inventory or performance claims. Creation and marketplace controls invoke the supplied app callbacks.

Existing `/images/tshirt.webp`, `designer.webp`, `social.webp`, and `creator.webp` are original generated concepts, as documented in `docs/visual-direction.md`. The page labels them as concepts and not campaign evidence. The laptop/bag recipe uses original typography and a generic icon. No historical project artwork or external campaign imagery was copied.

The short advertising-history section was verified against primary sources on September 20, 2026:

- [The Million Dollar Homepage](https://milliondollarhomepage.com/): the original Alex Tew project presents a pixel-grid advertising format and a 2005 copyright. Copy describes the format, not revenue or outcomes.
- [Jason Zook's account](https://jasondoesstuff.com/) and [project history](https://jasondoesstuff.com/history/): the creator describes launching IWearYourShirt in 2009, wearing sponsor shirts, and producing content. Copy uses that format as inspiration without quoting revenue, claiming success guarantees, or suggesting association with Ad Pad.

The requested design reference, [Emily Lai's sponsorship history page](https://sponsorme.emilylai.com/history), was not retrievable in this tool session (public request returned HTTP 403). No text, images, statistics, or historical claims were inferred from that inaccessible page. The recipe copy is original and historical facts use the primary sources above.

## Validation

`tests/community.test.ts` covers state classification, filtering unlinked/example/test-fixture/mismatched records, historical inactive offers, head de-duplication, unsafe amounts, exact large sums, category counts, actual brand and unknown-wallet relationships, latest-profile selection, timestamp fallbacks, and empty data. All nine tests and `tsc --noEmit` pass. Route, callback, and responsive browser checks belong to integration with the surrounding app; this component does not claim those checks have been completed independently.
