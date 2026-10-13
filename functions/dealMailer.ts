// Deal emails. Runs on a schedule as the AdPad agent: finds sponsor deals whose
// status changed since the last pass and emails the sponsor and creator who
// turned deal emails on (dealMailPrefs, keyed by wallet). dealMailLog keeps the
// last status mailed per deal, so each change is mailed once. Each send carries
// an idempotency key per deal, status and party, so a retried pass never mails twice.
import { dealMail, type Role } from './dealMailText';

const MAX_SENDS = 40;
const MAX_ATTEMPTS = 3;
/** A deal first seen by this mailer is only mailed if it changed this recently. */
const FRESH_MS = 30 * 60 * 1000;

type Row = Record<string, any>;

async function listAll(ctx: any, path: string, cap = 1000): Promise<Row[]> {
  const rows: Row[] = [];
  let cursor: string | null | undefined;
  do {
    const page: any = await ctx.bounded.get(path, cursor ? { limit: 100, cursor } : { limit: 100 });
    const data: Row[] = Array.isArray(page) ? page : (page?.data ?? []);
    rows.push(...data);
    cursor = Array.isArray(page) ? null : page?.nextCursor;
  } while (cursor && rows.length < cap);
  return rows;
}

const idOf = (row: Row) => String(row.pathId || row._id || '').split('/').pop() || '';

export default async function (args: any, ctx: any) {
  const nowMs = Date.now();
  const nowS = Math.floor(nowMs / 1000);
  const deals = await listAll(ctx, 'sponsorDeals');
  const logs = new Map((await listAll(ctx, 'dealMailLog')).map(row => [idOf(row), row]));
  const prefs = new Map<string, Row | null>();
  const pref = async (wallet: string) => {
    if (!prefs.has(wallet)) {
      try { prefs.set(wallet, await ctx.bounded.get(`dealMailPrefs/${wallet}`)); } catch { prefs.set(wallet, null); }
    }
    return prefs.get(wallet);
  };

  const out = { deals: deals.length, changed: 0, baselined: 0, sent: 0, skipped: 0, failed: 0, errors: [] as string[] };
  let sends = 0;
  for (const deal of deals) {
    const dealId = idOf(deal);
    if (!/^deal_[0-9a-f]{32}$/.test(dealId) || typeof deal.status !== 'string') continue;
    const log = logs.get(dealId);
    if (log && log.lastStatus === deal.status) continue;
    const isNew = !log;
    const changedAt = Number(deal._updatedAt || 0);
    if (isNew && nowMs - changedAt > FRESH_MS) {
      await ctx.bounded.set(`dealMailLog/${dealId}`, { lastStatus: deal.status, attempts: 0, updatedAt: nowS });
      out.baselined++;
      continue;
    }
    if (sends >= MAX_SENDS) break;
    out.changed++;
    let hardFailure = '';
    for (const role of ['sponsor', 'creator'] as Role[]) {
      const wallet = role === 'sponsor' ? deal.sponsor : deal.creator;
      if (typeof wallet !== 'string' || !wallet) continue;
      const p = await pref(wallet);
      if (!p || p.on !== true || typeof p.email !== 'string' || !p.email.includes('@')) { out.skipped++; continue; }
      const mail = dealMail({ headline: deal.headline, amountUsdc: Number(deal.amountUsdc), deadline: Number(deal.deadline), status: deal.status, payoutAfter: deal.payoutAfter, verdictReason: deal.verdictReason }, role, isNew);
      if (!mail) continue;
      sends++;
      try {
        await ctx.email.send({ to: [p.email], subject: mail.subject, text: mail.text, idempotencyKey: `adpad:${dealId}:${deal.status}:${role}` });
        out.sent++;
      } catch (err: any) {
        const message = String(err?.message || err).slice(0, 200);
        // Accepted by the mail provider but not yet confirmed: it is queued, do not resend.
        if (/delivery_unconfirmed/.test(message) || err?.code === 'email_delivery_unconfirmed') { out.sent++; continue; }
        hardFailure = message;
        out.failed++;
        out.errors.push(`${dealId}:${role}: ${message}`);
      }
    }
    const attempts = Number(log?.attempts || 0) + (hardFailure ? 1 : 0);
    const advance = !hardFailure || attempts >= MAX_ATTEMPTS;
    await ctx.bounded.set(`dealMailLog/${dealId}`, {
      lastStatus: advance ? deal.status : (log?.lastStatus ?? 'none'),
      attempts: advance ? 0 : attempts,
      updatedAt: nowS,
      ...(hardFailure ? { lastError: hardFailure } : {}),
    });
  }
  return out;
}
