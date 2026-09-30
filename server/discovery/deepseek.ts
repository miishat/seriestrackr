import { emptyUsage } from '../../shared/discovery';
import type { CheckRequest, EvidenceBundle, Source, Usage } from '../../shared/discovery';
import { normalizeIdentity } from '../../shared/discoveryPolicy';
import { parseExtraction } from '../../shared/discoveryValidation';
import type { DiscoveryConfig } from './config';
import { fetchProviderJson, ProviderError } from './http';
import { buildExtractionMessages } from './prompt';

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const invalid = (): never => { throw new ProviderError('deepseek', 'invalid-evidence'); };
const tokenCount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

function checkTarget(request: CheckRequest, evidence: EvidenceBundle): void {
  const author = normalizeIdentity(request.target.author);
  const requestedTitle = normalizeIdentity(request.target.title);
  const titles = new Set(evidence.identities.map(item => normalizeIdentity(item.title)));
  if (titles.size > 1) invalid();
  for (const item of evidence.identities) {
    if (normalizeIdentity(item.author) !== author || item.position !== request.target.position ||
      (requestedTitle && normalizeIdentity(item.title) !== requestedTitle)) invalid();
  }
  const title = requestedTitle || [...titles][0];
  for (const item of evidence.editions) {
    if (!title || normalizeIdentity(item.title) !== title || normalizeIdentity(item.author) !== author ||
      (item.position !== null && item.position !== request.target.position) ||
      !request.formats.includes(item.format === 'audio' ? 'audio' : 'book')) invalid();
  }
  // Literal quote matching establishes traceability, not semantic proof of
  // title/order/date/market claims. Proposed facts still require source review.
}

function extractionContent(raw: unknown): unknown {
  const envelope = object(raw);
  const choices = envelope?.choices;
  if (!Array.isArray(choices) || choices.length !== 1) invalid();
  const choice = object(choices[0]);
  const message = object(choice?.message);
  if (!message || typeof message.content !== 'string' ||
    choice?.finish_reason !== 'stop' ||
    Object.hasOwn(message, 'tool_calls') || Object.hasOwn(message, 'function_call')) return invalid();
  let content: unknown;
  try { content = JSON.parse(message.content); } catch { return invalid(); }
  const value = object(content);
  if (!value || Object.keys(value).some(key => key !== 'identities' && key !== 'editions')) invalid();
  // Missing nullable facts remain unknown. Do not hydrate from catalog or
  // storefront metadata, and do not default a missing edition format.
  if (Array.isArray(value.editions)) {
    value.editions = value.editions.map(item => {
      const edition = object(item);
      if (!edition) return item;
      return { position: null, editionKey: null, language: null, market: null,
        date: null, precision: 'none', ...edition };
    });
  }
  return value;
}

export async function extractEvidence(
  request: CheckRequest, evidence: EvidenceBundle, config: DiscoveryConfig,
  signal: AbortSignal, fetcher: typeof fetch = fetch,
): Promise<{ evidence: EvidenceBundle; usage: Usage }> {
  if (!request.useAi) return { evidence, usage: emptyUsage() };
  if (signal.aborted) throw new ProviderError('deepseek', 'cancelled');
  if (!config.deepseekKey?.trim()) throw new ProviderError('deepseek', 'missing-key');
  const messages = buildExtractionMessages(request, evidence);
  // Read the actual user payload back, retaining metadata only on the server.
  // Sources dropped or text trimmed for the budget cannot verify model quotes.
  const sent = JSON.parse(messages[1].content) as { sources: Pick<Source, 'id' | 'title' | 'text'>[] };
  const originalById = new Map(evidence.sources.map(source => [source.id, source]));
  const suppliedSources = sent.sources.map(source => ({ ...originalById.get(source.id)!, ...source }));
  if (!parseExtraction({ identities: [], editions: [] }, suppliedSources).ok) invalid();
  const raw = await fetchProviderJson('deepseek', '/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.deepseekKey}` },
    body: JSON.stringify({ model: config.model, messages, thinking: { type: 'disabled' },
      max_tokens: 2048, response_format: { type: 'json_object' }, stream: false }),
  }, signal, fetcher);
  const parsed = parseExtraction(extractionContent(raw), suppliedSources);
  if (parsed.ok === false) return invalid();
  checkTarget(request, parsed.value);
  const reportedUsage = object(object(raw)?.usage);
  return { evidence: parsed.value, usage: { ...emptyUsage(), deepseek: 1,
    inputTokens: tokenCount(reportedUsage?.prompt_tokens), outputTokens: tokenCount(reportedUsage?.completion_tokens) } };
}

export function estimatedMaxAiUsd(): { usd: number; pricingAsOf: string } {
  // Approximate capped estimate, not a bill or a tokenizer guarantee. Treat
  // each input byte as one token and use peak uncached rates researched from
  // https://api-docs.deepseek.com/quick_start/pricing/ on 2026-09-29.
  return { usd: (20000 * 30 + 2048 * 120) / 100_000_000, pricingAsOf: '2026-09-29' };
}
