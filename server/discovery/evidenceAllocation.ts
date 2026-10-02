import { diagnosticCounts, diagnosticRecordRef, emitDiagnostic, type DiagnosticObserver } from './diagnostics';
import type { CheckRequest, Citation, EditionEvidence, EvidenceBundle, Source } from '../../shared/discovery';
import { normalizeIdentity, selectProposals } from '../../shared/discoveryPolicy';

const exactDay = (item: EditionEvidence) => item.date !== null && item.precision === 'day';
const candidateRank = (request: CheckRequest) => (a: EditionEvidence, b: EditionEvidence) =>
  Number(exactDay(b)) - Number(exactDay(a)) ||
  Number(b.market === request.preferredMarket) - Number(a.market === request.preferredMarket) ||
  (a.date ?? '\uffff').localeCompare(b.date ?? '\uffff');

// Allocation hints only rank already validated evidence. They never establish
// identity, order, language, country, format or a release date.
export function allocationEvidence(request: CheckRequest, input: EvidenceBundle, onDiagnostic?: DiagnosticObserver) {
  const matchingAuthor = (author: string) => normalizeIdentity(author) === normalizeIdentity(request.target.author);
  const identities = input.identities.filter(item => matchingAuthor(item.author) && item.position === request.target.position);
  const titles = new Set(identities.map(item => normalizeIdentity(item.title)));
  if (request.target.title.trim()) titles.add(normalizeIdentity(request.target.title));
  const editions = input.editions.filter(item => matchingAuthor(item.author) &&
    (!titles.size || titles.has(normalizeIdentity(item.title))) && (item.position === null || item.position === request.target.position));
  const retainedItems = new Set([...identities, ...editions]);
  for (const item of [...input.identities, ...input.editions]) {
    if (retainedItems.has(item)) continue;
    const firstSource = input.sources.find(source => item.citations.some(c => c.sourceId === source.id));
    emitDiagnostic(onDiagnostic, { stage: 'allocation', category: 'target-mismatch', ...diagnosticCounts(input),
      rule: !matchingAuthor(item.author) ? 'author-mismatch' : item.position !== null && item.position !== request.target.position ? 'position-mismatch' : 'unsupported-title',
      ...(firstSource ? { provider: firstSource.provider } : {}),
      recordRef: diagnosticRecordRef('id' in item && typeof item.id === 'string' ? item.id : JSON.stringify(item.citations.map(c => c.sourceId).sort())),
    });
  }
  const referenced = new Set([...input.identities, ...input.editions].flatMap(item => item.citations.map(citation => citation.sourceId)));
  const relevant = new Set([...identities, ...editions].flatMap(item => item.citations.map(citation => citation.sourceId)));
  const sources = input.sources.filter(source => !referenced.has(source.id) || relevant.has(source.id));
  const grouped = new Map<string, EditionEvidence[]>();
  for (const item of editions) {
    // Match policy's edition grouping even before an unknown title resolves.
    const work = item.editionKey === null
      ? `work:${normalizeIdentity(item.title)}:${normalizeIdentity(item.author)}` : `edition:${item.editionKey}`;
    const key = JSON.stringify([item.market, item.format, work]);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  const conflicts = [...grouped.values()].filter(group => group.some((left, index) =>
    left.date !== null && group.slice(index + 1).some(right => right.date !== null &&
      !left.date!.startsWith(right.date) && !right.date.startsWith(left.date!))));
  const conflicting = new Set(conflicts.flatMap(group => group.map(item => item.id)));
  const singletons = editions.filter(item => !conflicting.has(item.id))
    .sort(candidateRank(request));
  return { sources, identities, editions, conflicts, singletons };
}

export interface RoleReservation {
  source: Source;
  citations: Citation[];
  editions: EditionEvidence[];
}

export function roleReservations(request: CheckRequest, evidence: EvidenceBundle, checkedAt: string): RoleReservation[] {
  const result: RoleReservation[] = [];
  const reserve = (source: Source, citations: Citation[] = [], edition?: EditionEvidence) => {
    const existing = result.find(item => item.source.id === source.id);
    if (existing) {
      existing.citations.push(...citations);
      if (edition && !existing.editions.includes(edition)) existing.editions.push(edition);
    } else result.push({ source, citations: [...citations], editions: edition ? [edition] : [] });
  };
  const referenced = new Set([...evidence.identities, ...evidence.editions].flatMap(item => item.citations.map(citation => citation.sourceId)));
  const prose = evidence.sources.filter(source => !referenced.has(source.id) && source.text.trim());
  if (!request.target.title.trim()) {
    const tavily = prose.filter(source => source.provider === 'tavily');
    const marker = (source: Source) => {
      const text = `${source.title} ${source.text}`;
      return /\b(reading order|series order|book order)\b/i.test(text) ||
        (Number.isInteger(request.target.position) && new RegExp(`\\bbook\\s+${request.target.position}(?!\\d|\\.\\d)\\b`, 'i').test(text));
    };
    const source = tavily.find(marker) ?? tavily[0];
    if (source) reserve(source);
  }
  const proposals = selectProposals(request, evidence, checkedAt);
  const unresolved = (!request.target.title.trim() || !Number.isInteger(request.target.position)) && !proposals.identity;
  const candidates = unresolved ? allocationEvidence(request, evidence).singletons : [];
  for (const format of request.formats) {
    const proposal = proposals.releases[format];
    const chosenProposal = proposal && evidence.editions.filter(item =>
      item.language === 'en' && normalizeIdentity(item.title) === normalizeIdentity(proposal.title) &&
      JSON.stringify(item.citations) === JSON.stringify(proposal.citations) && item.format === proposal.provenance.editionFormat &&
      item.market === proposal.provenance.sourceMarket && item.editionKey === proposal.provenance.editionKey &&
      item.precision === proposal.provenance.datePrecision && (proposal.date === null || item.date === proposal.date))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    const candidate = candidates.filter(item =>
      (format === 'audio' ? item.format === 'audio' : item.format !== 'audio') &&
      (item.language === 'en' || item.language === null) && exactDay(item))[0];
    const chosen = chosenProposal || candidate;
    const structured = chosen && evidence.sources.find(source => chosen.citations.some(citation => citation.sourceId === source.id));
    if (structured && chosen) {
      reserve(structured, chosen.citations, chosen);
    } else {
      const marker = format === 'audio' ? /\b(audiobook|audio)\b/i : /\b(ebook|e-book|print|hardcover|paperback)\b/i;
      const source = prose.find(item => marker.test(`${item.title} ${item.text}`));
      if (source) reserve(source);
    }
  }
  return result;
}
