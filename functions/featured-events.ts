/**
 * The Listing Agent's own copy of Ad Pad's featured Solana events.
 *
 * Function bundles may only import inside `functions/`, so this file mirrors the
 * site's metadata in `src/solana-events.ts`. Keep the two copies identical:
 * tests/featured-events.test.ts fails the suite when they drift, and adding a
 * new event means editing both (provenance: docs/events-sources.md).
 */
export interface AssistantEvent {
  id: string;
  title: string;
  dateLabel: string;
  city: string;
  venue: string;
  startAt: string;
  endAt: string;
}

export const FEATURED_EVENTS: readonly AssistantEvent[] = [
  {
    id: 'london-hacker-house-2026',
    title: 'Solana Hacker House — London',
    dateLabel: '1–12 November 2026',
    city: 'London, UK',
    venue: 'Somerset House',
    startAt: '2026-11-01T10:00:00.000Z',
    endAt: '2026-11-12T20:00:00.000Z',
  },
  {
    id: 'breakpoint-2026',
    title: 'Solana Breakpoint 2026',
    dateLabel: '15–17 November 2026',
    city: 'London, UK',
    venue: 'Olympia London',
    startAt: '2026-11-15T16:00:00.000Z',
    endAt: '2026-11-17T19:00:00.000Z',
  },
];

/** Retain an event while it is happening; hide it at its official end time. */
export function upcomingEvents(now: number = Date.now()): AssistantEvent[] {
  return FEATURED_EVENTS
    .filter(event => Number.isFinite(Date.parse(event.endAt)) && Date.parse(event.endAt) > now)
    .sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt));
}

const eventSeconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);

/**
 * Event-first dating for the onboarding draft. A chosen known event pins the
 * offer's eventId, eventName and activation window to the event's official
 * timestamps; every other date field is left to the review form, so the
 * assistant never needs to ask for UTC unix seconds.
 */
export function applyOfficialEventWindows(
  draft: { offers: Record<string, Record<string, string | number | boolean>> },
  events: readonly AssistantEvent[] = upcomingEvents(),
): void {
  for (const offer of Object.values(draft.offers)) {
    if (!offer || typeof offer !== 'object') continue;
    const eventId = typeof offer.eventId === 'string' ? offer.eventId.trim() : '';
    const eventName = typeof offer.eventName === 'string' ? offer.eventName.trim().toLowerCase() : '';
    const event = events.find(item => item.id === eventId) || events.find(item => eventName === item.title.toLowerCase());
    // Supply deadlines are calendar choices in the review form, never drafted.
    delete offer.supplyBy;
    if (event) {
      offer.eventId = event.id;
      offer.eventName = event.title;
      offer.startsAt = eventSeconds(event.startAt);
      offer.endsAt = eventSeconds(event.endAt);
    } else {
      // No chosen known event: the creator sets any dates in the form instead.
      delete offer.eventId;
      delete offer.startsAt;
      delete offer.endsAt;
    }
  }
}
