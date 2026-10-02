// @vitest-environment node
import { expect, test, vi } from 'vitest';
import { collectCoverCandidates } from '../../server/discovery/covers';
import { normalizeAppleCovers, normalizeGoogleCovers, normalizeHardcoverCovers, normalizeOpenLibraryCovers } from '../../server/discovery/coverCatalogs';
import { normalizeHardcover } from '../../server/discovery/hardcover';
import { validateCoverImageUrl, parseCoverCandidates, parseCoverRequest } from '../../shared/coverValidation';
import type { CoverRequest } from '../../shared/covers';
import { request as checkRequest } from './fixtures';

const cover = (overrides: Partial<CoverRequest> = {}): CoverRequest => ({ requestId: 'r1', seriesId: 'series-1', series: 'Example', author: 'Example Author',
  nextTitle: 'NextBook', position: 2, previousTitle: 'PreviousBook', preferredMarket: 'CA', ...overrides });
const ascension = { url: 'https://assets.hardcover.app/books/777/ascension.jpg', width: 1617, height: 2560 };
const hardcoverRows = (author = 'Example Author') => ({ data: { series: [{ name: 'Example', author: { name: author }, book_series: [
  { position: 2, book: { id: 777, slug: 'nextbook', title: 'NextBook', cached_image: ascension,
    contributions: [{ author: { name: author }, contributor_role: { name: 'Author' } }], editions: [] } },
  { position: 1, book: { id: 776, slug: 'previousbook', title: 'PreviousBook', cached_image: { url: 'https://assets.hardcover.app/books/776/p.jpg' },
    contributions: [{ author: { name: author }, contributor_role: { name: 'Author' } }], editions: [] } },
] }] } });
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('Hardcover cached_image gives named next and previous roles with source URLs', () => {
  const { candidates } = normalizeHardcoverCovers(hardcoverRows(), cover());
  expect(candidates.map(item => [item.role, item.title, item.imageUrl])).toEqual([
    ['next', 'NextBook', ascension.url], ['previous', 'PreviousBook', 'https://assets.hardcover.app/books/776/p.jpg']]);
  expect(candidates[0].source.url).toBe('https://hardcover.app/books/nextbook');
  expect(candidates[0]).toMatchObject({ provider: 'hardcover', width: 1617, height: 2560 });
});

test('a different author never yields a candidate and is offered only as a suggestion', () => {
  const rows = hardcoverRows('Other Writer');
  expect(normalizeHardcoverCovers(rows, cover()).candidates).toEqual([]);
  const google = normalizeGoogleCovers({ items: [{ id: 'g1', volumeInfo: { title: 'NextBook', authors: ['Other Writer'],
    imageLinks: { thumbnail: 'http://books.google.com/books/content?id=g1&zoom=1' } } }] }, cover());
  expect(google.candidates).toEqual([]);
  expect(google.authorSuggestions).toEqual([{ author: 'Other Writer', title: 'NextBook', source: expect.objectContaining({ url: 'https://books.google.com/books?id=g1' }) }]);
});

test('Google images keep their query, upgrade to HTTPS and gain no guessed transforms', () => {
  const { candidates } = normalizeGoogleCovers({ items: [{ id: 'g1', volumeInfo: { title: 'NextBook', authors: ['Example Author'], language: 'en',
    industryIdentifiers: [{ type: 'ISBN_13', identifier: '9781234567897' }],
    imageLinks: { thumbnail: 'http://books.google.com/books/content?id=g1&printsec=frontcover&img=1&zoom=1&edge=curl' } } },
  { id: 'g2', volumeInfo: { title: 'Unrelated', authors: ['Example Author'], imageLinks: { thumbnail: 'https://books.google.com/x' } } }] }, cover());
  expect(candidates).toHaveLength(1);
  expect(candidates[0].imageUrl).toBe('https://books.google.com/books/content?id=g1&printsec=frontcover&img=1&zoom=1&edge=curl');
  expect(candidates[0]).toMatchObject({ role: 'next', editionKey: 'isbn:9781234567897', provider: 'googlebooks' });
});

test('Apple exact-work ebook art is eligible and square audio art stays labelled audio', () => {
  const ebook = normalizeAppleCovers({ results: [{ trackId: 5, trackName: 'NextBook', artistName: 'Example Author',
    trackViewUrl: 'https://books.apple.com/ca/book/nextbook/id5', artworkUrl100: 'https://is3-ssl.mzstatic.com/image/thumb/Publication/a/100x100bb.jpg' },
  { trackId: 6, trackName: 'NextBook', artistName: 'Someone Else', trackViewUrl: 'https://books.apple.com/ca/book/nextbook/id6',
    artworkUrl100: 'https://is3-ssl.mzstatic.com/image/thumb/Publication/b/100x100bb.jpg' }] }, 'ebook', cover());
  expect(ebook.candidates).toHaveLength(1);
  expect(ebook.candidates[0]).toMatchObject({ format: 'ebook', role: 'next', provider: 'apple' });
  expect(ebook.authorSuggestions).toHaveLength(1);
  const audio = normalizeAppleCovers({ results: [{ collectionId: 9, collectionName: 'NextBook (Unabridged)', artistName: 'Example Author',
    collectionViewUrl: 'https://books.apple.com/ca/audiobook/nextbook/id9', artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/c/100x100bb.jpg' }] }, 'audio', cover());
  expect(audio.candidates[0]).toMatchObject({ format: 'audio', role: 'next' });
});

test('Open Library uses cover_i and carries the cover edition key', () => {
  const { candidates } = normalizeOpenLibraryCovers({ docs: [{ key: '/works/OL1W', title: 'PreviousBook', author_name: ['Example Author'], cover_i: 42, cover_edition_key: 'OL7M' },
    { key: '/works/OL2W', title: 'NextBook', author_name: ['Example Author'] }] }, cover());
  expect(candidates).toHaveLength(1);
  expect(candidates[0]).toMatchObject({ role: 'previous', imageUrl: 'https://covers.openlibrary.org/b/id/42-L.jpg', editionKey: 'OL7M' });
});

test.each([
  ['https://covers.openlibrary.org/b/id/1-L.jpg', true], ['https://assets.hardcover.app/a.jpg', true], ['https://is5-ssl.mzstatic.com/a.jpg', true],
  ['http://books.google.com/x?id=1&zoom=1', true], ['http://covers.openlibrary.org/a.jpg', false], ['https://is6-ssl.mzstatic.com/a.jpg', false],
  ['https://user:pw@books.google.com/x', false], ['https://books.google.com/x#frag', false], ['https://127.0.0.1/a.jpg', false],
  ['https://evil.example/a.jpg', false], ['https://books.google.com.evil.example/a.jpg', false],
])('validates cover URL %s', (url, ok) => { expect(validateCoverImageUrl(url) !== null).toBe(ok); });

test('candidate lists are schema validated and capped at nine', () => {
  const item = normalizeHardcoverCovers(hardcoverRows(), cover()).candidates[0];
  expect(parseCoverCandidates([item])).toEqual([item]);
  expect(() => parseCoverCandidates(Array.from({ length: 10 }, (_, index) => ({ ...item, id: `c${index}` })))).toThrow();
  expect(() => parseCoverCandidates([{ ...item, imageUrl: 'https://evil.example/a.jpg' }])).toThrow();
  expect(parseCoverRequest({ ...cover() }).ok).toBe(true);
  expect(parseCoverRequest({ ...cover(), extra: 1 }).ok).toBe(false);
});

test('release Hardcover identities survive a missing image and expose a sidecar when present', () => {
  const req = checkRequest({ target: { series: 'Example', author: 'Example Author', position: 2, title: 'NextBook', orderNote: '' } });
  const raw = (image: unknown) => ({ data: { series: [{ name: 'Example', author: { name: 'Example Author' }, book_series: [{ id: 1, position: 2, featured: true, compilation: false, details: null,
    book: { id: 777, slug: 'nextbook', title: 'NextBook', compilation: false, ...(image === undefined ? {} : { cached_image: image }),
      contributions: [{ author: { name: 'Example Author' }, contributor_role: { name: 'Author' } }],
      editions: [{ id: 5, title: 'NextBook', edition_format: 'Ebook', reading_format: null, isbn_10: null, isbn_13: null, language: { code2: 'en', code3: 'eng' } }] } }] }] } });
  const sidecar: unknown[] = [];
  const bundle = normalizeHardcover(raw(ascension), req, '2026-10-01T00:00:00Z', undefined, sidecar as never);
  expect(bundle.identities).toHaveLength(1);
  expect(sidecar).toEqual([expect.objectContaining({ role: 'next', imageUrl: ascension.url, workKey: expect.any(String) })]);
  const missing: unknown[] = [];
  expect(normalizeHardcover(raw(undefined), req, '2026-10-01T00:00:00Z', undefined, missing as never).identities).toHaveLength(1);
  expect(missing).toEqual([]);
  expect(normalizeHardcover(raw({ url: 'https://evil.example/a.jpg' }), req, '2026-10-01T00:00:00Z', undefined, missing as never).identities).toHaveLength(1);
  expect(missing).toEqual([]);
});

test('collection honours the separate budget and skips Google without a key', async () => {
  const calls: string[] = [];
  const fetcher = vi.fn(async (url: URL | string, init?: RequestInit) => {
    const u = new URL(String(url)); calls.push(`${u.hostname}${u.pathname}`);
    if (u.hostname === 'api.hardcover.app') { expect(JSON.stringify(init?.headers)).toContain('Bearer'); return reply(hardcoverRows()); }
    if (u.hostname === 'itunes.apple.com') return reply({ results: [] });
    return reply({ docs: [] });
  });
  const result = await collectCoverCandidates(cover(), { tavilyKey: null, deepseekKey: null, hardcoverToken: 'tok', googleBooksKey: null, model: 'deepseek-flash' },
    new AbortController().signal, fetcher as never);
  expect(calls.filter(call => call.startsWith('api.hardcover')).length).toBe(1);
  expect(calls.filter(call => call.startsWith('itunes')).length).toBeLessThanOrEqual(2);
  expect(calls.filter(call => call.startsWith('openlibrary')).length).toBeLessThanOrEqual(2);
  expect(calls.some(call => call.includes('googleapis'))).toBe(false);
  expect(result.outcomes.map(item => item.provider)).not.toContain('googlebooks');
  expect(result.candidates.map(item => item.role)).toEqual(['next', 'previous']);
}, 20000);

test('a failing provider does not erase others and quota with no results is reported', async () => {
  const fetcher = vi.fn(async (url: URL | string) => {
    const host = new URL(String(url)).hostname;
    if (host === 'api.hardcover.app') return reply(hardcoverRows());
    if (host === 'itunes.apple.com') return reply({}, 429);
    if (host === 'www.googleapis.com') return reply({}, 500);
    return reply({ docs: [] });
  });
  const result = await collectCoverCandidates(cover(), { tavilyKey: null, deepseekKey: null, hardcoverToken: 'tok', googleBooksKey: 'gk', model: 'deepseek-flash' },
    new AbortController().signal, fetcher as never);
  const state = (provider: string) => result.outcomes.find(item => item.provider === provider)?.state;
  expect(state('hardcover')).toBe('ok'); expect(state('apple')).toBe('quota'); expect(state('googlebooks')).toBe('failed'); expect(state('openlibrary')).toBe('no-match');
  expect(result.candidates.length).toBe(2);
}, 20000);
