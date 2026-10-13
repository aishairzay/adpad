# Ad Pad

A peer-to-peer ad placement and creator-services marketplace with campaign-specific USDC escrow, plus an independent guide to Solana events.

Advertisers browse placements and fund an offer. The publisher accepts its fixed deliverables, brief, amount, and deadline, then submits a public proof link and delivery note. The advertiser reviews the proof and releases payment. Either participant can open a dispute after acceptance; the campaign's pinned administrator can release funds against submitted proof or refund the advertiser.

## Development status

This version targets Bounded Poofnet (`realtime_offchain`). Its USDC, wallets' starting balances, and escrow transfers are simulated. It is not a real-money launch. The CLI is 0.0.136 and the client/server SDK is 0.0.100.

App ID: `605ba9048f556bdd2b7ea18e`. Hosted test marketplace: [adpad.fyi](https://adpad.fyi). The [Bounded vanity URL](https://ad-pad.bounded.page) remains available as a fallback. The site remains public and uses simulated USDC.

The backend is deployed and the frontend is connected. Application tests cover escrow amounts and receipts, photo validation, safe image sources, and upload reconciliation. Policy tests cover ownership, proof approval, disputes, refunds, failed hooks, immutable terms, listing images, and creator services. Release evidence lives in `docs/verification`. Hook writes have a separate authorization scope; this is not a claim that every application property has been formally proved.

The marketplace supports Event, T-shirts, Hats, X / Social, Other, Newsletter, Podcast, Community, and Website placements. `/creators` includes Photography, Video, Design, Content, Hosting, Music, Community, Development, and Other services. Both listing types accept a photo, event/location, price, deliverables, and delivery window. Concept listings are labeled and cannot be booked.

The creator form supports choosing ad space and creator services together. This publishes two separately bookable offers on the same profile, each with its own price, deliverables, dates, and availability. Stable publication identifiers and saved drafts reconcile interrupted publishing without duplicating completed offers. Body copy, navigation, form labels, and supporting text use larger type with stronger contrast and responsive layouts.

Owners can edit a new listing while it is closed to bookings: the app closes it, saves both metadata and authoritative terms, and reopens only after confirmation. Each booking keeps the title and amount it was made at, and the booking rule checks every new booking against the listing's current seller, price and title. Older listings can publish an updated version with a new identifier: the original closes first and is retired only after the new offer is confirmed; existing agreements retain the original terms. Known funded history blocks this replacement flow. Both owners and the pinned admin can delete listings from discovery; soft deletion stops new bookings and preserves active campaigns, escrow records, and agreement history. Admin listing management is available from the account menu.

`/sponsor-me` is a curated view of personal placement offers, using the same advertiser-funded escrow and proof approval as every booking. Wearing supplied merch, arranging custom branded clothing, and wearing agreed existing gear are supported. Clothing responsibilities, event dates, supply deadlines, price, and deliverables are part of the listing; bookings close when the activation starts or the supply date passes. The app counts spots from the public deal records (funded and delivered bookings hold one, a refund reopens it); the rules check each booking's terms but do not cap the count.

Offers and people have shareable `/offers/:id` and `/people/:owner` pages with linked delivery history, canonical share links, and an embeddable/downloadable badge. Accounts can publish person or brand profiles. Footer destinations `/brands`, `/insights`, and `/inspiration` provide factual public activity and original activation ideas. Concepts and automated test fixtures never count as collaborations or endorsements. The main navigation is Marketplace, Sponsor me, and Solana events, with a prominent Listing Agent button that opens the creator-onboarding chat directly: guests sign in first, the chat keeps its in-tab draft, and its review handoff fills the creator form. The form's own forced agent entry card is gone. The chat works event-first: the specific event and the offer kind are dropdown quick-choices (Breakpoint 2026 and Hacker House London first, then another event or none), and a chosen featured event fills the draft's activation window from that event's official timestamps — the assistant never asks for dates or UTC unix seconds, and any date not taken from an official window is left to the review form's date pickers. Services remain available from the footer at `/creators`; account controls live in a dropdown. The homepage uses one marketplace grid and a compact escrow explanation.

`/events` features Solana Hacker House London and Breakpoint 2026, available ad-space offers from people who explicitly declare attendance, official registration links, and Solana's own Luma calendar. Attendance is an optional owner-controlled public statement, not verified registration. Event cards require matching event identity, overlapping activation dates and bookable inventory; examples and automated fixtures are excluded. `/sponsor-me?event=<id>` retains that event filter, while `/sponsor-me?create=1&event=<id>` opens a prefilled creator listing form. Attendance confirmation remains unchecked until the creator chooses it. It is an independent community resource. A compact direct-open fallback is available if the calendar embed does not load. See `docs/events-sources.md` for verified dates, artwork, sources, and browser-check limits.

The deployed Poofnet integration test checks actual simulated transfers with separate temporary wallet identities: listing ownership, funding, acceptance, proof submission, exact publisher payout, exact advertiser refund, unauthorized actions, and concurrent funding applying only once. Successful test listings are retired; a first sponsorship test stopped at a definite clock-skew denial and retained an active fixture. All automated test IDs are excluded from public discovery and community statistics; campaign records remain clearly labeled as automated tests. Desktop/mobile marketplace behavior and the Bounded sign-in dialog were checked in the browser. Owner email sign-in and an authenticated browser transaction have not been completed by the test harness.

The owner account is `maurice@poof.new`. Maurice confirmed the Ad Pad admin wallet as `2z4wE2an8YRR6w4AMT2EaBTygheSixBE5Cf2YZfdaj1X` on 2026-09-19. It matches the address already pinned in the deployed policy, frontend, fixtures, and integration script, so no redeployment was needed. Signing in with that wallet exposes the Disputes page. No account credentials are included.

## Run locally

```sh
npm install
npm run dev
```

The app runs at `http://localhost:5178`. Browsing does not require an account. Publishing and escrow actions use email/social or wallet authentication. Register the local login origin on the deployed app before testing hosted sign-in:

```sh
npx bounded domains origins add http://localhost:5178
```

## Checks and release

```sh
npm test
npm run build
npx bounded verify --protocol realtime_offchain --json
npx bounded tests run --json
node scripts/test-listing-images.mjs
node scripts/test-event-attendance-integration.mjs
```

The policy test runner requires an existing app ID and creates throwaway sandboxes. Tests cover the authorization model; plugin mocks do not establish that real token transfers succeeded. Actual simulated transfers must also be exercised on the deployed test app.

The owner approved policy upload and testing on 2026-09-19. For subsequent releases, deploy to the existing app ID, inspect its active publication, then publish the static build. Never retry an ambiguous `deploy --create` operation. Local origins `http://localhost:5178` and `http://127.0.0.1:5178` are registered.

## Product boundaries

- Evidence is a claim by the publisher, reviewed by a person. A URL is not automatic proof of impressions, clicks, permanence, or authenticity.
- The agreed terms, wallet addresses, amounts, and delivery evidence are public. Never put confidential briefs, credentials, or private analytics links in the evidence fields.
- The sponsor locks USDC in AdPad's own escrow (dealEscrows) and can take it back until the creator accepts. After that the sponsor pays the creator from the escrow, the creator can return it, and either side can dispute; only AdPad's agent decides a dispute. Undisputed money nobody paid out returns to the sponsor after the expiry date. There is no silent automatic payout.
- A booking must match what it books: the open listing's seller, price and title, or the sponsor's own call. The agent's funded, disputed, released and refunded must match the escrow.
- An escrow's amount never changes; its creator is set when it is locked, or picked from a call's responses before anyone accepts. A settled escrow cannot pay out again. Pending or failed funding does not count as funded escrow.
- Marketplace audience sizes and descriptions are supplied by publishers; they are not independently verified. Example cards are clearly labeled and cannot be booked.
- This regular Bounded app remains upgradeable by its owner. Do not describe it as immutable or independent of its operator.

See `docs/sponsorship-policy.md` for booking inventory and sponsorship terms, `docs/community-features.md` for public history and source boundaries, `docs/escrow.md` for the escrow flow, `docs/listing-images.md` for storage behavior, `docs/events-sources.md` for event provenance, and `docs/visual-direction.md` for the design direction and original image prompts.
