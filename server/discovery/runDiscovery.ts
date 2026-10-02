import { createHash } from 'node:crypto';
import { emptyUsage } from '../../shared/discovery';
import type { CheckRequest, CheckResponse, Citation, EditionEvidence, EvidenceBundle, Format, IdentityEvidence, Reason } from '../../shared/discovery';
import { normalizeIdentity, selectProposals, undatedState } from '../../shared/discoveryPolicy';
import { parseCheckRequest, parseCheckResponse, parseExtraction } from '../../shared/discoveryValidation';
import type { CatalogResult } from './catalogs';
import { createRetrievalContext, type RetrievalContext, type RetrievalPhase } from './retrievalContext';
import type { extractEvidence } from './deepseek';
import { ProviderError } from './http';
import { buildSearchQueries } from './search';
import { interpretPrimarySources } from './primarySources';
import { allocationEvidence, roleReservations } from './evidenceAllocation';
import { diagnosticCounts, diagnosticRecordRef, emitDiagnostic, withDiagnosticTrace, type DiagnosticObserver } from './diagnostics';

export interface DiscoveryDependencies {
  catalogs: (request: CheckRequest, markets: string[], signal: AbortSignal, context?: RetrievalContext, phase?: RetrievalPhase,
    seed?: EvidenceBundle) => Promise<CatalogResult>;
  search: (query: string, signal: AbortSignal) => Promise<EvidenceBundle>;
  extract: (request: CheckRequest, evidence: EvidenceBundle, signal: AbortSignal) => ReturnType<typeof extractEvidence>;
  now: () => string;
  canSearch: boolean;
  canExtract: boolean;
  onDiagnostic?: DiagnosticObserver;
}
const empty = (): EvidenceBundle => ({ sources: [], identities: [], editions: [], related: [] });
const id = (namespace: string, original: string) => `${namespace}:${createHash('sha256').update(original).digest('hex').slice(0, 32)}`;
const workFormatKey = (title: string, author: string, format: Format) => JSON.stringify([normalizeIdentity(title), normalizeIdentity(author), format]);
type PrunedDates = { preferred: string | null; fallback: string | null };

// Every retrieval owns a namespace. Ambiguous duplicate IDs within one reply
// are rejected rather than allowing the last record to redirect citations.
function validatedBundle(raw: EvidenceBundle, namespace: string, reason: (value: Reason) => void): EvidenceBundle {
  const result = empty();
  if (!raw || !Array.isArray(raw.sources) || !Array.isArray(raw.identities) || !Array.isArray(raw.editions) || (raw.related !== undefined && !Array.isArray(raw.related))) {
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
  for (const kind of ['identities', 'editions', 'related'] as const) {
    const seen = new Set<string>();
    for (const item of raw[kind] ?? []) {
      const cited = Array.isArray(item?.citations) ? [...new Set(item.citations.map(citation => citation.sourceId))] : [];
      const supplied = cited.map(key => originals.get(key)).filter(source => source !== undefined);
      const checked = parseExtraction({ identities: kind === 'identities' ? [item] : [], editions: kind === 'editions' ? [item] : [],
        ...(kind === 'related' ? { related: [item] } : {}) }, supplied);
      if (!checked.ok) { reason('invalid-evidence'); continue; }
      if (kind === 'identities') result.identities.push({ ...checked.value.identities[0], citations: remap(checked.value.identities[0].citations) });
      else if (kind === 'related') {
        const claim = checked.value.related![0];
        const key = JSON.stringify(claim);
        if (!seen.has(key)) { seen.add(key); result.related!.push({ ...claim, citations: remap(claim.citations) }); }
      } else {
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

// Enrichment may re-retrieve records the check already holds under another
// namespace. Fold exact duplicates onto the retained source so they cannot
// consume the 30 source and 100 edition caps a second time.
function withoutRetained(retained: EvidenceBundle, incoming: EvidenceBundle): EvidenceBundle {
  const sourceKey = (source: EvidenceBundle['sources'][number]) => JSON.stringify([source.provider, source.url, source.market, source.text]);
  const existing = new Map(retained.sources.map(source => [sourceKey(source), source.id]));
  const aliases = new Map<string, string>();
  const sources = incoming.sources.filter(source => {
    const same = existing.get(sourceKey(source));
    if (same === undefined) return true;
    aliases.set(source.id, same); return false;
  });
  const remap = <T extends { citations: Citation[] }>(item: T): T => ({ ...item, citations: item.citations.map(c => ({ ...c, sourceId: aliases.get(c.sourceId) ?? c.sourceId })) });
  const shape = (item: { id?: string }) => JSON.stringify({ ...item, id: undefined });
  const known = new Set(retained.editions.map(shape));
  const editions = incoming.editions.map(remap).filter(item => !known.has(shape(item)));
  const identities = incoming.identities.map(remap).filter(item => !retained.identities.some(old => JSON.stringify(old) === JSON.stringify(item)));
  return { sources, identities, editions, related: (incoming.related ?? []).map(remap) };
}

function bound(request: CheckRequest, input: EvidenceBundle, checkedAt: string, suppressed: Set<Format | 'identity'>,
  prunedWorkFormats: Map<string, PrunedDates>, reason: (value: Reason) => void, onDiagnostic?: DiagnosticObserver): EvidenceBundle {
  const allocation = allocationEvidence(request, input, onDiagnostic);
  const { identities, editions, related, sources: eligibleSources, conflicts, singletons } = allocation;
  const unresolvedIdentity = (!request.target.title.trim() || !Number.isInteger(request.target.position)) &&
    !selectProposals(request, allocation, checkedAt).identity;
  const retained = empty();
  const sourceIds = new Set<string>();
  const keep = (citations: Citation[]): boolean => {
    const needed = new Set([...sourceIds, ...citations.map(item => item.sourceId)]);
    if (needed.size > 30) {
      emitDiagnostic(onDiagnostic, { stage: 'allocation', category: 'bounds', ...diagnosticCounts(retained),
        rule: 'citation-closure', recordRef: diagnosticRecordRef(JSON.stringify([...new Set(citations.map(item => item.sourceId))].sort())) });
      return false;
    }
    needed.forEach(key => sourceIds.add(key)); return true;
  };
  // Identity alternatives are one protected closure. Keeping only the first
  // alternative must never resolve ambiguity after truncation.
  if (identities.length <= 30 && keep(identities.flatMap(item => item.citations))) retained.identities = identities;
  else {
    if (identities.length > 30) emitDiagnostic(onDiagnostic, { stage: 'allocation', category: 'bounds', ...diagnosticCounts(retained), rule: 'evidence-bound', recordRef: diagnosticRecordRef(JSON.stringify(identities.flatMap(item => item.citations.map(c => c.sourceId)).sort())) });
    reason('budget');
    suppressed.add('identity'); suppressed.add('book'); suppressed.add('audio');
  }
  // Supported primary relation claims are a second protected closure, ahead of
  // generic prose and editions. Too many claims are dropped whole, never capped.
  if (related.length) {
    if (related.length <= 12 && keep(related.flatMap(item => item.citations))) retained.related = related;
    else {
      emitDiagnostic(onDiagnostic, { stage: 'allocation', category: 'bounds', ...diagnosticCounts(retained), rule: 'evidence-bound',
        recordRef: diagnosticRecordRef(JSON.stringify(related.flatMap(item => item.citations.map(c => c.sourceId)).sort())) });
      reason('budget');
    }
  }
  const keepGroup = (group: EditionEvidence[]) => {
    if (retained.editions.length + group.length > 100) {
      emitDiagnostic(onDiagnostic, { stage: 'allocation', category: 'bounds', ...diagnosticCounts(retained),
        rule: 'evidence-bound', recordRef: diagnosticRecordRef(JSON.stringify(group.map(item => item.id).sort())) });
      return false;
    }
    if (!keep(group.flatMap(item => item.citations))) return false;
    retained.editions.push(...group); return true;
  };
  for (const group of conflicts) {
    if (!keepGroup(group)) {
      reason('budget'); suppressed.add(group[0].format === 'audio' ? 'audio' : 'book');
    }
  }
  // Reserve at most one order role and one role for each requested format.
  // Structured representatives retain the chosen edition's whole closure.
  const keptEditionIds = new Set(retained.editions.map(item => item.id));
  for (const role of roleReservations(request, allocation, checkedAt)) {
    if (role.editions.length) {
      for (const item of role.editions) {
        if (keptEditionIds.has(item.id)) continue;
        if (keepGroup([item])) keptEditionIds.add(item.id);
        else { reason('budget'); suppressed.add(item.format === 'audio' ? 'audio' : 'book'); }
      }
    } else if (!sourceIds.has(role.source.id)) {
      if (sourceIds.size < 30) sourceIds.add(role.source.id);
      else reason('budget');
    }
  }
  for (const item of singletons) {
    if (keptEditionIds.has(item.id)) continue;
    if (keepGroup([item])) keptEditionIds.add(item.id);
    else {
      reason('budget');
      // Until identity resolves, any matching English exact-day edition might
      // be the selected minimum. Remember its work/format across later merges
      // rather than presenting a later surviving date as the earliest one.
      if (unresolvedIdentity && item.language === 'en' && item.precision === 'day' && item.date !== null) {
        const key = workFormatKey(item.title, item.author, item.format === 'audio' ? 'audio' : 'book');
        const dates = prunedWorkFormats.get(key) ?? { preferred: null, fallback: null };
        const pool = item.market === request.preferredMarket ? 'preferred' : 'fallback';
        const previous = dates[pool];
        if (previous === null || item.date < previous) dates[pool] = item.date;
        prunedWorkFormats.set(key, dates);
      }
    }
  }
  const extras = eligibleSources.filter(source => !sourceIds.has(source.id))
    .sort((a, b) => Number(b.market === request.preferredMarket) - Number(a.market === request.preferredMarket));
  for (const source of extras.slice(0, 30 - sourceIds.size)) sourceIds.add(source.id);
  retained.sources = eligibleSources.filter(source => sourceIds.has(source.id));
  for (const source of eligibleSources.filter(source => !sourceIds.has(source.id))) emitDiagnostic(onDiagnostic, {
    stage: 'allocation', category: 'bounds', ...diagnosticCounts(retained), provider: source.provider,
    rule: 'evidence-bound', recordRef: diagnosticRecordRef(source.id),
  });
  if (eligibleSources.length > retained.sources.length || editions.length > retained.editions.length) reason('budget');
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

export function runDiscovery(input: CheckRequest, dependencies: DiscoveryDependencies, caller: AbortSignal): Promise<CheckResponse> {
  return withDiagnosticTrace(() => runDiscoveryInTrace(input, dependencies, caller));
}
async function runDiscoveryInTrace(input: CheckRequest, dependencies: DiscoveryDependencies, caller: AbortSignal): Promise<CheckResponse> {
  const parsed = parseCheckRequest(input);
  if (!parsed.ok) throw new Error('invalid-request');
  const request = parsed.value;
  const deadline = AbortSignal.timeout(180000);
  const signal = AbortSignal.any([caller, deadline]);
  const checkedAt = dependencies.now();
  const usage = emptyUsage();
  const reasons: Reason[] = [];
  const reason = (value: Reason) => { if (!reasons.includes(value)) reasons.push(value); };
  const context = createRetrievalContext();
  const suppressed = new Set<Format | 'identity'>();
  const prunedWorkFormats = new Map<string, PrunedDates>();
  let evidence = empty();
  const coverSidecar: NonNullable<CheckResponse['coverCandidates']> = [];
  const failure = (error: unknown) => reason(caller.aborted ? 'cancelled' : deadline.aborted ? 'timeout' : error instanceof ProviderError ? error.reason : 'provider-error');
  const merge = (incoming: EvidenceBundle) => {
    let allocationBudget = false;
    evidence = bound(request, {
    sources: [...evidence.sources, ...incoming.sources], identities: [...evidence.identities, ...incoming.identities], editions: [...evidence.editions, ...incoming.editions],
    related: [...(evidence.related ?? []), ...(incoming.related ?? [])],
    }, checkedAt, suppressed, prunedWorkFormats, value => { reason(value); if (value === 'budget') allocationBudget = true; }, dependencies.onDiagnostic);
    if (allocationBudget) emitDiagnostic(dependencies.onDiagnostic, { stage: 'allocation', category: 'bounds', ...diagnosticCounts(evidence) });
  };
  const markets = [...new Set([request.preferredMarket, 'US', 'GB', 'CA'])];
  // Catalog usage is the shared aggregate snapshot; counters never move backwards.
  const absorb = (value: CatalogResult['usage']) => {
    for (const key of ['apple', 'openlibrary', 'googlebooks', 'hardcover'] as const) usage[key] = Math.max(usage[key], value[key]);
  };
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
      const catalogs = await dependencies.catalogs(request, markets, signal, context, 'initial');
      absorb(catalogs.usage);
      catalogs.reasons.forEach(reason);
      catalogs.overflow?.forEach(format => suppressed.add(format));
      for (const cover of catalogs.covers ?? []) if (coverSidecar.length < 9 && !coverSidecar.some(item => item.id === cover.id)) coverSidecar.push(cover);
      merge(interpretPrimarySources(request, validatedBundle(catalogs.evidence, 'catalog', reason)));
    } catch (error) { failure(error); }
  }
  const attempted = new Set<string>();
  // A supported title is enriched through the catalogs at most once per canonical
  // identity. Titles already used by the initial phase (for example from
  // Hardcover) are never enriched again.
  const enriched = new Set<string>();
  const unknownTitle = !request.target.title.trim();
  const noteEnriched = () => { const found = selection().identity; if (found) enriched.add(normalizeIdentity(found.title)); };
  if (unknownTitle) noteEnriched();
  const enrich = async () => {
    const identity = selection().identity;
    if (!unknownTitle || !identity || signal.aborted || enriched.has(normalizeIdentity(identity.title))) return;
    enriched.add(normalizeIdentity(identity.title));
    const cited = new Set(evidence.identities.flatMap(item => item.citations.map(citation => citation.sourceId)));
    const seed: EvidenceBundle = { identities: evidence.identities, editions: [], sources: evidence.sources.filter(source => cited.has(source.id)) };
    try {
      // The original request keeps unknown-title intent so every identity alternative still competes.
      const catalogs = await dependencies.catalogs(request, markets, signal, context, 'enrich', seed);
      absorb(catalogs.usage);
      catalogs.reasons.forEach(reason);
      catalogs.overflow?.forEach(format => suppressed.add(format));
      merge(interpretPrimarySources(request, withoutRetained(evidence, validatedBundle(catalogs.evidence, `enrich${enriched.size}`, reason))));
    } catch (error) { failure(error); }
  };
  // Rebuild after each query so an explicitly validated identity can narrow the
  // remaining format searches without providing a researched expected answer.
  while (!signal.aborted && context.canClaim('tavily')) {
    const gaps = needs();
    if (!gaps.identity && !gaps.book && !gaps.audio) break;
    if (!dependencies.canSearch) { reason('missing-key'); break; }
    const identity = selection().identity;
    const searchRequest = identity ? { ...request, target: { ...request.target, title: identity.title } } : request;
    const query = buildSearchQueries(searchRequest, gaps).find(item => !attempted.has(item));
    if (!query) break;
    attempted.add(query); context.claim('tavily'); usage.tavily++;
    // Primary-source blocks are parsed before bounding, while their source is still present.
    try { merge(interpretPrimarySources(request, validatedBundle(await abortable(dependencies.search(query, signal), signal), `search${usage.tavily}`, reason))); }
    catch (error) { failure(error); }
    await enrich();
  }
  const gaps = needs();
  if (!signal.aborted && request.useAi && (gaps.identity || gaps.book || gaps.audio)) {
    if (!dependencies.canExtract) reason('missing-key');
    else {
      context.claim('deepseek'); usage.deepseek++; usage.inputTokens = null; usage.outputTokens = null;
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
        for (const value of extracted.reasons ?? []) reason(value);
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
  for (const format of request.formats) {
    const proposal = proposals.releases[format];
    if (!proposal) continue;
    const pruned = prunedWorkFormats.get(workFormatKey(proposal.title, request.target.author, format));
    if (!pruned) continue;
    // A missing preferred day outranks fallback days. Otherwise compare only
    // the selected pool's minimum; recovered same/earlier evidence is safe.
    const local = proposal.provenance.sourceMarket === request.preferredMarket;
    if (!proposal.date || (local ? pruned.preferred !== null && pruned.preferred < proposal.date
      : pruned.preferred !== null || (pruned.fallback !== null && pruned.fallback < proposal.date))) proposals.releases[format] = null;
  }
  if ((!request.target.title.trim() || !Number.isInteger(request.target.position)) && !proposals.identity) reason('unknown-identity');
  for (const format of request.formats) {
    const proposal = proposals.releases[format];
    if (proposal) {
      const matching = evidence.editions.filter(item => normalizeIdentity(item.title) === normalizeIdentity(proposal.title) &&
        normalizeIdentity(item.author) === normalizeIdentity(request.target.author) && item.language === 'en' && item.market === proposal.provenance.sourceMarket &&
        item.editionKey === proposal.provenance.editionKey && item.format === proposal.provenance.editionFormat &&
        item.precision === proposal.provenance.datePrecision && (proposal.date === null ? undatedState(item) === proposal.state : item.date === proposal.date) &&
        JSON.stringify(item.citations) === JSON.stringify(proposal.citations)).sort((a, b) => a.id.localeCompare(b.id));
      proposal.provenance.interpreted = matching[0]?.id.startsWith('ai:') ?? false;
    }
  }
  const operational = reasons.some(item => item !== 'unknown-identity' && item !== 'cancelled');
  const hardFailure = reasons.some(item => ['quota', 'timeout', 'provider-error', 'invalid-evidence'].includes(item));
  // Sidecar art must belong to the chosen identity; with no chosen identity it is kept only when the request names the work.
  const sidecarFor = (identity: IdentityEvidence | null) => {
    if (identity) { const key = `${normalizeIdentity(identity.title)}|${normalizeIdentity(request.target.author)}`; return coverSidecar.filter(item => item.workKey === key); }
    return request.target.title.trim() ? coverSidecar : [];
  };
  const result: CheckResponse = { requestId: request.requestId, seriesId: request.seriesId, proposals,
    sources: evidence.sources.map(({ id, title, url }) => ({ id, title, url })), coverCandidates: sidecarFor(proposals.identity),
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
