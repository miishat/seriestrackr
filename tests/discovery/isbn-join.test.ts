// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { collectCatalogs } from '../../server/discovery/catalogs';
import { selectProposals } from '../../shared/discoveryPolicy';
import { request } from './fixtures';

const checkedAt = '2026-09-30T12:00:00Z';
afterEach(() => vi.useRealTimers());

const json = (input: unknown, status = 200) => new Response(JSON.stringify(input), { status, headers: { 'content-type': 'application/json' } });
const emptyTitle = () => request({ target: { series: 'Example', author: 'Example Author', position: 2, title: '', orderNote: '' } });

// A catalog edition that carries an explicit ISBN but no market-scoped date,
// which is what the strict Google Books normalizer emits for most volumes.
const isbnVolume = (overrides: Record<string, unknown> = {}) => ({ id: 'Fictional01', volumeInfo: {
  title: 'Second', subtitle: 'Example, Book Two', authors: ['Example Author'], language: 'en',
  industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780000000001' }],
}, saleInfo: { isEbook: true }, ...overrides });

// Modeled on the live CA storefront response captured 2026-09-30, where the
// dated edition carries a decorated title that exact title matching rejects.
const decoratedStorefront = (overrides: Record<string, unknown> = {}) => ({ results: [{
  trackId: 42, trackName: 'Second: Example, Book 2 (Unabridged)', artistName: 'Example Author',
  releaseDate: '2027-03-01T00:00:00Z', trackViewUrl: 'https://books.apple.com/ca/book/second/id42',
  ...overrides,
}] });

async function collect(options: { appleIsbnJoin?: boolean } = {}, responder?: (url: URL) => Response, checkRequest = emptyTitle(), markets = ['CA']) {
  vi.useFakeTimers();
  const urls: URL[] = [];
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input)); urls.push(url);
    if (responder) return responder(url);
    if (url.hostname === 'www.googleapis.com') return json({ items: [isbnVolume()] });
    if (url.pathname === '/lookup') return json(decoratedStorefront());
    return json(url.hostname === 'itunes.apple.com' ? { results: [] } : { docs: [] });
  };
  const pending = collectCatalogs(checkRequest, markets, new AbortController().signal, fetcher,
    { googleBooksKey: 'fake-google-secret', ...options });
  await vi.runAllTimersAsync();
  return { result: await pending, urls };
}

test('without the ISBN join a decorated storefront title yields no dated book proposal', async () => {
  const { result, urls } = await collect();
  expect(urls.some(url => url.pathname === '/lookup')).toBe(false);
  expect(selectProposals(emptyTitle(), result.evidence, checkedAt).identity?.title).toBe('Second');
  expect(selectProposals(emptyTitle(), result.evidence, checkedAt).releases.book?.date ?? null).toBeNull();
});

test('ISBN join resolves the exact edition and canonicalizes the decorated storefront title', async () => {
  const { result, urls } = await collect({ appleIsbnJoin: true });
  const lookup = urls.find(url => url.pathname === '/lookup');
  expect(lookup?.searchParams.get('isbn')).toBe('9780000000001');
  expect(lookup?.searchParams.get('country')).toBe('ca');
  expect(lookup?.searchParams.get('entity')).toBe('ebook');
  const proposals = selectProposals(emptyTitle(), result.evidence, checkedAt);
  expect(proposals.releases.book?.date).toBe('2027-03-01');
  expect(proposals.releases.book?.provenance.sourceMarket).toBe('CA');
  expect(proposals.releases.book?.provenance.editionKey).toBe('isbn:9780000000001');
  expect(proposals.releases.book?.title).toBe('Second');
});

test('ISBN join never accepts a storefront record whose author does not match', async () => {
  const { result } = await collect({ appleIsbnJoin: true },
    url => url.hostname === 'www.googleapis.com' ? json({ items: [isbnVolume()] })
      : url.pathname === '/lookup' ? json(decoratedStorefront({ artistName: 'Different Author' }))
        : json(url.hostname === 'itunes.apple.com' ? { results: [] } : { docs: [] }));
  expect(selectProposals(emptyTitle(), result.evidence, checkedAt).releases.book?.date ?? null).toBeNull();
});

test('ISBN join is skipped when the format is not requested, when a date exists, and when no ISBN is present', async () => {
  const bookOnly = request({ target: { series: 'Example', author: 'Example Author', position: 2, title: '', orderNote: '' }, formats: ['book'] });
  const noAudio = await collect({ appleIsbnJoin: true }, undefined, bookOnly);
  expect(selectProposals(bookOnly, noAudio.result.evidence, checkedAt).releases.audio).toBeNull();

  const dated = await collect({ appleIsbnJoin: true },
    url => url.hostname === 'www.googleapis.com' ? json({ items: [isbnVolume()] })
      : json(url.hostname === 'itunes.apple.com' ? { results: [{
        kind: 'ebook', trackId: 7, trackName: 'Second', artistName: 'Example Author', language: 'en',
        releaseDate: '2027-03-01T00:00:00Z', trackViewUrl: 'https://books.apple.com/ca/book/second/id7' }] } : { docs: [] }));
  expect(dated.urls.some(url => url.pathname === '/lookup')).toBe(false);

  const noIsbn = await collect({ appleIsbnJoin: true },
    url => url.hostname === 'www.googleapis.com'
      ? json({ items: [{ id: 'Fictional02', volumeInfo: { title: 'Second', subtitle: 'Example, Book Two', authors: ['Example Author'], language: 'en' }, saleInfo: { isEbook: true } }] })
      : json(url.hostname === 'itunes.apple.com' ? { results: [] } : { docs: [] }));
  expect(noIsbn.urls.some(url => url.pathname === '/lookup')).toBe(false);
});

test('ISBN join is bounded and uses only the preferred market', async () => {
  const volumes = Array.from({ length: 6 }, (_, index) => isbnVolume({
    id: `Fictional1${index}`,
    volumeInfo: { ...isbnVolume().volumeInfo, industryIdentifiers: [{ type: 'ISBN_13', identifier: `978000000000${index}` }] },
  }));
  const { result, urls } = await collect({ appleIsbnJoin: true },
    url => url.hostname === 'www.googleapis.com' ? json({ items: volumes })
      : url.pathname === '/lookup' ? json({ results: [] })
        : json(url.hostname === 'itunes.apple.com' ? { results: [] } : { docs: [] }));
  const lookups = urls.filter(url => url.pathname === '/lookup');
  expect(lookups).toHaveLength(4);
  expect(result.usage.apple).toBeLessThanOrEqual(12);
  expect(result.usage.googlebooks).toBeLessThanOrEqual(2);
  expect(result.usage.openlibrary).toBeLessThanOrEqual(3);
  for (const lookup of lookups) expect(lookup.searchParams.get('country')).toBe('ca');
});


test('joined title and language retain the identifier-bearing catalog citations', async () => {
  const { result } = await collect({ appleIsbnJoin: true });
  const book = selectProposals(emptyTitle(), result.evidence, checkedAt).releases.book;
  expect(book?.provenance.sources.some(source => source.id.startsWith('googlebooks:'))).toBe(true);
  expect(book?.citations.some(citation => citation.quote.includes('9780000000001'))).toBe(true);
  for (const citation of book?.citations ?? []) {
    expect(result.evidence.sources.find(source => source.id === citation.sourceId)?.text).toContain(citation.quote);
  }
});

test.each([
  { isbn13: '9780000000002' },
  { languages: ['en', 'fr'] },
  { language: 'fr' },
])('lookup metadata cannot contradict the ISBN or language association: %j', async overrides => {
  const { result } = await collect({ appleIsbnJoin: true }, url =>
    url.hostname === 'www.googleapis.com' ? json({ items: [isbnVolume()] })
      : url.pathname === '/lookup' ? json(decoratedStorefront(overrides))
        : json(url.hostname === 'itunes.apple.com' ? { results: [] } : { docs: [] }));
  expect(selectProposals(emptyTitle(), result.evidence, checkedAt).releases.book?.date ?? null).toBeNull();
});

test.each([false, true])('catalog language conflicts remain unknown in either Open Library order: reversed %s', async reverse => {
  const { result } = await collect({ appleIsbnJoin: true }, url => {
    if (url.hostname === 'www.googleapis.com') return json({ items: [isbnVolume()] });
    if (url.pathname === '/lookup') return json(decoratedStorefront());
    if (url.pathname.startsWith('/books/')) return json({
      key: url.pathname.replace('.json', ''), title: 'Second', authors: [{ key: '/authors/OL1A' }],
      physical_format: 'ebook', isbn_13: ['9780000000001'],
      languages: [{ key: url.pathname.includes('OL1M') ? '/languages/en' : '/languages/fr' }],
    });
    if (url.hostname === 'openlibrary.org') return json({ docs: [{ key: '/works/OL1W', title: 'Second',
      author_name: ['Example Author'], author_key: ['OL1A'], edition_key: reverse ? ['OL2M', 'OL1M'] : ['OL1M', 'OL2M'] }] });
    return json({ results: [] });
  });
  expect(selectProposals(emptyTitle(), result.evidence, checkedAt).releases.book?.date ?? null).toBeNull();
});

test('audio-only requests never use the ebook ISBN lookup', async () => {
  const audioOnly = request({ ...emptyTitle(), formats: ['audio'] });
  const { urls } = await collect({ appleIsbnJoin: true }, undefined, audioOnly);
  expect(urls.some(url => url.pathname === '/lookup')).toBe(false);
  for (const url of urls.filter(url => url.pathname === '/search')) expect(url.searchParams.get('entity')).toBe('audiobook');
});

test('multiple distinct storefront records cannot be canonicalized from one ISBN', async () => {
  const { result } = await collect({ appleIsbnJoin: true }, url =>
    url.hostname === 'www.googleapis.com' ? json({ items: [isbnVolume()] })
      : url.pathname === '/lookup' ? json({ results: [...decoratedStorefront().results, ...decoratedStorefront({ trackId: 43 }).results] })
        : json(url.hostname === 'itunes.apple.com' ? { results: [] } : { docs: [] }));
  expect(selectProposals(emptyTitle(), result.evidence, checkedAt).releases.book?.date ?? null).toBeNull();
});

test('fallback date does not prevent an exact preferred ISBN lookup', async () => {
  const { result, urls } = await collect({ appleIsbnJoin: true }, url => {
    if (url.hostname === 'www.googleapis.com') return json({ items: [isbnVolume()] });
    if (url.pathname === '/lookup') return json(decoratedStorefront());
    if (url.hostname === 'itunes.apple.com' && url.searchParams.get('country') === 'us' && url.searchParams.get('entity') === 'ebook') return json({ results: [{
      trackId: 88, trackName: 'Second', artistName: 'Example Author', language: 'en',
      releaseDate: '2027-02-01T00:00:00Z', trackViewUrl: 'https://books.apple.com/us/book/second/id88' }] });
    return json(url.hostname === 'itunes.apple.com' ? { results: [] } : { docs: [] });
  }, emptyTitle(), ['CA', 'US']);
  expect(urls.some(url => url.pathname === '/lookup')).toBe(true);
  expect(selectProposals(emptyTitle(), result.evidence, checkedAt).releases.book?.provenance.sourceMarket).toBe('CA');
});
