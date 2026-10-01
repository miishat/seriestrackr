// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { runDiscovery } from '../../server/discovery/runDiscovery';
import { emptyUsage } from '../../shared/discovery';
import type { EvidenceBundle } from '../../shared/discovery';
import type { DiscoveryDependencies } from '../../server/discovery/runDiscovery';
import { bundle, edition, request } from './fixtures';
import { ProviderError } from '../../server/discovery/http';
import { parseCheckResponse } from '../../shared/discoveryValidation';
import { createDiscoveryRuntime } from '../../server/discovery/runtime';
import { buildExtractionMessages } from '../../server/discovery/prompt';
import { extractEvidence } from '../../server/discovery/deepseek';
import { collectCatalogs, normalizeOpenLibrary } from '../../server/discovery/catalogs';
import { normalizeGoogleBooks } from '../../server/discovery/googleBooks';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const empty = () => bundle([]);

test.each(['complete', 'partial', 'cancelled'] as const)('Google catalog usage survives the final %s pipeline snapshot', async status => {
  vi.useFakeTimers(); const controller = new AbortController();
  const req = request({ formats: ['book'] });
  const deps = dependencies(); deps.canSearch = false;
  deps.catalogs = (input, markets, signal) => collectCatalogs(input, markets, signal, async input => {
    const url = new URL(String(input));
    if (url.hostname === 'www.googleapis.com') {
      if (status === 'cancelled') controller.abort();
      if (status === 'partial' && !url.searchParams.get('q')?.startsWith('intitle:')) return Response.json({}, { status: 429 });
      return Response.json({ items: [{ id: 'FictionalPipeline', volumeInfo: { title: 'Second', authors: ['Example Author'],
        language: 'en', publishedDate: '2027-03-01' }, saleInfo: status === 'partial' ? { isEbook: true }
        : { isEbook: true, saleability: 'FOR_PREORDER', country: 'CA', onSaleDate: '2027-03-01T00:00:00Z' } }] });
    }
    return Response.json({ results: [], docs: [] });
  }, { googleBooksKey: 'fake-pipeline-secret' });
  const pending = runDiscovery(req, deps, controller.signal); await vi.runAllTimersAsync(); const result = await pending;
  expect(result.summary.status).toBe(status); expect(result.summary.usage.googlebooks).toBe(status === 'partial' ? 2 : 1);
  expect(deps.extract).not.toHaveBeenCalled(); expect(result.summary.usage.deepseek).toBe(0);
});

test('rejected Google metadata never reaches extraction source text', async () => {
  vi.useFakeTimers(); const deps = dependencies(); deps.canSearch = false;
  deps.catalogs = (req, markets, signal) => collectCatalogs(req, markets, signal, async input => {
    const url = new URL(String(input));
    return Response.json(url.hostname === 'www.googleapis.com' ? { items: [{ id: 'FictionalRejected', volumeInfo: {
      title: 'Second', authors: ['Example Author'], language: 'en', publishedDate: '2028-05-06', description: 'Fictional dangerous date description 2029-06-07',
    }, saleInfo: { isEbook: true, saleability: 'FOR_PREORDER', country: 'CA', onSaleDate: '2030-02-30T00:00:00Z' } }] } : { results: [], docs: [] });
  }, { googleBooksKey: 'fake-pipeline-secret' });
  deps.extract = vi.fn(async (_req, evidence) => ({ evidence: { sources: evidence.sources, identities: [], editions: [] }, usage: emptyUsage() }));
  const pending = runDiscovery(request({ formats: ['book'], useAi: true }), deps, new AbortController().signal);
  await vi.runAllTimersAsync(); const result = await pending;
  expect(deps.extract).toHaveBeenCalledOnce(); const supplied = vi.mocked(deps.extract).mock.calls[0][1];
  expect(supplied.sources).toHaveLength(1); expect(supplied.sources[0].provider).toBe('googlebooks');
  for (const rejected of ['2028-05-06', '2030-02-30', '2029-06-07', 'description', 'Market: CA'])
    expect(JSON.stringify(supplied.sources)).not.toContain(rejected);
  expect(result.proposals.releases.book).toMatchObject({ date: null, provenance: { sourceMarket: null } });
  expect(result.summary.usage.googlebooks).toBe(2);
});
function dependencies(evidence = empty()): DiscoveryDependencies {
  return {
    catalogs: vi.fn(async () => ({ evidence, usage: { ...emptyUsage(), apple: 2 }, reasons: [] })),
    search: vi.fn(async () => empty()), extract: vi.fn(async () => ({ evidence: empty(), usage: emptyUsage() })),
    now: () => '2026-09-29T12:00:00Z', canSearch: true, canExtract: true,
  };
}

test.each(['Second', ''])('custom order note preserves source-only results and unknown summaries for title %j', async title => {
  const evidence = bundle([edition({ position: null }), edition({ id: 'audio', format: 'audio', editionKey: 'audio' })], [
    { title: 'Second', author: 'Example Author', position: 2,
      citations: [{ sourceId: 's1', quote: 'Second by Example Author. Book 2.' }] },
  ]);
  const req = request({ target: { ...request().target, title, orderNote: 'Alternate chronology: second entry' } });
  const beforeRequest = structuredClone(req); const beforeEvidence = structuredClone(evidence);
  const deps = dependencies(evidence);
  const result = await runDiscovery(req, deps, new AbortController().signal);
  expect(result.proposals).toEqual({ identity: null, identityAttribution: null,
    releases: { book: null, audio: null }, conflicts: [] });
  expect(result.summary.formats).toEqual({ book: 'unknown', audio: 'unknown' });
  expect(result.summary.status).toBe('complete');
  if (!title) expect(result.summary.reasons).toContain('unknown-identity');
  expect(result.sources).toHaveLength(1);
  expect(result.sources[0]).toMatchObject({ title: evidence.sources[0].title, url: evidence.sources[0].url });
  expect(result.sources[0]).not.toHaveProperty('text');
  expect(parseCheckResponse(result).ok).toBe(true);
  expect(deps.extract).not.toHaveBeenCalled();
  expect(req).toEqual(beforeRequest); expect(evidence).toEqual(beforeEvidence);
});

test.each(['identity-only', 'catalog-book', 'catalog-facts-and-conflicts'])('invalid AI edition batch stays partial and preserves identity plus %s', async variant => {
  const identity = { title: 'Second', author: 'Example Author', position: 2,
    citations: [{ sourceId: 's1', quote: 'Second by Example Author. Book 2.' }] };
  const found = bundle([], [identity]); found.identities = [];
  const catalog = variant === 'identity-only' ? empty() : variant === 'catalog-book' ? bundle([edition()]) : bundle([
    edition(), edition({ id: 'conflicting-book', date: '2028-03-01' }),
    edition({ id: 'catalog-audio', editionKey: 'audio', format: 'audio', market: 'GB', date: '2028-04-02' }),
  ]);
  const deps = dependencies(catalog);
  deps.search = vi.fn().mockResolvedValueOnce(found).mockResolvedValue(empty());
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    const sent = JSON.parse(JSON.parse(init!.body as string).messages[1].content).sources as EvidenceBundle['sources'];
    const sourceId = sent.find(item => item.text.includes(identity.citations[0].quote))!.id;
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
      identities: [{ ...identity, citations: [{ sourceId, quote: identity.citations[0].quote }] }],
      editions: [edition({ title: 'Third', citations: [{ sourceId, quote: identity.citations[0].quote }] })],
    }) } }], usage: { prompt_tokens: 100, completion_tokens: 50 } });
  });
  deps.extract = vi.fn((req, evidence, signal) => extractEvidence(req, evidence,
    { tavilyKey: null, deepseekKey: 'fake-test-key', model: 'deepseek-flash' }, signal, fetcher));
  const result = await runDiscovery(request({ useAi: true, target: { ...request().target, title: '' } }), deps, new AbortController().signal);
  expect(result.summary.status).toBe('partial');
  expect(result.summary.reasons).toEqual(['invalid-evidence']);
  expect(result.proposals.identity?.title).toBe('Second');
  if (variant === 'catalog-book') {
    expect(result.proposals.releases.book).toMatchObject({ date: '2027-03-01',
      provenance: { sourceMarket: 'CA', editionFormat: 'ebook', datePrecision: 'day', interpreted: false } });
    expect(result.proposals.releases.audio).toBeNull();
    expect(result.summary.formats).toEqual({ book: 'supported', audio: 'unknown' });
    expect(result.proposals.conflicts).toEqual([]);
  } else if (variant === 'identity-only') {
    expect(result.proposals.releases.book).toBeNull();
    expect(result.proposals.releases.audio).toBeNull();
    expect(result.proposals.conflicts).toEqual([]);
  } else {
    expect(result.proposals.releases.book).toBeNull();
    expect(result.proposals.conflicts).toHaveLength(1);
    expect(result.proposals.conflicts[0].format).toBe('book');
    expect(result.proposals.releases.audio?.date).toBe('2028-04-02');
    expect(result.proposals.releases.audio?.provenance.sourceMarket).toBe('GB');
    expect(result.proposals.releases.audio?.provenance.interpreted).toBe(false);
  }
  expect(result.summary.usage).toMatchObject({ deepseek: 1, inputTokens: 100, outputTokens: 50 });
  expect(deps.extract).toHaveBeenCalledOnce(); expect(fetcher).toHaveBeenCalledOnce();
  expect(parseCheckResponse(result).ok).toBe(true);
});

test('an earlier wrong-title AI edition rejects the whole batch instead of leaving a false minimum', async () => {
  const valid = edition({ id: 'valid-later', editionKey: 'valid-later' });
  const invalidEarlier = edition({ id: 'invalid-earlier', editionKey: 'invalid-earlier', title: 'Third', date: '2026-12-01' });
  const found = bundle([valid, invalidEarlier]); found.editions = [];
  const deps = dependencies();
  deps.search = vi.fn().mockResolvedValueOnce(found).mockResolvedValue(empty());
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    const sent = JSON.parse(JSON.parse(init!.body as string).messages[1].content).sources as EvidenceBundle['sources'];
    const sourceId = sent.find(item => item.text.includes('Third by Example Author'))!.id;
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ identities: [],
      editions: [valid, invalidEarlier].map(item => ({ ...item, citations: item.citations.map(citation => ({ ...citation, sourceId })) })),
    }) } }], usage: { prompt_tokens: 100, completion_tokens: 50 } });
  });
  deps.extract = vi.fn((req, evidence, signal) => extractEvidence(req, evidence,
    { tavilyKey: null, deepseekKey: 'fake-test-key', model: 'deepseek-flash' }, signal, fetcher));
  const result = await runDiscovery(request({ useAi: true }), deps, new AbortController().signal);
  expect(result.proposals.releases).toEqual({ book: null, audio: null });
  expect(result.proposals.conflicts).toEqual([]);
  expect(result.summary.formats).toEqual({ book: 'unknown', audio: 'unknown' });
  expect(result.summary.status).toBe('partial');
  expect(result.summary.reasons).toEqual(['invalid-evidence']);
  expect(result.summary.usage).toMatchObject({ deepseek: 1, inputTokens: 100, outputTokens: 50 });
  expect(deps.extract).toHaveBeenCalledOnce(); expect(fetcher).toHaveBeenCalledOnce();
});

test('pipeline merges optional extraction reasons once while retaining safe usage and valid evidence', async () => {
  const found = bundle([edition()]); found.editions = [];
  const deps = dependencies(found);
  deps.extract = vi.fn<DiscoveryDependencies['extract']>(async (_req, evidence) => ({ evidence: { sources: evidence.sources, identities: [], editions: [] },
    usage: { ...emptyUsage(), inputTokens: 123, outputTokens: 45 }, reasons: ['invalid-evidence', 'invalid-evidence'] }));
  const result = await runDiscovery(request({ useAi: true }), deps, new AbortController().signal);
  expect(result.summary.status).toBe('partial');
  expect(result.summary.reasons).toEqual(['invalid-evidence']);
  expect(result.summary.usage).toMatchObject({ deepseek: 1, inputTokens: 123, outputTokens: 45 });
});

test('valid empty AI arrays complete with unknown identity and no invalid evidence', async () => {
  const deps = dependencies();
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ finish_reason: 'stop',
    message: { content: JSON.stringify({ identities: [], editions: [] }) } }], usage: { prompt_tokens: 20, completion_tokens: 8 } }));
  deps.extract = vi.fn((req, evidence, signal) => extractEvidence(req, evidence,
    { tavilyKey: null, deepseekKey: 'fake-test-key', model: 'deepseek-flash' }, signal, fetcher));
  const result = await runDiscovery(request({ useAi: true, target: { ...request().target, title: '' } }), deps, new AbortController().signal);
  expect(result.summary.status).toBe('complete');
  expect(result.summary.reasons).toEqual(['unknown-identity']);
  expect(result.proposals.identity).toBeNull(); expect(result.proposals.releases.book).toBeNull();
  expect(result.summary.usage).toMatchObject({ deepseek: 1, inputTokens: 20, outputTokens: 8 });
  expect(fetcher).toHaveBeenCalledOnce();
});
test('complete catalogs skip AI and search and receive all countries once', async () => {
  const deps = dependencies(bundle([edition(), edition({ id: 'audio', format: 'audio', editionKey: 'isbn:audio' })]));
  const result = await runDiscovery(request({ useAi: true }), deps, new AbortController().signal);
  expect(result.summary.formats).toEqual({ book: 'supported', audio: 'supported' });
  expect(deps.search).not.toHaveBeenCalled(); expect(deps.extract).not.toHaveBeenCalled();
  expect(deps.catalogs).toHaveBeenCalledOnce();
  expect(vi.mocked(deps.catalogs).mock.calls[0][1]).toEqual(['CA', 'US', 'GB']);
});
test('unknown title without search key is honestly partial', async () => {
  const deps = dependencies(); deps.canSearch = false;
  const req = request(); req.target.title = '';
  const result = await runDiscovery(req, deps, new AbortController().signal);
  expect(result.summary.status).toBe('partial');
  expect(result.summary.reasons).toEqual(expect.arrayContaining(['missing-key', 'unknown-identity']));
  expect(result.proposals.releases.book).toBeNull();
  expect(deps.search).not.toHaveBeenCalled();
});
test('three unknown-title searches contain no oracle and one extraction is counted before failure', async () => {
  const deps = dependencies();
  deps.extract = vi.fn(async () => { throw new ProviderError('deepseek', 'provider-error'); });
  const req = request({ useAi: true }); req.target.title = '';
  const result = await runDiscovery(req, deps, new AbortController().signal);
  const queries = vi.mocked(deps.search).mock.calls.map(call => call[0]);
  expect(queries).toHaveLength(3); expect(queries[0]).toContain('Example Example Author book 2 reading order');
  expect(queries.join(' ')).not.toContain('Second');
  expect(deps.extract).toHaveBeenCalledOnce();
  expect(result.summary.usage).toMatchObject({ tavily: 3, deepseek: 1, inputTokens: null, outputTokens: null });
  expect(result.summary.status).toBe('failed');
});
test('true empty replies complete with honest unknown identity', async () => {
  const req = request(); req.target.title = '';
  const result = await runDiscovery(req, dependencies(), new AbortController().signal);
  expect(result.summary.status).toBe('complete'); expect(result.summary.reasons).toEqual(['unknown-identity']);
  expect(result.sources).toEqual([]); expect(result.proposals.identity).toBeNull();
});
test('source-only prose remains inert without AI and no raw source text is exposed', async () => {
  const deps = dependencies();
  const found = bundle([edition()]); found.identities = []; found.editions = [];
  deps.search = vi.fn(async () => found);
  const result = await runDiscovery(request(), deps, new AbortController().signal);
  expect(result.sources).toHaveLength(2); expect(result.proposals.releases.book).toBeNull();
  expect(JSON.stringify(result)).not.toContain('English ebook in Canada');
  expect(deps.extract).not.toHaveBeenCalled(); expect(result.summary.status).toBe('complete');
});
test('validated search identity narrows subsequent format queries', async () => {
  const req = request(); req.target.title = '';
  const found = bundle([], [{ title: 'Second', author: 'Example Author', position: 2,
    citations: [{ sourceId: 's1', quote: 'Second by Example Author. Book 2.' }] }]);
  const deps = dependencies(); deps.search = vi.fn().mockResolvedValueOnce(found).mockResolvedValue(empty());
  const result = await runDiscovery(req, deps, new AbortController().signal);
  expect(vi.mocked(deps.search).mock.calls[1][0]).toContain('Second Example Author ebook');
  expect(vi.mocked(deps.search).mock.calls[2][0]).toContain('Second Example Author audiobook');
  expect(result.proposals.identity?.title).toBe('Second');
});
test.each([
  { label: 'CA book and GB audio', bookMarket: 'CA', audioMarket: 'GB' },
  { label: 'US book and US audio fallback', bookMarket: 'US', audioMarket: 'US' },
])('fallback is independent for $label and source markets remain actual', async ({ bookMarket, audioMarket }) => {
  const deps = dependencies(bundle([edition({ market: bookMarket }),
    edition({ id: 'fallback-audio', editionKey: 'audio', format: 'audio', market: audioMarket, date: '2027-04-02' })]));
  const result = await runDiscovery(request(), deps, new AbortController().signal);
  expect(result.proposals.releases.book).toMatchObject({ date: '2027-03-01',
    provenance: { preferredMarket: 'CA', sourceMarket: bookMarket, editionFormat: 'ebook', datePrecision: 'day' } });
  expect(result.proposals.releases.audio).toMatchObject({ date: '2027-04-02',
    provenance: { preferredMarket: 'CA', sourceMarket: audioMarket, editionFormat: 'audio', datePrecision: 'day' } });
  expect(result.summary.formats).toEqual({ book: 'supported', audio: 'supported' });
  expect(deps.search).not.toHaveBeenCalled();
});

test.each([
  { label: 'exact day', publishDate: 'March 1, 2027', date: '2027-03-01', precision: 'day', state: 'scheduled' },
  { label: 'month only', publishDate: 'March 2027', date: null, precision: 'month', state: 'announced' },
])('country-unspecified English print with $label preserves date precision', async ({ publishDate, date, precision, state }) => {
  const catalog = normalizeOpenLibrary({ key: '/books/OL901M', title: 'Second', author_name: ['Example Author'],
    physical_format: 'paperback', languages: [{ key: '/languages/eng' }], publish_date: publishDate }, '2026-09-29T12:00:00Z');
  const result = await runDiscovery(request({ formats: ['book'] }), dependencies(catalog), new AbortController().signal);
  expect(result.proposals.releases.book).toMatchObject({ date, state,
    provenance: { preferredMarket: 'CA', sourceMarket: null, language: 'en', editionFormat: 'print', datePrecision: precision } });
  expect(result.proposals.releases.audio).toBeNull();
  expect(result.summary.formats).toEqual({ book: 'supported', audio: 'not-requested' });
});

test.each(['absent work language', 'English aggregate work language'])('CA storefront without edition language stays unknown with %s', async variant => {
  vi.useFakeTimers();
  const aggregate = variant === 'English aggregate work language';
  const fetcher = vi.fn<typeof fetch>(async input => {
    const url = new URL(String(input));
    if (url.pathname === '/search.json') return Response.json({ docs: aggregate ? [{ key: '/works/OL901W',
      title: 'Second', author_name: ['Example Author'], author_key: ['OL901A'], edition_key: ['OL901M'],
      language: ['eng'], isbn: ['9780000000001'], first_publish_year: 2027 }] : [] });
    if (url.pathname === '/books/OL901M.json') return Response.json({ key: '/books/OL901M', title: 'Second',
      authors: [{ key: '/authors/OL901A' }], physical_format: 'ebook', isbn_13: ['9780000000001'], publish_date: 'March 1, 2027' });
    return Response.json({ results: url.searchParams.get('country') === 'ca' ? [{ trackId: 901, trackName: 'Second',
      artistName: 'Example Author', trackViewUrl: 'https://books.apple.com/ca/book/second/id901',
      isbn13: '9780000000001', releaseDate: '2027-03-01T00:00:00Z' }] : [] });
  });
  const deps = dependencies();
  deps.catalogs = vi.fn((req, markets, signal) => collectCatalogs(req, markets, signal, fetcher));
  const operation = runDiscovery(request({ formats: ['book'] }), deps, new AbortController().signal);
  await vi.runAllTimersAsync();
  const result = await operation;
  const collected = await vi.mocked(deps.catalogs).mock.results[0].value;
  expect(collected.evidence.editions.find(item => item.id.startsWith('apple:901:'))).toMatchObject({
    date: '2027-03-01', format: 'ebook', market: 'CA', language: null,
  });
  if (aggregate) {
    expect(collected.evidence.editions.find(item => item.id === 'openlibrary:OL901M')).toMatchObject({
      date: '2027-03-01', format: 'ebook', market: null, language: null, editionKey: 'isbn:9780000000001',
    });
  }
  expect(result.proposals.releases).toEqual({ book: null, audio: null });
  expect(result.summary.formats).toEqual({ book: 'unknown', audio: 'not-requested' });
  expect(result.summary.reasons).toEqual([]);
  expect(deps.extract).not.toHaveBeenCalled();
});
test.each(['quota', 'provider-error'] as const)('failed %s searches count each unique attempt and retain useful catalogs', async failure => {
  const deps = dependencies(bundle([edition()]));
  deps.search = vi.fn(async () => { throw new ProviderError('tavily', failure); });
  const result = await runDiscovery(request(), deps, new AbortController().signal);
  expect(result.summary.status).toBe('partial'); expect(result.summary.reasons).toContain(failure);
  expect(result.summary.usage.tavily).toBe(1); expect(deps.search).toHaveBeenCalledOnce();
  expect(result.proposals.releases.book?.date).toBe('2027-03-01');
});
test('caller cancellation stops between calls and preserves attempted counters', async () => {
  const abort = new AbortController(); const deps = dependencies();
  deps.search = vi.fn(async () => { abort.abort(); return empty(); });
  const result = await runDiscovery(request({ useAi: true }), deps, abort.signal);
  expect(result.summary.status).toBe('cancelled'); expect(result.summary.usage.tavily).toBe(1);
  expect(deps.search).toHaveBeenCalledOnce(); expect(deps.extract).not.toHaveBeenCalled();
});
test('an already cancelled request makes no calls', async () => {
  const abort = new AbortController(); abort.abort(); const deps = dependencies();
  const result = await runDiscovery(request(), deps, abort.signal);
  expect(result.summary.status).toBe('cancelled'); expect(deps.catalogs).not.toHaveBeenCalled();
  expect(result.summary.usage.apple).toBe(0);
});
test('malformed extraction preserves catalogs, counts AI and keeps token usage unknown', async () => {
  const deps = dependencies(bundle([edition()]));
  deps.extract = vi.fn(async (_req, evidence) => ({ evidence: { ...evidence, editions: [{ invented: true }] } as never, usage: emptyUsage() }));
  const result = await runDiscovery(request({ useAi: true }), deps, new AbortController().signal);
  expect(result.proposals.releases.book?.date).toBe('2027-03-01');
  expect(result.summary.reasons).toContain('invalid-evidence');
  expect(result.summary.usage).toMatchObject({ deepseek: 1, inputTokens: null, outputTokens: null });
});
test('AI cannot replace an actually sent source or invent citation IDs', async () => {
  const deps = dependencies(bundle([edition()]));
  deps.extract = vi.fn(async (_req, evidence) => ({ evidence: { ...evidence, sources: evidence.sources.map(source => ({ ...source, text: 'Forged' })) }, usage: emptyUsage() }));
  const result = await runDiscovery(request({ useAi: true }), deps, new AbortController().signal);
  expect(result.summary.reasons).toContain('invalid-evidence'); expect(result.proposals.releases.book?.date).toBe('2027-03-01');
});
test('source collisions between queries cannot redirect a citation', async () => {
  const catalog = bundle([edition()]);
  const audio = bundle([edition({ id: 'audio', format: 'audio', editionKey: 'audio' })]);
  audio.sources[0].url = 'https://example.com/audio';
  const deps = dependencies(catalog); deps.search = vi.fn(async () => audio);
  const result = await runDiscovery(request(), deps, new AbortController().signal);
  expect(new Set(result.sources.map(source => source.id)).size).toBe(2);
  expect(result.proposals.releases.book?.provenance.sources[0].url).toBe('https://example.com/second');
  expect(result.proposals.releases.audio?.provenance.sources[0].url).toBe('https://example.com/audio');
});
test('contradictory extraction for the same edition preserves the conflict', async () => {
  const catalog = bundle([edition()]); const deps = dependencies(catalog);
  catalog.sources[0].text += ' English ebook in Canada: 2028-03-01.';
  deps.extract = vi.fn(async (_req, evidence) => ({ evidence: { sources: evidence.sources, identities: [], editions: [
    { ...edition({ date: '2028-03-01' }), citations: [{ sourceId: evidence.sources[0].id, quote: 'English ebook in Canada: 2028-03-01.' }] },
  ] }, usage: { ...emptyUsage(), inputTokens: 123, outputTokens: 45 } }));
  const result = await runDiscovery(request({ useAi: true }), deps, new AbortController().signal);
  expect(result.proposals.releases.book).toBeNull(); expect(result.proposals.conflicts).toHaveLength(1);
  expect(result.proposals.conflicts[0].format).toBe('book');
  expect(result.summary.formats).toEqual({ book: 'unknown', audio: 'unknown' });
  expect(result.summary.usage).toMatchObject({ deepseek: 1, inputTokens: 123, outputTokens: 45 });
});
test('priority bounds keep identity and preferred evidence ahead of unrelated catalog records', async () => {
  const unrelated = Array.from({ length: 120 }, (_, index) => edition({ id: `u${index}`, title: 'Other', author: 'Other Author', citations: [{ sourceId: `u${index}`, quote: 'English ebook in Canada: 2027-03-01.' }] }));
  const relevant = edition({ id: 'relevant', citations: [{ sourceId: 'last', quote: 'English ebook in Canada: 2027-03-01.' }] });
  const deps = dependencies(bundle([...unrelated, relevant])); deps.canSearch = false;
  const result = await runDiscovery(request(), deps, new AbortController().signal);
  expect(result.sources.length).toBeLessThanOrEqual(30); expect(result.proposals.releases.book?.date).toBe('2027-03-01');
  expect(result.summary.reasons).not.toContain('budget'); expect(parseCheckResponse(result).ok).toBe(true);
});
test('a conflict larger than bounds suppresses the format rather than resolving by truncation', async () => {
  const editions = Array.from({ length: 101 }, (_, index) => edition({ id: `c${index}`, date: index % 2 ? '2028-03-01' : '2027-03-01' }));
  const deps = dependencies(bundle(editions)); deps.canSearch = false;
  const result = await runDiscovery(request(), deps, new AbortController().signal);
  expect(result.proposals.releases.book).toBeNull(); expect(result.summary.reasons).toContain('budget');
});
test('ambiguous duplicates within a provider reply reject the citation instead of choosing last', async () => {
  const evidence = bundle([edition()]); evidence.sources.push({ ...evidence.sources[0], url: 'https://example.com/forged' });
  const deps = dependencies(evidence); deps.canSearch = false;
  const result = await runDiscovery(request(), deps, new AbortController().signal);
  expect(result.proposals.releases.book).toBeNull(); expect(result.summary.reasons).toContain('invalid-evidence');
});
test('invalid request is rejected before any provider call', async () => {
  const deps = dependencies();
  await expect(runDiscovery(request({ formats: ['book', 'book'] }), deps, new AbortController().signal)).rejects.toThrow('invalid-request');
  expect(deps.catalogs).not.toHaveBeenCalled();
});
test('the whole-check deadline aborts pending search without a retry or extraction', async () => {
  vi.useFakeTimers();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
    const abort = new AbortController(); setTimeout(() => abort.abort(new DOMException('Timeout', 'TimeoutError')), ms); return abort.signal;
  });
  const deps = dependencies(); deps.search = vi.fn(() => new Promise<EvidenceBundle>(() => {}));
  const operation = runDiscovery(request({ useAi: true }), deps, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(180001);
  const result = await operation; expect(result.summary.status).toBe('failed');
  expect(result.summary.reasons).toContain('timeout'); expect(result.summary.usage.tavily).toBe(1);
  expect(timeout).toHaveBeenCalledWith(180000);
  expect(deps.extract).not.toHaveBeenCalled();
});
test('production catalog cancellation keeps actual attempted transport usage and stops queued work', async () => {
  vi.useFakeTimers(); const abort = new AbortController();
  const fetcher = vi.fn(async () => { abort.abort(); throw new Error('cancelled'); });
  const deps = createDiscoveryRuntime({ tavilyKey: null, deepseekKey: null, model: 'deepseek-flash' }, fetcher as typeof fetch);
  const operation = runDiscovery(request(), deps, abort.signal);
  await vi.runAllTimersAsync(); const result = await operation;
  expect(result.summary.status).toBe('cancelled'); expect(fetcher).toHaveBeenCalledOnce();
  expect(result.summary.usage).toMatchObject({ apple: 1, openlibrary: 0, tavily: 0, deepseek: 0 });
});
test('fractional positions require explicit identity and never substitute integer main entries', async () => {
  const req = request(); req.target.position = 2.5;
  const deps = dependencies(bundle([edition()])); deps.canSearch = false;
  const result = await runDiscovery(req, deps, new AbortController().signal);
  expect(result.proposals.releases.book).toBeNull(); expect(result.summary.reasons).toContain('unknown-identity');
});
test('runtime counters reset for every independent check', async () => {
  const deps = dependencies();
  const first = await runDiscovery(request(), deps, new AbortController().signal);
  const second = await runDiscovery(request(), deps, new AbortController().signal);
  expect(first.summary.usage).toEqual(second.summary.usage); expect(second.summary.usage.tavily).toBe(2);
});
test('AI provenance survives allowed title case normalization without duplicate source links', async () => {
  const deps = dependencies();
  deps.search = vi.fn(async () => { const found = bundle([edition()]); found.editions = []; return found; });
  deps.extract = vi.fn(async (_req, evidence) => ({ evidence: { sources: evidence.sources, identities: [], editions: [
    { ...edition({ title: 'SECOND' }), citations: [{ sourceId: evidence.sources[0].id, quote: 'English ebook in Canada: 2027-03-01.' }] },
  ] }, usage: { ...emptyUsage(), inputTokens: 20, outputTokens: 10 } }));
  const result = await runDiscovery(request({ useAi: true }), deps, new AbortController().signal);
  expect(result.proposals.releases.book?.provenance.interpreted).toBe(true);
  expect(result.sources).toHaveLength(2); expect(result.summary.reasons).not.toContain('budget');
});
test('synchronous cancellation with a rejected operation stays handled and cancelled', async () => {
  const abort = new AbortController(); const deps = dependencies();
  deps.search = vi.fn(() => { abort.abort(); return Promise.reject(new ProviderError('tavily', 'cancelled')); });
  const result = await runDiscovery(request(), deps, abort.signal);
  expect(result.summary.status).toBe('cancelled'); expect(result.summary.usage.tavily).toBe(1);
});
test('discarded unrelated catalog sources cannot displace useful source-only search text before extraction', async () => {
  const unrelated = Array.from({ length: 30 }, (_, index) => edition({ id: `unrelated-${index}`, title: 'Other Work', author: 'Other Author',
    citations: [{ sourceId: `unrelated-${index}`, quote: 'English ebook in Canada: 2027-03-01.' }] }));
  const deps = dependencies(bundle(unrelated));
  const useful = bundle([edition({ id: 'useful-audio', format: 'audio', editionKey: 'audio',
    citations: [{ sourceId: 'useful-search', quote: 'English audio in Canada: 2027-03-01.' }] })]);
  useful.sources[0].market = null; useful.editions = [];
  deps.search = vi.fn(async () => useful);
  deps.extract = vi.fn(async (_req, evidence) => ({ evidence: { sources: evidence.sources, identities: [], editions: [] }, usage: emptyUsage() }));
  await runDiscovery(request({ formats: ['audio'], useAi: true }), deps, new AbortController().signal);
  const sent = vi.mocked(deps.extract).mock.calls[0][1];
  expect(sent.sources.some(source => source.text.includes('English audio in Canada: 2027-03-01.'))).toBe(true);
  expect(sent.sources.some(source => source.text.includes('Other Work'))).toBe(false);
});
test('source pruning keeps sources shared by retained and discarded factual records', async () => {
  const relevant = edition();
  const unrelated = edition({ id: 'unrelated-shared', title: 'Other Work', author: 'Other Author' });
  const deps = dependencies(bundle([relevant, unrelated]));
  deps.extract = vi.fn(async (_req, evidence) => ({ evidence: { sources: evidence.sources, identities: [], editions: [] }, usage: emptyUsage() }));
  const result = await runDiscovery(request({ useAi: true }), deps, new AbortController().signal);
  const sent = vi.mocked(deps.extract).mock.calls[0][1];
  expect(sent.sources).toHaveLength(1); expect(sent.sources[0].text).toContain('Second by Example Author');
  expect(sent.editions).toHaveLength(1); expect(sent.editions[0].title).toBe('Second');
  expect(result.proposals.releases.book?.date).toBe('2027-03-01');
});
test('filtering unrelated evidence below all caps keeps a successful supported check complete', async () => {
  const relevant = edition();
  const unrelated = edition({ id: 'unrelated', title: 'Other Work', author: 'Other Author',
    citations: [{ sourceId: 'unrelated-source', quote: 'English ebook in Canada: 2027-03-01.' }] });
  const result = await runDiscovery(request({ formats: ['book'] }), dependencies(bundle([relevant, unrelated])), new AbortController().signal);
  expect(result.proposals.releases.book?.date).toBe('2027-03-01');
  expect(result.sources).toHaveLength(1);
  expect(result.summary.status).toBe('complete');
  expect(result.summary.reasons).not.toContain('budget');
});
test('truncating eligible source-only evidence above the source cap still reports a budget limit', async () => {
  const evidence = bundle([]);
  const template = bundle([edition()]).sources[0];
  evidence.sources = Array.from({ length: 31 }, (_, index) => ({ ...template, id: `source-only-${index}`, url: `https://example.com/source-only-${index}` }));
  const deps = dependencies(evidence); deps.canSearch = false;
  const result = await runDiscovery(request({ formats: ['book'] }), deps, new AbortController().signal);
  expect(result.sources).toHaveLength(30);
  expect(result.summary.status).toBe('partial');
  expect(result.summary.reasons).toContain('budget');
});

test.each(['catalog-singletons', 'conflict-and-singletons', 'google-singletons', 'google-conflicts'])('source pruning then prompt pruning reserve sole order and audio search roles under %s saturation', async variant => {
  const catalogs = bundle(Array.from({ length: 35 }, (_, i) => edition({ id: `cat-${i}`, editionKey: `isbn:${i}`,
    citations: [{ sourceId: `cat-${i}`, quote: 'English ebook in Canada: 2027-03-01.' }] })));
  catalogs.sources.forEach(item => { item.provider = variant.startsWith('google') ? 'googlebooks' : 'apple'; item.text += ' Large fictional catalog detail.'.repeat(450); });
  if (variant === 'conflict-and-singletons' || variant === 'google-conflicts') {
    const conflicts = bundle([edition({ id: 'conflict-left', editionKey: 'conflicted', citations: [{ sourceId: 'conflict-left', quote: 'English ebook in Canada: 2027-03-01.' }] }),
      edition({ id: 'conflict-right', editionKey: 'conflicted', date: '2028-03-01', citations: [{ sourceId: 'conflict-right', quote: 'English ebook in Canada: 2028-03-01.' }] })]);
    catalogs.sources.push(...conflicts.sources); catalogs.editions.push(...conflicts.editions);
    if (variant === 'google-conflicts') conflicts.sources.forEach(item => { item.provider = 'googlebooks'; });
  }
  const template = bundle([edition()]).sources[0];
  const search: EvidenceBundle = { sources: [
    { ...template, id: 'order', title: 'Fictional series order', market: null, text: 'Second by Example Author. Book 2.' },
    { ...template, id: 'audio', title: 'Fictional GB audio', market: 'GB', text: 'Second by Example Author. English audiobook in GB: 2028-04-02.' },
  ], identities: [], editions: [] };
  const before = structuredClone({ catalogs, search });
  const req = request({ useAi: true, target: { ...request().target, title: '' } });
  const deps = dependencies(catalogs);
  deps.search = vi.fn().mockResolvedValueOnce(search).mockResolvedValue(empty());
  let promptSources: EvidenceBundle['sources'] = [];
  deps.extract = vi.fn(async (_request, evidence) => {
    promptSources = JSON.parse(buildExtractionMessages(req, evidence)[1].content).sources;
    expect(Buffer.byteLength(JSON.stringify(buildExtractionMessages(req, evidence)), 'utf8')).toBeLessThanOrEqual(20000);
    return { evidence: { sources: evidence.sources, identities: [], editions: [] }, usage: emptyUsage() };
  });
  const result = await runDiscovery(req, deps, new AbortController().signal);
  expect(deps.extract).toHaveBeenCalledOnce();
  expect(result.sources.some(item => item.title === 'Fictional series order')).toBe(true);
  expect(result.sources.some(item => item.title === 'Fictional GB audio')).toBe(true);
  const retained = vi.mocked(deps.extract).mock.calls[0][1];
  expect(retained.sources.length).toBeLessThanOrEqual(30);
  expect(retained.editions.length).toBeLessThanOrEqual(100);
  expect(promptSources.some(item => item.title === 'Fictional series order' && item.text.includes('Second by Example Author. Book 2.'))).toBe(true);
  expect(promptSources.some(item => item.title === 'Fictional GB audio' && item.text.includes('English audiobook in GB: 2028-04-02.'))).toBe(true);
  if (variant === 'conflict-and-singletons' || variant === 'google-conflicts') {
    expect(retained.editions.filter(item => item.editionKey === 'conflicted')).toHaveLength(2);
  }
  expect(result.proposals.identity).toBeNull();
  expect(result.proposals.releases.audio).toBeNull();
  expect(result.summary.reasons).toContain('budget');
  expect({ catalogs, search }).toEqual(before);
});

test.each(['tavily', 'googlebooks'] as const)('identity alternative closure exceeding 30 %s sources suppresses identity and dependent formats', async provider => {
  const identities = ['Second', 'Alternative'].map((title, index) => ({ title, author: 'Example Author', position: 2,
    citations: Array.from({ length: 16 }, (_, i) => ({ sourceId: `identity-${index}-${i}`, quote: `${title} by Example Author. Book 2.` })) }));
  const evidence = bundle([edition()], identities);
  evidence.sources.forEach(source => { source.provider = provider; });
  const deps = dependencies(evidence); deps.canSearch = false;
  const result = await runDiscovery(request({ target: { ...request().target, title: '' } }), deps, new AbortController().signal);
  expect(result.proposals.identity).toBeNull(); expect(result.proposals.releases.book).toBeNull();
  expect(result.sources.length).toBeLessThanOrEqual(30);
  expect(result.summary.reasons).toContain('budget');
});

test.each(['tavily', 'googlebooks'] as const)('whole conflict dependency closure exceeding 30 %s sources cannot expose a surviving date', async provider => {
  const left = edition({ id: 'left', citations: Array.from({ length: 16 }, (_, i) => ({ sourceId: `left-${i}`, quote: 'English ebook in Canada: 2027-03-01.' })) });
  const right = edition({ id: 'right', date: '2028-03-01', citations: Array.from({ length: 16 }, (_, i) => ({ sourceId: `right-${i}`, quote: 'English ebook in Canada: 2028-03-01.' })) });
  const evidence = bundle([left, right, edition({ id: 'unrelated-supported', editionKey: 'separate' })]);
  evidence.sources.forEach(source => { source.provider = provider; });
  const deps = dependencies(evidence); deps.canSearch = false;
  const result = await runDiscovery(request({ formats: ['book'] }), deps, new AbortController().signal);
  expect(result.proposals.releases.book).toBeNull(); expect(result.summary.reasons).toContain('budget');
});

test('a structured format minimum whose closure cannot fit suppresses later surviving singleton dates', async () => {
  const identities = [{ title: 'Second', author: 'Example Author', position: 2,
    citations: Array.from({ length: 29 }, (_, i) => ({ sourceId: `order-${i}`, quote: 'Second by Example Author. Book 2.' })) }];
  const first = edition({ id: 'earliest', date: '2026-12-01', editionKey: 'earliest',
    citations: ['earliest-a', 'earliest-b'].map(sourceId => ({ sourceId, quote: 'English ebook in Canada: 2026-12-01.' })) });
  const later = edition({ id: 'later', editionKey: 'later' });
  const deps = dependencies(bundle([first, later], identities)); deps.canSearch = false;
  const result = await runDiscovery(request({ formats: ['book'] }), deps, new AbortController().signal);
  expect(result.proposals.identity?.title).toBe('Second');
  expect(result.proposals.releases.book).toBeNull();
  expect(result.summary.reasons).toContain('budget');
});

test('source-only role reservations cannot evict a fitting protected 30-source identity closure', async () => {
  const identity = { title: 'Second', author: 'Example Author', position: 2,
    citations: Array.from({ length: 30 }, (_, i) => ({ sourceId: `protected-${i}`, quote: 'Second by Example Author. Book 2.' })) };
  const protectedEvidence = bundle([], [identity]);
  const template = protectedEvidence.sources[0];
  const roles: EvidenceBundle = { sources: [
    { ...template, id: 'order-role', title: 'Reading order', text: 'Fictional reading order information.' },
    { ...template, id: 'book-role', title: 'Paperback', text: 'Fictional paperback details.' },
    { ...template, id: 'audio-role', title: 'Audiobook', text: 'Fictional audiobook details.' },
  ], identities: [], editions: [] };
  const deps = dependencies(protectedEvidence);
  deps.search = vi.fn().mockResolvedValueOnce(roles).mockResolvedValue(empty());
  const result = await runDiscovery(request({ target: { ...request().target, title: '' } }), deps, new AbortController().signal);
  expect(result.proposals.identity?.title).toBe('Second');
  expect(result.sources).toHaveLength(30);
  expect(result.sources.map(item => item.url)).toEqual(protectedEvidence.sources.map(item => item.url));
  expect(result.sources.some(item => ['Reading order', 'Paperback', 'Audiobook'].includes(item.title))).toBe(false);
  expect(result.summary.reasons).toContain('budget');
});

test.each([
  { label: 'earlier matching preferred', prunedTitle: 'Second', prunedDate: '2026-12-01', prunedMarket: 'CA', retainedMarket: 'CA', expected: '2026-12-01' },
  { label: 'earlier matching fallback', prunedTitle: 'Second', prunedDate: '2026-12-01', prunedMarket: 'US', retainedMarket: 'US', expected: '2026-12-01' },
  { label: 'earlier unrelated work', prunedTitle: 'Other Work', prunedDate: '2026-12-01', prunedMarket: 'CA', retainedMarket: 'CA', expected: '2027-03-01' },
  { label: 'later matching preferred', prunedTitle: 'Second', prunedDate: '2028-12-01', prunedMarket: 'CA', retainedMarket: 'CA', expected: '2027-03-01' },
  { label: 'earlier fallback beside supported preferred', prunedTitle: 'Second', prunedDate: '2026-12-01', prunedMarket: 'US', retainedMarket: 'CA', expected: '2027-03-01' },
  { label: 'preferred day before fallback selection', prunedTitle: 'Second', prunedDate: '2028-12-01', prunedMarket: 'CA', retainedMarket: 'US', expected: null, competingWorks: true },
  { label: 'same earliest day recovered in AI batch', prunedTitle: 'Second', prunedDate: '2026-12-01', prunedMarket: 'CA', retainedMarket: 'CA', expected: '2026-12-01', recovered: true },
])('late AI identity preserves date policy after pruning $label evidence', async ({ prunedTitle, prunedDate, prunedMarket, retainedMarket, expected, recovered, competingWorks }) => {
  const books = Array.from({ length: 30 }, (_, i) => {
    const last = i === 29;
    const market = last ? prunedMarket : competingWorks ? 'CA' : retainedMarket;
    const date = last ? prunedDate : '2027-03-01';
    return edition({ id: `late-${i}`, editionKey: `late-${i}`,
      title: last ? prunedTitle : competingWorks ? 'Other Work' : 'Second', date, market,
      citations: [{ sourceId: `late-source-${i}`, quote: `English ebook in ${market === 'CA' ? 'Canada' : market}: ${date}.` }] });
  });
  if (competingWorks) books.push(edition({ id: 'retained-fallback', editionKey: 'retained-fallback', market: 'US',
    citations: [{ sourceId: 'late-source-0', quote: 'English ebook in US: 2027-03-01.' }] }));
  const audio = edition({ id: 'independent-audio', format: 'audio', editionKey: 'independent-audio', market: 'GB', date: '2028-04-02',
    citations: [{ sourceId: 'late-source-0', quote: 'English audio in GB: 2028-04-02.' }] });
  const catalogs = bundle([...books, audio]);
  if (recovered) catalogs.sources[0].text += ' English ebook in Canada: 2026-12-01.';
  catalogs.sources.forEach((item, index) => { item.provider = index % 2 ? 'googlebooks' : 'apple'; });
  const template = catalogs.sources[0];
  const deps = dependencies(catalogs);
  deps.search = vi.fn().mockResolvedValueOnce({ sources: [{ ...template, provider: 'tavily', id: 'uncited-order', title: 'Series order',
    text: 'Fictional series order prose.' }], identities: [], editions: [] }).mockResolvedValue(empty());
  deps.extract = vi.fn(async (_req, evidence) => {
    const sourceId = evidence.sources.find(item => item.url.endsWith('/late-source-0'))!.id;
    return { evidence: { sources: evidence.sources, editions: recovered ? [edition({ id: 'recovered', editionKey: 'recovered', date: '2026-12-01',
      citations: [{ sourceId, quote: 'English ebook in Canada: 2026-12-01.' }] })] : [], identities: [
      { title: 'Second', author: 'Example Author', position: 2, citations: [{ sourceId, quote: 'Second by Example Author. Book 2.' }] },
    ] }, usage: emptyUsage() };
  });
  const result = await runDiscovery(request({ useAi: true, target: { ...request().target, title: '' } }), deps, new AbortController().signal);
  expect(result.proposals.identity?.title).toBe('Second');
  expect(result.proposals.releases.book?.date ?? null).toBe(expected);
  expect(result.proposals.releases.audio?.date).toBe('2028-04-02');
  expect(result.proposals.releases.audio?.provenance.sourceMarket).toBe('GB');
  expect(result.sources.length).toBeLessThanOrEqual(30);
  expect(result.sources.some(item => item.title === 'Series order')).toBe(true);
  expect(result.sources.some(item => item.url.endsWith('/late-source-29'))).toBe(
    prunedTitle === 'Second' && prunedDate === '2026-12-01' && prunedMarket === retainedMarket);
  expect(result.summary.reasons).toContain('budget');
  expect(result.summary.formats.book).toBe(expected === null ? 'unknown' : 'supported');
  expect(result.summary.reasons).not.toContain('invalid-evidence');
  expect(result.summary.usage.tavily).toBe(3);
  expect(result.summary.usage.deepseek).toBe(1);
});

test('Google normalized identity and ebook survive fitting thirty-identity and hundred-edition boundaries without mutation', async () => {
  const req = request({ useAi: true, target: { ...request().target, title: '' } });
  const normalized = normalizeGoogleBooks({ items: [{ id: 'FictionalBoundary', volumeInfo: {
    title: 'Second', subtitle: 'Example, Book Two', authors: ['Example Author'], language: 'en', publishedDate: '2027-03-01',
  }, saleInfo: { isEbook: true, saleability: 'FOR_PREORDER', country: 'CA', onSaleDate: '2027-03-01T00:00:00Z' } }] }, req, '2026-09-29T12:00:00Z');
  const source = normalized.sources[0]; const identity = normalized.identities[0]; const ebook = normalized.editions[0];
  const evidence: EvidenceBundle = { sources: normalized.sources,
    identities: Array.from({ length: 30 }, () => structuredClone(identity)),
    editions: Array.from({ length: 100 }, (_, i) => ({ ...ebook, id: `boundary-${i}`, editionKey: `boundary-${i}`, citations: ebook.citations.map(citation => ({ ...citation })) })),
  };
  const before = structuredClone(evidence); const deps = dependencies(evidence); deps.canSearch = false;
  deps.extract = vi.fn(async (_req, supplied) => {
    expect(supplied.identities).toHaveLength(30); expect(supplied.editions).toHaveLength(100);
    const messages = buildExtractionMessages(req, supplied); expect(Buffer.byteLength(JSON.stringify(messages), 'utf8')).toBeLessThanOrEqual(20000);
    const promptSources = JSON.parse(messages[1].content).sources as EvidenceBundle['sources'];
    expect(promptSources[0].text).toContain(identity.citations[0].quote);
    return { evidence: { sources: supplied.sources, identities: [], editions: [] }, usage: emptyUsage() };
  });
  const result = await runDiscovery(req, deps, new AbortController().signal);
  expect(result.proposals.identity?.title).toBe('Second'); expect(result.proposals.releases.book?.date).toBe('2027-03-01');
  expect(result.sources[0].url).toBe(source.url); expect(result.summary.reasons).not.toContain('budget');
  expect(evidence).toEqual(before);
});

test.each(['identity', 'conflict'] as const)('Google %s evidence over factual caps suppresses affected proposals', async kind => {
  const req = request({ formats: ['book'], target: { ...request().target, title: '' } });
  const normalized = normalizeGoogleBooks({ items: [{ id: 'FictionalOverBoundary', volumeInfo: {
    title: 'Second', subtitle: 'Example, Book Two', authors: ['Example Author'], language: 'en', publishedDate: '2027-03-01',
  }, saleInfo: { isEbook: true, saleability: 'FOR_PREORDER', country: 'CA', onSaleDate: '2027-03-01T00:00:00Z' } }] }, req, '2026-09-29T12:00:00Z');
  const ebook = normalized.editions[0];
  const evidence: EvidenceBundle = { ...normalized,
    identities: kind === 'identity' ? Array.from({ length: 31 }, () => structuredClone(normalized.identities[0])) : normalized.identities,
    editions: kind === 'conflict' ? Array.from({ length: 101 }, (_, i) => ({ ...ebook, id: `over-${i}`, date: i % 2 ? '2028-03-01' : ebook.date,
      citations: ebook.citations.map(citation => ({ ...citation })) })) : normalized.editions,
  };
  if (kind === 'conflict') {
    evidence.sources[0].text += ' Fictional conflicting day: 2028-03-01.';
    evidence.editions.forEach((item, i) => { if (i % 2) item.citations = [{ sourceId: normalized.sources[0].id, quote: 'Fictional conflicting day: 2028-03-01.' }]; });
  }
  const before = structuredClone(evidence); const deps = dependencies(evidence); deps.canSearch = false;
  const result = await runDiscovery(req, deps, new AbortController().signal);
  expect(result.proposals.releases.book).toBeNull(); expect(result.summary.reasons).toContain('budget');
  if (kind === 'identity') expect(result.proposals.identity).toBeNull();
  expect(evidence).toEqual(before);
});
