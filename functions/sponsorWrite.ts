// Fee sponsor. Realtime calls this before a user's onchain write; AdPad either
// pays the network fee and rent ({ sponsor: true }) or lets the signer pay
// ({ sponsor: false }). It is a pure function of its args: no reads, no writes.
// Realtime runs it as the system principal with no signed-in caller, so any
// record it tried to write or count would be refused. Realtime's own
// sponsorship journal supplies the counts in args.recent.
//
// Sponsored: only set ops, only when every write in the batch is
// bookingOffers/* (publishing a listing; listings is offchain) or
// sponsorDeals/* (booking a deal). Each batch may cost at most 0.02 SOL of fee
// plus rent. Per signer: fewer than 5 sponsored writes in the last day and
// fewer than 2 outstanding. Everything else, including a missing or malformed
// recent, is declined. Each decline logs one line with the reason and the
// quote's numbers, never an address. This function never throws.

export const MAX_LAMPORTS = 20_000_000; // 0.02 SOL of fee plus rent per batch
export const MAX_SIGNER_DAY = 5; // sponsored writes per signer per day
export const MAX_SIGNER_OUTSTANDING = 2; // sponsored writes not yet confirmed
const MAX_WRITES = 10;
const SEGMENT = '[A-Za-z0-9_.:-]{1,128}';
const SPONSORED_PATHS: RegExp[] = [
  new RegExp(`^bookingOffers/${SEGMENT}$`),
  new RegExp(`^sponsorDeals/${SEGMENT}$`),
];
const ADDRESSISH = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

export type SponsorAnswer = { sponsor: true; attribution: 'adpad' } | { sponsor: false };
export const DECLINE: SponsorAnswer = Object.freeze({ sponsor: false }) as SponsorAnswer;
export const ACCEPT: SponsorAnswer = Object.freeze({ sponsor: true, attribution: 'adpad' }) as SponsorAnswer;

/** A whole, nonnegative amount given as a number or a numeric string. */
export function amount(value: unknown): number | null {
  const n = typeof value === 'number' ? value
    : typeof value === 'string' && /^\d{1,18}$/.test(value.trim()) ? Number(value.trim())
    : NaN;
  return Number.isFinite(n) && Number.isInteger(n) && n >= 0 ? n : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function writeParts(write: unknown): { path: string; op: string } | null {
  if (!isObject(write)) return null;
  const path = typeof write.path === 'string' ? write.path : null;
  const op = typeof write.op === 'string' ? write.op : typeof write.kind === 'string' ? write.kind : typeof write.type === 'string' ? write.type : null;
  if (path === null || op === null) return null;
  return { path: path.trim().replace(/^\/+/, ''), op: op.trim().toLowerCase() };
}

/** True when the write is a set on bookingOffers/* or sponsorDeals/*. */
export function isSponsoredWrite(write: unknown): boolean {
  const parts = writeParts(write);
  return !!parts && parts.op === 'set' && SPONSORED_PATHS.some(p => p.test(parts.path));
}

/** A write described without ids or addresses: "set bookingOffers/*". */
export function describeWrite(write: unknown): string {
  const parts = writeParts(write);
  if (!parts) return 'malformed';
  const shape = parts.path.split('/').map((seg, i) => (i % 2 === 0 ? seg.replace(ADDRESSISH, '?').slice(0, 40) : '*')).join('/');
  return `${parts.op.slice(0, 12)} ${shape}`;
}

/** The quote's numbers only, never an address. */
export function describeQuote(quote: unknown): string {
  if (!isObject(quote)) return quote === undefined ? 'missing' : quote === null ? 'null' : typeof quote;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(quote).slice(0, 12)) {
    out[key.slice(0, 32)] = typeof value === 'number' || typeof value === 'boolean' ? value
      : typeof value === 'string' && /^\d{1,24}$/.test(value) ? value : typeof value;
  }
  return JSON.stringify(out);
}

function describeRecent(recent: unknown): string {
  if (!isObject(recent) || !isObject(recent.signer)) return 'missing';
  return `day=${String(amount(recent.signer.day))},outstanding=${String(amount(recent.signer.outstanding))}`;
}

/** The reason to decline, or null to sponsor. Pure. */
export function declineReason(args: unknown): string | null {
  if (!isObject(args)) return 'no_args';
  const { writes, quote, recent } = args;
  if (!Array.isArray(writes) || writes.length < 1) return 'no_writes';
  if (writes.length > MAX_WRITES) return 'too_many_writes';
  if (!writes.every(isSponsoredWrite)) return 'unsponsored_write';
  if (!isObject(quote)) return 'no_quote';
  const fee = amount(quote.feeLamportsMax);
  const rent = amount(quote.rentLamportsMax);
  if (fee === null || rent === null) return 'quote_missing_lamports';
  if (fee + rent > MAX_LAMPORTS) return 'over_lamport_cap';
  if (!isObject(recent) || !isObject(recent.signer)) return 'no_recent';
  const day = amount(recent.signer.day);
  const outstanding = amount(recent.signer.outstanding);
  if (day === null || outstanding === null) return 'malformed_recent';
  if (day >= MAX_SIGNER_DAY) return 'signer_daily_cap';
  if (outstanding >= MAX_SIGNER_OUTSTANDING) return 'signer_outstanding_cap';
  return null;
}

function log(line: string): void {
  try { console.log(line.replace(ADDRESSISH, '?').slice(0, 900)); } catch { /* ignore */ }
}

function summary(args: unknown): string {
  const a = isObject(args) ? args : {};
  const writes = Array.isArray(a.writes)
    ? `[${a.writes.slice(0, MAX_WRITES + 2).map(describeWrite).join(', ')}]${a.writes.length > MAX_WRITES + 2 ? `+${a.writes.length - MAX_WRITES - 2}` : ''}`
    : String(typeof a.writes);
  return `writes=${writes} quote=${describeQuote(a.quote)} recent=${describeRecent(a.recent)}`;
}

export function decide(args: unknown): SponsorAnswer {
  try {
    const reason = declineReason(args);
    if (reason === null) return ACCEPT;
    log(`sponsorWrite declined reason=${reason} ${summary(args)}`);
    return DECLINE;
  } catch {
    log('sponsorWrite declined reason=internal_error');
    return DECLINE;
  }
}

export default async function (args: any, _ctx?: unknown): Promise<SponsorAnswer> {
  try {
    return decide(args) === ACCEPT ? { sponsor: true, attribution: 'adpad' } : { sponsor: false };
  } catch {
    return { sponsor: false };
  }
}
