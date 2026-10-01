import { afterEach, expect, test, vi } from 'vitest';
import { checkDiscovery, getDiscoveryCapabilities } from '../../src/services/discovery';
import { request, response } from './fixtures';

const capabilities = () => ({ search: true, ai: false, googleBooks: false, hardcover: false,
  model: 'deepseek-flash', limits: { search: 3, ai: 1, googleBooks: 2, hardcover: 1,
    outputTokens: 2048, inputBytes: 20000 }, pricingAsOf: '2026-09-29', estimatedMaxAiUsd: 0.0084576 });
const signal = () => new AbortController().signal;
afterEach(() => vi.unstubAllGlobals());

test('module import makes no request', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  vi.resetModules();
  await import('../../src/services/discovery');
  expect(fetcher).not.toHaveBeenCalled();
});

test('capabilities use only the same-origin route and caller cancellation', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(capabilities()));
  vi.stubGlobal('fetch', fetcher);
  const abort = signal();
  await expect(getDiscoveryCapabilities(abort)).resolves.toEqual(capabilities());
  expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/discovery/capabilities', expect.objectContaining({
    method: 'GET', signal: abort, mode: 'same-origin', credentials: 'same-origin', redirect: 'error', cache: 'no-store',
  }));
});

test('check sends only parsed public target data and strictly parses the response', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(response()));
  vi.stubGlobal('fetch', fetcher);
  const abort = signal();
  await expect(checkDiscovery(request(), abort)).resolves.toEqual(response());
  expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/discovery/check', expect.objectContaining({
    method: 'POST', signal: abort, body: JSON.stringify(request()), mode: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  }));
});

test('invalid requests never leave the browser', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(checkDiscovery({ ...request(), secret: 'fictional-secret' } as never, signal())).rejects.toThrow('Invalid discovery request.');
  expect(fetcher).not.toHaveBeenCalled();
});

test.each([
  { search: 'yes' }, { ai: 1 }, { googleBooks: null }, { hardcover: undefined },
  { model: 'unapproved-model' }, { pricingAsOf: '2026-02-30' }, { pricingAsOf: 'tomorrow' },
  { estimatedMaxAiUsd: -1 }, { estimatedMaxAiUsd: '0.1' }, { estimatedMaxAiUsd: Infinity }, { unexpected: true },
  { limits: { ...capabilities().limits, unexpected: 1 } },
  ...['search', 'ai', 'googleBooks', 'hardcover', 'outputTokens', 'inputBytes'].map(key => ({ limits: { ...capabilities().limits, [key]: 999 } })),
])('rejects malformed capabilities without revealing response data: %j', async patch => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...capabilities(), ...patch })));
  await expect(getDiscoveryCapabilities(signal())).rejects.toThrow('Discovery returned an invalid response.');
});

test.each([
  () => Response.json({ bad: 'fictional-secret' }),
  () => Response.json({ ...response(), requestId: 'other-request' }),
  () => Response.json({ ...response(), seriesId: 'other-series' }),
  () => new Response(JSON.stringify(response()), { headers: { 'Content-Type': 'text/plain' } }),
  () => new Response('{broken-fictional-secret', { headers: { 'Content-Type': 'application/json' } }),
  () => Response.json({ ...response(), sources: [{ id: 's1', title: 'Second', url: 'http://localhost/private' }] }),
])('rejects malformed or mismatched successful checks', async reply => {
  vi.stubGlobal('fetch', vi.fn(async () => reply()));
  await expect(checkDiscovery(request(), signal())).rejects.toThrow('Discovery returned an invalid response.');
});

test.each([
  [409, 'Discovery is busy. Try again when the current check finishes.'],
  [429, 'Discovery quota is exhausted. Try again later.'],
  [404, 'Discovery service is unavailable. Start the local discovery service and try again.'],
  [503, 'Discovery service is unavailable. Start the local discovery service and try again.'],
  [400, 'Discovery request was rejected.'],
  [403, 'Discovery request was rejected.'],
])('sanitizes HTTP %i without retrying or reading upstream errors', async (status, message) => {
  const fetcher = vi.fn(async () => new Response('fictional-secret', { status }));
  vi.stubGlobal('fetch', fetcher);
  await expect(getDiscoveryCapabilities(signal())).rejects.toThrow(message);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test('network failures are sanitized and never retried', async () => {
  const fetcher = vi.fn(async () => { throw new Error('fictional-secret'); });
  vi.stubGlobal('fetch', fetcher);
  await expect(checkDiscovery(request(), signal())).rejects.toThrow('Discovery service is unavailable.');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test('preserves AbortError and skips calls with an already cancelled signal', async () => {
  const controller = new AbortController();
  controller.abort();
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(getDiscoveryCapabilities(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetcher).not.toHaveBeenCalled();
  const aborted = new DOMException('Cancelled', 'AbortError');
  fetcher.mockRejectedValue(aborted);
  await expect(checkDiscovery(request(), signal())).rejects.toBe(aborted);
});

test('late successful fetch cannot revive a cancelled check', async () => {
  const controller = new AbortController();
  vi.stubGlobal('fetch', vi.fn(async () => {
    controller.abort();
    return Response.json(response());
  }));
  await expect(checkDiscovery(request(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
});

test('cancellation while decoding JSON remains cancellation', async () => {
  const controller = new AbortController();
  const reply = Response.json(capabilities());
  vi.spyOn(reply, 'json').mockImplementation(async () => {
    controller.abort();
    return capabilities();
  });
  vi.stubGlobal('fetch', vi.fn(async () => reply));
  await expect(getDiscoveryCapabilities(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
});
