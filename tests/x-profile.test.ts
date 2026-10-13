import { describe, expect, it } from 'vitest';
import { isXProfileUrl, normalizeXHandle, normalizeXPostUrl, verifiedHandle, xHandleFor, xProfileUrl } from '../src/lib/x-profile';

describe('X profile helpers', () => {
  it('accepts handles and canonical X or legacy Twitter profile URLs', () => {
    expect(normalizeXHandle('@adpad')).toBe('adpad');
    expect(normalizeXHandle('https://x.com/openapps')).toBe('openapps');
    expect(normalizeXHandle('https://twitter.com/creator_one/status/1')).toBe('creator_one');
  });

  it('rejects non-X URLs and invalid handles', () => {
    expect(normalizeXHandle('https://example.com/adpad')).toBe('');
    expect(normalizeXHandle('not-a-handle')).toBe('');
    expect(normalizeXHandle('this_handle_is_over_fifteen')).toBe('');
  });

  it('shows a handle only when it came from a linked X account', () => {
    expect(verifiedHandle({ verifiedXId: '1234', verifiedXHandle: 'creator_one' })).toBe('creator_one');
    expect(xHandleFor({ verifiedXId: '1234', verifiedXHandle: 'creator_one' })).toBe('creator_one');
    // A typed handle is a claim, never displayed, even when it looks like the verified one.
    expect(verifiedHandle({ xHandle: 'claimed_handle' } as never)).toBe('');
    expect(xHandleFor({ verifiedXId: null, verifiedXHandle: 'claimed_handle' })).toBe('');
    expect(verifiedHandle(null)).toBe('');
    expect(isXProfileUrl('https://twitter.com/legacy')).toBe(true);
  });

  it('builds an HTTPS X profile URL', () => {
    expect(xProfileUrl('creator_one')).toBe('https://x.com/creator_one');
  });

  it('links only public X status URLs and strips tracking parameters', () => {
    expect(normalizeXPostUrl('https://twitter.com/creator_one/status/123456?utm_source=adpad')).toBe('https://x.com/creator_one/status/123456');
    expect(normalizeXPostUrl('https://x.com/creator_one/status/123456')).toBe('https://x.com/creator_one/status/123456');
    expect(normalizeXPostUrl('https://example.com/creator_one/status/123456')).toBe('');
    expect(normalizeXPostUrl('http://x.com/creator_one/status/123456')).toBe('');
    expect(normalizeXPostUrl('https://x.com/creator_one/status/not-a-post')).toBe('');
  });
});
