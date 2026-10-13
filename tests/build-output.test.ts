import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Checks the built site in dist/ (run `npm run build` first; skipped when there is no build).
const dist = join(__dirname, '..', 'dist');
const assetsDir = join(dist, 'assets');
const built = existsSync(join(dist, 'index.html')) && existsSync(assetsDir);
const chunks = built ? readdirSync(assetsDir).filter(name => name.endsWith('.js')) : [];

/** Every string in a chunk's __vite__mapDeps list. */
function mapDeps(code: string): string[] {
  const list = code.match(/__vite__mapDeps=\(i,m=__vite__mapDeps,d=\(m\.f\|\|\(m\.f=(\[[^\]]*\])/);
  return list ? (JSON.parse(list[1]) as string[]) : [];
}

describe.skipIf(!built)('built code files', () => {
  it('lists lazy-chunk dependencies as root-absolute /assets/ paths', () => {
    const deps = chunks.flatMap(name => mapDeps(readFileSync(join(assetsDir, name), 'utf8')));
    expect(deps.length).toBeGreaterThan(5);
    expect(deps.filter(dep => !dep.startsWith('/assets/'))).toEqual([]);
  });

  it('every dependency resolves to a real file from the chunk that names it (no /assets/assets/)', () => {
    const broken: string[] = [];
    for (const name of chunks) {
      const chunkUrl = new URL(`/assets/${name}`, 'https://adpad.fyi');
      for (const dep of mapDeps(readFileSync(join(assetsDir, name), 'utf8'))) {
        const resolved = new URL(dep, chunkUrl).pathname;
        if (resolved.startsWith('/assets/assets/') || !existsSync(join(dist, resolved))) broken.push(`${name}: ${dep} -> ${resolved}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('ships /manifest.json and /llms.txt', () => {
    expect(JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8')).name).toBe('AdPad');
    expect(readFileSync(join(dist, 'llms.txt'), 'utf8')).toContain('Pages worth reading');
  });
  it('index.html paints a visible branded shell before the app code loads (QA screenshots after load are not blank)', () => {
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    expect(html).toMatch(/<div id="boot-shell"/);
    expect(html).toMatch(/#boot-shell\s*\{[^}]*background:\s*#d9fc4b/);
    expect(html).toContain('Get seen. Everywhere.');
  });

  it('preloads the wallet provider chunk from index.html, and the link points at a real file', () => {
    for (const page of ['index.html', 'how-it-works/index.html']) {
      const html = readFileSync(join(dist, page), 'utf8');
      const hrefs = [...html.matchAll(/<link rel="modulepreload" crossorigin href="([^"]+)"/g)].map(m => m[1]);
      expect(hrefs.some(href => /^\/assets\/injected-wallet-provider-[\w-]+\.js$/.test(href))).toBe(true);
      expect(hrefs.filter(href => !existsSync(join(dist, href)))).toEqual([]);
    }
  });
});
