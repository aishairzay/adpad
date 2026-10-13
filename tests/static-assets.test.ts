import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STALE_RELOAD_GUARD_MS, claimStaleReload, reloadForStaleBuild } from '../src/lib/stale-build';

const root = join(__dirname, '..');
const publicDir = join(root, 'public');
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');

function publicFileFor(url: string) {
  return join(publicDir, url.split(/[?#]/)[0].replace(/^\//, ''));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(tsx?|css)$/.test(name) ? [path] : [];
  });
}

describe('homepage static files', () => {
  it('every local file index.html links to exists in public/', () => {
    const refs = [...indexHtml.matchAll(/(?:href|src|content)="(\/[^"/][^"]*)"/g)].map(m => m[1]).filter(ref => !ref.startsWith('/src/'));
    expect(refs.length).toBeGreaterThan(1);
    const missing = refs.filter(ref => !existsSync(publicFileFor(ref)));
    expect(missing).toEqual([]);
  });

  it('links /manifest.json, which is a valid manifest whose icons exist', () => {
    expect(indexHtml).toContain('<link rel="manifest" href="/manifest.json" />');
    for (const name of ['manifest.json', 'site.webmanifest']) {
      const manifest = JSON.parse(readFileSync(join(publicDir, name), 'utf8'));
      expect(manifest.name).toBe('AdPad');
      expect(manifest.start_url).toBe('/');
      expect(manifest.icons.length).toBeGreaterThan(0);
      for (const icon of manifest.icons) expect(existsSync(publicFileFor(icon.src)), icon.src).toBe(true);
    }
  });

  it('every root-relative image or file named in the source exists in public/', () => {
    const missing: string[] = [];
    for (const file of sourceFiles(join(root, 'src'))) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/["'(](\/(?:brand|events|images|badges|icon|favicon|apple-touch|og-image)[^"')\s]*\.(?:png|webp|svg|jpg|jpeg|ico|gif|avif))["')]/g)) {
        if (!existsSync(publicFileFor(match[1]))) missing.push(`${file.slice(root.length + 1)}: ${match[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('stale code files after a release', () => {
  function memoryStore(initial?: string) {
    const data = new Map<string, string>(initial ? [['adpad:stale-build-reload', initial]] : []);
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
  }

  it('reloads once, then lets the error surface inside the guard window', () => {
    const store = memoryStore();
    expect(claimStaleReload(store, 1_000_000)).toBe(true);
    expect(claimStaleReload(store, 1_000_000 + 5_000)).toBe(false);
    expect(claimStaleReload(store, 1_000_000 + STALE_RELOAD_GUARD_MS + 1)).toBe(true);
  });

  it('still reloads once when storage is unavailable', () => {
    expect(claimStaleReload(null, 5)).toBe(true);
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(claimStaleReload(throwing, 5)).toBe(true);
  });

  it('reloads the page through location.reload', () => {
    let reloads = 0;
    const store = memoryStore();
    const win = { sessionStorage: store, location: { reload: () => { reloads += 1; } } } as unknown as Window;
    expect(reloadForStaleBuild(win, 10_000_000)).toBe(true);
    expect(reloadForStaleBuild(win, 10_000_100)).toBe(false);
    expect(reloads).toBe(1);
  });

  it('the entry file installs the handler and retries the first load', () => {
    const main = readFileSync(join(root, 'src/main.tsx'), 'utf8');
    expect(main).toContain('installStaleBuildReload()');
    expect(main).toMatch(/if \(!reloadForStaleBuild\(\)\) showLoadError\(error\)/);
  });
});
