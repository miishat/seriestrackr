import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Capabilities } from '../../shared/discovery';
import { parseCheckRequest, parseCheckResponse } from '../../shared/discoveryValidation';
import { parseCoverRequest, parseCoverResult } from '../../shared/coverValidation';
import type { CoverRequest, CoverResult } from '../../shared/covers';
import type { DiscoveryConfig } from './config';
import { estimatedMaxAiUsd } from './deepseek';
import { runDiscovery, type DiscoveryDependencies } from './runDiscovery';
import { createDiscoveryRuntime } from './runtime';
import { isApiKey } from '../../shared/apiKey';
import { createResponseCache } from './responseCache';

const appOrigin = 'http://127.0.0.1:3000';
const bodyLimit = 16 * 1024;
// All servers in this process share the credit-spending lock.
let activeCheck = false;
type ApiError = 'bad-request' | 'forbidden' | 'busy' | 'method' | 'not-found' | 'service-error';
const statuses: Record<ApiError, number> = { 'bad-request': 400, forbidden: 403, busy: 409, method: 405, 'not-found': 404, 'service-error': 503 };

function json(res: ServerResponse, status: number, value: unknown): void {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
function reject(res: ServerResponse, error: ApiError): void { json(res, statuses[error], { error }); }
function singleHeader(req: IncomingMessage, name: string): boolean {
  return req.rawHeaders.filter((_, index) => index % 2 === 0 && req.rawHeaders[index].toLowerCase() === name).length <= 1;
}
function body(req: IncomingMessage, res: ServerResponse): Promise<unknown> {
  return new Promise((resolve, rejectBody) => {
    const chunks: Buffer[] = []; let bytes = 0; let settled = false;
    const fail = (oversized = false) => {
      if (settled) return; settled = true;
      if (oversized) {
        // Finish the fixed error before destroying the unread stream/socket.
        req.pause(); res.setHeader('Connection', 'close');
        res.once('finish', () => req.destroy()); reject(res, 'bad-request');
      }
      rejectBody(new Error('invalid-body'));
    };
    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > bodyLimit) { fail(true); return; }
      chunks.push(chunk);
    });
    req.once('end', () => {
      if (settled) return; settled = true;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { rejectBody(new Error('invalid-body')); }
    });
    req.once('aborted', () => fail()); req.once('error', () => fail());
  });
}

type ServerDependencies = DiscoveryDependencies & { covers?: (request: CoverRequest, signal: AbortSignal) => Promise<CoverResult> };

// Tavily and DeepSeek are billed to their owner, so the service only ever uses keys the
// person supplies with the request. Keys in local env files are never used for them.
export interface UserKeys { tavily: string | null; deepseek: string | null }
export const withUserKeys = (config: DiscoveryConfig, keys: UserKeys): DiscoveryConfig => ({ ...config, tavilyKey: keys.tavily, deepseekKey: keys.deepseek });
function parseUserKeys(req: IncomingMessage): UserKeys | null {
  const read = (name: string): string | null | undefined => {
    const value = req.headers[name];
    if (value === undefined) return null;
    if (!singleHeader(req, name) || !isApiKey(value)) return undefined;
    return value;
  };
  const tavily = read('x-tavily-key'); const deepseek = read('x-deepseek-key');
  return tavily === undefined || deepseek === undefined ? null : { tavily, deepseek };
}

export function createDiscoveryServer(config: DiscoveryConfig, dependencies?: ServerDependencies, runtimeFor?: (keys: UserKeys) => ServerDependencies): Server {
  const responseCache = createResponseCache();
  const runtime = (keys: UserKeys): ServerDependencies => runtimeFor?.(keys) ?? dependencies ?? createDiscoveryRuntime(withUserKeys(config, keys), fetch, { responseCache });
  const controllers = new Set<AbortController>();
  const estimate = estimatedMaxAiUsd();
  // search and ai mean "supported with a key you provide"; the service holds no keys for them.
  const capabilities: Capabilities = { search: true, ai: true,
    googleBooks: Boolean(config.googleBooksKey?.trim()), hardcover: Boolean(config.hardcoverToken?.trim()), model: config.model,
    limits: { search: 3, ai: 1, googleBooks: 2, hardcover: 1, outputTokens: 2048, inputBytes: 20000 }, pricingAsOf: estimate.pricingAsOf, estimatedMaxAiUsd: estimate.usd };
  const server = createServer((req, res) => { void dispatch(req, res); });
  // Closing the service must cancel work before waiting for HTTP connections.
  const close = server.close.bind(server);
  server.close = callback => {
    for (const controller of controllers) controller.abort();
    return close(callback);
  };
  async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const address = server.address();
    if (!address || typeof address === 'string' || address.address !== '127.0.0.1' ||
      !singleHeader(req, 'host') || req.headers.host !== `127.0.0.1:${address.port}` ||
      !singleHeader(req, 'origin') || (req.headers.origin !== undefined && req.headers.origin !== appOrigin)) {
      reject(res, 'forbidden'); return;
    }
    if (req.url === '/api/discovery/capabilities') {
      if (req.method !== 'GET') { reject(res, 'method'); return; }
      json(res, 200, capabilities); return;
    }
    const covers = req.url === '/api/discovery/covers';
    if (req.url !== '/api/discovery/check' && !covers) { reject(res, 'not-found'); return; }
    if (req.method !== 'POST') { reject(res, 'method'); return; }
    if (req.headers.origin !== appOrigin) { reject(res, 'forbidden'); return; }
    if (!singleHeader(req, 'content-type') || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '')) {
      reject(res, 'bad-request'); return;
    }
    const keys = parseUserKeys(req);
    if (!keys) { reject(res, 'bad-request'); return; }
    let parsed: ReturnType<typeof parseCheckRequest>;
    let coverParsed: ReturnType<typeof parseCoverRequest> | undefined;
    try { const payload = await body(req, res); if (covers) coverParsed = parseCoverRequest(payload); else parsed = parseCheckRequest(payload); }
    catch { reject(res, 'bad-request'); return; }
    if (covers ? !coverParsed?.ok : !parsed!.ok) { reject(res, 'bad-request'); return; }
    const active = runtime(keys);
    if (covers && !active.covers) { reject(res, 'service-error'); return; }
    if (activeCheck) { reject(res, 'busy'); return; }
    activeCheck = true;
    const controller = new AbortController(); controllers.add(controller);
    const abortRequest = () => controller.abort();
    const closeResponse = () => { if (!res.writableEnded) controller.abort(); };
    req.once('aborted', abortRequest); res.once('close', closeResponse);
    if (req.aborted || res.destroyed) controller.abort();
    try {
      if (covers) {
        const wanted = (coverParsed as { ok: true; value: CoverRequest }).value;
        const result = parseCoverResult(await active.covers!(wanted, controller.signal));
        if (!result.ok || result.value.requestId !== wanted.requestId || result.value.seriesId !== wanted.seriesId) { reject(res, 'service-error'); return; }
        json(res, 200, result.value); return;
      }
      const checked = (parsed as { ok: true; value: Parameters<typeof runDiscovery>[0] }).value;
      const output = parseCheckResponse(await runDiscovery(checked, active, controller.signal));
      if (!output.ok || output.value.requestId !== checked.requestId || output.value.seriesId !== checked.seriesId) {
        reject(res, 'service-error'); return;
      }
      json(res, 200, output.value);
    } catch { reject(res, 'service-error'); }
    finally {
      req.off('aborted', abortRequest); res.off('close', closeResponse);
      controllers.delete(controller); activeCheck = false;
    }
  }
  return server;
}

