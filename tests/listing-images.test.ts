import { describe, expect, it } from 'vitest';
import { LISTING_IMAGE_MAX_BYTES, safeListingImageUrl, validateListingImage } from '../src/lib/listing-images';

describe('listing photo validation', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])('accepts %s at the upload limit', type => {
    expect(() => validateListingImage({ type, size: LISTING_IMAGE_MAX_BYTES })).not.toThrow();
  });
  it.each(['image/svg+xml', 'text/html', 'application/pdf', ''])('rejects unsupported %s content', type => {
    expect(() => validateListingImage({ type, size: 100 })).toThrow('Choose a JPG');
  });
  it('rejects empty and oversized files', () => {
    expect(() => validateListingImage({ type: 'image/png', size: 0 })).toThrow();
    expect(() => validateListingImage({ type: 'image/png', size: LISTING_IMAGE_MAX_BYTES + 1 })).toThrow();
  });
});

describe('listing image rendering', () => {
  it('allows bundled concept images and public HTTPS photos', () => {
    expect(safeListingImageUrl('/images/tshirt.webp')).toBe('/images/tshirt.webp');
    expect(safeListingImageUrl('https://realtime.bounded.sh/storage/photo')).toBe('https://realtime.bounded.sh/storage/photo');
  });
  it.each(['javascript:alert(1)', 'data:image/svg+xml,<svg/>', '//example.com/a.jpg', '/images/../secret', 'http://example.com/a.jpg', 'https://user:pass@example.com/a.jpg', 'https://localhost/a.jpg', 'https://127.0.0.1/a.jpg', 'https://192.168.1.1/a.jpg', 'https://[::1]/a.jpg'])('rejects unsafe source %s', value => {
    expect(safeListingImageUrl(value)).toBeNull();
  });
  it('leaves missing legacy photos to the fallback', () => {
    expect(safeListingImageUrl(undefined)).toBeNull();
    expect(safeListingImageUrl(null)).toBeNull();
    expect(safeListingImageUrl('https://example.com/' + 'x'.repeat(2048))).toBeNull();
  });
});
