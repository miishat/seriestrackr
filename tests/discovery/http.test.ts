// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { fetchProviderJson } from '../../server/discovery/http';
import { createRateQueue } from '../../server/discovery/rateQueue';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const signal = () => new AbortController().signal;
const json = (body = '{"ok":true}', status = 200) => new Response(body, {
  status, headers: { 'content-type': 'application/json; charset=utf-8' },
});
const boundedProviders = [
  ['tavily', '/search'],
  ['googlebooks', '/books/v1/volumes?q=Example&key=fake-google-secret'],
  ['hardcover', '/v1/graphql'],
] as const;

test.each([['deepseek', '/chat/completions'], boundedProviders[1]] as const)('never follows a credential-bearing redirect or echoes response bodies for %s', async (provider, path) => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response('secret-value', {
    status: 302, headers: { location: 'https://elsewhere.example/' },
  }));
  const result = fetchProviderJson(provider, path, {}, signal(), fetcher);
  await expect(result).rejects.toMatchObject({ provider, reason: 'provider-error', message: 'provider-error' });
  expect(fetcher.mock.calls).toHaveLength(1);
  expect(fetcher.mock.calls[0][1]?.redirect).toBe('error');
});

test.each([
  '/books/v1/volumes/Fictional01', '/volumes',
  'https://elsewhere.example/books/v1/volumes',
  '//elsewhere.example/books/v1/volumes',
  '/books/v1/volumes#secret', '/books/v1/../volumes',
  '/books/v1/volumes/extra', '/books%2fv1/volumes',
])('Google rejects destination %s before fetch', async path => {
  const fetcher = vi.fn<typeof fetch>(async () => json());
  await expect(fetchProviderJson('googlebooks', path, {}, signal(), fetcher))
    .rejects.toMatchObject({ reason: 'provider-error', message: 'provider-error' });
  expect(fetcher).not.toHaveBeenCalled();
});

test.each([
  'https://elsewhere.example/chat/completions', '//elsewhere.example/chat/completions',
  '/chat/completions#fragment', '/chat/../chat/completions', '/chat%2fcompletions',
  '/chat/completions/extra', '/search', '\\elsewhere.example\\chat\\completions',
])('rejects unsupported or off-provider destination %s before fetching', async (path) => {
  const fetcher = vi.fn<typeof fetch>(async () => json());
  await expect(fetchProviderJson('deepseek', path, {}, signal(), fetcher)).rejects.toMatchObject({ reason: 'provider-error' });
  expect(fetcher).not.toHaveBeenCalled();
});

test.each([
  ['hardcover', '/v1/graphql', 'https://api.hardcover.app/v1/graphql'],
  ['apple', '/search?term=A%26B&country=US', 'https://itunes.apple.com/search?term=A%26B&country=US'],
  ['openlibrary', '/search.json?q=A%26B', 'https://openlibrary.org/search.json?q=A%26B'],
  ['openlibrary', '/books/OL123M.json', 'https://openlibrary.org/books/OL123M.json'],
  ['tavily', '/search', 'https://api.tavily.com/search'],
  ['deepseek', '/chat/completions', 'https://api.deepseek.com/chat/completions'],
  ['googlebooks', '/books/v1/volumes?q=Example&key=fake-google-secret', 'https://www.googleapis.com/books/v1/volumes?q=Example&key=fake-google-secret'],
] as const)('routes %s only to its fixed host', async (provider, path, expected) => {
  const fetcher = vi.fn<typeof fetch>(async () => json());
  await expect(fetchProviderJson(provider, path, { redirect: 'follow' }, signal(), fetcher)).resolves.toEqual({ ok: true });
  expect(String(fetcher.mock.calls[0][0])).toBe(expected);
  expect(fetcher.mock.calls[0][1]?.redirect).toBe('error');
});

test('rejects Apple JSONP callbacks before fetching', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => json());
  await expect(fetchProviderJson('apple', '/search?%63allback=secret-value', {}, signal(), fetcher)).rejects.toMatchObject({ reason: 'provider-error' });
  expect(fetcher).not.toHaveBeenCalled();
});

test('accepts actual Apple text/javascript JSON using JSON parsing', async () => {
  const fetcher: typeof fetch = async () => new Response('{"results":[]}', {
    headers: { 'content-type': 'text/javascript; charset=utf-8' },
  });
  await expect(fetchProviderJson('apple', '/search', {}, signal(), fetcher)).resolves.toEqual({ results: [] });
});

test.each(['tavily', 'openlibrary', 'deepseek', 'googlebooks'] as const)('rejects JavaScript MIME for %s', async (provider) => {
  const fetcher: typeof fetch = async () => new Response('{"ok":true}', { headers: { 'content-type': 'text/javascript' } });
  const path = provider === 'openlibrary' ? '/search.json' : provider === 'deepseek' ? '/chat/completions' : provider === 'googlebooks' ? boundedProviders[1][1] : '/search';
  await expect(fetchProviderJson(provider, path, {}, signal(), fetcher)).rejects.toMatchObject({ reason: 'provider-error' });
});

test.each(boundedProviders)('rejects non-JSON response MIME for %s', async (provider, path) => {
  for (const mime of [undefined, 'text/html', 'application/jsonp']) {
    const fetcher: typeof fetch = async () => new Response('secret-value', { headers: mime ? { 'content-type': mime } : {} });
    await expect(fetchProviderJson(provider, path, {}, signal(), fetcher)).rejects.toMatchObject({ reason: 'provider-error', message: 'provider-error' });
  }
});

test.each([['deepseek', '/chat/completions'], boundedProviders[1]] as const)('sanitizes quota and server errors for %s', async (provider, path) => {
  for (const [status, reason] of [[429, 'quota'], [502, 'provider-error']] as const) {
    const fetcher: typeof fetch = async () => json('secret-value', status);
    await expect(fetchProviderJson(provider, path, {}, signal(), fetcher)).rejects.toMatchObject({ provider, reason, message: reason });
  }
});

test('sanitizes invalid JSON and never evaluates Apple JSONP', async () => {
  for (const body of ['secret-value', 'callback({"ok":true})']) {
    const fetcher: typeof fetch = async () => new Response(body, { headers: { 'content-type': 'text/javascript' } });
    await expect(fetchProviderJson('apple', '/search', {}, signal(), fetcher)).rejects.toMatchObject({ reason: 'provider-error', message: 'provider-error' });
  }
});

test.each(boundedProviders)('sanitizes fetch and stream errors containing credentials for %s', async (provider, path) => {
  const fetcher: typeof fetch = async () => { throw new Error('secret-value'); };
  await expect(fetchProviderJson(provider, path, {}, signal(), fetcher)).rejects.toMatchObject({ message: 'provider-error' });
  const streamFetcher: typeof fetch = async () => new Response(new ReadableStream({
    start(controller) { controller.error(new Error('secret-value')); },
  }), { headers: { 'content-type': 'application/json' } });
  await expect(fetchProviderJson(provider, path, {}, signal(), streamFetcher)).rejects.toMatchObject({ message: 'provider-error' });
});

test.each(boundedProviders)('stops %s at 1 MiB without Content-Length and cancels the reader', async (provider, path) => {
  let read = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { read++; controller.enqueue(new Uint8Array(524288)); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const fetcher: typeof fetch = async () => new Response(stream, { headers: { 'content-type': 'application/json' } });
  await expect(fetchProviderJson(provider, path, {}, signal(), fetcher)).rejects.toMatchObject({ reason: 'budget', message: 'budget' });
  expect(read).toBe(3);
  expect(cancelled).toBe(true);
});

test.each(boundedProviders)('accepts JSON exactly at the 1 MiB limit for %s', async (provider, path) => {
  const body = '"' + 'a'.repeat(1048574) + '"';
  const fetcher: typeof fetch = async () => json(body);
  const result = await fetchProviderJson(provider, path, {}, signal(), fetcher);
  expect(typeof result).toBe('string');
  expect((result as string).length).toBe(1048574);
});

test('accepts JSON request bodies and rejects non-JSON bodies before fetching', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => json());
  await expect(fetchProviderJson('tavily', '/search', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"query":"book"}',
  }, signal(), fetcher)).resolves.toEqual({ ok: true });
  fetcher.mockClear();
  for (const init of [
    { method: 'POST', body: 'secret-value' },
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'secret-value' },
    { method: 'POST', body: new URLSearchParams({ key: 'secret-value' }) },
  ]) {
    await expect(fetchProviderJson('tavily', '/search', init, signal(), fetcher)).rejects.toMatchObject({ message: 'provider-error' });
  }
  expect(fetcher).not.toHaveBeenCalled();
});

const abortingFetcher: typeof fetch = async (_url, init) => new Promise<Response>((_resolve, reject) => {
  init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
});

test.each([
  ['apple', '/search', 20000], ['openlibrary', '/search.json', 20000],
  ['tavily', '/search', 20000], ['deepseek', '/chat/completions', 45000],
  ['googlebooks', '/books/v1/volumes?q=Example&key=fake-google-secret', 20000],
] as const)('bounds the %s request %s at %s ms', async (provider, path, ms) => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((delay) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('secret-value', 'TimeoutError')), delay);
    return controller.signal;
  });
  const outcome = fetchProviderJson(provider, path, {}, signal(), abortingFetcher).catch(error => error);
  await vi.advanceTimersByTimeAsync(ms);
  expect(await outcome).toMatchObject({ provider, reason: 'timeout', message: 'timeout' });
});

test.each(boundedProviders)('cancels an in-flight %s request using the caller signal', async (provider, path) => {
  const controller = new AbortController();
  const outcome = fetchProviderJson(provider, path, {}, controller.signal, abortingFetcher);
  const assertion = expect(outcome).rejects.toMatchObject({ reason: 'cancelled', message: 'cancelled' });
  controller.abort(new Error('secret-value'));
  await assertion;
});

test.each(boundedProviders)('an already cancelled %s request never fetches', async (provider, path) => {
  const controller = new AbortController();
  controller.abort(new Error('secret-value'));
  const fetcher = vi.fn<typeof fetch>(async () => json());
  await expect(fetchProviderJson(provider, path, {}, controller.signal, fetcher)).rejects.toMatchObject({ reason: 'cancelled', message: 'cancelled' });
  expect(fetcher).not.toHaveBeenCalled();
});

test.each(['redirected', 'off-origin', 'invalid-json'] as const)('Google sanitizes %s responses without exposing key, body or URL', async mode => {
  const response = json(mode === 'invalid-json' ? 'fake-google-secret response-body' : '{"ok":true}');
  if (mode === 'redirected') Object.defineProperty(response, 'redirected', { value: true });
  if (mode === 'off-origin') Object.defineProperty(response, 'url', { value: 'https://elsewhere.example/?key=fake-google-secret' });
  const fetcher: typeof fetch = async () => response;
  const error = await fetchProviderJson('googlebooks', boundedProviders[1][1], {}, signal(), fetcher).catch(error => error);
  expect(error).toMatchObject({ provider: 'googlebooks', reason: 'provider-error', message: 'provider-error' });
  if (!(error instanceof Error)) throw new Error('expected-provider-error');
  const serialized = JSON.stringify({ ...error, message: error.message, stack: error.stack });
  for (const secret of ['fake-google-secret', 'response-body', 'https://elsewhere.example', 'https://www.googleapis.com']) {
    expect(serialized).not.toContain(secret);
  }
});

test.each([[3100, 'Apple'], [1100, 'Open Library']] as const)('spaces %s ms queue starts for %s', async (interval, _provider) => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const queue = createRateQueue(interval);
  const starts: number[] = [];
  const job = async () => { starts.push(Date.now()); return starts.length; };
  const first = queue.run(job, signal());
  const second = queue.run(job, signal());
  const third = queue.run(job, signal());
  await vi.advanceTimersByTimeAsync(0);
  expect(starts).toEqual([0]);
  await vi.advanceTimersByTimeAsync(interval - 1);
  expect(starts).toEqual([0]);
  await vi.advanceTimersByTimeAsync(1);
  expect(starts).toEqual([0, interval]);
  await vi.advanceTimersByTimeAsync(interval);
  expect(starts).toEqual([0, interval, interval * 2]);
  await expect(Promise.all([first, second, third])).resolves.toEqual([1, 2, 3]);
});

test.each([[3100, 'Apple'], [1100, 'Open Library']] as const)(
  'preserves %s ms minimum spacing for %s when Node truncates fractional timer delays',
  async (interval, _provider) => {
    vi.useFakeTimers();
    const schedule = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, ms) => schedule(callback, Math.trunc(ms ?? 0)));
    const queue = createRateQueue(interval);
    const starts: number[] = [];
    const job = async () => { starts.push(performance.now()); };
    await queue.run(job, signal());
    await vi.advanceTimersByTimeAsync(0.25);
    const second = queue.run(job, signal());
    await vi.advanceTimersByTimeAsync(interval - 1);
    expect(starts).toEqual([0]);
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(starts).toEqual([0, interval + 0.25]);
  },
);

test('a rejected queue job does not poison the next job', async () => {
  vi.useFakeTimers();
  const queue = createRateQueue(1100);
  const failed = queue.run(async () => { throw new Error('failed job'); }, signal());
  const assertion = expect(failed).rejects.toThrow('failed job');
  const next = queue.run(async () => 'next', signal());
  await vi.advanceTimersByTimeAsync(1100);
  await assertion;
  await expect(next).resolves.toBe('next');
});

test('aborting work while it waits behind a running job prevents its start', async () => {
  const queue = createRateQueue(1100);
  let finish!: () => void;
  const first = queue.run(() => new Promise<void>((resolve) => { finish = resolve; }), signal());
  await Promise.resolve();
  const controller = new AbortController();
  let started = false;
  const cancelled = queue.run(async () => { started = true; }, controller.signal);
  const assertion = expect(cancelled).rejects.toMatchObject({ name: 'AbortError', message: 'cancelled' });
  controller.abort(new Error('secret-value'));
  await assertion;
  finish();
  await first;
  expect(started).toBe(false);
});

test('aborting a queue delay clears its timer and listener', async () => {
  vi.useFakeTimers();
  const queue = createRateQueue(3100);
  await queue.run(async () => 'first', signal());
  const controller = new AbortController();
  const add = vi.spyOn(controller.signal, 'addEventListener');
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  let started = false;
  const cancelled = queue.run(async () => { started = true; }, controller.signal);
  const assertion = expect(cancelled).rejects.toMatchObject({ name: 'AbortError', message: 'cancelled' });
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(1);
  controller.abort();
  await assertion;
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(0);
  expect(started).toBe(false);
  for (const [, callback] of add.mock.calls) expect(remove.mock.calls.some(([, removed]) => removed === callback)).toBe(true);
});

test('completed queue delays remove every abort listener', async () => {
  vi.useFakeTimers();
  const queue = createRateQueue(1100);
  await queue.run(async () => 'first', signal());
  const controller = new AbortController();
  const add = vi.spyOn(controller.signal, 'addEventListener');
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  const second = queue.run(async () => 'second', controller.signal);
  await vi.advanceTimersByTimeAsync(1100);
  await expect(second).resolves.toBe('second');
  for (const [, callback] of add.mock.calls) expect(remove.mock.calls.some(([, removed]) => removed === callback)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

test('a wall-clock jump does not bypass elapsed queue spacing', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const queue = createRateQueue(3100);
  let started = 0;
  await queue.run(async () => { started++; }, signal());
  vi.setSystemTime(1000000);
  const second = queue.run(async () => { started++; }, signal());
  await vi.advanceTimersByTimeAsync(0);
  expect(started).toBe(1);
  await vi.advanceTimersByTimeAsync(3099);
  expect(started).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  await second;
  expect(started).toBe(2);
});


test('Hardcover rejects arbitrary endpoint and query before fetching', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => json());
  for (const path of ['/v1/graphql?query=anything', '/v1/graphql#fragment', 'https://evil.example/v1/graphql', '/graphql']) {
    await expect(fetchProviderJson('hardcover', path, {}, signal(), fetcher)).rejects.toMatchObject({ reason: 'provider-error' });
  }
  expect(fetcher).not.toHaveBeenCalled();
});
