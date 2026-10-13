import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Static copies of index.html with their own share tags, so a shared link to
// a page previews with that page's title even before any script runs.
const SHARED_PAGES = [{
  path: 'how-it-works',
  title: 'How payment works · AdPad',
  description: 'Where the USDC is at every step of an AdPad deal: book, lock in escrow, proof, check, approval, a 24-hour challenge window, payout.',
  url: 'https://adpad-wugc.openapps.xyz/how-it-works',
}];

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function sharedPageHtml(): Plugin {
  return {
    name: 'shared-page-html',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const index = bundle['index.html'];
      if (!index || index.type !== 'asset') return;
      const html = String(index.source);
      for (const page of SHARED_PAGES) {
        const title = escape(page.title); const description = escape(page.description);
        const out = html
          .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
          .replace(/(<meta (?:property="og:title"|name="twitter:title") content=")[^"]*"/g, `$1${title}"`)
          .replace(/(<meta (?:name="description"|property="og:description"|name="twitter:description") content=")[^"]*"/g, `$1${description}"`)
          .replace('<meta property="og:type"', `<meta property="og:url" content="${page.url}" />\n    <meta property="og:type"`);
        this.emitFile({ type: 'asset', fileName: `${page.path}/index.html`, source: out });
        this.emitFile({ type: 'asset', fileName: `${page.path}.html`, source: out });
      }
    },
  };
}

// A signed-in visit restores the wallet session by lazily loading the wallet provider chunks,
// which used to start after the page's load event. Anything that leaves the page right after
// load (a quick click away, the platform's page check) cancelled that request mid-flight.
// Preloading these small chunks from index.html starts them with the first paint and keeps the
// load event waiting for them. Guarded by tests/build-output.test.ts.
const PRELOAD_CHUNKS = /^assets\/(?:injected-wallet-provider-|client-)[\w-]+\.js$/;

function walletChunkPreload(): Plugin {
  return {
    name: 'wallet-chunk-preload',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const index = bundle['index.html'];
      if (!index || index.type !== 'asset') return;
      const links = Object.keys(bundle).filter((name) => PRELOAD_CHUNKS.test(name)).sort()
        .map((name) => `    <link rel="modulepreload" crossorigin href="/${name}" />`);
      if (!links.length) return;
      index.source = String(index.source).replace('</head>', `${links.join('\n')}\n  </head>`);
    },
  };
}

export default defineConfig({
  plugins: [react(), walletChunkPreload(), sharedPageHtml()],
  // Vite lists each lazy chunk's dependencies as "assets/x.js" (relative to the site root) and
  // prepends "/" at runtime. Anything that resolves those strings against the chunk's own URL
  // (crawlers and link scanners do) asks for /assets/assets/x.js and gets a 404. Defining
  // renderBuiltUrl, even as a no-op, makes Vite write the root-absolute "/assets/x.js" instead,
  // which resolves to the same file from anywhere. Guarded by tests/build-output.test.ts.
  experimental: { renderBuiltUrl: () => undefined },
  define: { global: 'globalThis' },
  resolve: { alias: { buffer: 'buffer/' } },
  server: { port: 5178, strictPort: true },
});
