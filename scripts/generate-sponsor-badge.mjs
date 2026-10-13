import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const dataUrl = (path, mime) => `data:${mime};base64,${readFileSync(new URL(path, root)).toString('base64')}`;
const symbol = dataUrl('public/brand/adpad-symbol.png', 'image/png');
const openApps = dataUrl('public/brand/openapps-wordmark.svg', 'image/svg+xml');

const badge = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80" viewBox="0 0 320 80" role="img" aria-labelledby="title"><title id="title">Sponsor me on Ad Pad, powered by OpenApps</title><rect width="320" height="80" fill="#11110f"/><text x="16" y="18" fill="#d9fc4b" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="700" letter-spacing="1">ON ADPAD</text><text x="14" y="48" fill="#f6f6f0" font-family="Arial Black,Arial,Helvetica,sans-serif" font-size="25" font-weight="900" letter-spacing="-1">SPONSOR ME.</text><text x="16" y="68" fill="#f6f6f0" font-family="Arial,Helvetica,sans-serif" font-size="7" font-weight="700" letter-spacing=".8">POWERED BY</text><rect x="70" y="57" width="58" height="15" fill="#d9fc4b"/><image x="75" y="60" width="48" height="9" preserveAspectRatio="xMidYMid meet" href="${openApps}"/><image x="240" y="0" width="80" height="80" href="${symbol}"/></svg>`;

writeFileSync(fileURLToPath(new URL('public/badges/ad-pad-sponsor.svg', root)), badge);
