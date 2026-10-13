import type { Profile } from '../types';

const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;

export function normalizeXHandle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withoutAt = trimmed.replace(/^@/, '');
  if (X_HANDLE.test(withoutAt)) return withoutAt;
  try {
    const url = new URL(trimmed);
    if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname.toLowerCase())) return '';
    const handle = url.pathname.split('/').filter(Boolean)[0] || '';
    return X_HANDLE.test(handle) ? handle : '';
  } catch {
    return '';
  }
}

/** The X handle copied from the owner's linked account. A typed xHandle is a claim and is never returned. */
export function verifiedHandle(source?: { verifiedXId?: string | null; verifiedXHandle?: string | null } | null): string {
  if (!source?.verifiedXId) return '';
  return normalizeXHandle(source.verifiedXHandle || '');
}

export function xHandleFor(profile?: Pick<Profile, 'verifiedXHandle' | 'verifiedXId'> | null): string {
  return verifiedHandle(profile);
}

export function xProfileUrl(handle: string): string {
  return `https://x.com/${encodeURIComponent(handle)}`;
}

export function isXProfileUrl(value: string): boolean {
  try {
    return ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(new URL(value).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function normalizeXPostUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' || !isXProfileUrl(trimmed)) return '';
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 3 || !normalizeXHandle(parts[0]) || parts[1] !== 'status' || !/^\d{1,25}$/.test(parts[2])) return '';
    return `https://x.com/${parts[0]}/status/${parts[2]}`;
  } catch { return ''; }
}
