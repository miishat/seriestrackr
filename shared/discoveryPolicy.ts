import type { Attribution, CheckRequest, Citation, Conflict, EditionEvidence, EvidenceBundle, IdentityEvidence, Proposals, ReleaseProposal, SourceLink } from './discovery';

export const normalizeIdentity = (s: string) => s.normalize('NFKC')
  .toLocaleLowerCase('en').replace(/\s+/g, ' ').trim();

function citedSources(citations: Citation[], evidence: EvidenceBundle): SourceLink[] {
  const ids = new Set(citations.map(citation => citation.sourceId));
  return evidence.sources.filter(source => ids.has(source.id))
    .map(({ id, title, url }) => ({ id, title, url }));
}

function editionGroup(edition: EditionEvidence): string {
  const key = edition.editionKey === null
    ? `work:${normalizeIdentity(edition.title)}:${normalizeIdentity(edition.author)}`
    : `edition:${edition.editionKey}`;
  return JSON.stringify([edition.market, edition.format, key]);
}

export function selectProposals(request: CheckRequest, evidence: EvidenceBundle, checkedAt: string, interpreted = false): Proposals {
  const empty: Proposals = { identity: null, identityAttribution: null, releases: { book: null, audio: null }, conflicts: [] };
  const citedIdentities = evidence.identities.filter(identity =>
    identity.position === request.target.position && identity.citations.length > 0);
  const identities = new Set(citedIdentities.map(identity =>
    `${normalizeIdentity(identity.title)}\u0000${normalizeIdentity(identity.author)}`));
  if (identities.size > 1) return empty;
  const matchingIdentities = citedIdentities.filter(identity =>
    normalizeIdentity(identity.author) === normalizeIdentity(request.target.author));
  if (citedIdentities.length && !matchingIdentities.length) return empty;

  const identity: IdentityEvidence | null = matchingIdentities[0] ?? null;
  const suppliedTitle = normalizeIdentity(request.target.title);
  if (identity && suppliedTitle && normalizeIdentity(identity.title) !== suppliedTitle) return empty;
  const title = suppliedTitle ? request.target.title : identity?.title;
  if (!title || (!Number.isInteger(request.target.position) && !identity)) return empty;

  const identityAttribution: Attribution | null = identity
    ? { checkedAt, sources: citedSources(identity.citations, evidence) } : null;
  const result: Proposals = { identity, identityAttribution, releases: { book: null, audio: null }, conflicts: [] };
  const target = { title };
  const matching = evidence.editions.filter(e =>
    normalizeIdentity(e.title) === normalizeIdentity(target.title) &&
    normalizeIdentity(e.author) === normalizeIdentity(request.target.author) &&
    (e.position === null || e.position === request.target.position) && e.language === 'en');
  const grouped = new Map<string, EditionEvidence[]>();
  for (const item of matching) {
    const key = editionGroup(item);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  const conflicted = new Set<string>();
  for (const [key, group] of grouped) {
    const dated = group.filter(item => item.date !== null);
    const incompatible = dated.some((left, index) => dated.slice(index + 1).some(right =>
      !left.date!.startsWith(right.date!) && !right.date!.startsWith(left.date!)));
    if (incompatible) {
      conflicted.add(key);
      result.conflicts.push({
        format: group[0].format === 'audio' ? 'audio' : 'book',
        evidenceIds: group.map(item => item.id).sort(),
        reason: 'Contradictory dates for the same edition',
      } satisfies Conflict);
    }
  }
  for (const format of request.formats) {
    const candidates = matching.filter(e => format === 'audio' ? e.format === 'audio' : e.format !== 'audio');
    const preferredConflict = candidates.some(e =>
      e.market === request.preferredMarket && conflicted.has(editionGroup(e)));
    if (preferredConflict) continue;
    const valid = candidates.filter(e => !conflicted.has(editionGroup(e)));
    const dated = valid.filter(e => e.precision === 'day' && e.date !== null);
    const local = dated.filter(e => e.market === request.preferredMarket);
    const pool = local.length ? local : dated;
    const chosen = [...pool].sort((a, b) => a.date!.localeCompare(b.date!) || a.id.localeCompare(b.id))[0]
      ?? [...valid].sort((a, b) => Number(b.market === request.preferredMarket) - Number(a.market === request.preferredMarket) || a.id.localeCompare(b.id))[0];
    if (!chosen) continue;
    result.releases[format] = {
      title, position: request.target.position,
      state: chosen.precision === 'day' && chosen.date !== null ? 'scheduled' : 'announced',
      date: chosen.precision === 'day' ? chosen.date : null,
      provenance: {
        checkedAt, sources: citedSources(chosen.citations, evidence),
        preferredMarket: request.preferredMarket, sourceMarket: chosen.market,
        language: 'en', editionFormat: chosen.format, editionKey: chosen.editionKey,
        datePrecision: chosen.precision, interpreted,
      },
      citations: chosen.citations,
    } satisfies ReleaseProposal;
  }
  return result;
}
