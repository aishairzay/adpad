/** Public sources checked 2026-09-19. Provenance and maintenance: docs/events-sources.md. */
export const SOLANA_EVENTS_URL = 'https://solana.com/events';
export const SOLANA_CALENDAR_URL = 'https://luma.com/solana';

// Solana Foundation's own calendar ID, not a calendar inferred from its display name:
// https://github.com/solana-foundation/solana-com/blob/main/apps/web/src/app/%5Blocale%5D/events/page.tsx
export const SOLANA_CALENDAR_ID = 'cal-J8WZ4jDbwzD9TWi';
export const SOLANA_CALENDAR_EMBED_URL = `https://luma.com/embed/calendar/${SOLANA_CALENDAR_ID}/events`;

export interface SolanaEvent {
  id: string;
  title: string;
  displayTitle: string;
  kind: string;
  startAt: string;
  endAt: string;
  dateLabel: string;
  dateNumerals: string;
  city: string;
  venue: string;
  description: string;
  registrationUrl: string;
  registrationLabel: string;
  coverUrl: string;
  sourceUrl: string;
}

// Exact start/end timestamps and cover URLs are from solana.com/events JSON-LD.
// London venue: https://solana.com/news/the-token-supercycle
// Breakpoint date/venue: https://solana.com/breakpoint
// Registration destinations are the corresponding cards on solana.com/events.
export const FEATURED_SOLANA_EVENTS: readonly SolanaEvent[] = [
  {
    id: 'london-hacker-house-2026',
    title: 'Solana Hacker House — London',
    displayTitle: 'Hacker House\nLondon',
    kind: 'Builder residency',
    startAt: '2026-11-01T10:00:00.000Z',
    endAt: '2026-11-12T20:00:00.000Z',
    dateLabel: '1–12 November 2026',
    dateNumerals: '01—12',
    city: 'London, UK',
    venue: 'Somerset House',
    description: 'Show up early. Build alongside the Solana community, join workshops, and take your next idea further ahead of Breakpoint.',
    registrationUrl: 'https://luma.com/london-hh-26',
    registrationLabel: 'View registration',
    coverUrl: 'https://images.lumacdn.com/uploads/us/872fe78e-c0aa-4f08-b842-21d764285064.jpg',
    sourceUrl: 'https://solana.com/news/the-token-supercycle',
  },
  {
    id: 'breakpoint-2026',
    title: 'Solana Breakpoint 2026',
    displayTitle: 'Breakpoint\n2026',
    kind: 'Global conference',
    startAt: '2026-11-15T16:00:00.000Z',
    endAt: '2026-11-17T19:00:00.000Z',
    dateLabel: '15–17 November 2026',
    dateNumerals: '15—17',
    city: 'London, UK',
    venue: 'Olympia London',
    description: 'The ecosystem comes together in London. Meet the builders, institutions, and creators shaping what happens next on Solana.',
    registrationUrl: 'https://luma.com/breakpoint2026',
    registrationLabel: 'View tickets',
    coverUrl: 'https://images.lumacdn.com/event-covers/rp/f80e679e-441f-4cd0-9f62-ffb131cf68bb.png',
    sourceUrl: 'https://solana.com/breakpoint',
  },
];

/** Retain an event while it is happening; hide it at its official end time. */
export function upcomingSolanaEvents(now: number = Date.now()): SolanaEvent[] {
  return FEATURED_SOLANA_EVENTS
    .filter(event => Number.isFinite(Date.parse(event.endAt)) && Date.parse(event.endAt) > now)
    .sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt));
}

/** The Listing Agent's event choices: Hacker House London first, then Breakpoint. */
export function headlineSolanaEvents(now: number = Date.now()): SolanaEvent[] {
  return upcomingSolanaEvents(now);
}
