// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { normalizeAppleProductPage, appleProductUrl } from '../../server/discovery/applePages';
import { fetchAppleProductText } from '../../server/discovery/http';
import { collectCatalogs, normalizeApple } from '../../server/discovery/catalogs';
import { selectProposals } from '../../shared/discoveryPolicy';
import { parseExtraction } from '../../shared/discoveryValidation';
import { request } from './fixtures';

const checkedAt = '2026-09-30T00:00:00Z';
test.each(['ebook', 'audio'] as const)('explicit ordinal qualifier joins %s to canonical title with exact product evidence', format => {
  const api = record();
  const edition = { ...api.editions[0], format, title: 'Legacies of Betrayal: The Third Tale of Witness' };
  const source = { ...api.sources[0], title: edition.title, url: format === 'audio' ? productUrl.replace('/book/', '/audiobook/') : productUrl };
  const req = request({ target: { ...request().target, series: 'The Tale of Witness', title: 'Legacies of Betrayal', position: 3 } });
  const html = page({ name: edition.title, '@type': format === 'audio' ? 'Audiobook' : 'Book' });
  const evidence = normalizeAppleProductPage(html, source, edition, req, checkedAt);
  expect(evidence.editions[0]).toMatchObject({ title: 'Legacies of Betrayal', date: '2027-03-01', language: 'en', format });
  expect(evidence.sources[0].text).toContain(`Literal catalog label: ${edition.title}.`);
  expect(evidence.sources[0].text).toContain('Exact supported series-order title relationship.');
  expect(evidence.sources[0].text).not.toMatch(/unabridged|literal audio label/i);
  expect(evidence.editions[0].citations.map(citation => citation.quote).join('')).toBe(evidence.sources[0].text);
  expect(parseExtraction(evidence, evidence.sources).ok).toBe(true);
  const wrong = { ...req, target: { ...req.target, position: 2 } };
  expect(normalizeAppleProductPage(html, source, edition, wrong, checkedAt).editions).toEqual([]);
  const other = { ...req, target: { ...req.target, series: 'The Tale of Other' } };
  expect(normalizeAppleProductPage(html, source, edition, other, checkedAt).editions).toEqual([]);
});
const productUrl = 'https://books.apple.com/ca/book/second/id123';
const record = (audio = false) => normalizeApple({ results: [{ trackId: 123, collectionId: 123, trackName: 'Second', collectionName: 'Second: Example, Book 2 (Unabridged)', artistName: 'Example Author', trackViewUrl: productUrl, collectionViewUrl: productUrl.replace('/book/', '/audiobook/'), releaseDate: '2027-03-01T00:00:00Z' }] }, 'CA', audio ? 'audio' : 'ebook', checkedAt);
const badge = (caption = 'English') => `<figure class="book-badge"><div class="book-badge__eyebrow">LANGUAGE</div><div class="book-badge__caption">${caption}</div></figure>`;
const page = (overrides: Record<string, unknown> = {}, extra = '') => `<script type="application/ld+json">${JSON.stringify({ '@type': 'Book', additionalType: 'Product', name: 'Second', author: 'Example Author', bookFormat: 'EBook', inLanguage: 'en-US', datePublished: '2027-03-01', ...overrides })}</script><main class="is-books-theme"><article><section class="product-hero"><h1 class="product-header__title">${overrides.name ?? 'Second'}</h1></section><section class="section--book-infobar">${extra}</section></article></main>`;
function normalize(html: string, audio = false) {
  const api = record(audio);
  return normalizeAppleProductPage(html, api.sources[0], api.editions[0], request(), checkedAt);
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test('exact product fields qualify language and preserve source citations', () => {
  const result = normalize(page());
  expect(result.editions[0]).toMatchObject({ language: 'en', date: '2027-03-01', editionKey: 'apple:123' });
  expect(result.sources[0].url).toBe(productUrl);
  expect(parseExtraction(result, result.sources).ok).toBe(true);
});
test('audio label and unique product badge qualify canonical title', () => {
  const result = normalize(page({ '@type': 'Audiobook', name: 'Second: Example, Book 2 (Unabridged)', bookFormat: undefined, inLanguage: undefined }, badge()), true);
  expect(result.editions[0]).toMatchObject({ title: 'Second', format: 'audio', language: 'en' });
  expect(result.sources[0].text).toContain('Second: Example, Book 2 (Unabridged)');
  expect(result.sources[0].text).toContain('Literal audio label: Second: Example, Book 2 (Unabridged).');
  expect(result.sources[0].text).toContain('Exact supported unabridged title relationship.');
});
test.each([
  [{ inLanguage: 'fr' }, badge()], [{ inLanguage: ['en', 'fr'] }, ''],
  [{ author: 'Other Author' }, ''], [{ bookFormat: 'Hardcover' }, ''],
  [{ url: 'https://books.apple.com/us/book/second/id123' }, ''],
  [{ url: 'https://books.apple.com/ca/book/second/id999' }, ''],
  [{ inLanguage: undefined }, '<footer>English</footer>'],
])('unsupported or contradictory product fails closed %j', (overrides, extra) => {
  expect(normalize(page(overrides, extra)).editions).toHaveLength(0);
});
test('multiple product schemas reject while nested recommendations do not qualify', () => {
  expect(normalize(page() + page({ inLanguage: 'fr' })).editions).toHaveLength(0);
  expect(normalize(`<script type="application/ld+json">${JSON.stringify({ '@type': 'Organization', itemListElement: [{ '@type': 'Book', name: 'Second', inLanguage: 'en' }] })}</script>`).editions).toHaveLength(0);
});
test.each(['2027-02-30', '2027', 'Spring 2027', null])('unknown exact date remains unknown %s', datePublished => {
  expect(normalize(page({ datePublished })).editions[0]).toMatchObject({ date: null, precision: 'none' });
});
test('conflicting product and API dates survive deterministic conflict grouping', () => {
  const result = normalize(page({ datePublished: '2027-03-02' }));
  expect(selectProposals(request(), result, checkedAt).conflicts).toHaveLength(1);
  expect(selectProposals(request(), result, checkedAt).releases.book).toBeNull();
});
test.each(['https://other.test/ca/book/second/id123', 'https://books.apple.com:443/ca/book/second/id123', 'https://user@books.apple.com/ca/book/second/id123', 'https://books.apple.com/ca/book/second/id124'])('strict product URL rejects %s', url => {
  expect(appleProductUrl(url, record().editions[0])).toBeNull();
});
test.each(['application/json', 'text/plain'])('HTML fetch rejects MIME %s', async contentType => {
  await expect(fetchAppleProductText(productUrl, new AbortController().signal, async () => new Response('x', { headers: { 'content-type': contentType } }))).rejects.toMatchObject({ reason: 'provider-error' });
});
test('HTML fetch omits cookies, blocks redirects and enforces byte limit and cancellation', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response('x'.repeat(1048577), { headers: { 'content-type': 'text/html' } }));
  await expect(fetchAppleProductText(productUrl, new AbortController().signal, fetcher)).rejects.toMatchObject({ reason: 'budget' });
  expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error' });
  const controller = new AbortController(); controller.abort();
  await expect(fetchAppleProductText(productUrl, controller.signal, fetcher)).rejects.toMatchObject({ reason: 'cancelled' });
});
test('keyless catalog pipeline hydrates preferred formats before fallback APIs', async () => {
  vi.useFakeTimers();
  const urls: URL[] = [];
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input)); urls.push(url);
    if (url.hostname === 'books.apple.com') return new Response(page(url.pathname.includes('audiobook') ? { '@type': 'Audiobook', name: 'Second: Example, Book 2 (Unabridged)', bookFormat: undefined, inLanguage: undefined } : {}, badge()), { headers: { 'content-type': 'text/html' } });
    return new Response(JSON.stringify(url.hostname === 'openlibrary.org' ? { docs: [] } : { results: [{ trackId: 123, collectionId: 124, trackName: 'Second', collectionName: 'Second: Example, Book 2 (Unabridged)', artistName: 'Example Author', trackViewUrl: productUrl, collectionViewUrl: productUrl.replace('/book/', '/audiobook/').replace('id123', 'id124'), releaseDate: '2027-03-01T00:00:00Z' }] }), { headers: { 'content-type': 'application/json' } });
  };
  const pending = collectCatalogs(request(), ['CA', 'US', 'GB'], new AbortController().signal, fetcher, { appleProductPages: true });
  await vi.runAllTimersAsync();
  const result = await pending;
  const proposals = selectProposals(request(), result.evidence, checkedAt);
  expect(proposals.releases.book?.date).toBe('2027-03-01');
  expect(proposals.releases.audio?.date).toBe('2027-03-01');
  expect(result.usage.apple).toBe(4);
  expect(urls.filter(url => url.searchParams.has('country')).every(url => url.searchParams.get('country') === 'ca')).toBe(true);
});

test.each(['Second: Other, Book 2 (Unabridged)', 'Second: Example, Book 3 (Unabridged)', 'Second (Abridged)', 'Second: Companion', 'Second: French title'])('unsupported audio labels reject %s', title => {
  const api = record(true); api.editions[0].title = title;
  expect(normalizeAppleProductPage(page({ '@type': 'Audiobook', name: title, inLanguage: undefined }, badge()), api.sources[0], api.editions[0], request(), checkedAt).editions).toHaveLength(0);
});
test('duplicate language badge and footer language never qualify audio', () => {
  const audio = { '@type': 'Audiobook', name: 'Second: Example, Book 2 (Unabridged)', bookFormat: undefined, inLanguage: undefined };
  expect(normalize(page(audio, badge() + badge()), true).editions).toHaveLength(0);
  expect(normalize(page(audio, '<footer>English</footer>'), true).editions).toHaveLength(0);
});
test.each(['footer', 'section'])('foreign badge outside product infobar never qualifies audio in %s', container => {
  const audio = { '@type': 'Audiobook', name: 'Second: Example, Book 2 (Unabridged)', bookFormat: undefined, inLanguage: undefined };
  expect(normalize(page(audio) + `<${container}>${badge()}</${container}>`, true).editions).toHaveLength(0);
});
test.each(['comment', 'script', 'footer', 'wrong-title'])('inactive or unrelated product badge never qualifies audio %s', context => {
  const audio = { '@type': 'Audiobook', name: 'Second: Example, Book 2 (Unabridged)', bookFormat: undefined, inLanguage: undefined };
  const wrapped = context === 'comment' ? `<!--${badge()}-->` : context === 'script' ? `<script type="text/plain">${badge()}</script>` : context === 'footer' ? `<footer>${badge()}</footer>` : badge();
  let html = page(audio, wrapped);
  if (context === 'wrong-title') html = html.replace('<h1 class="product-header__title">Second:', '<h1 class="product-header__title">Other:');
  expect(normalize(html, true).editions).toHaveLength(0);
});
test.each(['footer', 'aside', 'comment', 'script', 'style', 'missing-main'])('verified-looking foreign article cannot qualify audio %s', context => {
  const audio = { '@type': 'Audiobook', name: 'Second: Example, Book 2 (Unabridged)', bookFormat: undefined, inLanguage: undefined };
  const html = page(audio, badge());
  const mainStart = html.indexOf('<main');
  const schema = html.slice(0, mainStart);
  const mimic = html.slice(mainStart);
  const foreign = context === 'comment' ? `<!--${mimic}-->` : context === 'missing-main' ? mimic.replace(/<main[^>]*>|<\/main>/g, '') : `<${context}>${mimic}</${context}>`;
  expect(normalize(schema + foreign, true).editions).toHaveLength(0);
});
test('HTML fetch rejects redirected response and times out an unresponsive fetcher', async () => {
  const redirected = new Response('html', { headers: { 'content-type': 'text/html' } });
  Object.defineProperty(redirected, 'redirected', { value: true });
  await expect(fetchAppleProductText(productUrl, new AbortController().signal, async () => redirected)).rejects.toMatchObject({ reason: 'provider-error' });
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(delay => {
    const controller = new AbortController(); setTimeout(() => controller.abort(), delay); return controller.signal;
  });
  const pending = fetchAppleProductText(productUrl, new AbortController().signal, () => new Promise<Response>(() => {}));
  const assertion = expect(pending).rejects.toMatchObject({ reason: 'timeout' });
  await vi.advanceTimersByTimeAsync(20000);
  await assertion;
});

test('earlier API day is prioritized before later rows for requested book-only hydration', async () => {
  vi.useFakeTimers();
  const htmlIds: string[] = [];
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === 'books.apple.com') { htmlIds.push(url.pathname); return new Response(page(), { headers: { 'content-type': 'text/html' } }); }
    return new Response(JSON.stringify(url.hostname === 'openlibrary.org' ? { docs: [] } : { results: [
      { trackId: 222, trackName: 'Second', artistName: 'Example Author', trackViewUrl: productUrl.replace('id123', 'id222'), releaseDate: '2027-04-01T00:00:00Z' },
      { trackId: 123, trackName: 'Second', artistName: 'Example Author', trackViewUrl: productUrl, releaseDate: '2027-03-01T00:00:00Z' },
    ] }), { headers: { 'content-type': 'application/json' } });
  };
  const pending = collectCatalogs(request({ formats: ['book'] }), ['CA'], new AbortController().signal, fetcher, { appleProductPages: true });
  await vi.runAllTimersAsync();
  expect(selectProposals(request({ formats: ['book'] }), (await pending).evidence, checkedAt).releases.book?.date).toBe('2027-03-01');
  expect(htmlIds).toEqual(['/ca/book/second/id123']);
});
test('combined API and HTML attempts never exceed twelve and HTML has its own six-page bound', async () => {
  vi.useFakeTimers();
  let htmlCalls = 0;
  let appleCalls = 0;
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === 'openlibrary.org') return new Response(JSON.stringify({ docs: [] }), { headers: { 'content-type': 'application/json' } });
    appleCalls++;
    if (url.hostname === 'books.apple.com') { htmlCalls++; return new Response('no qualifying schema', { headers: { 'content-type': 'text/html' } }); }
    const market = url.searchParams.get('country');
    const audio = url.searchParams.get('entity') === 'audiobook';
    return new Response(JSON.stringify({ results: Array.from({ length: 6 }, (_, index) => ({ trackId: 100 + index, collectionId: 200 + index,
      trackName: 'Second', collectionName: 'Second', artistName: 'Example Author',
      trackViewUrl: `https://books.apple.com/${market}/book/second/id${100 + index}`,
      collectionViewUrl: `https://books.apple.com/${market}/audiobook/second/id${200 + index}`, releaseDate: '2027-03-01T00:00:00Z' })) }), { headers: { 'content-type': 'application/json' } });
  };
  const pending = collectCatalogs(request(), ['CA', 'US', 'GB'], new AbortController().signal, fetcher, { appleProductPages: true });
  await vi.runAllTimersAsync();
  const result = await pending;
  expect(appleCalls).toBe(12); expect(result.usage.apple).toBe(12); expect(htmlCalls).toBe(6);
  expect(result.reasons).toContain('budget');
});

const ascensionTitle = 'Ascension: A LitRPG Adventure (Book of the Dead 5) (Unabridged)';
const ascensionUrl = 'https://books.apple.com/ca/audiobook/ascension/id6745';
const ascensionReq = request({ target: { series: 'Book of the Dead', author: 'RinoZ', position: 5, title: 'Ascension', orderNote: '' } });
const ascensionApi = (overrides: Record<string, unknown> = {}) => normalizeApple({ results: [{ trackId: 6745, collectionId: 6745, collectionName: ascensionTitle, artistName: 'RinoZ', collectionViewUrl: ascensionUrl, releaseDate: '2026-08-19T07:00:00Z', ...overrides }] }, 'CA', 'audio', checkedAt);
const ascensionPage = (name = ascensionTitle, author = 'RinoZ', inLanguage?: string) => page({ '@type': 'Audiobook', name, author, bookFormat: undefined, inLanguage, datePublished: '2026-08-19', url: ascensionUrl }, badge(inLanguage === 'fr' ? 'French' : 'English'));
test('recorded Ascension replay hydrates language and keeps the day', () => {
  const api = ascensionApi();
  expect(api.editions[0]).toMatchObject({ title: ascensionTitle, language: null, date: '2026-08-19' });
  const result = normalizeAppleProductPage(ascensionPage(), api.sources[0], api.editions[0], ascensionReq, checkedAt);
  expect(result.editions[0]).toMatchObject({ title: 'Ascension', language: 'en', date: '2026-08-19', format: 'audio' });
  expect(result.sources[0].text).toContain(`Literal audio label: ${ascensionTitle}.`);
  expect(parseExtraction(result, result.sources).ok).toBe(true);
});
test.each([
  ['wrong author', () => ({ api: ascensionApi({ artistName: 'Other' }), html: ascensionPage(), url: ascensionUrl })],
  ['wrong product id', () => ({ api: ascensionApi(), html: ascensionPage().replace(ascensionUrl, 'https://books.apple.com/ca/audiobook/ascension/id9999'), url: ascensionUrl })],
  ['landscape unrelated product', () => ({ api: ascensionApi(), html: ascensionPage('Landscape Photography Basics'), url: ascensionUrl })],
  ['wrong market', () => ({ api: ascensionApi(), html: ascensionPage(), url: ascensionUrl.replace('/ca/', '/us/') })],
  ['french page', () => ({ api: ascensionApi(), html: ascensionPage(ascensionTitle, 'RinoZ', 'fr'), url: ascensionUrl })],
])('Ascension replay fails closed: %s', (_name, build) => {
  const { api, html, url } = build();
  expect(normalizeAppleProductPage(html, { ...api.sources[0], url }, api.editions[0], ascensionReq, checkedAt).editions).toHaveLength(0);
});

const eyebrow = (label: string) => `<figure class="book-badge"><div class="book-badge__eyebrow">${label}</div><div class="book-badge__caption">x</div></figure>`;
test.each([
  ['RELEASED', 'published'], ['PREORDER', 'announced'], ['PRE-ORDER', 'announced'],
])('bound infobar %s badge sets publication %s; API and bare pages stay catalogued', (label, expected) => {
  const api = ascensionApi();
  expect(api.editions[0].publication).toBe('catalogued');
  const html = ascensionPage().replace('</section></article>', `${eyebrow(label)}</section></article>`);
  const result = normalizeAppleProductPage(html, api.sources[0], api.editions[0], ascensionReq, checkedAt);
  expect(result.editions[0]).toMatchObject({ publication: expected, date: '2026-08-19', precision: 'day' });
  expect(result.sources[0].text).toContain(`Publication: ${expected}.`);
  const bare = normalizeAppleProductPage(ascensionPage(), api.sources[0], api.editions[0], ascensionReq, checkedAt);
  expect(bare.editions[0]).toMatchObject({ publication: 'catalogued' });
});
test('ambiguous or duplicate publication badges stay catalogued', () => {
  const api = ascensionApi();
  const html = ascensionPage().replace('</section></article>', `${eyebrow('RELEASED')}${eyebrow('PREORDER')}</section></article>`);
  expect(normalizeAppleProductPage(html, api.sources[0], api.editions[0], ascensionReq, checkedAt).editions[0].publication).toBe('catalogued');
});
