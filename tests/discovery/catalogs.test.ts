// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { collectCatalogs, normalizeApple, normalizeOpenLibrary } from '../../server/discovery/catalogs';
import { selectProposals } from '../../shared/discoveryPolicy';
import { parseExtraction } from '../../shared/discoveryValidation';
import { request } from './fixtures';

const checkedAt = '2026-09-29T12:00:00Z';
const apple = JSON.parse(readFileSync(new URL('./data/apple.json', import.meta.url), 'utf8'));
const ol = JSON.parse(readFileSync(new URL('./data/openlibrary.json', import.meta.url), 'utf8'));
afterEach(() => vi.useRealTimers());

test('catalog timestamp stays a provider calendar date and storefront never implies language', () => {
  const result = normalizeApple(apple.ebook, 'CA', 'ebook', checkedAt);
  expect(result.editions[0]).toMatchObject({ date: '2027-03-01', language: null, market: 'CA' });
  expect(result.sources[0].text).toContain('Language: unknown');
  expect(parseExtraction(result, result.sources).ok).toBe(true);
});

test('only exact English title and author dates survive policy selection', () => {
  const result = normalizeApple(apple.ebook, 'CA', 'ebook', checkedAt);
  expect(result.editions).toHaveLength(7);
  expect(selectProposals(request(), result, checkedAt).releases.book?.date).toBe('2027-03-02');
});

test('audio collection fields retain the author and never use narrator for author matching', () => {
  const result = normalizeApple(apple.audio, 'CA', 'audio', checkedAt);
  expect(result.editions[0]).toMatchObject({ title: 'Second', author: 'Example Author', format: 'audio' });
  expect(selectProposals(request(), result, checkedAt).releases.audio?.date).toBe('2027-04-01');
  expect(result.sources[0].text).toContain('Narrator: Other Narrator');
});

test('actual storefront governs market and contradictory country attribution is rejected', () => {
  const record = apple.ebook.results[1];
  expect(normalizeApple({ results: [record] }, 'US', 'ebook', checkedAt).editions[0].market).toBe('CA');
  expect(normalizeApple({ results: [{ ...record, country: 'US' }] }, 'CA', 'ebook', checkedAt).editions).toHaveLength(0);
  expect(normalizeApple({ results: [{ ...record, trackViewUrl: undefined }] }, 'CA', 'ebook', checkedAt).editions).toHaveLength(0);
});

test('distinct records with colliding IDs are retained as contradictory evidence', () => {
  const record = apple.ebook.results[1];
  const result = normalizeApple({ results: [record, { ...record, releaseDate: '2027-03-03T00:00:00Z' }] }, 'CA', 'ebook', checkedAt);
  expect(new Set(result.sources.map(s => s.id)).size).toBe(2);
  expect(selectProposals(request(), result, checkedAt).conflicts).toHaveLength(1);
});

test('invalid dates and languages remain unknown and excess Apple records are capped locally', () => {
  const record = { ...apple.ebook.results[1], releaseDate: '2027-02-30T00:00:00Z', language: undefined };
  const result = normalizeApple({ results: Array.from({ length: 25 }, (_, i) => ({ ...record, trackId: i + 100 })) }, 'CA', 'ebook', checkedAt);
  expect(result.editions).toHaveLength(20);
  expect(result.editions[0]).toMatchObject({ date: null, precision: 'none', language: null });
  expect(normalizeApple(null, 'CA', 'ebook', checkedAt).sources).toEqual([]);
});

test('Open Library work dates and aggregate languages never become edition facts', () => {
  const result = normalizeOpenLibrary(ol.search, checkedAt);
  expect(result.sources).toHaveLength(2);
  expect(result.editions).toEqual([]);
  expect(result.sources[0].text).toContain('Language: unknown');
});

test.each([
  ['March 1, 2027', '2027-03-01', 'day'], ['2027-03', '2027-03', 'month'],
  ['March 2027', '2027-03', 'month'], ['2027', '2027', 'year'],
  ['February 30, 2027', null, 'none'], ['Spring 2027', null, 'none'],
])('Open Library explicit edition date %s preserves precision', (input, date, precision) => {
  const result = normalizeOpenLibrary({ ...ol.editions[1], author_name: ['Example Author'], publish_date: input }, checkedAt);
  expect(result.editions[0]).toMatchObject({ date, precision, format: 'print', language: 'en', market: null });
  expect(parseExtraction(result, result.sources).ok).toBe(true);
});

test('Open Library requires an explicit edition format and resolves no language from ambiguous lists', () => {
  const record = { ...ol.editions[1], author_name: ['Example Author'], languages: [{ key: '/languages/eng' }, { key: '/languages/fre' }] };
  expect(normalizeOpenLibrary(record, checkedAt).editions[0].language).toBeNull();
  expect(normalizeOpenLibrary({ ...record, physical_format: undefined }, checkedAt).editions).toEqual([]);
});

const json = (input: unknown, status = 200) => new Response(JSON.stringify(input), { status, headers: { 'content-type': 'application/json' } });
async function collect(req = request(), markets = ['CA', 'US', 'GB'], responder: (url: URL) => Response = () => json({ results: [], docs: [] })) {
  vi.useFakeTimers();
  const urls: URL[] = [];
  const fetcher: typeof fetch = async input => { const url = new URL(String(input)); urls.push(url); return responder(url); };
  const pending = collectCatalogs(req, markets, new AbortController().signal, fetcher);
  await vi.runAllTimersAsync();
  return { result: await pending, urls };
}

test('collector queries preferred formats, Open Library once, then bounded unique fallback countries', async () => {
  const { result, urls } = await collect(request(), [' ca ', 'US', 'GB', 'CA', 'FR', 'bad', 'us']);
  expect(urls.map(url => url.hostname === 'itunes.apple.com' ? `${url.searchParams.get('country')}:${url.searchParams.get('entity')}` : url.pathname))
    .toEqual(['ca:ebook', 'ca:audiobook', '/search.json', 'us:ebook', 'us:audiobook', 'gb:ebook', 'gb:audiobook']);
  expect(result.usage).toMatchObject({ apple: 6, openlibrary: 1, tavily: 0, deepseek: 0 });
  for (const url of urls.filter(url => url.hostname === 'itunes.apple.com')) {
    expect(url.searchParams.get('term')).toBe('Second Example Author');
    expect(url.searchParams.get('limit')).toBe('20');
  }
});

test('fallback is per format and preserves actual source market', async () => {
  const { result, urls } = await collect(request(), ['CA', 'US', 'GB'], url => {
    if (url.hostname === 'openlibrary.org') return json({ docs: [] });
    if (url.searchParams.get('entity') === 'ebook') return json({ results: [apple.ebook.results[1]] });
    return json(url.searchParams.get('country') === 'us' ? { results: [{ ...apple.audio.results[0], collectionViewUrl: 'https://books.apple.com/us/audiobook/second/id51' }] } : { results: [] });
  });
  expect(urls.filter(url => url.searchParams.get('entity') === 'ebook')).toHaveLength(1);
  expect(selectProposals(request(), result.evidence, checkedAt).releases.audio?.provenance.sourceMarket).toBe('US');
  expect(result.usage.apple).toBe(4);
});

test('collector fetches at most two exact editions and joins Apple language only by shared ISBN', async () => {
  const { result, urls } = await collect(request({ formats: ['book'] }), ['CA', 'US'], url => {
    if (url.pathname === '/search.json') return json(ol.search);
    if (url.pathname.startsWith('/books/')) return json(ol.editions.find((item: { key: string }) => `${item.key}.json` === url.pathname));
    return json({ results: [apple.ebook.results[0], { ...apple.ebook.results[0], trackId: 49, isbn13: undefined }] });
  });
  expect(urls.filter(url => url.pathname.startsWith('/books/')).map(url => url.pathname)).toEqual(['/books/OL101M.json', '/books/OL102M.json']);
  expect(result.usage.openlibrary).toBe(3);
  expect(result.evidence.editions.find(item => item.id.startsWith('apple:42:'))).toMatchObject({ language: 'en', date: '2027-03-01' });
  expect(result.evidence.editions.find(item => item.id.startsWith('apple:49:'))?.language).toBeNull();
  expect(result.usage.apple).toBe(1);
  expect(parseExtraction(result.evidence, result.evidence.sources).ok).toBe(true);
});

test('failed and malformed providers retain successful evidence and sanitized reasons', async () => {
  const { result } = await collect(request({ formats: ['book'] }), ['CA', 'US'], url => {
    if (url.hostname === 'openlibrary.org') return json({}, 429);
    return url.searchParams.get('country') === 'ca' ? json({ results: [apple.ebook.results[1]] }) : json(null);
  });
  expect(result.reasons).toEqual(['quota']);
  expect(result.evidence.editions[0].date).toBe('2027-03-02');
  const malformed = await collect(request({ formats: ['book'] }), ['CA'], () => json(null));
  expect(malformed.result.reasons).toContain('invalid-evidence');
});

test('local caps signal budget while preserving later fallback candidates', async () => {
  const { result } = await collect(request({ formats: ['book'] }), ['CA', 'US'], url => {
    if (url.hostname === 'openlibrary.org') return json({ docs: [] });
    if (url.searchParams.get('country') === 'ca') return json({ results: Array.from({ length: 25 }, (_, i) => ({ ...apple.ebook.results[0], trackId: i + 100, isbn13: undefined })) });
    return json({ results: [{ ...apple.ebook.results[1], trackViewUrl: 'https://books.apple.com/us/book/second/id43' }] });
  });
  expect(result.reasons).toContain('budget');
  expect(result.evidence.editions).toHaveLength(21);
  expect(selectProposals(request(), result.evidence, checkedAt).releases.book?.provenance.sourceMarket).toBe('US');
});

test('unknown title uses series plus author and already cancelled collection never fetches', async () => {
  const req = request(); req.target.title = '';
  const { urls } = await collect(req, ['CA']);
  expect(urls[0].searchParams.get('term')).toBe('Example Example Author');
  const controller = new AbortController(); controller.abort();
  const fetcher = vi.fn<typeof fetch>(async () => json({ results: [] }));
  const result = await collectCatalogs(request(), ['CA'], controller.signal, fetcher);
  expect(result.reasons).toEqual(['cancelled']);
  expect(result.usage.apple).toBe(0);
  expect(fetcher).not.toHaveBeenCalled();
});

test('long bibliographic fields produce bounded literal citations', () => {
  const record = { ...apple.ebook.results[1], trackName: 'T'.repeat(300), artistName: 'A'.repeat(300) };
  const result = normalizeApple({ results: [record] }, 'CA', 'ebook', checkedAt);
  expect(parseExtraction(result, result.sources).ok).toBe(true);
  expect(result.editions[0].citations.every(item => result.sources[0].text.includes(item.quote))).toBe(true);
});

test('a contradictory explicit language cannot be erased by repeated ISBN joins', async () => {
  const { result } = await collect(request({ formats: ['book'] }), ['CA', 'US', 'GB'], url => {
    if (url.pathname === '/search.json') return json(ol.search);
    if (url.pathname.startsWith('/books/')) return json(ol.editions.find((item: { key: string }) => `${item.key}.json` === url.pathname));
    return json({ results: [{ ...apple.ebook.results[0], language: 'fr' }] });
  });
  expect(result.evidence.editions.find(item => item.id.startsWith('apple:42:'))?.language).toBeNull();
  expect(selectProposals(request(), result.evidence, checkedAt).releases.book?.provenance.sourceMarket).toBeNull();
});

test.each([
  { languages: ['eng', 'fre'] },
  { language: 'eng', languages: ['fre'] },
])('explicit mixed-language metadata cannot become English through an ISBN join: %j', async metadata => {
  const { result } = await collect(request({ formats: ['book'] }), ['CA', 'US', 'GB'], url => {
    if (url.pathname === '/search.json') return json(ol.search);
    if (url.pathname.startsWith('/books/')) return json(ol.editions.find((item: { key: string }) => `${item.key}.json` === url.pathname));
    return json({ results: [{ ...apple.ebook.results[0], ...metadata }] });
  });
  const candidate = result.evidence.editions.find(item => item.id.startsWith('apple:42:'));
  expect(candidate?.language).toBeNull();
  expect(selectProposals(request(), result.evidence, checkedAt).releases.book?.provenance.sourceMarket).toBeNull();
});

test('four allowed countries bound requests even when arbitrary extra inputs are supplied', async () => {
  const { result, urls } = await collect(request({ preferredMarket: 'AU' }), ['AU', 'US', 'GB', 'CA', 'FR', 'DE']);
  expect(result.usage.apple).toBe(8);
  expect(result.usage.openlibrary).toBe(1);
  expect(new Set(urls.filter(url => url.hostname === 'itunes.apple.com').map(url => url.searchParams.get('country')))).toEqual(new Set(['au', 'us', 'gb', 'ca']));
});

test('mismatched exact edition IDs cannot join language or author metadata', async () => {
  const { result } = await collect(request({ formats: ['book'] }), ['CA'], url => {
    if (url.pathname === '/search.json') return json(ol.search);
    if (url.pathname.startsWith('/books/')) return json({ ...ol.editions[0], key: '/books/OL999M' });
    return json({ results: [apple.ebook.results[0]] });
  });
  expect(result.reasons).toContain('invalid-evidence');
  expect(result.evidence.editions[0].language).toBeNull();
});

test('successful and failed responses are not persistently cached across collection calls', async () => {
  const first = await collect(request({ formats: ['book'] }), ['CA'], () => json({}, 429));
  const second = await collect(request({ formats: ['book'] }), ['CA'], url => json(url.hostname === 'itunes.apple.com' ? { results: [apple.ebook.results[1]] } : { docs: [] }));
  expect(first.result.reasons).toEqual(['quota']);
  expect(second.result.usage).toMatchObject({ apple: 1, openlibrary: 1 });
  expect(second.result.reasons).toEqual([]);
  expect(second.result.evidence.editions[0].date).toBe('2027-03-02');
});

test('concurrent collection calls share provider start spacing', async () => {
  vi.useFakeTimers();
  const starts: Record<string, number[]> = { apple: [], openlibrary: [] };
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    const provider = url.hostname === 'itunes.apple.com' ? 'apple' : 'openlibrary';
    starts[provider].push(performance.now());
    return json(provider === 'apple' ? { results: [] } : { docs: [] });
  };
  const calls = [collectCatalogs(request({ formats: ['book'] }), ['CA'], new AbortController().signal, fetcher),
    collectCatalogs(request({ formats: ['book'] }), ['CA'], new AbortController().signal, fetcher)];
  await vi.runAllTimersAsync();
  await Promise.all(calls);
  expect(starts.apple).toHaveLength(2);
  expect(starts.openlibrary).toHaveLength(2);
  expect(starts.apple[1] - starts.apple[0]).toBeGreaterThanOrEqual(3100);
  expect(starts.openlibrary[1] - starts.openlibrary[0]).toBeGreaterThanOrEqual(1100);
});

test('cancellation after successful evidence stops remaining retrieval and retains its facts', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const urls: URL[] = [];
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input)); urls.push(url);
    if (url.hostname === 'openlibrary.org') controller.abort();
    return json(url.hostname === 'itunes.apple.com' ? { results: [apple.ebook.results[0]] } : { docs: [] });
  };
  const pending = collectCatalogs(request({ formats: ['book'] }), ['CA', 'US', 'GB'], controller.signal, fetcher);
  await vi.runAllTimersAsync();
  const result = await pending;
  expect(result.reasons).toEqual(['cancelled']);
  expect(urls).toHaveLength(2);
  expect(result.evidence.editions[0].date).toBe('2027-03-01');
});
