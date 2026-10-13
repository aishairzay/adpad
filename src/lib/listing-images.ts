export const LISTING_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const LISTING_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

export function validateListingImage(file: Pick<File, 'size' | 'type'>): void {
  if (!LISTING_IMAGE_TYPES.some(type => type === file.type)) {
    throw new Error('Choose a JPG, PNG, WebP, or AVIF image.');
  }
  if (file.size <= 0 || file.size > LISTING_IMAGE_MAX_BYTES) {
    throw new Error('Choose an image smaller than 5 MB.');
  }
}

export function safeListingImageUrl(value?: string | null): string | null {
  if (!value || value.length > 2048) return null;
  if (/^\/images\/[a-zA-Z0-9_-]+\.(webp|png|jpe?g|avif)$/.test(value)) return value;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host.startsWith('[') || /^\d+(\.\d+){3}$/.test(host)) return null;
    return url.href;
  } catch { return null; }
}
