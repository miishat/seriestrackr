// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { collectCatalogs } from '../../server/discovery/catalogs';
import { request } from './fixtures';

const apple = JSON.parse(readFileSync(new URL('./data/apple.json', import.meta.url), 'utf8'));
afterEach(() => vi.useRealTimers());
const json = (input: unknown) => new Response(JSON.stringify(input), { status: 200, headers: { 'content-type': 'application/json' } });
const ebookRow = (overrides: Record<string, unknown> = {}) => ({ ...apple.ebook.results[1], kind: 'ebook', ...overrides });
const audioRow = (overrides: Record<string, unknown> = {}) => ({ ...apple.audio.results[0], wrapperType: 'audiobook', ...overrides });
const isApple = (url: URL) => url.hostname === 'itunes.apple.com' && url.pathname === '/search';

async function run(req: ReturnType<typeof request>, markets: string[], respond: (url: URL) => Response) {
  vi.resetModules(); const { collectCatalogs: isolated } = await import('../../server/discovery/catalogs');
  vi.useFakeTimers();
  const urls: URL[] = [];
  const fetcher: typeof fetch = async input => { const url = new URL(String(input)); urls.push(url); return respond(url); };
  const pending = isolated(req, markets, new AbortController().signal, fetcher);
  await vi.runAllTimersAsync();
  return { result: await pending, urls };
}
const other = (url: URL) => json(url.hostname === 'itunes.apple.com' ? { results: [] } : { docs: [] });

test('both formats are searched with one Apple call per market', async () => {
  const { urls, result } = await run(request(), ['CA'], url => isApple(url) ? json({ results: [ebookRow(), audioRow()] }) : other(url));
  const searches = urls.filter(isApple);
  expect(searches).toHaveLength(1);
  expect(searches[0].searchParams.get('entity')).toBe('ebook,audiobook');
  expect(searches[0].searchParams.get('limit')).toBe('40');
  expect(result.usage.apple).toBe(1);
  expect(result.evidence.editions.filter(item => item.format === 'ebook')).toHaveLength(1);
  expect(result.evidence.editions.filter(item => item.format === 'audio')).toHaveLength(1);
});
test('a single requested format keeps its own entity and limit', async () => {
  const book = await run(request({ formats: ['book'] }), ['CA'], url => isApple(url) ? json({ results: [ebookRow()] }) : other(url));
  expect(book.urls.filter(isApple).map(url => [url.searchParams.get('entity'), url.searchParams.get('limit')])).toEqual([['ebook', '20']]);
  const audio = await run(request({ formats: ['audio'] }), ['CA'], url => isApple(url) ? json({ results: [audioRow()] }) : other(url));
  expect(audio.urls.filter(isApple).map(url => [url.searchParams.get('entity'), url.searchParams.get('limit')])).toEqual([['audiobook', '20']]);
});
test('a fallback storefront is searched only for the formats still missing a preferred-market date', async () => {
  // The preferred market answers the book with a date but gives no audiobook.
  const { urls } = await run(request(), ['CA', 'US'], url => isApple(url) && url.searchParams.get('country') === 'ca' ? json({ results: [ebookRow()] }) : other(url));
  const searches = urls.filter(isApple).map(url => [url.searchParams.get('country'), url.searchParams.get('entity')]);
  expect(searches).toEqual([['ca', 'ebook,audiobook'], ['us', 'audiobook']]);
});
test('no fallback storefront is searched when every format already has a preferred-market date', async () => {
  const { urls } = await run(request(), ['CA', 'US', 'GB'], url => isApple(url) ? json({ results: [ebookRow(), audioRow()] }) : other(url));
  expect(urls.filter(isApple)).toHaveLength(1);
});
test('records are classified by their own type, never by the order or the request', async () => {
  const { result } = await run(request(), ['CA'], url => isApple(url) ? json({ results: [audioRow(), ebookRow(), { ...ebookRow({ trackId: 77 }), kind: undefined, wrapperType: 'track' }] }) : other(url));
  expect(result.evidence.editions.map(item => item.format).sort()).toEqual(['audio', 'ebook']);
});
test('too many records of one format flag only that format', async () => {
  const many = Array.from({ length: 25 }, (_, i) => audioRow({ collectionId: 9000 + i, collectionName: `Other Work ${i}`, collectionViewUrl: `https://books.apple.com/ca/audiobook/x/id${9000 + i}` }));
  const { result } = await run(request(), ['CA'], url => isApple(url) ? json({ results: [ebookRow(), ...many] }) : other(url));
  expect(result.reasons).toContain('budget');
  expect(result.evidence.editions.filter(item => item.format === 'ebook')).toHaveLength(1);
  expect(result.evidence.editions.filter(item => item.format === 'audio').length).toBeLessThanOrEqual(20);
});
