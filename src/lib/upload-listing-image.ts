import { getFiles, setFile } from '@bounded-sh/client';
import { APP_ID } from '../config';
import { safeListingImageUrl, validateListingImage } from './listing-images';

type UploadRecord = { path: string; url?: string };

function permanentImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const safe = safeListingImageUrl(value);
  if (!safe || !safe.startsWith('https:')) return null;
  const url = new URL(safe);
  if ([...url.searchParams.keys()].some(key => /token|signature|expires|credential|^sig$/i.test(key))) return null;
  return safe;
}

async function reconcileImage(path: string): Promise<string | null> {
  const response = await getFiles(path);
  const files = Array.isArray(response?.data) ? response.data : [];
  const file = files.find((item: { path?: string }) => item.path?.replace(/^\//, '') === path.replace(/^\//, ''));
  return file ? permanentImageUrl(file.url) : null;
}

/** Keep the same upload path after an ambiguous response or a failed listing save. */
export async function uploadListingImage(file: File, userId: string): Promise<string> {
  validateListingImage(file);
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const fingerprint = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  const key = `adpad:listing-image:${APP_ID}:${userId}:${file.type}:${fingerprint}`;
  const previous = localStorage.getItem(key);
  if (previous) {
    const saved = JSON.parse(previous) as UploadRecord;
    if (!saved.path.startsWith(`listingImages/${userId}/files/`)) throw new Error('The saved upload belongs to a different account.');
    const url = permanentImageUrl(saved.url) || await reconcileImage(saved.path);
    if (url) { localStorage.setItem(key, JSON.stringify({ path: saved.path, url })); return url; }
    throw new Error('Your previous photo upload is still unconfirmed. Please try again shortly; the same upload will be checked before anything is sent again.');
  }
  const path = `listingImages/${userId}/files/image_${crypto.randomUUID().replaceAll('-', '_')}`;
  localStorage.setItem(key, JSON.stringify({ path }));
  let result;
  try { result = await setFile(path, file); }
  catch (error) {
    const description = error instanceof Error ? error.message : String(error);
    // These responses definitively reject the upload. Lost responses remain pending.
    if (/\b(400|401|403|404|413|415|422)\b/.test(description)) localStorage.removeItem(key);
    throw error;
  }
  localStorage.setItem(key, JSON.stringify({ path: result.path }));
  const url = result.status === 'uploaded' && result.visibility === 'public'
    ? permanentImageUrl(result.url) || await reconcileImage(result.path)
    : await reconcileImage(result.path);
  if (!url) throw new Error('The photo upload has not been confirmed as publicly viewable yet. Try again shortly to check the same upload.');
  localStorage.setItem(key, JSON.stringify({ path: result.path, url }));
  return url;
}
