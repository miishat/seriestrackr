// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { createDiscoveryRuntime } from '../../server/discovery/runtime';
import { runDiscovery } from '../../server/discovery/runDiscovery';
import { createRetrievalContext } from '../../server/discovery/retrievalContext';
import { request } from './fixtures';

afterEach(() => vi.useRealTimers());

test.each([false, true])('runtime creates no calls and wires configured Google key only when enabled: %s', async enabled => {
  vi.useFakeTimers(); const urls: URL[] = [];
  const fetcher = vi.fn<typeof fetch>(async input => {
    const url = new URL(String(input)); urls.push(url);
    return Response.json(url.hostname === 'www.googleapis.com' ? { totalItems: 0 } : { results: [], docs: [] });
  });
  const runtime = createDiscoveryRuntime({ tavilyKey: null, deepseekKey: null, model: 'deepseek-flash',
    ...(enabled ? { googleBooksKey: ' fake-runtime-secret ' } : {}) }, fetcher);
  expect(fetcher).not.toHaveBeenCalled();
  const pending = runtime.catalogs(request({ formats: ['book'] }), ['CA'], new AbortController().signal);
  await vi.runAllTimersAsync(); const result = await pending;
  const google = urls.filter(url => url.hostname === 'www.googleapis.com');
  expect(google).toHaveLength(enabled ? 2 : 0); expect(result.usage.googlebooks).toBe(enabled ? 2 : 0);
  if (enabled) {
    expect(urls[0].hostname).toBe('www.googleapis.com');
    expect(google.every(url => url.pathname === '/books/v1/volumes' && url.searchParams.get('key') === 'fake-runtime-secret')).toBe(true);
  }
  expect(urls.every(url => ['www.googleapis.com', 'itunes.apple.com', 'openlibrary.org'].includes(url.hostname))).toBe(true);
});

test('runDiscovery preserves runtime Google attempts without AI or search calls', async () => {
  vi.useFakeTimers(); const fetcher = vi.fn<typeof fetch>(async input => {
    const url = new URL(String(input));
    return Response.json(url.hostname === 'www.googleapis.com' ? { totalItems: 0 } : { results: [], docs: [] });
  });
  const runtime = createDiscoveryRuntime({ tavilyKey: null, deepseekKey: 'fake-unused-secret',
    googleBooksKey: 'fake-runtime-secret', model: 'deepseek-flash' }, fetcher);
  const pending = runDiscovery(request({ formats: ['book'], useAi: false }), runtime, new AbortController().signal);
  await vi.runAllTimersAsync(); const result = await pending;
  expect(result.summary.usage).toMatchObject({ googlebooks: 2, tavily: 0, deepseek: 0 });
  expect(fetcher.mock.calls.every(([input]) => ['www.googleapis.com', 'itunes.apple.com', 'openlibrary.org'].includes(new URL(String(input)).hostname))).toBe(true);
});

test('runtime seeds Hardcover before planning catalog queries and preserves empty input title', async () => {
  vi.useFakeTimers(); const urls: URL[] = [];
  const original = request({ target: { ...request().target, title: '' }, formats: ['book'] });
  const fetcher = vi.fn<typeof fetch>(async input => {
    const url = new URL(String(input)); urls.push(url);
    if (url.hostname === 'api.hardcover.app') return Response.json({ data: { series: [{ name: 'Example', book_series: [{
      position: 2, featured: true, compilation: false, details: '2', book: { id: 20, title: 'Found Second', slug: 'found-second', compilation: false,
        contributions: [{ author: { name: 'Example Author' }, contributor_role: { name: 'Author' } }],
        editions: [{ id: 40, title: 'Found Second', edition_format: 'ebook', language: { code2: 'en', code3: 'eng' } }] },
    }] }] } });
    return Response.json(url.hostname === 'www.googleapis.com' ? { totalItems: 0 } : { results: [], docs: [] });
  });
  const runtime = createDiscoveryRuntime({ tavilyKey: null, deepseekKey: null, googleBooksKey: 'fake', hardcoverToken: 'fake-token', model: 'deepseek-flash' }, fetcher);
  expect(fetcher).not.toHaveBeenCalled();
  const pending = runDiscovery(original, runtime, new AbortController().signal); await vi.runAllTimersAsync(); const result = await pending;
  expect(urls[0].hostname).toBe('api.hardcover.app'); expect(original.target.title).toBe('');
  expect(urls.find(url => url.hostname === 'www.googleapis.com')?.searchParams.get('q')).toBe('intitle:Found Second inauthor:Example Author');
  expect(urls.find(url => url.hostname === 'itunes.apple.com')?.searchParams.get('term')).toBe('Found Second Example Author');
  expect(result.summary.usage.hardcover).toBe(1); expect(result.proposals.identity?.title).toBe('Found Second');
  expect(result.summary.usage.deepseek).toBe(0);
});
test('failed Hardcover preserves independent catalog evidence and attempted count', async () => {
  vi.useFakeTimers(); const fetcher = vi.fn<typeof fetch>(async input => {
    const url = new URL(String(input));
    return Response.json(url.hostname === 'api.hardcover.app' ? { errors: [{ message: 'fictional-secret' }] } : { totalItems: 0, results: [], docs: [] });
  });
  const runtime = createDiscoveryRuntime({ tavilyKey: null, deepseekKey: null, hardcoverToken: 'fake', model: 'deepseek-flash' }, fetcher);
  const pending = runtime.catalogs(request(), ['CA'], new AbortController().signal); await vi.runAllTimersAsync(); const result = await pending;
  expect(result.usage).toMatchObject({ hardcover: 1, apple: 1, openlibrary: 1 }); expect(result.reasons).toContain('invalid-evidence');
  expect(JSON.stringify(result)).not.toContain('fictional-secret');
});


test('runtime enables reviewed exact ISBN lookup using English Hardcover ebook and Apple market date without AI', async () => {
  vi.useFakeTimers(); const urls: URL[] = [];
  const original = request({ target: { ...request().target, title: '' }, formats: ['book'], useAi: false });
  const fetcher = vi.fn<typeof fetch>(async input => {
    const url = new URL(String(input)); urls.push(url);
    if (url.hostname === 'api.hardcover.app') return Response.json({ data: { series: [{ name: 'Example', book_series: [{
      position: 2, featured: true, compilation: false, details: '2', book: { id: 20, title: 'Found Second', slug: 'found-second', compilation: false,
        contributions: [{ author: { name: 'Example Author' }, contributor_role: { name: 'Author' } }],
        editions: [{ id: 40, title: 'Found Second', edition_format: 'ebook', isbn_13: '9780000000002', language: { code2: 'en', code3: 'eng' }, release_date: '2024-01-01' }] },
    }] }] } });
    if (url.hostname === 'itunes.apple.com' && url.pathname === '/lookup') return Response.json({ results: [{
      trackId: 50, trackName: 'Found Second (Example Series Book 2)', artistName: 'Example Author',
      trackViewUrl: 'https://books.apple.com/ca/book/found-second/id50', releaseDate: '2027-03-01T00:00:00Z', isbn13: '9780000000002',
    }] });
    return Response.json({ results: [], docs: [] });
  });
  const runtime = createDiscoveryRuntime({ tavilyKey: 'fake-unused-search', deepseekKey: 'fake-unused-ai', hardcoverToken: 'fake-token', model: 'deepseek-flash' }, fetcher);
  const pending = runDiscovery(original, runtime, new AbortController().signal); await vi.runAllTimersAsync(); const result = await pending;
  const lookups = urls.filter(url => url.pathname === '/lookup');
  expect(lookups).toHaveLength(1); expect(lookups[0].searchParams.get('isbn')).toBe('9780000000002');
  expect(lookups[0].searchParams.get('country')).toBe('ca');
  expect(result.proposals.identity?.title).toBe('Found Second'); expect(original.target.title).toBe('');
  expect(result.proposals.releases.book).toMatchObject({ title: 'Found Second', date: '2027-03-01', provenance: {
    sourceMarket: 'CA', language: 'en', editionFormat: 'ebook', editionKey: 'isbn:9780000000002', datePrecision: 'day',
  } });
  expect(result.proposals.releases.book?.provenance.sources.some(source => new URL(source.url).hostname === 'hardcover.app')).toBe(true);
  expect(result.proposals.releases.book?.provenance.sources.some(source => new URL(source.url).hostname === 'books.apple.com')).toBe(true);
  expect(result.summary.usage).toMatchObject({ hardcover: 1, apple: 4, tavily: 0, deepseek: 0 });
  expect(urls.every(url => ['api.hardcover.app', 'itunes.apple.com', 'openlibrary.org'].includes(url.hostname))).toBe(true);
});

test('runtime hydrates canonical Hardcover seed with keyless English Apple product dates for both formats', async () => {
  vi.useFakeTimers(); const urls: URL[] = [];
  const original = request({ target: { ...request().target, title: '' }, useAi: false });
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input)); urls.push(url);
    if (url.hostname === 'api.hardcover.app') return Response.json({ data: { series: [{ name: 'Example', book_series: [{
      position: 2, featured: true, compilation: false, details: '2', book: { id: 20, title: 'Found Second', slug: 'found-second', compilation: false,
        contributions: [{ author: { name: 'Example Author' }, contributor_role: { name: 'Author' } }],
        editions: [{ id: 40, title: 'Found Second', edition_format: 'ebook', language: { code2: 'en' } }] },
    }] }] } });
    const audio = url.pathname.includes('audiobook') || url.searchParams.get('entity') === 'audiobook';
    const literalTitle = audio ? 'Found Second: Example, Book 2 (Unabridged)' : 'Found Second';
    const identifier = audio ? 51 : 50;
    if (url.hostname === 'books.apple.com') return new Response(`<script type="application/ld+json">${JSON.stringify({
      '@type': audio ? 'Audiobook' : 'Book', additionalType: 'Product', name: literalTitle, author: 'Example Author',
      bookFormat: audio ? undefined : 'EBook', inLanguage: audio ? undefined : 'en-US', datePublished: '2027-03-01',
    })}</script><main class="is-books-theme"><article><section class="product-hero"><h1 class="product-header__title">${literalTitle}</h1></section><section class="section--book-infobar"><figure class="book-badge"><div class="book-badge__eyebrow">LANGUAGE</div><div class="book-badge__caption">English</div></figure></section></article></main>`, { headers: { 'content-type': 'text/html' } });
    // One combined search answers both formats, each record typed as Apple types it.
    if (url.hostname === 'itunes.apple.com') return Response.json({ results: [
      { kind: 'ebook', trackId: 50, trackName: 'Found Second', artistName: 'Example Author', releaseDate: '2027-03-01T00:00:00Z', trackViewUrl: 'https://books.apple.com/ca/book/found-second/id50' },
      { wrapperType: 'audiobook', collectionId: 51, collectionName: 'Found Second: Example, Book 2 (Unabridged)', artistName: 'Example Author', releaseDate: '2027-03-01T00:00:00Z', collectionViewUrl: 'https://books.apple.com/ca/audiobook/found-second/id51' },
    ] });
    return Response.json({ docs: [] });
  };
  const runtime = createDiscoveryRuntime({ tavilyKey: 'fake-unused-search', deepseekKey: 'fake-unused-ai', hardcoverToken: 'fake-token', model: 'deepseek-flash' }, fetcher);
  const pending = runDiscovery(original, runtime, new AbortController().signal); await vi.runAllTimersAsync(); const result = await pending;
  expect(result.proposals.identity?.title).toBe('Found Second'); expect(original.target.title).toBe('');
  expect(result.proposals.releases.book?.date).toBe('2027-03-01'); expect(result.proposals.releases.audio?.date).toBe('2027-03-01');
  expect(result.proposals.releases.audio?.title).toBe('Found Second');
  expect(result.summary.usage).toMatchObject({ hardcover: 1, apple: 3, googlebooks: 0, tavily: 0, deepseek: 0 });
  expect(urls.filter(url => url.hostname === 'books.apple.com')).toHaveLength(2);
  for (const release of Object.values(result.proposals.releases)) {
    expect(release?.provenance.sources.some(source => new URL(source.url).hostname === 'books.apple.com')).toBe(true);
    expect(release?.citations.some(citation => citation.quote.includes('inLanguage:') || citation.quote.includes('Product LANGUAGE badge: English.'))).toBe(true);
    expect(release?.provenance.sourceMarket).toBe('CA');
  }
});

test('enrichment phase never spends a second Hardcover request and keeps the shared ledger', async () => {
  vi.useFakeTimers(); const hosts: string[] = [];
  const fetcher = vi.fn<typeof fetch>(async input => {
    const url = new URL(String(input)); hosts.push(url.hostname);
    return Response.json(url.hostname === 'api.hardcover.app' ? { data: { series: [] } } : { results: [], docs: [] });
  });
  const runtime = createDiscoveryRuntime({ tavilyKey: null, deepseekKey: null, hardcoverToken: 'fake-token', model: 'deepseek-flash' }, fetcher);
  const context = createRetrievalContext(); const req = request({ formats: ['book'] });
  const initial = runtime.catalogs(req, ['CA'], new AbortController().signal, context, 'initial'); await vi.runAllTimersAsync(); const first = await initial;
  const enrich = runtime.catalogs(req, ['CA'], new AbortController().signal, context, 'enrich'); await vi.runAllTimersAsync(); const second = await enrich;
  expect(hosts.filter(host => host === 'api.hardcover.app')).toHaveLength(1);
  expect(first.usage.hardcover).toBe(1); expect(second.usage.hardcover).toBe(1);
  expect(second.usage.apple).toBe(hosts.filter(host => host === 'itunes.apple.com').length);
  expect(context.claim('hardcover')).toBe(false);
});
