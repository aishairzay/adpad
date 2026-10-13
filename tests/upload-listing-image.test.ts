import { beforeEach, describe, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ setFile: vi.fn(), getFiles: vi.fn() }));
vi.mock('@bounded-sh/client', () => sdk);
import { uploadListingImage } from '../src/lib/upload-listing-image';

const values = new Map<string, string>();
beforeEach(() => {
  values.clear(); sdk.setFile.mockReset(); sdk.getFiles.mockReset();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});
const photo = () => new File(['test image bytes'], 'photo.png', { type: 'image/png' });
const url = 'https://realtime.bounded.sh/storage/public/photo';

describe('photo upload reconciliation', () => {
  it('reuses an uploaded photo when the listing is submitted again', async () => {
    sdk.setFile.mockImplementation(async path => ({ status: 'uploaded', path, url, visibility: 'public' }));
    expect(await uploadListingImage(photo(), 'alice')).toBe(url);
    expect(await uploadListingImage(photo(), 'alice')).toBe(url);
    expect(sdk.setFile).toHaveBeenCalledTimes(1);
  });
  it('reconciles an ambiguous upload without sending bytes twice', async () => {
    sdk.setFile.mockResolvedValue({ status: 'unknown', path: 'listingImages/alice/files/actual', retrySafe: false });
    sdk.getFiles.mockResolvedValueOnce({ data: [] });
    await expect(uploadListingImage(photo(), 'alice')).rejects.toThrow('not been confirmed');
    sdk.getFiles.mockResolvedValueOnce({ data: [{ path: 'listingImages/alice/files/actual', url }] });
    expect(await uploadListingImage(photo(), 'alice')).toBe(url);
    expect(sdk.setFile).toHaveBeenCalledTimes(1);
  });
  it('keeps a missing ambiguous upload pending', async () => {
    sdk.setFile.mockResolvedValue({ status: 'unknown', path: 'listingImages/alice/files/actual', retrySafe: false });
    sdk.getFiles.mockResolvedValue({ data: [] });
    await expect(uploadListingImage(photo(), 'alice')).rejects.toThrow();
    await expect(uploadListingImage(photo(), 'alice')).rejects.toThrow('still unconfirmed');
    expect(sdk.setFile).toHaveBeenCalledTimes(1);
  });
  it('reconciles storage metadata paths with a leading slash', async () => {
    sdk.setFile.mockResolvedValue({ status: 'unknown', path: 'listingImages/alice/files/actual', retrySafe: false });
    sdk.getFiles.mockResolvedValue({ data: [{ path: '/listingImages/alice/files/actual', url }] });
    expect(await uploadListingImage(photo(), 'alice')).toBe(url);
    expect(sdk.setFile).toHaveBeenCalledTimes(1);
  });
  it('does not persist an expiring signed link as a public listing photo', async () => {
    sdk.setFile.mockResolvedValue({ status: 'uploaded', path: 'listingImages/alice/files/actual', url: null, visibility: 'private' });
    sdk.getFiles.mockResolvedValue({ data: [{ path: 'listingImages/alice/files/actual', url: url + '?token=temporary' }] });
    await expect(uploadListingImage(photo(), 'alice')).rejects.toThrow('not been confirmed');
  });
  it('allows a retry after a definitive upload rejection', async () => {
    sdk.setFile.mockRejectedValueOnce(new Error('Upload failed with status: 413'));
    await expect(uploadListingImage(photo(), 'alice')).rejects.toThrow('413');
    sdk.setFile.mockImplementation(async path => ({ status: 'uploaded', path, url, visibility: 'public' }));
    expect(await uploadListingImage(photo(), 'alice')).toBe(url);
    expect(sdk.setFile).toHaveBeenCalledTimes(2);
  });
});
