// @vitest-environment node
import { request as httpRequest, type Server } from 'node:http';
import { connect } from 'node:net';
import { afterEach, expect, test, vi } from 'vitest';
import { createDiscoveryServer } from '../../server/discovery/server';
import type { DiscoveryConfig } from '../../server/discovery/config';
import type { DiscoveryDependencies } from '../../server/discovery/runDiscovery';
import { emptyUsage } from '../../shared/discovery';
import { parseCheckResponse } from '../../shared/discoveryValidation';
import { request } from './fixtures';

const config = { tavilyKey: null, deepseekKey: null, model: 'deepseek-flash' as const };
const origin = 'http://127.0.0.1:3000';
const servers: Server[] = [];
function dependencies(): DiscoveryDependencies {
  return { catalogs: vi.fn(async () => ({ evidence: { sources: [], identities: [], editions: [] }, usage: emptyUsage(), reasons: [] })),
    search: vi.fn(), extract: vi.fn(), now: () => '2026-09-29T12:00:00Z', canSearch: false, canExtract: false };
}
async function start(deps = dependencies(), cfg: DiscoveryConfig = config) {
  const server = createDiscoveryServer(cfg, deps); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  return { server, deps, port: address.port, url: `http://127.0.0.1:${address.port}` };
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); })));
  vi.restoreAllMocks();
});
function send(port: number, { path = '/api/discovery/check', method = 'POST', headers = {}, body = JSON.stringify(request()) } = {}) {
  return new Promise<{ status: number; headers: import('node:http').IncomingHttpHeaders; body: unknown }>((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method, headers: { Origin: origin, 'Content-Type': 'application/json', ...headers } }, res => {
      let text = ''; res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: JSON.parse(text) }));
    });
    req.on('error', reject); req.end(body);
  });
}
test('creates an unbound server without starting provider work', () => {
  const deps = dependencies(); const server = createDiscoveryServer(config, deps); servers.push(server);
  expect(server.listening).toBe(false); expect(deps.catalogs).not.toHaveBeenCalled();
});
test('capabilities expose only presence, caps, model and dated estimate without provider work', async () => {
  const { url, deps } = await start(dependencies(), { ...config, tavilyKey: 'fake-search-secret', deepseekKey: 'fake-ai-secret', googleBooksKey: 'fake-google-secret' });
  const response = await fetch(`${url}/api/discovery/capabilities`);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toEqual({ search: true, ai: true, googleBooks: true, hardcover: false, model: 'deepseek-flash',
    limits: { search: 3, ai: 1, googleBooks: 2, hardcover: 1, outputTokens: 2048, inputBytes: 20000 }, pricingAsOf: '2026-09-29', estimatedMaxAiUsd: 0.0084576 });
  for (const key of ['fake-search-secret', 'fake-ai-secret', 'fake-google-secret']) expect(JSON.stringify(body)).not.toContain(key);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.has('access-control-allow-origin')).toBe(false);
  expect(deps.catalogs).not.toHaveBeenCalled(); expect(deps.search).not.toHaveBeenCalled(); expect(deps.extract).not.toHaveBeenCalled();
});

test.each([null, '', ' ', undefined])('Google capabilities disable absent or blank optional keys %s without provider work', async googleBooksKey => {
  const { url, deps } = await start(dependencies(), googleBooksKey === undefined ? config : { ...config, googleBooksKey });
  const response = await fetch(`${url}/api/discovery/capabilities`);
  expect(await response.json()).toMatchObject({ googleBooks: false, limits: { googleBooks: 2 } });
  expect(deps.catalogs).not.toHaveBeenCalled(); expect(deps.search).not.toHaveBeenCalled(); expect(deps.extract).not.toHaveBeenCalled();
});
test.each(['localhost', 'example.com', '127.0.0.1:3001', '127.0.0.1'])('rejects nonmatching Host %s', async host => {
  const { port, deps } = await start();
  expect(await send(port, { headers: { Host: host } })).toMatchObject({ status: 403, body: { error: 'forbidden' } });
  expect(deps.catalogs).not.toHaveBeenCalled();
});
test.each([undefined, 'https://evil.example', 'http://localhost:3000', `${origin}/`, 'http://127.0.0.1:3000.evil.example'])('requires exact app Origin for checks: %s', async value => {
  const { url, deps } = await start();
  const response = await fetch(`${url}/api/discovery/check`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(value ? { Origin: value } : {}) }, body: JSON.stringify(request()) });
  expect(response.status).toBe(403); expect(await response.json()).toEqual({ error: 'forbidden' }); expect(deps.catalogs).not.toHaveBeenCalled();
});
test('rejects external Origin on capabilities too', async () => {
  const { url } = await start();
  expect((await fetch(`${url}/api/discovery/capabilities`, { headers: { Origin: 'https://evil.example' } })).status).toBe(403);
});
test.each(['Host', 'Origin'])('rejects duplicate %s headers', async name => {
  const { port, deps } = await start();
  const response = await new Promise<string>((resolve, reject) => {
    const socket = connect(port, '127.0.0.1'); let result = '';
    socket.on('error', reject); socket.on('data', chunk => { result += chunk; }); socket.on('end', () => resolve(result));
    socket.on('connect', () => socket.end(`GET /api/discovery/capabilities HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: ${origin}\r\n${name}: ${name === 'Host' ? `127.0.0.1:${port}` : origin}\r\nConnection: close\r\n\r\n`));
  });
  expect(response).toContain('403 Forbidden'); expect(response).toContain('{"error":"forbidden"}'); expect(deps.catalogs).not.toHaveBeenCalled();
});
test('rejects oversized streamed body before client completes it', async () => {
  const { port, deps } = await start();
  const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method: 'POST', path: '/api/discovery/check', headers: { Origin: origin, 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, res => {
      let body = ''; res.on('data', chunk => { body += chunk; }); res.on('end', () => { req.destroy(); resolve({ status: res.statusCode!, body }); });
    });
    req.on('error', reject); req.write(' '.repeat(8192)); req.write(' '.repeat(8193));
  });
  expect(response).toEqual({ status: 400, body: '{"error":"bad-request"}' }); expect(deps.catalogs).not.toHaveBeenCalled();
});
test.each([
  { method: 'PUT', status: 405, error: 'method' },
  { method: 'GET', status: 405, error: 'method' },
  { path: '/api/discovery/missing', status: 404, error: 'not-found' },
  { path: '/api/discovery/check?url=https://evil.example', status: 404, error: 'not-found' },
  { headers: { 'Content-Type': 'text/plain' }, status: 400, error: 'bad-request' },
  { body: 'broken json', status: 400, error: 'bad-request' },
  { body: '{}', status: 400, error: 'bad-request' },
  { body: JSON.stringify({ ...request(), url: 'https://evil.example' }), status: 400, error: 'bad-request' },
  { body: ' '.repeat(16385), status: 400, error: 'bad-request' },
])('rejects invalid request %# before providers', async ({ status, error, ...options }) => {
  const { port, deps } = await start(); const response = await send(port, options);
  expect(response).toMatchObject({ status, body: { error } }); expect(deps.catalogs).not.toHaveBeenCalled();
});
test('valid check completes after body end and response is parsed', async () => {
  const deps = dependencies();
  deps.catalogs = vi.fn(async (_request, _markets, signal) => {
    await new Promise(resolve => setTimeout(resolve, 15)); expect(signal.aborted).toBe(false);
    return { evidence: { sources: [], identities: [], editions: [] }, usage: emptyUsage(), reasons: [] };
  });
  const { port } = await start(deps); const response = await send(port);
  expect(response.status).toBe(200); expect(parseCheckResponse(response.body).ok).toBe(true);
  expect(deps.catalogs).toHaveBeenCalledOnce(); expect(response.headers['content-type']).toBe('application/json');
});
test('one active check across server instances returns busy and clears after finally', async () => {
  let release!: () => void; let entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const deps = dependencies(); deps.catalogs = vi.fn(async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); return { evidence: { sources: [], identities: [], editions: [] }, usage: emptyUsage(), reasons: [] }; });
  const first = await start(deps); const second = await start(); const pending = send(first.port); await ready;
  expect(await send(second.port)).toMatchObject({ status: 409, body: { error: 'busy' } }); expect(second.deps.catalogs).not.toHaveBeenCalled();
  release(); expect((await pending).status).toBe(200); expect((await send(second.port)).status).toBe(200);
});
test.each(['exception', 'invalid response'])('sanitizes %s and clears busy', async mode => {
  const deps = dependencies(); deps.now = () => { if (mode === 'exception') throw new Error('fake secret upstream stack'); return 'invalid timestamp'; };
  const { port } = await start(deps);
  expect(await send(port)).toMatchObject({ status: 503, body: { error: 'service-error' } });
  deps.now = () => '2026-09-29T12:00:00Z'; expect((await send(port)).status).toBe(200);
});
test.each(['disconnect', 'server close'])('aborts pending provider work on %s', async mode => {
  let entered!: () => void; let aborted!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; }); const cancelled = new Promise<void>(resolve => { aborted = resolve; });
  const deps = dependencies(); deps.catalogs = vi.fn(async (_request, _markets, signal) => {
    entered(); await new Promise<void>(resolve => signal.addEventListener('abort', () => { aborted(); resolve(); }, { once: true }));
    return { evidence: { sources: [], identities: [], editions: [] }, usage: emptyUsage(), reasons: [] };
  });
  const { server, port } = await start(deps);
  const req = httpRequest({ host: '127.0.0.1', port, path: '/api/discovery/check', method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' } }, res => res.resume());
  req.on('error', () => {}); req.end(JSON.stringify(request())); await ready;
  if (mode === 'disconnect') req.destroy(); else server.close();
  await cancelled;
});


test.each([null, '', ' ', undefined, 'fake-hardcover-token'])('Hardcover capability exposes presence and one-call bound without secrets: %s', async hardcoverToken => {
  const { url, deps } = await start(dependencies(), { ...config, hardcoverToken });
  const result = await fetch(`${url}/api/discovery/capabilities`); const value = await result.json();
  expect(value).toMatchObject({ hardcover: Boolean(hardcoverToken?.trim()), limits: { hardcover: 1 } });
  expect(JSON.stringify(value)).not.toContain('fake-hardcover-token'); expect(deps.catalogs).not.toHaveBeenCalled();
});
