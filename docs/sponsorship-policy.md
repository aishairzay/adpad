# Sponsorship and profile contract

This revision keeps existing offchain listings and image storage compatible. It adds public account-owned profiles and an onchain `bookingOffers/$listingId` companion for authoritative booking terms. The live app runs on Solana mainnet with real USDC; previews run on Poofnet with simulated USDC.

## Profiles

Path: `profiles/<user.id>`. The document id is the account identity; do not submit an `id` field (Bounded reserves it).

| Field | Contract |
|---|---|
| `owner` | Required immutable string equal to the signed-in account id and path id |
| `wallet` | Required immutable address equal to the caller wallet at creation |
| `name` | Required, 1–80 characters |
| `bio`, `location` | Optional/null; at most 500 and 100 characters |
| `website`, `socialUrl`, `imageUrl` | Optional/null; at most 250, 250 and 2048 characters; frontend validates safe HTTPS URLs |
| `profileType` | `person` or `brand` |
| `createdAt`, `updatedAt` | Unix seconds; initially equal; creation time immutable; updated time cannot go backwards and must be within the current 60-second write window |

Use the SDK `serverTimestamp()` for write stamps, including the same marker in both profile creation fields. A client clock one second ahead is correctly rejected by the no-future timestamp rule.

Anyone may read a profile. Only its account identity may edit it. A profile is descriptive; it confers no escrow or offer authority. The pinned admin may have a profile but cannot publish a listing.

## Listing metadata and authoritative offers

`listings/$listingId` remains offchain and owned by `@user.id`. Optional metadata is:

- `sponsorship: Bool?`
- `eventId: String?` (80), `eventName: String?` (120)
- `startsAt: UInt?`, `endsAt: UInt?` (Unix seconds)
- `capacity: UInt?` (1–100; null means no configured limit)
- `clothingSource: 'sponsor' | 'creator' | 'existing' | null`
- `clothingDetails: String?` (500), `supplyBy: UInt?`

A listing cannot submit a non-null `reserved` counter.

Listings also accept `attendingEvent: Bool?` as offchain discovery metadata. Missing, null or false preserves legacy behavior. When true, the listing must be a placement (`kind: 'placement'` or null), have nonempty `eventId` and `eventName`, and have both valid `startsAt` and `endsAt` values under the existing date rules. Sponsorship and capacity are not required to self-report attendance. Only the listing's authenticated account owner may edit the declaration, subject to the closed edit flow below; sharing its wallet does not confer account ownership.

Attendance is self-reported by the creator. It does not verify a ticket, check-in, event-organizer endorsement or actual attendance. The flag is not added to booking offers or bookings and never authorizes payment. Concrete attendance and advertising obligations belong in the offer's `deliverables`; completion still requires proof, and the sponsor pays from the escrow or AdPad's agent decides a dispute.

`bookingOffers/$listingId` is onchain. It has `seller: Address!`, `listingOwner: String!`, `createdAt: UInt!`, mutable `title` (3–80), `channel` (1–100), `deliverables` (1–500), `priceMicro` (1–100,000,000,000), `kind: 'placement' | 'service' | null`, `active: Bool`, the optional metadata above, and the derived `reserved: UInt?` and `everFunded: Bool?`.

Create it under the same id as the listing, with the authenticated wallet as `seller`. Omit `reserved` and `everFunded`; its create hook initializes them to zero and false. Confirm the offer hook before treating it as available. That immutable seller wallet controls the offer; the pinned admin has only the additional soft-deletion permission described below. `listingOwner` is immutable descriptive identity, not authorization. The frontend must pair a companion with the actual listing seller and retain account identity from the owned listing/profile; an arbitrary companion is not evidence of offchain listing ownership.

A sponsorship must be a placement, have nonempty `eventId` and `eventName`, paired start/end times, and a capacity. Null `kind` is a legacy placement. Paired times require `startsAt > 0`, `endsAt >= startsAt`, and a span no longer than 90 days. `supplyBy`, if present, must be positive and no later than `startsAt`. Clothing supply is an agreed term, not authorization for advance payment or a separate beneficiary.

Offer updates cannot edit `reserved` or `everFunded`, or change seller/identity/creation time. Offers cannot be physically deleted. Create the authoritative booking offer FIRST under a fresh unguessable id, confirm its initialization hook, then publish the descriptive listing under the same id with `editVersion: 1`. This avoids exposing the id in a public listing before the companion namespace is claimed. These remain separate operations. A partial result needs reconciliation before retry; do not present a pending or conflicting companion as bookable. Older metadata-first partial publications require matching seller/identity checks; conflicts fail closed and may require a fresh id.

## Editing and deleting listings

`bookingOffers.everFunded` and `reserved` were maintained by the first escrow's funding hook. That escrow is removed from the policy, so they keep the `false` and `0` their create hook sets, and callers still cannot supply or change them.

New offchain listings use immutable `editVersion: UInt!?` equal to 1. Creation with that marker requires an initialized companion with `everFunded == false`, matching seller wallet and account identity, and no deletion. Missing markers remain valid for old records, but cannot be added later.

Offer term changes require both its existing and proposed `active` value to be false; listing content changes require `editVersion == 1` and a matching, closed companion with `everFunded == false`. Neither document may already be deleted. All known content fields are protected otherwise, including image reference, category, kind, event/attendance metadata, deliverables, price and clothing terms. Owner identity and timestamps remain immutable. The underlying stored image bytes retain their existing ownership/immutability rules. A booking keeps the title and amount it was made at, so editing a closed listing never changes an existing booking.

The client edit sequence is: close the authoritative offer; confirm closure; save listing metadata; save authoritative terms while closed; then restore listing visibility and reopen the offer last if it was previously open. These are separate operations, not an atomic cross-plane batch. A partial failure must preserve the operation details and reconcile the exact documents; do not silently reopen after an incomplete edit. An ambiguous final reopen needs inspection, because it may have committed. A closed listing cannot be booked.

Owner/seller and the pinned admin may soft-delete with exactly `{ deleted: true, active: false }` on each document. Delete the authoritative offer first, confirm it, then hide metadata; a legacy listing with no companion can be marked directly. `deleted: Bool?` is optional for compatibility, but once true cannot be unset and the record cannot reopen. The admin cannot use deletion to change terms, ownership or counters. Actual document deletion remains denied, retaining records for existing agreements. UI discovery must exclude deleted records.

Owners may close/reopen a nondeleted listing and offer, or delete them. A deleted listing or offer cannot be booked, while existing bookings continue through acceptance, proof, dispute and settlement under their own terms. A listing without `editVersion` keeps its terms; its owner can close, reopen or delete it, or publish an updated version under a fresh id.

Offchain rules use `get(/bookingOffers/$listingId)` for the listing edit guard and the booking rule. Onchain rules cannot read offchain documents. On mainnet, offchain rules read the indexed copy of an onchain offer, which can trail the chain by a few seconds.

## Bookings

A booking (`sponsorDeals/<dealId>`) names the listing it books, and the booking rule requires that listing to exist, be active and not deleted, with the booking's creator as its seller. When the listing has an onchain offer with the same seller and owner, the booking's `amountUsdc` and `headline` must equal the offer's `priceMicro` and `title`, the offer must be active, initialized and not deleted, and the booking must come before `startsAt` and no later than `supplyBy`. Otherwise the listing's own `priceMicro`, `title` and dates apply, and a listing with capacity or a sponsorship cannot be booked without its offer. An offer that another wallet created under the same id does not change what the listing costs. The sponsor writes their own `brief`. A booking from a call is checked against the call instead ([calls](calls.md)).

## Capacity

The app counts a listing's taken spots from the public `dealRecords`: funded and released bookings hold a spot, and a refund frees it. The rules check each booking's terms but do not cap the number of bookings; a creator can return the money for a booking they cannot take. The offer's `reserved` counter belonged to the first escrow and stays 0.

## Validation

- `05-listing-ownership.json`, `10-image-storage.json`, `11-listing-image-reference.json`, `12-listing-kind.json`: listing ownership, images and kinds.
- `13-profiles.json`: account path/wallet identity, immutable ownership, permitted edits and limits.
- `14-booking-offers.json`: seller authority, event/clothing validation, derived counter and offer edits.
- `18-event-attendance.json`: optional/legacy attendance, required placement and event dates, field bounds, owner-only opt-in/withdrawal, account identity distinct from a shared wallet, and invalid update rejection.
- `19-listing-edit-lock.json`: offer and listing terms change only through the closed edit flow, and the derived flags cannot be forged.
- `20-legacy-edit-boundary.json`: missing-history handling, immutable marker and companion identity checks, and prevention of legacy-record permission retrofits.
- `21-listing-soft-deletion.json`: owner/admin permissions and irreversible closure.
- `34-booking-terms.json`: bookings take the open listing's current seller, price and title, use an onchain offer only when it is the seller's, and close when the activation starts.

For the attendance-only revision, `node scripts/test-event-attendance-integration.mjs` checks the real SDK after deployment: owner placement creation and public roundtrip, denial of service attendance or missing event details/dates, owner-only edits and retirement with attendance withdrawn. It uses `serverTimestamp()`, holds temporary keys/tokens only in memory and retains one inactive `integration_` listing. It performs no booking-offer, escrow or payment writes and does not retry ambiguous writes.

The edit/deletion candidate passed verification on 2026-09-21 with CLI 0.0.136 / SDK 0.0.100: 119 checks, 111 proved, no blocking failures, six intentional public-read advisories and two advisories for the intentional non-owner pinned-admin deletion path. All 21 suites passed, totaling 736 steps. Tests were split across batches because the platform limits one run to 120 seconds; the deletion suite's initial cleanup-only billing acknowledgment error passed on rerun. Consolidated evidence is `/private/tmp/adpad-listing-edit-summary.json`, with verification and per-suite report paths recorded there. Its expected submitted policy digest is `b08fcde890a99e1cddde8373e08077e2761a26bf98e97d73700551724a2e9694`. These are pre-deployment results; deployment and real SDK receipts must separately confirm the release.

Attendance policy verification on 2026-09-21 passed with CLI 0.0.136 and SDK 0.0.100: 118 checks, 112 proved, no failures and six existing public-read advisories. All 18 policy suites passed (526 steps, including 55 focused attendance steps). Exact policy comparison confirms no changes to booking offers, escrow, images, profiles or existing listing ownership checks. Evidence is `/private/tmp/adpad-attendance-verify.json`, `/private/tmp/adpad-attendance-tests.json` and `/private/tmp/adpad-attendance-summary.json`. These results verify the candidate policy; deployment and live-test receipts must separately confirm activation.

The proof verifier checks named rule properties; it does not prove the hook's entire business behavior or replace live concurrency evidence. Sandbox tests use real policy enforcement with mocked token effects. Source references: installed Bounded `policy-reference.md` (cross-plane reads), `policy-primitives.md` (atomic onchain staged updates), `data-plane.md` (snapshot/concurrency and nested-get limits), and `policy-native-state-machines.md` (receipt confirmation and hook-derived authority).

## Sponsorship release — 2026-09-20

Backend revision 6/runtime publication 10 was deployed without source upload using project-local Bounded CLI 0.0.135 and SDK 0.0.100. Verification passed 118 checks with zero failures, and all 17 policy suites passed 471 steps. The real Poofnet SDK integration passed profile authorization, exact sponsorship/clothing snapshots, two distinct buyers racing for one capacity slot, refund reuse, no advance withdrawal, and proof/approval settlement with the exact seller balance increase. The successful test listing and offer were retired inactive.

The first live attempt used client timestamps and hit a one-second clock-skew denial at proof submission after capacity/refund checks succeeded. No policy guard was weakened. That attempt retained clearly labeled automated-test profile/listing/offer and one active simulated escrow; its ephemeral owner credentials were not persisted. The revised script uses actual SDK server timestamps and completed successfully. Retained evidence is in `/private/tmp/adpad-sponsorship-release-summary.json`. Root separately confirmed that hosting is currently public and chose to preserve that setting. This backend task issued no hosting or privacy mutation.


### Definitive publication and retained evidence

- App: `605ba9048f556bdd2b7ea18e`; policy revision **6**, runtime publication **10**.
- Committed operation: `6394e71a-8f17-4f09-9cad-89a2586b0045`.
- Submitted policy SHA-256: `011e15a8e8cb403a0d12768b16205e71b904295502b71ac2a128309f0c9f9913`.
- Resolved policy SHA-256: `248dbfe0411228599b25cb2e3445b10d6ca48f2f8381c4fb4d0f14186fd7bbd8`.
- Runtime artifact SHA-256: `5a84fa5fe19f77fe2aa63ff8a7dc1dbfffd229b8cf361b464795e725ed7702a0`.

The submitted digest was independently matched from the local policy using sorted compact JSON with Go HTML escaping. Post-test inspection retained the same operation and policy digests. The raw pretty-printed policy file has a different hash; it is not the submitted-body digest.

Receipts in `/private/tmp`:

- `adpad-sponsorship-release-verify.json`, `adpad-sponsorship-tests-all.json`
- `adpad-sponsorship-release-preflight.json`, `adpad-sponsorship-release-deploy.json`
- `adpad-sponsorship-release-inspect.json`, `adpad-sponsorship-release-posttest-inspect.json`
- `adpad-sponsorship-release-integration-server-time.json` (successful live test)
- `adpad-sponsorship-release-summary.json` (consolidated evidence)

Residual first-attempt fixtures, retained after the definite clock-skew rejection:

- Profile: `profiles/3PGvwNY5q2uf7SzrWFBHdXp3teVnCjEhWi69uR4DzN6x`
- Listing/offer id: `sponsorship_test_6c11120e_6a27_42ef_a5a4_1e10368dba30`; authoritative offer is fully booked by the active test escrow.
- Refunded escrow: `escrows/adpad_esc_1af906cd-598e-44c0-a0bd-9c345b590343`
- Active simulated test escrow: `escrows/adpad_esc_bc076cf6-166e-499c-8914-c4021a3cecdb`

The frontend excludes reserved test prefixes from public discovery. No private keys, session tokens or authentication headers were logged or persisted by the integration script; ephemeral identities were held only in process memory. These lost ephemeral identities are why the first attempt's owner-only fixtures remain instead of being modified through an administrative policy exception. No actual USDC or other mainnet asset was used.

## Attendance release — 2026-09-21

Root deployed the verified attendance revision to the existing app after reviewing the exact change: one optional offchain field and its two listing validation predicates. Policy revision **7**, runtime publication **11**, committed operation `80c05403-331f-4b45-9326-97c7d8b71973`. Submitted digest `88f3d6d5dc4e1a374f93680adbbe75028984a3185012921232e204136d0007ae` matches the verified candidate. Hosting remains public. No source sync or escrow rule change was made.

The live SDK attendance check passed: valid owner creation and public roundtrip, denied service attendance/missing identity/missing dates, denied outsider edit and invalid owner update, and confirmed retirement with attendance withdrawn. Retained fixture: `listings/integration_attendance_valid_22e88cac_16f2_4e3c_b6b7_27578556ef06`, inactive and excluded from discovery. No booking or payment writes occurred in this check. Receipts: `/private/tmp/adpad-attendance-deploy.json`, `/private/tmp/adpad-attendance-inspect.json`, `/private/tmp/adpad-attendance-live.json`. Consolidated release evidence is in `docs/verification/2026-09-21-navigation.json`.
