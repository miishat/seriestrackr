import type { CoverCandidate, CoverRequest, CoverResult, AuthorSuggestion } from './covers';
import type { Parsed, SourceLink } from './discovery';

export const MAX_COVER_CANDIDATES = 9;
const providers = ['apple', 'hardcover', 'googlebooks', 'openlibrary'] as const;
const formats = ['ebook', 'print', 'audio'] as const;
const states = ['ok', 'no-match', 'quota', 'failed'] as const;

export function isPortrait(width: number, height: number): boolean {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 &&
    width / height >= 0.45 && width / height <= 0.85;
}

const exactHosts = new Set(['covers.openlibrary.org', 'books.google.com', 'books.googleusercontent.com', 'assets.hardcover.app']);
const googleHosts = new Set(['books.google.com', 'books.googleusercontent.com']);
const privateHost = (host: string): boolean => /^(?:localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host) ||
  host.startsWith('[') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);

// Returns the normalised URL or null. Only known Google image URLs are upgraded from http.
export function validateCoverImageUrl(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 2048 || input.includes('#')) return null;
  let url: URL;
  try { url = new URL(input); } catch { return null; }
  if (url.username || url.password || url.hash || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (privateHost(host)) return null;
  const known = exactHosts.has(host) || /^is[1-5]-ssl\.mzstatic\.com$/.test(host);
  if (!known) return null;
  if (url.protocol === 'http:' && googleHosts.has(host)) url.protocol = 'https:';
  if (url.protocol !== 'https:') return null;
  return url.href;
}

function fail(path: string): never { throw new Error(`${path}: invalid`); }
const record = (input: unknown, path: string): Record<string, unknown> =>
  input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : fail(path);
const str = (input: unknown, path: string, max = 300): string =>
  typeof input === 'string' && input.trim() && input.length <= max ? input : fail(path);
const dim = (input: unknown, path: string): number | null =>
  input === null ? null : typeof input === 'number' && Number.isFinite(input) && input > 0 && input <= 20000 ? input : fail(path);

function sourceLink(input: unknown, path: string): SourceLink {
  const value = record(input, path);
  const url = str(value.url, `${path}.url`, 2048);
  try { if (new URL(url).protocol !== 'https:') fail(path); } catch { fail(path); }
  return { id: str(value.id, `${path}.id`, 200), title: str(value.title, `${path}.title`), url };
}

export function candidate(input: unknown, path = 'candidate'): CoverCandidate {
  const value = record(input, path);
  const imageUrl = validateCoverImageUrl(value.imageUrl);
  if (!imageUrl) fail(`${path}.imageUrl`);
  if (!['next', 'previous'].includes(value.role as string)) fail(`${path}.role`);
  if (!formats.includes(value.format as never)) fail(`${path}.format`);
  if (!providers.includes(value.provider as never)) fail(`${path}.provider`);
  return {
    id: str(value.id, `${path}.id`, 200), title: str(value.title, `${path}.title`), author: str(value.author, `${path}.author`),
    role: value.role as CoverCandidate['role'], format: value.format as CoverCandidate['format'], provider: value.provider as CoverCandidate['provider'],
    source: sourceLink(value.source, `${path}.source`), imageUrl: imageUrl as string,
    workKey: str(value.workKey, `${path}.workKey`, 400),
    editionKey: value.editionKey === null ? null : str(value.editionKey, `${path}.editionKey`, 200),
    width: dim(value.width, `${path}.width`), height: dim(value.height, `${path}.height`),
  };
}

export function parseCoverCandidates(input: unknown, path = 'coverCandidates'): CoverCandidate[] {
  if (!Array.isArray(input) || input.length > MAX_COVER_CANDIDATES) fail(path);
  const items = (input as unknown[]).map((item, index) => candidate(item, `${path}[${index}]`));
  if (new Set(items.map(item => item.id)).size !== items.length) fail(path);
  return items;
}

export function parseCoverRequest(input: unknown): Parsed<CoverRequest> {
  try {
    const value = record(input, 'request');
    const allowed = ['requestId', 'seriesId', 'series', 'author', 'nextTitle', 'position', 'previousTitle', 'preferredMarket'];
    if (Object.keys(value).some(key => !allowed.includes(key)) || allowed.some(key => !Object.hasOwn(value, key))) fail('request');
    if (typeof value.position !== 'number' || !Number.isSafeInteger(value.position) || value.position < 1 || value.position > 1000) fail('request.position');
    const market = str(value.preferredMarket, 'request.preferredMarket', 2);
    if (!/^[A-Z]{2}$/.test(market)) fail('request.preferredMarket');
    return { ok: true, value: {
      requestId: str(value.requestId, 'request.requestId', 100), seriesId: str(value.seriesId, 'request.seriesId', 100),
      series: str(value.series, 'request.series'), author: str(value.author, 'request.author'), nextTitle: str(value.nextTitle, 'request.nextTitle'),
      position: value.position as number, previousTitle: value.previousTitle === null ? null : str(value.previousTitle, 'request.previousTitle'),
      preferredMarket: market } };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'invalid input' }; }
}

export function parseCoverResult(input: unknown): Parsed<CoverResult> {
  try {
    const value = record(input, 'result');
    if (!Array.isArray(value.authorSuggestions) || value.authorSuggestions.length > 9 || !Array.isArray(value.outcomes) || value.outcomes.length > 4) fail('result');
    const authorSuggestions: AuthorSuggestion[] = (value.authorSuggestions as unknown[]).map((item, index) => {
      const suggestion = record(item, `result.authorSuggestions[${index}]`);
      return { author: str(suggestion.author, 'author'), title: str(suggestion.title, 'title'), source: sourceLink(suggestion.source, 'source') };
    });
    const outcomes = (value.outcomes as unknown[]).map((item, index) => {
      const outcome = record(item, `result.outcomes[${index}]`);
      if (!providers.includes(outcome.provider as never) || !states.includes(outcome.state as never)) fail('outcome');
      return { provider: outcome.provider as CoverCandidate['provider'], state: outcome.state as CoverResult['outcomes'][number]['state'] };
    });
    return { ok: true, value: { requestId: str(value.requestId, 'requestId', 100), seriesId: str(value.seriesId, 'seriesId', 100),
      candidates: parseCoverCandidates(value.candidates, 'result.candidates'), authorSuggestions, outcomes } };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'invalid input' }; }
}
