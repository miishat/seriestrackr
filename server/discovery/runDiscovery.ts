import { createHash } from 'node:crypto';
import { emptyUsage } from '../../shared/discovery';
import type { CheckRequest, CheckResponse, Citation, EditionEvidence, EvidenceBundle, Format, Reason } from '../../shared/discovery';
import { normalizeIdentity, selectProposals } from '../../shared/discoveryPolicy';
import { parseCheckRequest, parseCheckResponse, parseExtraction } from '../../shared/discoveryValidation';
import type { collectCatalogs } from './catalogs';
import type { extractEvidence } from './deepseek';
import { ProviderError } from './http';
import { buildSearchQueries } from './search';

export interface DiscoveryDependencies {
  catalogs: typeof collectCatalogs;
  search: (query: string, signal: AbortSignal) => Promise<EvidenceBundle>;
  extract: (request: CheckRequest, evidence: EvidenceBundle, signal: AbortSignal) => ReturnType<typeof extractEvidence>;
  now: () => string;
  canSearch: boolean;
  canExtract: boolean;
}
const empty = (): EvidenceBundle => ({ sources: [], identities: [], editions: [] });
const id = (namespace: string, original: string) => `${namespace}:${createHash('sha256').update(original).digest('hex').slice(0, 32)}`;

// Every retrieval owns a namespace. Ambiguous duplicate IDs within one reply
// are rejected rather than allowing the last record to redirect citations.
function validatedBundle(raw: EvidenceBundle, namespace: string, reason: (value: Reason) => void): EvidenceBundle {
  const result = empty();
  if (!raw || !Array.isArray(raw.sources) || !Array.isArray(raw.identities) || !Array.isArray(raw.editions)) {
    reason('invalid-evidence'); return result;
  }
  const duplicates = new Set<string>();
  const originals = new Map<string, EvidenceBundle['sources'][number]>();
  for (const source of raw.sources) {
    if (!parseExtraction({ identities: [], editions: [] }, [source]).ok) { reason('invalid-evidence'); continue; }
    const previous = originals.get(source.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(source)) duplicates.add(source.id);
    originals.set(source.id, source);
  }
  for (const duplicate of duplicates) { originals.delete(duplicate); reason('invalid-evidence'); }
  const aliases = new Map([...originals.keys()].map(key => [key, id(namespace, key)]));
  result.sources = [...originals.values()].map(source => ({ ...source, id: aliases.get(source.id)! }));
  const remap = (items: Citation[]) => items.map(item => ({ ...item, sourceId: aliases.get(item.sourceId)! }));
  for (const kind of ['identities', 'editions'] as const) {
    const seen = new Set<string>();
    for (const item of raw[kind]) {
      const cited = Array.isArray(item?.citations) ? [...new Set(item.citations.map(citation => citation.sourceId))] : [];
      const supplied = cited.map(key => originals.get(key)).filter(source => source !== undefined);
      const checked = parseExtraction({ identities: kind === 'identities' ? [item] : [], editions: kind === 'editions' ? [item] : [] }, supplied);
      if (!checked.ok) { reason('invalid-evidence'); continue; }
      if (kind === 'identities') result.identities.push({ ...checked.value.identities[0], citations: remap(checked.value.identities[0].citations) });
      else {
        const edition = checked.value.editions[0];
        // Distinct same-ID records remain separate, including contradictory dates.
        const key = JSON.stringify(edition);
        if (seen.has(key)) continue;
        seen.add(key);
        result.editions.push({ ...edition, id: id(namespace, key), citations: remap(edition.citations) });
      }
    }
  }
  return result;
}

function bound(request: CheckRequest, input: EvidenceBundle, checkedAt: string, suppressed: Set<Format | 'identity'>, reason: (value: Reason) => void): EvidenceBundle {
  const matchingAuthor = (author: string) => normalizeIdentity(author) === normalizeIdentity(request.target.author);
  const identities = input.identities.filter(item => matchingAuthor(item.author) && item.position === request.target.position);
  const titles = new Set(identities.map(item => normalizeIdentity(item.title)));
  if (request.target.title) titles.add(normalizeIdentity(request.target.title));
  const editions = input.editions.filter(item => matchingAuthor(item.author) &&
    (!titles.size || titles.has(normalizeIdentity(item.title))) && (item.position === null || item.position === request.target.position));
  // Detect structured contradictions before identity resolution too. Otherwise
  // pruning an unknown-title catalog could discard one side before a later
  // query establishes the identity and make the surviving date look certain.
  const editionGroups = new Map<string, EditionEvidence[]>();
  for (const item of editions) {
    const key = JSON.stringify([normalizeIdentity(item.title), normalizeIdentity(item.author), item.editionKey, item.market, item.format]);
    editionGroups.set(key, [...(editionGroups.get(key) ?? []), item]);
  }
  const conflicts = [...editionGroups.values()].filter(group => group.some((left, index) =>
    left.date !== null && group.slice(index + 1).some(right => right.date !== null && !left.date!.startsWith(right.date) && !right.date.startsWith(left.date!))))
    .map(group => ({ evidenceIds: group.map(item => item.id) }));
  const grouped = new Set<string>();
  const groups: EditionEvidence[][] = [];
  for (const conflict of conflicts) {
    const group = editions.filter(item => conflict.evidenceIds.includes(item.id));
    group.forEach(item => grouped.add(item.id)); groups.push(group);
  }
  groups.push(...editions.filter(item => !grouped.has(item.id))
    .sort((a, b) => Number(b.market === request.preferredMarket) - Number(a.market === request.preferredMarket)).map(item => [item]));
  const retained = empty();
  const sourceIds = new Set<string>();
  const keep = (citations: Citation[]): boolean => {
    const needed = new Set([...sourceIds, ...citations.map(item => item.sourceId)]);
    if (needed.size > 30) return false;
    needed.forEach(key => sourceIds.add(key)); return true;
  };
  for (const identity of identities) {
    if (retained.identities.length < 30 && keep(identity.citations)) retained.identities.push(identity);
    else {
      reason('budget');
      // Dropped order contradictions must not turn ambiguity into a resolved title.
      suppressed.add('identity'); suppressed.add('book'); suppressed.add('audio'); retained.identities = [];
      break;
    }
  }
  for (const group of groups) {
    if (retained.editions.length + group.length <= 100 && keep(group.flatMap(item => item.citations))) retained.editions.push(...group);
    else {
      reason('budget');
      if (group.length > 1) suppressed.add(group[0].format === 'audio' ? 'audio' : 'book');
    }
  }
  const cited = input.sources.filter(source => sourceIds.has(source.id));
  const extras = input.sources.filter(source => !sourceIds.has(source.id)).sort((a, b) => {
    const priority = (source: typeof a) => /\b(reading order|series order|book order)\b/i.test(`${source.title} ${source.text}`) ? 0 : source.market === request.preferredMarket ? 1 : 2;
    return priority(a) - priority(b);
  });
  retained.sources = [...cited, ...extras.slice(0, 30 - cited.length)];
  if (input.sources.length > retained.sources.length || editions.length > retained.editions.length) reason('budget');
  return retained;
}

async function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) void operation.catch(() => {});
  signal.throwIfAborted();
  let onAbort: () => void;
  const aborted = new Promise<never>((_, reject) => { onAbort = () => reject(signal.reason); signal.addEventListener('abort', onAbort, { once: true }); });
  try { return await Promise.race([operation, aborted]); }
  finally { signal.removeEventListener('abort', onAbort!); }
}

export async function runDiscovery(input: CheckRequest, dependencies: DiscoveryDependencies, caller: AbortSignal): Promise<CheckResponse> {
  const parsed = parseCheckRequest(input);
  if (!parsed.ok) throw new Error('invalid-request');
  const request = parsed.value;
  const deadline = AbortSignal.timeout(180000);
  const signal = AbortSignal.any([caller, deadline]);
  const checkedAt = dependencies.now();
  const usage = emptyUsage();
  const reasons: Reason[] = [];
  const reason = (value: Reason) => { if (!reasons.includes(value)) reasons.push(value); };
  const suppressed = new Set<Format | 'identity'>();
  let evidence = empty();
  const failure = (error: unknown) => reason(caller.aborted ? 'cancelled' : deadline.aborted ? 'timeout' : error instanceof ProviderError ? error.reason : 'provider-error');
  const merge = (incoming: EvidenceBundle) => { evidence = bound(request, {
    sources: [...evidence.sources, ...incoming.sources], identities: [...evidence.identities, ...incoming.identities], editions: [...evidence.editions, ...incoming.editions],
  }, checkedAt, suppressed, reason); };
  const selection = () => selectProposals(request, evidence, checkedAt);
  const needs = () => {
    const proposals = selection();
    return { identity: (!request.target.title.trim() || !Number.isInteger(request.target.position)) && !proposals.identity,
      book: request.formats.includes('book') && !proposals.releases.book?.date,
      audio: request.formats.includes('audio') && !proposals.releases.audio?.date };
  };
  if (!signal.aborted) {
    try {
      // Catalog transport owns its abort-aware queues and returns attempted
      // counters even on cancellation. Await that final accounting snapshot.
      const catalogs = await dependencies.catalogs(request, [...new Set([request.preferredMarket, 'US', 'GB', 'CA'])], signal);
      usage.apple = catalogs.usage.apple; usage.openlibrary = catalogs.usage.openlibrary;
      catalogs.reasons.forEach(reason);
      merge(validatedBundle(catalogs.evidence, 'catalog', reason));
    } catch (error) { failure(error); }
  }
  const attempted = new Set<string>();
  // Rebuild after each query so an explicitly validated identity can narrow the
  // remaining format searches without providing a researched expected answer.
  while (!signal.aborted && usage.tavily < 3) {
    const gaps = needs();
    if (!gaps.identity && !gaps.book && !gaps.audio) break;
    if (!dependencies.canSearch) { reason('missing-key'); break; }
    const identity = selection().identity;
    const searchRequest = identity ? { ...request, target: { ...request.target, title: identity.title } } : request;
    const query = buildSearchQueries(searchRequest, gaps).find(item => !attempted.has(item));
    if (!query) break;
    attempted.add(query); usage.tavily++;
    try { merge(validatedBundle(await abortable(dependencies.search(query, signal), signal), `search${usage.tavily}`, reason)); }
    catch (error) { failure(error); }
  }
  const gaps = needs();
  if (!signal.aborted && request.useAi && (gaps.identity || gaps.book || gaps.audio)) {
    if (!dependencies.canExtract) reason('missing-key');
    else {
      usage.deepseek++; usage.inputTokens = null; usage.outputTokens = null;
      try {
        const extracted = await abortable(dependencies.extract(request, evidence, signal), signal);
        // Extractors may trim supplied sources, but cannot introduce a source,
        // replace its text, or change its bibliographic/link metadata.
        const original = new Map(evidence.sources.map(source => [source.id, source]));
        if (!extracted?.evidence?.sources?.every(source => {
          const supplied = original.get(source.id);
          return supplied && supplied.text.startsWith(source.text) && JSON.stringify({ ...supplied, text: source.text }) === JSON.stringify(source);
        })) throw new ProviderError('deepseek', 'invalid-evidence');
        const validated = parseExtraction(extracted.evidence, extracted.evidence.sources);
        if (!validated.ok) throw new ProviderError('deepseek', 'invalid-evidence');
        const tokens = (value: number | null) => Number.isSafeInteger(value) && value! >= 0 ? value : null;
        usage.inputTokens = tokens(extracted.usage.inputTokens); usage.outputTokens = tokens(extracted.usage.outputTokens);
        const incoming = validatedBundle(validated.value, 'ai', reason);
        const aliases = new Map(validated.value.sources.map(source => [id('ai', source.id), source.id]));
        const remap = (citations: Citation[]) => citations.map(citation => ({ ...citation, sourceId: aliases.get(citation.sourceId)! }));
        // These are the same verified retrieved sources, not another retrieval.
        // Preserve deterministic source text and references independently of
        // the extractor's trimmed input while keeping AI edition IDs distinct.
        merge({ sources: [], identities: incoming.identities.map(item => ({ ...item, citations: remap(item.citations) })),
          editions: incoming.editions.map(item => ({ ...item, citations: remap(item.citations) })) });
      } catch (error) { failure(error); }
    }
  }
  if (signal.aborted) reason(caller.aborted ? 'cancelled' : 'timeout');
  const proposals = selection();
  for (const format of suppressed) {
    if (format === 'identity') { proposals.identity = null; proposals.identityAttribution = null; }
    else proposals.releases[format] = null;
  }
  if ((!request.target.title.trim() || !Number.isInteger(request.target.position)) && !proposals.identity) reason('unknown-identity');
  for (const format of request.formats) {
    const proposal = proposals.releases[format];
    if (proposal) {
      const matching = evidence.editions.filter(item => normalizeIdentity(item.title) === normalizeIdentity(proposal.title) &&
        normalizeIdentity(item.author) === normalizeIdentity(request.target.author) && item.language === 'en' && item.market === proposal.provenance.sourceMarket &&
        item.editionKey === proposal.provenance.editionKey && item.format === proposal.provenance.editionFormat &&
        item.precision === proposal.provenance.datePrecision && (proposal.date === null || item.date === proposal.date) &&
        JSON.stringify(item.citations) === JSON.stringify(proposal.citations)).sort((a, b) => a.id.localeCompare(b.id));
      proposal.provenance.interpreted = matching[0]?.id.startsWith('ai:') ?? false;
    }
  }
  const operational = reasons.some(item => item !== 'unknown-identity' && item !== 'cancelled');
  const hardFailure = reasons.some(item => ['quota', 'timeout', 'provider-error', 'invalid-evidence'].includes(item));
  const result: CheckResponse = { requestId: request.requestId, seriesId: request.seriesId, proposals,
    sources: evidence.sources.map(({ id, title, url }) => ({ id, title, url })),
    summary: { requestId: request.requestId, checkedAt,
      status: caller.aborted ? 'cancelled' : hardFailure && !evidence.sources.length && !proposals.identity && !proposals.releases.book && !proposals.releases.audio ? 'failed' : operational ? 'partial' : 'complete',
      reasons, usage, formats: {
        book: request.formats.includes('book') ? proposals.releases.book ? 'supported' : 'unknown' : 'not-requested',
        audio: request.formats.includes('audio') ? proposals.releases.audio ? 'supported' : 'unknown' : 'not-requested',
      } },
  };
  const response = parseCheckResponse(result);
  if (!response.ok) throw new Error('invalid-response');
  return response.value;
}
