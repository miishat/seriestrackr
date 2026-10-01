import type { Capabilities, CheckRequest, CheckResponse } from '../../shared/discovery';
import { parseCheckRequest, parseCheckResponse } from '../../shared/discoveryValidation';

const invalidResponse = () => new Error('Discovery returned an invalid response.');
const unavailable = () => new Error('Discovery service is unavailable. Start the local discovery service and try again.');

function record(input: unknown, keys: string[]): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw invalidResponse();
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw invalidResponse();
  return value;
}

function capabilities(input: unknown): Capabilities {
  const value = record(input, ['search', 'ai', 'googleBooks', 'hardcover', 'model', 'limits', 'pricingAsOf', 'estimatedMaxAiUsd']);
  for (const field of ['search', 'ai', 'googleBooks', 'hardcover']) {
    if (typeof value[field] !== 'boolean') throw invalidResponse();
  }
  const limits = record(value.limits, ['search', 'ai', 'googleBooks', 'hardcover', 'outputTokens', 'inputBytes']);
  if (limits.search !== 3 || limits.ai !== 1 || limits.googleBooks !== 2 || limits.hardcover !== 1 ||
    limits.outputTokens !== 2048 || limits.inputBytes !== 20000 || value.model !== 'deepseek-flash') throw invalidResponse();
  if (typeof value.pricingAsOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.pricingAsOf)) throw invalidResponse();
  const date = new Date(`${value.pricingAsOf}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.pricingAsOf) throw invalidResponse();
  if (typeof value.estimatedMaxAiUsd !== 'number' || !Number.isFinite(value.estimatedMaxAiUsd) || value.estimatedMaxAiUsd < 0) throw invalidResponse();
  return {
    search: value.search as boolean, ai: value.ai as boolean, googleBooks: value.googleBooks as boolean,
    hardcover: value.hardcover as boolean, model: value.model,
    limits: { search: 3, ai: 1, googleBooks: 2, hardcover: 1, outputTokens: 2048, inputBytes: 20000 },
    pricingAsOf: value.pricingAsOf, estimatedMaxAiUsd: value.estimatedMaxAiUsd,
  };
}

function cancelled(error: unknown, signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Discovery check cancelled.', 'AbortError');
  if (error !== null && typeof error === 'object' && 'name' in error && error.name === 'AbortError') throw error;
}

async function fetchJson(path: '/api/discovery/capabilities' | '/api/discovery/check', signal: AbortSignal, body?: string): Promise<unknown> {
  cancelled(null, signal);
  let reply: Response;
  try {
    reply = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST', signal,
      mode: 'same-origin', credentials: 'same-origin', redirect: 'error', cache: 'no-store',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body }),
    });
  } catch (error) {
    cancelled(error, signal);
    throw unavailable();
  }
  cancelled(null, signal);
  if (!reply.ok) {
    if (reply.status === 409) throw new Error('Discovery is busy. Try again when the current check finishes.');
    if (reply.status === 429) throw new Error('Discovery quota is exhausted. Try again later.');
    if (reply.status === 400 || reply.status === 403 || reply.status === 405) throw new Error('Discovery request was rejected.');
    throw unavailable();
  }
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(reply.headers.get('Content-Type') ?? '')) throw invalidResponse();
  try {
    const value: unknown = await reply.json();
    cancelled(null, signal);
    return value;
  } catch (error) {
    cancelled(error, signal);
    throw invalidResponse();
  }
}

export async function getDiscoveryCapabilities(signal: AbortSignal): Promise<Capabilities> {
  return capabilities(await fetchJson('/api/discovery/capabilities', signal));
}

export async function checkDiscovery(request: CheckRequest, signal: AbortSignal): Promise<CheckResponse> {
  const parsed = parseCheckRequest(request);
  if (!parsed.ok) throw new Error('Invalid discovery request.');
  const result = parseCheckResponse(await fetchJson('/api/discovery/check', signal, JSON.stringify(parsed.value)));
  if (!result.ok || result.value.requestId !== parsed.value.requestId || result.value.seriesId !== parsed.value.seriesId) throw invalidResponse();
  return result.value;
}
