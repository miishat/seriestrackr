import { expect, test, vi } from 'vitest';
import { allocationEvidence, roleReservations } from '../../server/discovery/evidenceAllocation';
import { runDiscovery, type DiscoveryDependencies } from '../../server/discovery/runDiscovery';
import { buildExtractionMessages } from '../../server/discovery/prompt';
import { emptyUsage, type EvidenceBundle } from '../../shared/discovery';
import { selectProposals } from '../../shared/discoveryPolicy';
import { bundle, edition, request } from './fixtures';

const checkedAt = '2026-09-30T12:00:00Z';
const unknownRequest = () => request({ useAi: true, target: { ...request().target, title: '' } });

function floodedCatalog(): EvidenceBundle {
  const google = bundle(Array.from({ length: 20 }, (_, i) => edition({ id: `google-${i}`, editionKey: `google-${i}`,
    date: null, precision: 'none', citations: [{ sourceId: `google-${i}`, quote: 'English ebook in Canada: date unknown.' }] })));
  google.sources.forEach(source => { source.provider = 'googlebooks'; });
  const apple = bundle([
    ...Array.from({ length: 10 }, (_, i) => edition({ id: `apple-undated-${i}`, editionKey: `apple-undated-${i}`,
      date: null, precision: 'none', citations: [{ sourceId: `apple-undated-${i}`, quote: 'English ebook in Canada: date unknown.' }] })),
    edition({ id: 'apple-book', editionKey: 'apple-book', citations: [
      { sourceId: 'apple-book', quote: 'English ebook in Canada: 2027-03-01.' },
      { sourceId: 'apple-language', quote: 'English ebook in Canada: 2027-03-01.' },
    ] }),
    edition({ id: 'apple-audio', editionKey: 'apple-audio', format: 'audio', citations: [
      { sourceId: 'apple-audio', quote: 'English audio in Canada: 2027-03-01.' },
    ] }),
  ]);
  apple.sources.forEach(source => { source.provider = 'apple'; });
  return { sources: [...google.sources, ...apple.sources], identities: [], editions: [...google.editions, ...apple.editions] };
}

test('exact-day candidates survive ahead of preferred undated and partial-date editions', () => {
  const candidates = [edition({ id: 'undated', date: null, precision: 'none' }),
    edition({ id: 'partial', date: '2027-03', precision: 'month' }),
    edition({ id: 'fallback', market: 'US', date: '2026-01-01' }),
    edition({ id: 'preferred-later', date: '2028-01-01' }),
    edition({ id: 'preferred-earlier', date: '2027-01-01' })];
  candidates.forEach(item => { item.editionKey = item.id; });
  const allocation = allocationEvidence(unknownRequest(), bundle(candidates));
  expect(allocation.singletons.map(item => item.id)).toEqual([
    'preferred-earlier', 'preferred-later', 'fallback', 'partial', 'undated',
  ]);
  expect(selectProposals(unknownRequest(), allocation, checkedAt).releases.book).toBeNull();
});

test('unresolved format reservations preserve every candidate citation without resolving identity', () => {
  const input = floodedCatalog();
  const roles = roleReservations(unknownRequest(), allocationEvidence(unknownRequest(), input), checkedAt);
  expect(roles.flatMap(role => role.editions).map(item => item.id)).toEqual(['apple-book', 'apple-audio']);
  expect(roles.find(role => role.editions.some(item => item.id === 'apple-book'))?.citations).toHaveLength(2);
  expect(input.identities).toEqual([]);
});

test.each([true, false])('Google flood retains Apple dates for later supported AI identity: %s', async resolveIdentity => {
  const req = unknownRequest();
  const catalogs = floodedCatalog();
  const order = bundle([], [{ title: 'Second', author: 'Example Author', position: 2,
    citations: [{ sourceId: 'order', quote: 'Second by Example Author. Book 2.' }] }]);
  order.identities = [];
  let supplied: EvidenceBundle | undefined;
  const dependencies: DiscoveryDependencies = {
    catalogs: vi.fn(async () => ({ evidence: catalogs, usage: emptyUsage(), reasons: [] })),
    search: vi.fn().mockResolvedValueOnce(order).mockResolvedValue(bundle([])),
    extract: vi.fn(async (_request, evidence) => {
      supplied = evidence;
      const source = evidence.sources.find(item => item.url.endsWith('/order'))!;
      return { evidence: { sources: evidence.sources, editions: [], identities: resolveIdentity ? [
        { title: 'Second', author: 'Example Author', position: 2,
          citations: [{ sourceId: source.id, quote: 'Second by Example Author. Book 2.' }] },
      ] : [] }, usage: emptyUsage() };
    }),
    now: () => checkedAt, canSearch: true, canExtract: true,
  };
  const result = await runDiscovery(req, dependencies, new AbortController().signal);
  expect(dependencies.extract).toHaveBeenCalledOnce();
  expect(supplied!.editions.filter(item => item.editionKey?.startsWith('apple-') && item.date !== null)).toHaveLength(2);
  const prompt = JSON.parse(buildExtractionMessages(req, supplied!)[1].content) as { sources: EvidenceBundle['sources'] };
  for (const item of supplied!.editions.filter(item => item.date !== null)) {
    for (const citation of item.citations) {
      expect(prompt.sources.find(source => source.id === citation.sourceId)?.text).toContain(citation.quote);
    }
  }
  expect(result.summary.reasons).toContain('budget');
  expect(result.summary.reasons).not.toContain('invalid-evidence');
  if (resolveIdentity) {
    expect(result.proposals.identity?.title).toBe('Second');
    expect(result.proposals.releases.book?.date).toBe('2027-03-01');
    expect(result.proposals.releases.audio?.date).toBe('2027-03-01');
    expect(result.proposals.releases.book?.citations).toHaveLength(2);
  } else {
    expect(result.proposals.identity).toBeNull();
    expect(result.proposals.releases).toEqual({ book: null, audio: null });
  }
});

test('unresolved reservations exclude wrong authors and explicit non-English editions', () => {
  const req = unknownRequest();
  const evidence = bundle([
    edition({ id: 'wrong-author', author: 'Other Author', date: '2025-01-01', editionKey: 'wrong-author' }),
    edition({ id: 'french', language: 'fr', date: '2026-01-01', editionKey: 'french' }),
    edition({ id: 'unknown-language', language: null, editionKey: 'unknown-language' }),
  ]);
  const roles = roleReservations(req, evidence, checkedAt);
  expect(roles.flatMap(role => role.editions).map(item => item.id)).toEqual(['unknown-language']);
  const identity = { title: 'Second', author: 'Example Author', position: 2,
    citations: [{ sourceId: 'order', quote: 'Second by Example Author. Book 2.' }] };
  const resolved = { ...evidence, identities: [identity] };
  resolved.sources.push(...bundle([], [identity]).sources);
  expect(selectProposals(req, resolved, checkedAt).releases.book).toBeNull();
});

test('retention never establishes a relationship between decorated and canonical titles or English language', () => {
  const req = unknownRequest();
  const input = bundle([
    edition({ id: 'decorated', title: 'Second: A Novel', language: null }),
    edition({ id: 'canonical', date: null, precision: 'none', editionKey: 'canonical' }),
  ]);
  const allocation = allocationEvidence(req, input);
  expect(allocation.singletons[0].title).toBe('Second: A Novel');
  const identity = { title: 'Second', author: 'Example Author', position: 2,
    citations: [{ sourceId: 'order', quote: 'Second by Example Author. Book 2.' }] };
  const resolved = { ...input, identities: [identity] };
  resolved.sources.push(...bundle([], [identity]).sources);
  expect(selectProposals(req, resolved, checkedAt).releases.book?.date).toBeNull();
  expect(selectProposals(req, resolved, checkedAt).releases.audio).toBeNull();
});

test.each(['CA', 'US'])('a nonfitting earlier whole citation closure still suppresses a later %s date after identity resolves', async market => {
  const label = market === 'CA' ? 'Canada' : market;
  const otherWorks = Array.from({ length: 29 }, (_, i) => edition({ id: `other-${i}`, title: 'Other Work',
    editionKey: `other-${i}`, market, date: '2025-01-01',
    citations: [{ sourceId: `other-${i}`, quote: `English ebook in ${label}: 2025-01-01.` }] }));
  const earlier = edition({ id: 'earlier', editionKey: 'earlier', market, date: '2026-01-01',
    citations: ['earlier-one', 'earlier-two'].map(sourceId => ({ sourceId, quote: `English ebook in ${label}: 2026-01-01.` })) });
  const later = edition({ id: 'later', editionKey: 'later', market, date: '2027-01-01',
    citations: [{ sourceId: 'other-0', quote: `English ebook in ${label}: 2027-01-01.` }] });
  const evidence = bundle([...otherWorks, earlier, later]);
  let supplied: EvidenceBundle | undefined;
  const dependencies: DiscoveryDependencies = {
    catalogs: vi.fn(async () => ({ evidence, usage: emptyUsage(), reasons: [] })),
    search: vi.fn(async () => bundle([])),
    extract: vi.fn(async (_request, input) => {
      supplied = input;
      const source = input.sources.find(item => item.url.endsWith('/other-0'))!;
      return { evidence: { sources: input.sources, editions: [], identities: [
        { title: 'Second', author: 'Example Author', position: 2,
          citations: [{ sourceId: source.id, quote: 'Second by Example Author. Book 2.' }] },
      ] }, usage: emptyUsage() };
    }), now: () => checkedAt, canSearch: false, canExtract: true,
  };
  const result = await runDiscovery(unknownRequest(), dependencies, new AbortController().signal);
  expect(supplied!.editions.some(item => item.editionKey === 'earlier')).toBe(false);
  expect(supplied!.editions.some(item => item.editionKey === 'later')).toBe(true);
  expect(result.proposals.identity?.title).toBe('Second');
  expect(result.proposals.releases.book).toBeNull();
  expect(result.summary.reasons).toContain('budget');
});

test('related claims keep their sources and conflicting claims are retained together, then suppressed by selection', async () => {
  const { allocationEvidence } = await import('../../server/discovery/evidenceAllocation');
  const { selectRelatedWorks } = await import('../../shared/discoveryPolicy');
  const base = bundle([]);
  const sources = ['a', 'b', 'c'].map(id => ({ ...(base.sources[0] ?? { title: 't', url: `https://example.com/${id}`, provider: 'tavily' as const,
    market: null, retrievedAt: '2026-09-29T12:00:00Z', text: 'Prequel. Sequel.' }), id, url: `https://example.com/${id}`, text: 'Prequel. Sequel.' }));
  const claim = (relationship: 'prequel' | 'continuation', sourceId: string) => ({ title: 'Other Tale', author: 'Example Author',
    relationship, position: null, citations: [{ sourceId, quote: 'Prequel.' }] });
  const evidence = { sources, identities: [], editions: [], related: [claim('prequel', 'a'), claim('continuation', 'b')] };
  const allocation = allocationEvidence(request(), evidence);
  expect(allocation.related).toHaveLength(2);
  expect(allocation.sources.map(source => source.id).sort()).toEqual(['a', 'b', 'c']);
  expect(selectRelatedWorks(request(), allocation)).toEqual([]);
});
