// @vitest-environment node
import { request as httpRequest, type Server } from 'node:http';
import { afterEach, expect, test, vi } from 'vitest';
import { createDiscoveryServer, withUserKeys, type UserKeys } from '../../server/discovery/server';
import type { DiscoveryDependencies } from '../../server/discovery/runDiscovery';
import { emptyUsage } from '../../shared/discovery';
import { request } from './fixtures';

const origin = 'http://127.0.0.1:3000';
const servers: Server[] = [];
const config = { tavilyKey: 'file-tavily-key-1', deepseekKey: 'file-deepseek-key-1', model: 'deepseek-flash' as const };
const deps = (): DiscoveryDependencies => ({ catalogs: vi.fn(async () => ({ evidence: { sources: [], identities: [], editions: [] }, usage: emptyUsage(), reasons: [] })),
  search: vi.fn(), extract: vi.fn(), now: () => '2026-09-29T12:00:00Z', canSearch: false, canExtract: false });
async function start(runtimeFor: (keys: UserKeys) => DiscoveryDependencies) {
  const server = createDiscoveryServer(config, undefined, runtimeFor); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as { port: number }).port;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); })));
});
const post = (port: number, headers: Record<string, string> = {}) => new Promise<{ status: number; text: string }>((resolve, reject) => {
  const req = httpRequest({ host: '127.0.0.1', port, path: '/api/discovery/check', method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers } }, res => {
    let text = ''; res.on('data', chunk => { text += chunk; }); res.on('end', () => resolve({ status: res.statusCode!, text }));
  });
  req.on('error', reject); req.end(JSON.stringify(request()));
});

test('keys sent in headers reach that request runtime and nothing else', async () => {
  const seen: UserKeys[] = [];
  const port = await start(keys => { seen.push(keys); return deps(); });
  const reply = await post(port, { 'X-Tavily-Key': 'user-tavily-key-1', 'X-Deepseek-Key': 'user-deepseek-key-1' });
  expect(reply.status).toBe(200);
  expect(seen).toEqual([{ tavily: 'user-tavily-key-1', deepseek: 'user-deepseek-key-1' }]);
  expect(reply.text).not.toContain('user-tavily-key-1'); expect(reply.text).not.toContain('user-deepseek-key-1');
});
test('a check without key headers gets no keys, never the keys from the local env files', async () => {
  const seen: UserKeys[] = [];
  const port = await start(keys => { seen.push(keys); return deps(); });
  await post(port);
  expect(seen).toEqual([{ tavily: null, deepseek: null }]);
});
test.each([['too short', 'abc'], ['has a space', 'user key with spaces'], ['non-ASCII', 'user-key-é-bad-1'], ['too long', 'k'.repeat(301)]])('a malformed key header is rejected before any provider work: %s', async (_name, value) => {
  const factory = vi.fn(() => deps());
  const port = await start(factory);
  const reply = await post(port, { 'X-Tavily-Key': value });
  expect(reply.status).toBe(400); expect(factory).not.toHaveBeenCalled();
  expect(reply.text).not.toContain(value);
});
test('a duplicated key header is rejected', async () => {
  const port = await start(() => deps());
  const reply = await new Promise<number>((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path: '/api/discovery/check', method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Tavily-Key': ['user-tavily-key-1', 'user-tavily-key-2'] } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode!)); });
    req.on('error', reject); req.end(JSON.stringify(request()));
  });
  expect(reply).toBe(400);
});
test('the server never uses Tavily or DeepSeek keys from its own config files', () => {
  expect(withUserKeys(config, { tavily: null, deepseek: null })).toMatchObject({ tavilyKey: null, deepseekKey: null });
  expect(withUserKeys(config, { tavily: 'user-tavily-key-1', deepseek: null })).toMatchObject({ tavilyKey: 'user-tavily-key-1', deepseekKey: null });
});
test('capabilities report that search and AI are supported with a user key, regardless of local files', async () => {
  const port = await start(() => deps());
  const body = await fetch(`http://127.0.0.1:${port}/api/discovery/capabilities`).then(r => r.json());
  expect(body).toMatchObject({ search: true, ai: true });
  expect(JSON.stringify(body)).not.toContain('file-tavily-key-1');
});
