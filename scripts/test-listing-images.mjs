import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { init, createWalletClient } from '@bounded-sh/server';
import { Keypair } from '@solana/web3.js';

if (process.argv.includes('--help')) {
  console.log('After deploying the image storage policy, run: node scripts/test-listing-images.mjs\nCreates one immutable tiny public PNG and one inactive test listing. Uses ephemeral identities kept only in memory. No escrow or money operations.');
  process.exit(0);
}

const config = JSON.parse(readFileSync(new URL('../bounded.json', import.meta.url), 'utf8'));
if (!config.appId || config.protocol !== 'realtime_offchain') {
  throw new Error('Image integration test requires this project to be explicitly configured for Poofnet.');
}

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
const makePng = () => new File([png], 'listing-test.png', { type: 'image/png' });
let phase = 'initialize';
const rejectionEvidence = [];
let requestedImagePath;
let retainedImagePath;
let accountMatchesWallet;
let rejectedTypePath;
let oversizedPath;

function sanitizedMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/https?:\/\/\S+/gi, '[URL]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted token]')
    .replace(/("?(?:accessToken|idToken|refreshToken|secretKey|privateKey|authorization)"?\s*[:=]\s*)[^,\s}]+/gi, '$1[redacted]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 300);
}

async function accountId(client) {
  // This token came directly from this isolated SDK session. Decode only its
  // documented identity claims; never log or persist the bearer credential.
  const token = await client.getIdToken();
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(claims['custom:walletAddress'], client.address);
  assert.equal(claims['custom:appId'], config.appId);
  const id = claims['custom:userId'];
  assert.ok(typeof id === 'string' && id.length > 0 && !id.includes('/'), 'Session must contain a path-safe account ID');
  return id;
}

function failureDetails(error) {
  const fields = ['code', 'status', 'statusCode', 'error', 'reason', 'details', 'requestId'];
  return Object.fromEntries(fields.flatMap(field => {
    const value = error?.[field];
    return typeof value === 'string' || typeof value === 'number' ? [[field, sanitizedMessage(value)]] : [];
  }));
}

function assertPublicUrl(value) {
  assert.equal(typeof value, 'string', 'The upload must expose a permanent public URL');
  const url = new URL(value);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.username, '');
  assert.equal(url.password, '');
  for (const key of url.searchParams.keys()) {
    assert.doesNotMatch(key, /token|signature|credential|expires/i, 'Do not persist a signed private download URL');
  }
  assert.ok(value.length <= 2048, 'Public URL must fit listing.imageUrl');
  return value;
}

async function mustDeny(operation, label) {
  try {
    await operation();
  } catch (error) {
    // These ownership checks require an actual policy denial. Input-validation
    // errors are not evidence that the permission boundary was enforced.
    const message = error instanceof Error ? error.message : String(error);
    if (/\b403\b|denied|forbidden|not allowed/i.test(message) && !/\b400\b|not defined|not a function/i.test(message)) {
      rejectionEvidence.push({ check: label, enforcement: 'policy' });
      return;
    }
    throw new Error(`${label}: rejection did not match the expected boundary: ${sanitizedMessage(error)}`);
  }
  throw new Error(`${label}: operation was unexpectedly allowed.`);
}

try {
  await init({ appId: config.appId, network: config.environment === 'staging' ? 'bounded-staging' : 'bounded-production' });
  // Neither secret keys nor auth/session objects are written to disk or logged.
  const makeClient = () => createWalletClient({ keypair: JSON.stringify([...Keypair.generate().secretKey]) });
  const owner = await makeClient();
  const outsider = await makeClient();
  const ownerId = await accountId(owner);
  const outsiderId = await accountId(outsider);
  assert.notEqual(ownerId, outsiderId);
  accountMatchesWallet = ownerId === owner.address;
  const prefix = `listingImages/${ownerId}/files`;
  const fresh = label => `${prefix}/${label}_${randomUUID().replaceAll('-', '_')}`;

  phase = 'cross-user upload denial';
  await mustDeny(() => outsider.setFile(fresh('outsider'), makePng()), phase);

  phase = 'owner upload';
  requestedImagePath = fresh('image');
  const upload = await owner.setFile(requestedImagePath, makePng());
  retainedImagePath = upload.path;
  assert.ok('status' in upload && upload.status === 'uploaded', 'Ambiguous upload outcome: reconcile the returned path before any retry');
  const savedPath = upload.path.replace(/^\//, '');
  assert.ok(savedPath.startsWith(`${prefix}/`), 'Retain the returned path in the owner namespace');

  phase = 'public file metadata and URL';
  const files = await outsider.getFiles(prefix);
  assert.ok(Array.isArray(files?.data), 'getFiles must return its documented data array');
  const image = files.data.find(item => item.path?.replace(/^\//, '') === savedPath);
  assert.ok(image, 'A different identity must be able to list this public image');
  assert.equal(image.metadata?.contentType, 'image/png');
  assert.equal(image.metadata?.size, png.length);
  assert.equal(image.metadata?.status, 'ready');
  const imageUrl = assertPublicUrl(upload.url || image.url);
  const exactFiles = await owner.getFiles(savedPath);
  assert.ok(exactFiles?.data?.some(item => item.path?.replace(/^\//, '') === savedPath && item.url === imageUrl), 'The exact-path lookup used for browser reconciliation must return the public image');

  phase = 'anonymous image download';
  // A plain fetch carries no Bounded session or authorization headers.
  const response = await fetch(imageUrl, { cache: 'no-store' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /^image\/png(?:;|$)/i);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);

  phase = 'immutable image bytes';
  await mustDeny(() => owner.setFile(savedPath, makePng()), 'Owner cannot replace an uploaded image');
  await mustDeny(() => outsider.setFile(savedPath, makePng()), 'Outsider cannot replace another user’s image');
  await mustDeny(() => owner.setFile(savedPath, null), 'Owner cannot revoke a published immutable image');
  await mustDeny(() => outsider.setFile(savedPath, null), 'Outsider cannot delete another user’s image');

  phase = 'listing image persistence';
  const listingPath = `listings/image_test_${randomUUID().replaceAll('-', '_')}`;
  await owner.set(listingPath, {
    owner: ownerId, seller: owner.address, publisher: 'Ad Pad image test',
    title: 'Inactive image upload test', kind: 'service', category: 'Photography', channel: 'Test harness',
    description: 'Automated inactive test listing; no advertising service is offered.',
    deliverables: 'No actual advertising deliverables.', audience: 'No real audience',
    priceMicro: 1000000, turnaroundDays: 1, active: false,
    createdAt: Math.floor(Date.now() / 1000) - 2, imageUrl,
  });
  const persisted = await outsider.get(listingPath, { bypassCache: true });
  assert.equal(persisted.imageUrl, imageUrl);
  assert.equal(persisted.kind, 'service');
  assert.equal(persisted.category, 'Photography');
  await mustDeny(() => outsider.set(listingPath, { imageUrl: 'https://example.com/replacement.png' }), 'Outsider cannot replace the listing image reference');
  assert.equal((await owner.get(listingPath, { bypassCache: true })).imageUrl, imageUrl);

  phase = 'post-denial byte preservation';
  const after = await fetch(imageUrl, { cache: 'no-store' });
  assert.equal(after.status, 200);
  assert.deepEqual(Buffer.from(await after.arrayBuffer()), png);

  async function assertNotPublic(result, label) {
    assert.equal(result.status, 'uploaded', `Reconcile the retained ${label} path before any retry`);
    assert.notEqual(result.visibility, 'public', `${label} must never receive a public-read verdict`);
    assert.equal(result.url, null, `${label} must never expose a permanent public URL`);
    // Reuse the actual URL returned for the valid image, replacing only its
    // documented concrete path query. This carries no session or signed token.
    const deniedUrl = new URL(imageUrl);
    assert.equal(deniedUrl.searchParams.get('path'), savedPath);
    deniedUrl.searchParams.set('path', result.path.replace(/^\//, ''));
    const deniedDownload = await fetch(deniedUrl, { cache: 'no-store' });
    assert.equal(deniedDownload.status, 403, `${label} must refuse direct anonymous download`);
    await deniedDownload.arrayBuffer();
    const listed = await outsider.getFiles(prefix);
    assert.ok(!listed?.data?.some(item => item.path?.replace(/^\//, '') === result.path.replace(/^\//, '')), `${label} must not appear in public file listings`);
    rejectionEvidence.push({ check: `${label} denies anonymous HTTP GET and cannot receive a public URL or appear in public listings`, enforcement: 'persisted metadata read policy' });
  }

  phase = 'unsupported MIME is never publicly served';
  const svgUpload = await owner.setFile(fresh('svg_read_gate'), new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'test.svg', { type: 'image/svg+xml' }));
  rejectedTypePath = svgUpload.path;
  await assertNotPublic(svgUpload, 'SVG');

  phase = 'actual 5 MiB plus 1 byte upload is never publicly served';
  const oversized = new Uint8Array(5 * 1024 * 1024 + 1);
  oversized.set(png);
  const oversizedUpload = await owner.setFile(fresh('oversize_read_gate'), new File([oversized], 'oversize.png', { type: 'image/png' }));
  oversizedPath = oversizedUpload.path;
  await assertNotPublic(oversizedUpload, '5 MiB + 1 byte PNG');

  phase = 'only owner can delete invalid uploads';
  for (const path of [rejectedTypePath, oversizedPath]) {
    await mustDeny(() => outsider.setFile(path, null), 'Outsider cannot delete an invalid upload');
    const removal = await owner.setFile(path, null);
    assert.equal(removal.deleted, true, 'Owner can remove their exact unreadable test artifact');
  }
  console.log(JSON.stringify({
    ok: true, appId: config.appId, accountMatchesWallet, imagePath: savedPath, imageUrl, listingPath,
    outcome: 'Owner upload, public anonymous download, immutable valid images, service listing image ownership, unsupported-MIME/oversize public-serving denial and owner-only invalid-upload cleanup passed.',
    rejectionEvidence,
    invalidUploadsRemoved: [rejectedTypePath, oversizedPath],
    limitation: 'App-specific type/5MiB limits control public serving, not storage admission. Browser validates before upload; owners can delete unreadable invalid uploads.',
    retained: 'One tiny immutable public PNG and one inactive service listing. Both invalid test uploads were removed.',
  }, null, 2));
} catch (error) {
  // Avoid dumping SDK error objects, request headers, or session state.
  console.error(JSON.stringify({
    ok: false, appId: config.appId, phase, accountMatchesWallet,
    message: sanitizedMessage(error), details: failureDetails(error),
    requestedImagePath, retainedImagePath, rejectedTypePath, oversizedPath, rejectionEvidence,
    recovery: retainedImagePath ? 'Reconcile this exact retained path before any retry; an object may already have committed.' : undefined,
  }, null, 2));
  process.exitCode = 1;
}
