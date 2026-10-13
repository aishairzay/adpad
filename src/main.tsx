import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;
import { installStaleBuildReload, reloadForStaleBuild } from './lib/stale-build';

installStaleBuildReload();

/**
 * The app's code loads as a separate file. If that file cannot be fetched (a page cached from
 * before an update asking for files that were replaced, or a dropped connection), show a plain
 * message with a reload button instead of a blank page and an unhandled promise rejection.
 */
function showLoadError(error: unknown) {
  console.error('AdPad could not load its code', error);
  (window as unknown as { __adpadReleaseLoad?: () => void }).__adpadReleaseLoad?.();
  const root = document.getElementById('root');
  document.getElementById('boot-shell')?.remove();
  if (!root || root.childElementCount > 0) return;
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.style.cssText = 'max-width:420px;margin:15vh auto;padding:24px;font-family:system-ui,sans-serif;text-align:center;color:#151413';
  const title = document.createElement('h1');
  title.textContent = 'AdPad did not finish loading.';
  title.style.cssText = 'font-size:22px;margin:0 0 8px';
  const text = document.createElement('p');
  text.textContent = 'This usually happens right after an update or on a weak connection. Reloading fixes it.';
  text.style.cssText = 'margin:0 0 16px;line-height:1.5';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Reload';
  button.style.cssText = 'padding:10px 20px;border:2px solid #151413;background:#d9fc4b;font-weight:700;cursor:pointer';
  button.addEventListener('click', () => location.reload());
  box.append(title, text, button);
  root.append(box);
}

import('./bootstrap').catch((error) => {
  // A tab restored from before a release asks for code files that no longer exist: reload once first.
  if (!reloadForStaleBuild()) showLoadError(error);
});
