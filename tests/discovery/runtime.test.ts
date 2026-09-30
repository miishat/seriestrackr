// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { createDiscoveryRuntime } from '../../server/discovery/runtime';
import { runDiscovery } from '../../server/discovery/runDiscovery';
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
