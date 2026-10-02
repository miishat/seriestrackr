import { afterEach, expect, test, vi } from 'vitest';
import { fetchCoverImageUrls } from '../src/services/covers';
import { decodeCover, fetchCoverCandidates, isPortrait, rankCovers, selectableCover } from '../src/services/coverImages';
import type { CoverCandidate } from '../shared/covers';

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

test('partial provider failure with no surviving covers reports an incomplete search', async () => {
  vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('openlibrary')
    ? Promise.reject(new Error('offline'))
    : Promise.resolve({ ok: true, json: async () => ({ items: [] }) })));
  await expect(fetchCoverImageUrls('Example', 'Writer', '', 'Next Title')).rejects.toThrow(/incomplete/i);
});

// Structured cover retrieval (the legacy export above stays only until the Task 9 picker migrates).
const candidate = (overrides: Partial<CoverCandidate> = {}): CoverCandidate => ({ id: 'c1', title: 'Next', author: 'Writer', role: 'next', format: 'ebook',
  provider: 'openlibrary', source: { id: 's', title: 'Next', url: 'https://openlibrary.org/works/OL1W' }, imageUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg',
  workKey: 'next|writer', editionKey: null, width: null, height: null, ...overrides });

test.each([[400, 400, false], [1200, 630, false], [1617, 2560, true], [65, 100, true]])(
  'checks decoded portrait dimensions %d x %d', (width, height, expected) => {
    expect(isPortrait(width, height)).toBe(expected);
  });

function stubImage(width: number, height: number, fail = false) {
  const images: { src: string }[] = [];
  vi.stubGlobal('Image', class {
    naturalWidth = width; naturalHeight = height; onload: (() => void) | null = null; onerror: (() => void) | null = null;
    private source = '';
    get src() { return this.source; }
    set src(value: string) { this.source = value; images.push(this); if (value) queueMicrotask(() => (fail ? this.onerror : this.onload)?.()); }
  });
  return images;
}

test('decoding trusts loaded dimensions, never metadata', async () => {
  stubImage(1617, 2560);
  const decoded = await decodeCover(candidate({ width: 400, height: 400 }), new AbortController().signal);
  expect(decoded).toMatchObject({ width: 1617, height: 2560 });
  stubImage(400, 400);
  expect(await decodeCover(candidate({ width: 1617, height: 2560 }), new AbortController().signal)).toBeNull();
});

test('square audio art decodes but stays labelled audio, and failures or aborts yield null', async () => {
  stubImage(500, 500);
  expect(await decodeCover(candidate({ format: 'audio' }), new AbortController().signal)).toMatchObject({ format: 'audio', width: 500, height: 500 });
  stubImage(500, 500, true);
  expect(await decodeCover(candidate(), new AbortController().signal)).toBeNull();
  const controller = new AbortController(); controller.abort();
  expect(await decodeCover(candidate(), controller.signal)).toBeNull();
});

test('ranks next portraits before previous, then larger images, keeping audio labels', () => {
  const ranked = rankCovers([
    candidate({ id: 'p', role: 'previous', width: 2000, height: 3000 }), candidate({ id: 'small', width: 65, height: 100 }),
    candidate({ id: 'audio', format: 'audio', width: 900, height: 900 }), candidate({ id: 'big', width: 1617, height: 2560 })]);
  expect(ranked.map(item => item.id)).toEqual(['big', 'small', 'audio', 'p']);
  expect(ranked.find(item => item.id === 'audio')?.format).toBe('audio');
  expect(selectableCover(ranked.find(item => item.id === 'audio')!)).toBe(false);
  expect(selectableCover(ranked[0])).toBe(true);
});

test('fetches covers only from the local service when called, never from providers', async () => {
  const body = { requestId: 'r', seriesId: 's', candidates: [candidate()], authorSuggestions: [], outcomes: [{ provider: 'openlibrary', state: 'ok' }] };
  const fetcher = vi.fn(async () => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetcher);
  const request = { requestId: 'r', seriesId: 's', series: 'Ex', author: 'Writer', nextTitle: 'Next', position: 2, previousTitle: null, preferredMarket: 'CA' };
  expect(fetcher).not.toHaveBeenCalled();
  const result = await fetchCoverCandidates(request, new AbortController().signal);
  expect(result.candidates).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect((fetcher.mock.calls[0] as unknown[])[0]).toBe('/api/discovery/covers');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...body, requestId: 'other' }), { headers: { 'content-type': 'application/json' } })));
  await expect(fetchCoverCandidates(request, new AbortController().signal)).rejects.toThrow();
});
