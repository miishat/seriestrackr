import type { Attribution, CheckRequest, Citation, Conflict, EditionEvidence, EvidenceBundle, IdentityEvidence, Proposals, RelatedWorkEvidence, ReleaseProposal, SourceLink } from './discovery';

export const normalizeIdentity = (s: string) => s.normalize('NFKC')
  .toLocaleLowerCase('en').replace(/\s+/g, ' ').trim();

function citedSources(citations: Citation[], evidence: EvidenceBundle): SourceLink[] {
  const ids = new Set(citations.map(citation => citation.sourceId));
  return evidence.sources.filter(source => ids.has(source.id))
    .map(({ id, title, url }) => ({ id, title, url }));
}

// Absent publication is catalogued: a null date alone never implies an announcement.
// Only explicit publication evidence with a verified market can be released.
const publicationRank = (edition: EditionEvidence) =>
  edition.publication === 'published' && edition.market !== null ? 2 : edition.publication === 'announced' ? 1 : 0;
const originRank = (edition: EditionEvidence) => edition.id.startsWith('ai:') ? 1 : 0;
export const undatedState = (edition: EditionEvidence): ReleaseProposal['state'] =>
  publicationRank(edition) === 2 ? 'released' : publicationRank(edition) === 1 ? 'announced' : 'catalogued';

function editionGroup(edition: EditionEvidence): string {
  const key = edition.editionKey === null
    ? `work:${normalizeIdentity(edition.title)}:${normalizeIdentity(edition.author)}`
    : `edition:${edition.editionKey}`;
  return JSON.stringify([edition.market, edition.format, key]);
}

// Validated relationship evidence only. A relation never enters identity
// selection or release-title narrowing. Contradictory claims for one title
// are suppressed so a later cap cannot hide the ambiguity.
export function relatedCandidates(request: CheckRequest, evidence: EvidenceBundle): RelatedWorkEvidence[] {
  const sourceIds = new Set(evidence.sources.map(source => source.id));
  const valid = (evidence.related ?? []).filter(item =>
    item.position === null && normalizeIdentity(item.author) === normalizeIdentity(request.target.author) &&
    item.citations.length > 0 && item.citations.every(citation => sourceIds.has(citation.sourceId)));
  const relationships = new Map<string, Set<string>>();
  for (const item of valid) {
    const key = normalizeIdentity(item.title);
    relationships.set(key, (relationships.get(key) ?? new Set()).add(item.relationship));
  }
  const seen = new Set<string>();
  return valid.filter(item => {
    const key = `${normalizeIdentity(item.title)}:${item.relationship}`;
    if (relationships.get(normalizeIdentity(item.title))!.size > 1 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function selectRelatedWorks(request: CheckRequest, evidence: EvidenceBundle): RelatedWorkEvidence[] {
  return relatedCandidates(request, evidence).slice(0, 6);
}

const authorHost = (url: string, author: string): boolean => {
  const compact = author.toLowerCase().replace(/[^a-z0-9]/g, '');
  try { return !!compact && new RegExp(`^(?:www\\.)?${compact}\\.[a-z]{2,24}$`).test(new URL(url).hostname.toLowerCase()); } catch { return false; }
};

// The author's own announcement of the next book in this series stands in for a missing
// numbered row. Only for a blank saved title, one continuation and author-site citations.
function promotedContinuation(request: CheckRequest, evidence: EvidenceBundle, numbered: IdentityEvidence[]): IdentityEvidence | null {
  if (numbered.length || request.target.title.trim() || !Number.isInteger(request.target.position)) return null;
  const continuations = relatedCandidates(request, evidence).filter(item => item.relationship === 'continuation');
  if (continuations.length !== 1) return null;
  const [item] = continuations;
  const urls = new Map(evidence.sources.map(source => [source.id, source.url]));
  if (!item.citations.every(citation => authorHost(urls.get(citation.sourceId) ?? '', request.target.author))) return null;
  return { title: item.title, author: item.author, position: request.target.position, citations: item.citations };
}

export function selectProposals(request: CheckRequest, evidence: EvidenceBundle, checkedAt: string, interpreted = false): Proposals {
  const empty: Proposals = { identity: null, identityAttribution: null, releases: { book: null, audio: null }, conflicts: [], related: [] };
  if (!request.target.orderNote.trim()) empty.related = selectRelatedWorks(request, evidence);
  // Current evidence cannot attest arbitrary custom ordering instructions.
  // Keep retrieved links available without offering dependent facts to accept.
  if (request.target.orderNote.trim()) return empty;
  const numbered = evidence.identities.filter(identity =>
    identity.position === request.target.position && identity.citations.length > 0);
  const promoted = promotedContinuation(request, evidence, numbered);
  const citedIdentities = promoted ? [promoted] : numbered;
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
  const related = promoted ? empty.related.filter(item => normalizeIdentity(item.title) !== normalizeIdentity(promoted.title)) : empty.related;
  const result: Proposals = { identity, identityAttribution, releases: { book: null, audio: null }, conflicts: [], related };
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
      ?? [...valid].sort((a, b) => Number(b.market === request.preferredMarket) - Number(a.market === request.preferredMarket) ||
        publicationRank(b) - publicationRank(a) || originRank(a) - originRank(b) || a.id.localeCompare(b.id))[0];
    if (!chosen) continue;
    const exact = chosen.precision === 'day' && chosen.date !== null;
    result.releases[format] = {
      title, position: request.target.position,
      state: exact ? 'scheduled' : undatedState(chosen),
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

// A model's publication claim counts only when a cited quote carries availability language
// that is not a future or negated statement. Announcement language clamps to announced.
const AVAILABILITY_LANGUAGE = /\b(?:released|available now|on sale|out now)\b/i;
const NOT_AVAILABLE_YET = /\b(?:not yet|to be|will be|going to be|upcoming|coming|expected|scheduled)\b[^.]{0,30}\b(?:released?|available)\b|\bunreleased\b/i;
const ANNOUNCEMENT_LANGUAGE = /\b(?:pre-?orders?|coming|upcoming|will be released|expected|publication date)\b/i;
export function supportedPublication(edition: EditionEvidence): EditionEvidence {
  const claim = edition.publication ?? 'catalogued';
  if (claim === 'catalogued') return edition;
  const quotes = edition.citations.map(citation => citation.quote);
  const announced = quotes.some(quote => ANNOUNCEMENT_LANGUAGE.test(quote));
  if (claim === 'published' && quotes.some(quote => AVAILABILITY_LANGUAGE.test(quote) && !NOT_AVAILABLE_YET.test(quote))) return edition;
  if (announced) return claim === 'announced' ? edition : { ...edition, publication: 'announced' };
  return { ...edition, publication: 'catalogued' };
}
