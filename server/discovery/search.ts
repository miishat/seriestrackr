import { createHash } from 'node:crypto';
import type { CheckRequest, EvidenceBundle, Source } from '../../shared/discovery';
import { parseExtraction } from '../../shared/discoveryValidation';
import type { DiscoveryConfig } from './config';
import { fetchProviderJson, ProviderError } from './http';

const empty = (): EvidenceBundle => ({ sources: [], identities: [], editions: [] });
const object = (input: unknown): Record<string, unknown> => input !== null && typeof input === 'object' && !Array.isArray(input)
  ? input as Record<string, unknown> : {};
const whitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();
const text = (input: unknown, max: number): string | null => {
  if (typeof input !== 'string') return null;
  const bounded = input.slice(0, max);
  return bounded.trim() ? bounded : null;
};

export function buildSearchQueries(request: CheckRequest, needs: { identity: boolean; book: boolean; audio: boolean }): string[] {
  const { series, author, position, title, orderNote } = request.target;
  const subject = whitespace(title) || series;
  const queries: string[] = [];
  if (needs.identity) queries.push(`${series} ${author} book ${position} reading order next novel ${orderNote}`);
  if (needs.book && request.formats.includes('book')) {
    queries.push(`${subject} ${author} ebook hardcover publication release date English ${request.preferredMarket}`);
  }
  if (needs.audio && request.formats.includes('audio')) {
    queries.push(`${subject} ${author} audiobook release date English ${request.preferredMarket}`);
  }
  // Remaining slots go to a primary-host query built only from the request.
  if (needs.identity && queries.length < 3) {
    queries.push(`${series} ${author} book ${position} official publisher author announcement`);
  }
  return [...new Set(queries.map(whitespace))].slice(0, 3);
}

function canonicalUrl(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 2048) return null;
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

export function normalizeSearch(input: unknown, checkedAt: string): EvidenceBundle {
  const bundle = empty();
  const results = object(input).results;
  const seen = new Set<string>();
  for (const item of Array.isArray(results) ? results.slice(0, 5) : []) {
    const raw = object(item);
    const url = canonicalUrl(raw.url);
    const title = text(raw.title, 300);
    const sourceText = text(raw.raw_content, 6000) ?? text(raw.content, 6000) ?? text(raw.snippet, 6000);
    if (!url || !title || !sourceText || seen.has(url)) continue;
    const source: Source = {
      id: `tavily:${createHash('sha256').update(url).digest('hex').slice(0, 24)}`,
      title, url, provider: 'tavily', market: null, retrievedAt: checkedAt, text: sourceText,
    };
    // Reuse the shared source parser's public-link rules. Retrieved prose stays inert.
    if (!parseExtraction({ identities: [], editions: [] }, [source]).ok) continue;
    seen.add(url);
    bundle.sources.push(source);
  }
  return bundle;
}

export async function searchEvidence(
  query: string, config: DiscoveryConfig, signal: AbortSignal, fetcher: typeof fetch = fetch,
): Promise<EvidenceBundle> {
  if (signal.aborted) throw new ProviderError('tavily', 'cancelled');
  if (!config.tavilyKey?.trim()) throw new ProviderError('tavily', 'missing-key');
  const payload = {
    query, topic: 'general', search_depth: 'basic', max_results: 5,
    include_answer: false, include_raw_content: 'text', include_images: false, auto_parameters: false,
  };
  const raw = await fetchProviderJson('tavily', '/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.tavilyKey}` },
    body: JSON.stringify(payload),
  }, signal, fetcher);
  if (!Array.isArray(object(raw).results)) throw new ProviderError('tavily', 'invalid-evidence');
  return normalizeSearch(raw, new Date().toISOString());
}
