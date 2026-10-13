// Upload production listing photos to the PREVIEW's own storage so the preview
// cards carry real images (production storage is origin-locked to the live site).
import { readFileSync } from 'node:fs';
import { init, createWalletClient, setFile, getFiles } from '@bounded-sh/server';
import { Keypair } from '@solana/web3.js';

const config = JSON.parse(readFileSync(new URL('../bounded.json', import.meta.url), 'utf8'));
if (config.protocol !== 'realtime_offchain' || !config.appId) {
  throw new Error('Poofnet preview only.');
}
await init({ appId: config.appId, network: 'bounded-production' });
const client = await createWalletClient({ keypair: JSON.stringify([...Keypair.generate().secretKey]) });
const userId = client.address ?? client.user?.id;
if (!userId) throw new Error('No wallet user id for the upload path.');

const meta = JSON.parse(readFileSync('/tmp/imgs/meta.json', 'utf8'));
const out = [];
for (const item of meta) {
  const buf = readFileSync(item.file);
  const ext = item.type.includes('webp') ? 'webp' : 'img';
  const file = new File([buf], `photo.${ext}`, { type: item.type });
  const path = `listingImages/${userId}/files/image_${crypto.randomUUID().replaceAll('-', '_')}`;
  const result = await client.setFile(path, file);
  const files = (await client.getFiles(path))?.data ?? [];
  const rec = files.find(f => (f.path ?? '').replace(/^\//, '') === path);
  const url = rec?.url ?? result?.url ?? null;
  if (!url) throw new Error(`Upload not confirmed for ${item.title}: ${JSON.stringify(result).slice(0, 200)}`);
  out.push({ listingId: item.listingId, title: item.title, url, status: result.status, visibility: result.visibility });
}
console.log(JSON.stringify(out, null, 1));
