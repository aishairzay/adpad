/**
 * Every release replaces the app's code files with new names and the old ones stop existing.
 * A tab opened before a release still asks for the old names the first time it needs a part
 * of the app it has not loaded yet (sign-in, wallet, funding), and those requests fail.
 *
 * This reloads the page once so the tab picks up the current release. A short guard stops a
 * reload loop when the failure is something else (offline, a blocked file): then the error
 * surfaces normally and the page shows its own message.
 */
export const STALE_RELOAD_KEY = 'adpad:stale-build-reload';
export const STALE_RELOAD_GUARD_MS = 30_000;

type GuardStore = Pick<Storage, 'getItem' | 'setItem'>;

/** True when a reload was not already tried within the guard window (and records this one). */
export function claimStaleReload(store: GuardStore | null, now: number): boolean {
  let last = 0;
  try { last = Number(store?.getItem(STALE_RELOAD_KEY) || 0); } catch { last = 0; }
  if (Number.isFinite(last) && last > 0 && now - last < STALE_RELOAD_GUARD_MS) return false;
  try { store?.setItem(STALE_RELOAD_KEY, String(now)); } catch { /* storage blocked: still reload once */ }
  return true;
}

function sessionStore(win: Window): GuardStore | null {
  try { return win.sessionStorage; } catch { return null; }
}

/** Reload once on a stale code file instead of leaving the tab half broken. Returns true when it reloads. */
export function reloadForStaleBuild(win: Window = window, now = Date.now()): boolean {
  if (!claimStaleReload(sessionStore(win), now)) return false;
  win.location.reload();
  return true;
}

/** Vite fires `vite:preloadError` when a lazily loaded code file cannot be fetched. */
export function installStaleBuildReload(win: Window = window) {
  win.addEventListener('vite:preloadError', (event) => {
    if (reloadForStaleBuild(win)) event.preventDefault();
  });
}
