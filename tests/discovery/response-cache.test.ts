// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { collectCatalogs } from '../../server/discovery/catalogs';
import { createResponseCache, responseKey } from '../../server/discovery/responseCache';
import { request } from './fixtures';

afterEach(() => vi.useRealTimers());
const json = (input: unknown, status = 200) => new Response(JSON.stringify(input), { status, headers: { 'content-type': 'application/json' } });
async function run(cache: ReturnType<typeof createResponseCache>, respond: (url: URL) => Response, options: Record<string, unknown> = {}) {
  vi.useFakeTimers();
  const urls: URL[] = [];
  const fetcher: typeof fetch = async input => { const url = new URL(String(input)); urls.push(url); return respond(url); };
  const pending = collectCatalogs(request({ formats: ['book'] }), ['CA'], new AbortController().signal, fetcher, { responseCache: cache, ...options });
  await vi.runAllTimersAsync();
  return { result: await pending, urls };
}
const ok = () => json({ results: [], docs: [] });

test('a repeated catalog query inside the lifetime is served without a network call or a counted attempt', async () => {
  const cache = createResponseCache(60_000);
  const first = await run(cache, ok);
  expect(first.urls.length).toBeGreaterThan(0);
  const second = await run(cache, ok);
  expect(second.urls).toEqual([]);
  expect(second.result.usage).toMatchObject({ apple: 0, openlibrary: 0 });
});
test('failed responses are never cached', async () => {
  const cache = createResponseCache(60_000);
  const first = await run(cache, () => json({}, 503));
  expect(first.result.reasons).toContain('provider-error');
  const second = await run(cache, ok);
  expect(second.urls.length).toBeGreaterThan(0);
});
test('entries expire after their lifetime', async () => {
  let now = 0; const cache = createResponseCache(1000, () => now);
  await run(cache, ok);
  now = 1001;
  const again = await run(cache, ok);
  expect(again.urls.length).toBeGreaterThan(0);
});
test('the cache key never contains an API key', () => {
  expect(responseKey('googlebooks', '/books/v1/volumes?q=a&key=secret-1&maxResults=20')).toBe(responseKey('googlebooks', '/books/v1/volumes?q=a&key=other&maxResults=20'));
  expect(responseKey('googlebooks', '/books/v1/volumes?q=a&key=secret-1')).not.toContain('secret-1');
});
test('without a cache every check queries the providers', async () => {
  vi.useFakeTimers();
  const urls: URL[] = [];
  const fetcher: typeof fetch = async input => { urls.push(new URL(String(input))); return ok(); };
  for (let i = 0; i < 2; i++) { const pending = collectCatalogs(request({ formats: ['book'] }), ['CA'], new AbortController().signal, fetcher); await vi.runAllTimersAsync(); await pending; }
  expect(urls.length).toBeGreaterThanOrEqual(4);
});
