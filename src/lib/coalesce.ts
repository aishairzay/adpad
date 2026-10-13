/**
 * Live updates arrive in bursts: each subscription reports once when it attaches, and one
 * write can touch several collections. Every report used to start a full reload of all
 * collections, so a single page view fetched the same data six or more times in a row.
 *
 * coalesce turns a burst of calls into one run after the burst settles, and never runs two
 * at once: a call that lands while a run is in flight schedules exactly one more run after it.
 */
export type Coalesced = { (): void; cancel(): void };

export function coalesce(run: () => Promise<unknown>, waitMs: number, timers: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'> = globalThis): Coalesced {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let again = false;
  let cancelled = false;

  const start = () => {
    timer = null;
    if (cancelled) return;
    if (running) { again = true; return; }
    running = true;
    void Promise.resolve().then(run).catch(() => { /* the caller reports its own errors */ }).finally(() => {
      running = false;
      if (again && !cancelled) { again = false; schedule(); }
    });
  };

  const schedule = () => {
    if (cancelled) return;
    if (timer !== null) timers.clearTimeout(timer);
    timer = timers.setTimeout(start, waitMs);
  };

  const call = (() => schedule()) as Coalesced;
  call.cancel = () => { cancelled = true; if (timer !== null) timers.clearTimeout(timer); timer = null; };
  return call;
}
