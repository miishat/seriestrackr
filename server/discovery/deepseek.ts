import { emptyUsage } from '../../shared/discovery';
import type { CheckRequest, EvidenceBundle, Reason, Source, Usage } from '../../shared/discovery';
import { normalizeIdentity } from '../../shared/discoveryPolicy';
import { parseExtraction } from '../../shared/discoveryValidation';
import type { DiscoveryConfig } from './config';
import { fetchProviderJson, ProviderError } from './http';
import { buildExtractionMessages } from './prompt';
import { OMITTED } from './sourceExcerpt';
import { classifyExtractionFailure, diagnosticCounts, emitDiagnostic, type DiagnosticObserver } from './diagnostics';

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const invalid = (): never => { throw new ProviderError('deepseek', 'invalid-evidence'); };
const tokenCount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

export type ExtractionResult = { evidence: EvidenceBundle; usage: Usage; reasons?: Reason[] };

function matchesTarget(request: CheckRequest, evidence: EvidenceBundle): boolean {
  const author = normalizeIdentity(request.target.author);
  const requestedTitle = normalizeIdentity(request.target.title);
  const titles = new Set(evidence.identities.map(item => normalizeIdentity(item.title)));
  if (titles.size > 1) return false;
  for (const item of evidence.identities) {
    if (normalizeIdentity(item.author) !== author || item.position !== request.target.position ||
      (requestedTitle && normalizeIdentity(item.title) !== requestedTitle)) return false;
  }
  const title = requestedTitle || [...titles][0];
  for (const item of evidence.editions) {
    if (!title || normalizeIdentity(item.title) !== title || normalizeIdentity(item.author) !== author ||
      (item.position !== null && item.position !== request.target.position) ||
      !request.formats.includes(item.format === 'audio' ? 'audio' : 'book')) return false;
  }
  // Literal quote matching establishes traceability, not semantic proof of
  // title/order/date/market claims. Proposed facts still require source review.
  return true;
}

function extractionContent(raw: unknown): { identities: unknown[]; editions: unknown[] } {
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
  // Outer shape and global bounds remain hard failures before batch isolation.
  if (!Array.isArray(value.identities) || value.identities.length > 30 ||
    !Array.isArray(value.editions) || value.editions.length > 100) return invalid();
  // Missing nullable facts remain unknown. Do not hydrate from catalog or
  // storefront metadata, and do not default a missing edition format.
  return { identities: value.identities,
    editions: value.editions.map(item => {
      const edition = object(item);
      if (!edition) return item;
      return { position: null, editionKey: null, language: null, market: null,
        date: null, precision: 'none', ...edition };
    }) };
}

export async function extractEvidence(
  request: CheckRequest, evidence: EvidenceBundle, config: DiscoveryConfig,
  signal: AbortSignal, fetcher: typeof fetch = fetch, onDiagnostic?: DiagnosticObserver,
): Promise<ExtractionResult> {
  if (!request.useAi) return { evidence, usage: emptyUsage() };
  if (signal.aborted) throw new ProviderError('deepseek', 'cancelled');
  if (!config.deepseekKey?.trim()) throw new ProviderError('deepseek', 'missing-key');
  let messages: ReturnType<typeof buildExtractionMessages>;
  try { messages = buildExtractionMessages(request, evidence); }
  catch (error) {
    emitDiagnostic(onDiagnostic, { stage: 'prompt', category: error instanceof ProviderError && error.reason === 'budget' ? 'bounds' : 'shape', sources: 0, identities: 0, editions: 0 });
    throw error;
  }
  // Read the actual user payload back, retaining metadata only on the server.
  // Sources dropped or text trimmed for the budget cannot verify model quotes.
  const sent = JSON.parse(messages[1].content) as { sources: Pick<Source, 'id' | 'title' | 'text'>[] };
  const originalById = new Map(evidence.sources.map(source => [source.id, source]));
  const suppliedSources = sent.sources.map(source => ({ ...originalById.get(source.id)!, ...source }));
  const retainedSources = sent.sources.map(source => originalById.get(source.id)!);
  const validate = (input: { identities: unknown[]; editions: unknown[] }) => {
    const parsed = parseExtraction(input, suppliedSources);
    if (!parsed.ok) return parsed;
    const citations = [...parsed.value.identities, ...parsed.value.editions].flatMap(item => item.citations);
    if (citations.some(citation => !suppliedSources.find(source => source.id === citation.sourceId)!
      .text.split(OMITTED).some(window => window.includes(citation.quote)))) {
      return { ok: false as const, error: 'evidence.citations: quote must appear in supplied source' };
    }
    return parseExtraction(input, retainedSources);
  };
  const supplied = { sources: suppliedSources, identities: [], editions: [] };
  if (suppliedSources.length < evidence.sources.length || suppliedSources.some(source => originalById.get(source.id)?.text !== source.text)) {
    emitDiagnostic(onDiagnostic, { stage: 'prompt', category: 'trimmed', ...diagnosticCounts(supplied) });
  }
  if (!parseExtraction({ identities: [], editions: [] }, suppliedSources).ok) {
    emitDiagnostic(onDiagnostic, { stage: 'prompt', category: 'shape', ...diagnosticCounts(supplied) });
    invalid();
  }
  const raw = await fetchProviderJson('deepseek', '/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.deepseekKey}` },
    body: JSON.stringify({ model: config.model, messages, thinking: { type: 'disabled' },
      max_tokens: 2048, response_format: { type: 'json_object' }, stream: false }),
  }, signal, fetcher);
  let content: ReturnType<typeof extractionContent>;
  try { content = extractionContent(raw); }
  catch (error) {
    emitDiagnostic(onDiagnostic, { stage: 'envelope', category: 'shape', ...diagnosticCounts(supplied) });
    throw error;
  }
  const reportedUsage = object(object(raw)?.usage);
  const usage: Usage = { ...emptyUsage(), deepseek: 1,
    inputTokens: tokenCount(reportedUsage?.prompt_tokens), outputTokens: tokenCount(reportedUsage?.completion_tokens) };
  const identities = validate({ identities: content.identities, editions: [] });
  // A bad nonempty identity batch cannot borrow the known input title to
  // validate editions. Keep ambiguity and false identity claims unresolved.
  if (!identities.ok || !matchesTarget(request, identities.value)) {
    emitDiagnostic(onDiagnostic, { stage: 'identity', category: 'error' in identities ? classifyExtractionFailure(identities.error) : 'target-mismatch', ...diagnosticCounts(supplied) });
    return { evidence: { sources: retainedSources, identities: [], editions: [] }, usage, reasons: ['invalid-evidence'] };
  }
  emitDiagnostic(onDiagnostic, { stage: 'identity', category: 'accepted', ...diagnosticCounts(identities.value) });
  const editions = validate({ identities: identities.value.identities, editions: content.editions });
  // Editions are one batch: dropping a single bad/conflicting record could
  // manufacture an earliest date from whichever edition happened to survive.
  if (!editions.ok || !matchesTarget(request, editions.value)) {
    emitDiagnostic(onDiagnostic, { stage: 'edition', category: 'error' in editions ? classifyExtractionFailure(editions.error) : 'target-mismatch', ...diagnosticCounts(identities.value) });
    return { evidence: identities.value, usage, reasons: ['invalid-evidence'] };
  }
  emitDiagnostic(onDiagnostic, { stage: 'edition', category: 'accepted', ...diagnosticCounts(editions.value) });
  return { evidence: editions.value, usage };
}

export function estimatedMaxAiUsd(): { usd: number; pricingAsOf: string } {
  // Approximate capped estimate, not a bill or a tokenizer guarantee. Treat
  // each input byte as one token and use peak uncached rates researched from
  // https://api-docs.deepseek.com/quick_start/pricing/ on 2026-09-29.
  return { usd: (20000 * 30 + 2048 * 120) / 100_000_000, pricingAsOf: '2026-09-29' };
}
