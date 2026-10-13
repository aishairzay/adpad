# Solana events page: sources and maintenance

Checked 2026-09-19. This page is an independent Ad Pad community resource, not a claim of endorsement or partnership. The component adds no authentication requirement; the host's existing private-preview gate still applies. Registration remains on the organizer's official event page; the page does not assert current ticket availability or prices.

## Featured events

| Event | Official dates (Europe/London) | Venue | Registration |
| --- | --- | --- | --- |
| Solana Hacker House — London | November 1–12, 2026 | Somerset House | [Official Luma event](https://luma.com/london-hh-26) |
| Solana Breakpoint 2026 | November 15–17, 2026 | Olympia London | [Official Luma event](https://luma.com/breakpoint2026) |

- [Solana Events](https://solana.com/events) links directly to those two Luma event pages. Its JSON-LD supplies exact timestamps and cover URLs: Hacker House `2026-11-01T10:00:00.000Z` through `2026-11-12T20:00:00.000Z`; Breakpoint `2026-11-15T16:00:00.000Z` through `2026-11-17T19:00:00.000Z`.
- [Solana's Breakpoint page](https://solana.com/breakpoint) independently confirms both date ranges, the current Hacker House link, and Olympia as the conference venue.
- [Solana Foundation's August 4 announcement](https://solana.com/news/the-token-supercycle) identifies Somerset House for the November 1–12 builder residency.
- The [current Hacker House Luma event](https://luma.com/london-hh-26) describes workshops and building alongside the community. It currently requires organizer approval and hides the exact address until registration. The venue displayed here is from Solana's public announcement. Its prose says “thirteen days”; the calendar and Solana announcements specify November 1–12, which are the dates used here. Do not substitute the older `london-hacker-house` event.
- Event artwork is referenced directly from the official calendar's JSON-LD, without downloading or rehosting: [Hacker House cover](https://images.lumacdn.com/uploads/us/872fe78e-c0aa-4f08-b842-21d764285064.jpg), [Breakpoint cover](https://images.lumacdn.com/event-covers/rp/f80e679e-441f-4cd0-9f62-ffb131cf68bb.png).

## Official calendar embed

- The “Follow on Luma” link on [Solana Events](https://solana.com/events) points to [Solana's Luma calendar](https://luma.com/solana).
- Calendar ID `cal-J8WZ4jDbwzD9TWi` is explicitly identified as the Solana Foundation calendar in the Foundation's [events page source](https://github.com/solana-foundation/solana-com/blob/main/apps/web/src/app/%5Blocale%5D/events/page.tsx). It is also present in the [archive page source](https://github.com/solana-foundation/solana-com/blob/main/apps/web/src/app/%5Blocale%5D/events/archive/page.tsx). The ID was read from the public source, not invented.
- [Luma's embedding documentation](https://help.luma.com/p/embed-luma-on-your-website) supports calendar embeds via Calendar → Settings → Embed. The iframe target is `https://luma.com/embed/calendar/cal-J8WZ4jDbwzD9TWi/events`.
- The iframe has an accessible title, eager loading when the Events route mounts, and a loading/error state. After 15 seconds without a load event, a compact “Open the live Solana calendar” panel replaces the large blank area. The iframe stays mounted at a visually hidden size so its request can finish; a later load event restores its normal height. A cross-origin load event cannot establish that calendar content rendered. An always-visible direct calendar link remains available in either state.
- Browser verification: the root agent opened the exact official embed URL directly and confirmed that it renders live events. Command-line retrieval returned HTTP 403, so browser evidence supersedes that retrieval limitation. Nested inside Ad Pad's local production preview, both lazy and eager iframe versions remained at `about:blank` despite being in the viewport; there was no browser console error. The cause is unconfirmed, and nested rendering remains unverified. The compact fallback provides access to the official calendar without implying that the embedded content loaded. No event registration, subscription, or purchase was performed.

## Updating

`src/solana-events.ts` owns the featured metadata. `upcomingSolanaEvents()` filters each event at its exact official end timestamp and sorts by start time. The component rechecks once per minute and when the window regains focus, so past featured entries disappear without a deployment. The Listing Agent's function cannot import outside `functions/`, so `functions/featured-events.ts` mirrors this metadata for the onboarding assistant; `tests/featured-events.test.ts` fails when the two copies drift, so updating an event or adding a new one means editing both files together. The iframe supplies the organizer-maintained calendar independently of those curated entries. Before changing dates, venues, images, or links, recheck the organizer's primary sources. Do not add inferred pricing or availability.

Integration: import `SolanaEvents` from `./SolanaEvents` and render `<SolanaEvents onExplorePlacements={() => navigateToMarketplace()} onExploreCreators={() => navigateToCreators()} />`. Both callbacks are optional. The component imports its own scoped stylesheet and performs no Bounded reads or writes.
