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
async function collect(req = request(), markets = ['CA', 'US', 'GB'], responder: (url: URL) => Response = () => json({ results: [], docs: [] }), options: { googleBooksKey?: string | null } = {}) {
  vi.useFakeTimers();
  const urls: URL[] = [];
  const fetcher: typeof fetch = async input => { const url = new URL(String(input)); urls.push(url); return responder(url); };
  const pending = collectCatalogs(req, markets, new AbortController().signal, fetcher, options);
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

const googleOptions = { googleBooksKey: 'fake-google-secret' };
const volume = (overrides: Record<string, unknown> = {}) => ({ id: 'Fictional01', volumeInfo: {
  title: 'Second', subtitle: 'Example, Book Two', authors: ['Example Author'], language: 'en',
}, saleInfo: { isEbook: true }, ...overrides });
const qualifiedVolume = (day = '2027-03-01', overrides: Record<string, unknown> = {}) => volume({
  volumeInfo: { ...volume().volumeInfo, publishedDate: day },
  saleInfo: { isEbook: true, saleability: 'FOR_PREORDER', country: 'CA', onSaleDate: `${day}T00:00:00Z` }, ...overrides,
});
const unknownRequest = () => request({ target: { ...request().target, title: '' }, formats: ['book'] });
const googleUrls = (urls: URL[]) => urls.filter(url => url.hostname === 'www.googleapis.com');
const emptyCatalog = (url: URL) => json(url.hostname === 'www.googleapis.com' ? { totalItems: 0 } : { results: [], docs: [] });

test.each([undefined, null, '', '  '])('Google key %s preserves legacy calls without a missing-key reason', async googleBooksKey => {
  const { urls, result } = await collect(unknownRequest(), ['CA'], emptyCatalog, { googleBooksKey });
  expect(urls.map(url => url.hostname)).toEqual(['itunes.apple.com', 'openlibrary.org']);
  expect(urls[0].searchParams.get('term')).toBe('Example Example Author');
  expect(urls[1].searchParams.get('title')).toBe('Example');
  expect(result.usage.googlebooks).toBe(0); expect(result.reasons).toEqual([]);
});

test('enabled Google series lookup narrows later catalog terms only by identity', async () => {
  const req = unknownRequest();
  const { result, urls } = await collect(req, ['CA'], url => url.hostname === 'www.googleapis.com'
    ? json({ items: [volume()] }) : emptyCatalog(url), googleOptions);
  expect(urls[0].hostname).toBe('www.googleapis.com');
  expect(urls[0].pathname).toBe('/books/v1/volumes');
  expect(Object.fromEntries(urls[0].searchParams)).toEqual({ q: 'Example inauthor:Example Author',
    key: 'fake-google-secret', maxResults: '20', showPreorders: 'true', langRestrict: 'en' });
  expect(urls.find(url => url.hostname === 'itunes.apple.com')?.searchParams.get('term')).toBe('Second Example Author');
  expect(urls.find(url => url.hostname === 'openlibrary.org')?.searchParams.get('title')).toBe('Second');
  expect(googleUrls(urls).map(url => url.searchParams.get('q'))).toEqual(['Example inauthor:Example Author', 'intitle:Second inauthor:Example Author']);
  expect(urls.at(-1)?.hostname).toBe('www.googleapis.com');
  expect(result.usage.googlebooks).toBe(2); expect(result.evidence.identities).toHaveLength(1);
  expect(result.evidence.editions).toHaveLength(1); expect(req.target.title).toBe('');
  expect(parseExtraction(result.evidence, result.evidence.sources).ok).toBe(true);
});

test('literal supplied title and author survive every query even after normalized identity agreement', async () => {
  const title = 'Second & Third + "Fourth": A Subtitle!'; const author = 'Example & Author + "Other"';
  const req = request({ target: { ...request().target, title, author }, formats: ['book'] });
  const before = structuredClone(req);
  const { urls } = await collect(req, ['CA'], url => url.hostname === 'www.googleapis.com' ? json({ items: [volume({
    volumeInfo: { ...volume().volumeInfo, title: title.toUpperCase(), authors: [author.toUpperCase()] },
  })] }) : emptyCatalog(url), googleOptions);
  expect(googleUrls(urls).map(url => url.searchParams.get('q'))).toEqual([`intitle:${title} inauthor:${author}`, `Example inauthor:${author}`]);
  expect(urls.find(url => url.hostname === 'itunes.apple.com')?.searchParams.get('term')).toBe(`${title} ${author}`);
  expect(urls.find(url => url.hostname === 'openlibrary.org')?.searchParams.get('title')).toBe(title);
  expect(req).toEqual(before);
});

test('unknown series and author punctuation survive decoded query parameters', async () => {
  const req = unknownRequest(); req.target.series = 'Example & "Other" + Series!'; req.target.author = 'A & B + "C"';
  const { urls } = await collect(req, ['CA'], emptyCatalog, googleOptions);
  expect(googleUrls(urls).map(url => url.searchParams.get('q'))).toEqual(['Example & "Other" + Series! inauthor:A & B + "C"']);
  expect(urls.find(url => url.hostname === 'itunes.apple.com')?.searchParams.get('term')).toBe('Example & "Other" + Series! A & B + "C"');
  expect(urls.find(url => url.hostname === 'openlibrary.org')?.searchParams.get('title')).toBe(req.target.series);
});

test('ambiguous Google identities remain alternatives and cannot narrow or authorize another query', async () => {
  const { result, urls } = await collect(unknownRequest(), ['CA'], url => url.hostname === 'www.googleapis.com'
    ? json({ items: [volume(), volume({ id: 'Fictional02', volumeInfo: { ...volume().volumeInfo, title: 'Alternative' } })] }) : emptyCatalog(url), googleOptions);
  expect(result.evidence.identities.map(item => item.title)).toEqual(['Second', 'Alternative']);
  expect(selectProposals(unknownRequest(), result.evidence, checkedAt).identity).toBeNull();
  expect(googleUrls(urls)).toHaveLength(1);
  expect(urls.find(url => url.hostname === 'itunes.apple.com')?.searchParams.get('term')).toBe('Example Example Author');
  expect(urls.find(url => url.hostname === 'openlibrary.org')?.searchParams.get('title')).toBe('Example');
});

test('second Google title lookup retains a contradictory identity from the original unknown target', async () => {
  const { result, urls } = await collect(unknownRequest(), ['CA'], url => url.hostname === 'www.googleapis.com'
    ? json({ items: [volume(url.searchParams.get('q')?.startsWith('intitle:') ? {
      volumeInfo: { ...volume().volumeInfo, title: 'Alternative' },
    } : {})] }) : emptyCatalog(url), googleOptions);
  expect(googleUrls(urls)).toHaveLength(2);
  expect(result.evidence.identities.map(item => item.title)).toEqual(['Second', 'Alternative']);
  expect(new Set(result.evidence.sources.map(item => item.id)).size).toBe(2);
  expect(selectProposals(unknownRequest(), result.evidence, checkedAt).identity).toBeNull();
  expect(parseExtraction(result.evidence, result.evidence.sources).ok).toBe(true);
});

test('Google and legacy normalized records retain shared Open Library language citations on multiple editions', async () => {
  const { result } = await collect(unknownRequest(), ['CA'], url => {
    if (url.hostname === 'www.googleapis.com') return json({ items: [volume()] });
    if (url.pathname === '/search.json') return json(ol.search);
    if (url.pathname.startsWith('/books/')) return json(ol.editions.find((item: { key: string }) => `${item.key}.json` === url.pathname));
    return json({ results: [apple.ebook.results[0], { ...apple.ebook.results[0], trackId: 49 }] });
  }, googleOptions);
  const appleEditions = result.evidence.editions.filter(item => item.id.startsWith('apple:'));
  expect(appleEditions).toHaveLength(2);
  for (const item of appleEditions) {
    expect(item.language).toBe('en'); expect(item.citations.some(citation => citation.sourceId.startsWith('openlibrary:'))).toBe(true);
  }
  expect(result.evidence.editions.some(item => item.id.startsWith('googlebooks:'))).toBe(true);
  expect(result.evidence.identities).toHaveLength(1);
  expect(parseExtraction(result.evidence, result.evidence.sources).ok).toBe(true);
});

test.each([
  { subtitle: 'Other, Book Two' }, { subtitle: 'Example: Book Two' },
  { authors: ['Wrong Author'] }, { language: 'fr' },
])('unvalidated Google identity %j cannot retitle later queries', async facts => {
  const { result, urls } = await collect(unknownRequest(), ['CA'], url => url.hostname === 'www.googleapis.com'
    ? json({ items: [volume({ volumeInfo: { ...volume().volumeInfo, ...facts } })] }) : emptyCatalog(url), googleOptions);
  expect(result.evidence.identities).toEqual([]); expect(googleUrls(urls)).toHaveLength(1);
  expect(urls.find(url => url.hostname === 'itunes.apple.com')?.searchParams.get('term')).toBe('Example Example Author');
});

test('effective unknown title limits Open Library exact edition candidates', async () => {
  const { urls } = await collect(unknownRequest(), ['CA'], url => {
    if (url.hostname === 'www.googleapis.com') return json({ items: [volume()] });
    if (url.pathname === '/search.json') return json({ docs: [
      { title: 'Other', author_name: ['Example Author'], edition_key: ['OL999M'] }, ...ol.search.docs,
    ] });
    if (url.pathname.startsWith('/books/')) return json(ol.editions.find((item: { key: string }) => `${item.key}.json` === url.pathname));
    return emptyCatalog(url);
  }, googleOptions);
  expect(urls.filter(url => url.hostname === 'openlibrary.org' && url.pathname.startsWith('/books/')).map(url => url.pathname)).toEqual(['/books/OL101M.json', '/books/OL102M.json']);
});

test('unresolved known title gets one series alternate, including a title found only in that response', async () => {
  const { result, urls } = await collect(request({ formats: ['book'] }), ['CA'], url => url.hostname === 'www.googleapis.com'
    ? json(url.searchParams.get('q')?.startsWith('intitle:') ? { totalItems: 0 } : { items: [qualifiedVolume()] }) : emptyCatalog(url), googleOptions);
  expect(googleUrls(urls).map(url => url.searchParams.get('q'))).toEqual(['intitle:Second inauthor:Example Author', 'Example inauthor:Example Author']);
  expect(result.usage.googlebooks).toBe(2); expect(selectProposals(request(), result.evidence, checkedAt).releases.book?.date).toBe('2027-03-01');
});

test.each(['resolved-book', 'audio-only', 'only-audio-missing'])('Google stops after one request for %s needs', async mode => {
  const req = mode === 'audio-only' ? request({ formats: ['audio'] }) : request({ formats: mode === 'resolved-book' ? ['book'] : ['book', 'audio'] });
  const { result, urls } = await collect(req, ['CA', 'US', 'GB'], url => url.hostname === 'www.googleapis.com'
    ? json({ items: [qualifiedVolume()] }) : emptyCatalog(url), googleOptions);
  expect(googleUrls(urls)).toHaveLength(1); expect(result.usage.googlebooks).toBe(1);
  expect(result.evidence.editions.every(item => item.format === 'ebook')).toBe(true);
});

test('Google collisions across queries preserve each immutable source and qualified day conflict', async () => {
  const { result } = await collect(unknownRequest(), ['CA'], url => {
    if (url.hostname !== 'www.googleapis.com') return emptyCatalog(url);
    return json({ items: [url.searchParams.get('q')?.startsWith('intitle:') ? qualifiedVolume('2028-03-01') : volume()] });
  }, googleOptions);
  expect(result.evidence.sources).toHaveLength(2); expect(result.evidence.identities).toHaveLength(2);
  expect(new Set(result.evidence.editions.map(item => item.id)).size).toBe(2);
  expect(parseExtraction(result.evidence, result.evidence.sources).ok).toBe(true);
  const conflict = await collect(request({ formats: ['book'], target: { ...request().target, position: 2.5 } }), ['CA'], url => {
    if (url.hostname !== 'www.googleapis.com') return emptyCatalog(url);
    return json({ items: [qualifiedVolume(url.searchParams.get('q')?.startsWith('intitle:') ? '2027-03-01' : '2028-03-01')] });
  }, googleOptions);
  expect(conflict.result.evidence.editions).toHaveLength(2);
  expect(new Set(conflict.result.evidence.sources.map(item => item.id)).size).toBe(2);
  // Fractional targets are unresolved without identity, but both incompatible dates survive.
  expect(conflict.result.evidence.editions.map(item => item.date)).toEqual(['2027-03-01', '2028-03-01']);
  const req = request({ formats: ['book'] });
  expect(selectProposals(req, conflict.result.evidence, checkedAt).conflicts).toHaveLength(1);
  for (const item of conflict.result.evidence.editions) for (const citation of item.citations)
    expect(conflict.result.evidence.sources.find(source => source.id === citation.sourceId)?.text).toContain(citation.quote);
});

test('duplicate Google IDs with incompatible identity texts keep every alternative and long citation part', async () => {
  const title = 'T'.repeat(280); const author = 'A'.repeat(280); const req = unknownRequest(); req.target.author = author;
  const { result } = await collect(req, ['CA'], url => url.hostname === 'www.googleapis.com' ? json({ items: [
    volume({ volumeInfo: { ...volume().volumeInfo, title, authors: [author] } }),
    volume({ volumeInfo: { ...volume().volumeInfo, title: 'Alternative', authors: [author] } }),
  ] }) : emptyCatalog(url), googleOptions);
  expect(result.evidence.identities).toHaveLength(2); expect(result.evidence.editions).toHaveLength(2);
  expect(new Set(result.evidence.sources.map(item => item.id)).size).toBe(2);
  expect(result.evidence.identities[0].citations.length).toBeGreaterThan(1);
  expect(parseExtraction(result.evidence, result.evidence.sources).ok).toBe(true);
});

test('Google ISBN never supplies missing Apple language and actual CA book and GB audio stay independent', async () => {
  const { result, urls } = await collect(request(), ['CA', 'US', 'GB'], url => {
    if (url.hostname === 'www.googleapis.com') return json({ items: [qualifiedVolume('2027-03-02', {
      volumeInfo: { ...volume().volumeInfo, publishedDate: '2027-03-02', industryIdentifiers: [{ type: 'ISBN_13', identifier: apple.ebook.results[0].isbn13 }] },
    })] });
    if (url.hostname === 'openlibrary.org') return json({ docs: [] });
    return json({ results: url.searchParams.get('entity') === 'ebook' ? [apple.ebook.results[0]]
      : url.searchParams.get('country') === 'gb' ? [{ ...apple.audio.results[0], collectionViewUrl: 'https://books.apple.com/gb/audiobook/second/id51' }] : [] });
  }, googleOptions);
  expect(result.evidence.editions.find(item => item.id.startsWith('apple:'))?.language).toBeNull();
  const proposals = selectProposals(request(), result.evidence, checkedAt);
  expect(proposals.releases.book?.provenance.sourceMarket).toBe('CA'); expect(proposals.releases.book?.provenance.editionFormat).toBe('ebook');
  expect(proposals.releases.audio?.provenance.sourceMarket).toBe('GB');
  expect(urls.filter(url => url.searchParams.get('entity') === 'ebook')).toHaveLength(1);
});

test.each([
  { payload: {}, status: 429, reason: 'quota' }, { payload: {}, status: 503, reason: 'provider-error' },
  { payload: { totalItems: 1 }, status: 200, reason: 'invalid-evidence' },
  { payload: { items: 'wrong' }, status: 200, reason: 'invalid-evidence' },
])('Google failed started requests count once per unique query and retain prior Apple evidence: $reason $status', async ({ payload, status, reason }) => {
  const { result, urls } = await collect(request({ formats: ['book'] }), ['CA'], url => url.hostname === 'www.googleapis.com'
    ? json(payload, status) : url.hostname === 'itunes.apple.com' ? json({ results: [apple.ebook.results[1]] }) : emptyCatalog(url), googleOptions);
  expect(result.usage.googlebooks).toBe(1); expect(googleUrls(urls)).toHaveLength(1);
  expect(result.reasons).toEqual([reason]); expect(result.evidence.editions[0].date).toBe('2027-03-02');
  expect(JSON.stringify(result.reasons)).not.toContain('fake-google-secret');
});

test('failed Google requests never retry identical queries and total requests stop at two', async () => {
  const { result, urls } = await collect(request({ formats: ['book'] }), ['CA'], url => url.hostname === 'www.googleapis.com'
    ? json({}, 429) : emptyCatalog(url), googleOptions);
  expect(result.usage.googlebooks).toBe(2); expect(googleUrls(urls)).toHaveLength(2);
  expect(new Set(googleUrls(urls).map(url => url.search))).toHaveProperty('size', 2);
  expect(result.reasons).toEqual(['quota']);
});

test('oversized Google items retain the first twenty and deduplicate repeated rows', async () => {
  const { result } = await collect(request({ formats: ['book'] }), ['CA'], url => url.hostname === 'www.googleapis.com'
    ? json({ items: [...Array.from({ length: 20 }, (_, i) => qualifiedVolume('2027-03-01', { id: `Fictional${i}` })), qualifiedVolume('2026-12-01', { id: 'Discarded' })] }) : emptyCatalog(url), googleOptions);
  expect(result.usage.googlebooks).toBe(1); expect(result.reasons).toEqual(['budget']);
  expect(result.evidence.sources).toHaveLength(20); expect(result.evidence.editions).toHaveLength(20);
  expect(result.evidence.sources.some(item => item.id.includes('Discarded'))).toBe(false);
});

test('enabled concurrent checks share Google start spacing while delayed responses retain per-check counts', async () => {
  vi.resetModules(); const { collectCatalogs: isolatedCollect } = await import('../../server/discovery/catalogs');
  vi.useFakeTimers(); const starts: number[] = [];
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === 'www.googleapis.com') {
      starts.push(performance.now()); await new Promise(resolve => setTimeout(resolve, 100)); return json({ items: [qualifiedVolume()] });
    }
    return emptyCatalog(url);
  };
  const calls = Array.from({ length: 2 }, () => isolatedCollect(request({ formats: ['book'] }), ['CA'], new AbortController().signal, fetcher, googleOptions));
  await vi.runAllTimersAsync(); const results = await Promise.all(calls);
  expect(starts).toHaveLength(2); expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1100);
  expect(results.map(item => item.usage.googlebooks)).toEqual([1, 1]);
});

test('cancelling queued Google work has zero attempts and no provider work for that check', async () => {
  vi.resetModules(); const { collectCatalogs: isolatedCollect } = await import('../../server/discovery/catalogs');
  vi.useFakeTimers(); const controller = new AbortController(); const starts: number[] = [];
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === 'www.googleapis.com') { starts.push(performance.now()); await new Promise(resolve => setTimeout(resolve, 100)); return json({ items: [qualifiedVolume()] }); }
    return emptyCatalog(url);
  };
  const first = isolatedCollect(request({ formats: ['book'] }), ['CA'], new AbortController().signal, fetcher, googleOptions);
  const second = isolatedCollect(request({ formats: ['book'] }), ['CA'], controller.signal, fetcher, googleOptions);
  await vi.advanceTimersByTimeAsync(1); controller.abort(); await vi.runAllTimersAsync();
  const result = await second; await first;
  expect(starts).toHaveLength(1); expect(result.usage).toMatchObject({ googlebooks: 0, apple: 0, openlibrary: 0 });
  expect(result.reasons).toEqual(['cancelled']);
});

test('cancelling a started Google request keeps one attempt and stops all later providers', async () => {
  vi.resetModules(); const { collectCatalogs: isolatedCollect } = await import('../../server/discovery/catalogs');
  vi.useFakeTimers(); const controller = new AbortController();
  const fetcher = vi.fn<typeof fetch>(async () => { controller.abort(); return json({ items: [qualifiedVolume()] }); });
  const pending = isolatedCollect(request(), ['CA', 'US', 'GB'], controller.signal, fetcher, googleOptions);
  await vi.runAllTimersAsync(); const result = await pending;
  expect(fetcher).toHaveBeenCalledOnce(); expect(result.usage).toMatchObject({ googlebooks: 1, apple: 0, openlibrary: 0 });
  expect(result.reasons).toEqual(['cancelled']);
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
