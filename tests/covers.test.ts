import { afterEach, expect, test, vi } from 'vitest';
import { fetchCoverImageUrls } from '../src/services/covers';

afterEach(() => vi.unstubAllGlobals());

test('returns a usable provider result when another provider fails', async () => {
  vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('openlibrary')
    ? Promise.reject(new Error('offline'))
    : Promise.resolve({ ok: true, json: async () => ({ items: [{ volumeInfo: { imageLinks: { thumbnail: 'https://books.google.com/cover.jpg' } } }] }) })));
  await expect(fetchCoverImageUrls('Example', 'Writer', '', 'Next Title')).resolves.toContain('https://books.google.com/cover.jpg');
});

test('distinguishes no matching cover from all providers failing', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ docs: [], items: [] }) })));
  await expect(fetchCoverImageUrls('Example', 'Writer', '', 'Next Title')).resolves.toEqual([]);
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  await expect(fetchCoverImageUrls('Example', 'Writer', '', 'Next Title')).rejects.toThrow(/failed/i);
});
