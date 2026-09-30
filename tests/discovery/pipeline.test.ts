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

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const empty = () => bundle([]);
function dependencies(evidence = empty()): DiscoveryDependencies {
  return {
    catalogs: vi.fn(async () => ({ evidence, usage: { ...emptyUsage(), apple: 2 }, reasons: [] })),
    search: vi.fn(async () => empty()), extract: vi.fn(async () => ({ evidence: empty(), usage: emptyUsage() })),
    now: () => '2026-09-29T12:00:00Z', canSearch: true, canExtract: true,
  };
}
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
test('fallback is independent for book and audio and source markets remain actual', async () => {
  const deps = dependencies(bundle([edition(), edition({ id: 'us-audio', editionKey: 'audio', format: 'audio', market: 'US' })]));
  const result = await runDiscovery(request(), deps, new AbortController().signal);
  expect(result.proposals.releases.book?.provenance.sourceMarket).toBe('CA');
  expect(result.proposals.releases.audio?.provenance.sourceMarket).toBe('US');
  expect(deps.search).not.toHaveBeenCalled();
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
  expect(result.summary.usage).toMatchObject({ deepseek: 1, inputTokens: 123, outputTokens: 45 });
});
test('priority bounds keep identity and preferred evidence ahead of unrelated catalog records', async () => {
  const unrelated = Array.from({ length: 120 }, (_, index) => edition({ id: `u${index}`, title: 'Other', author: 'Other Author', citations: [{ sourceId: `u${index}`, quote: 'English ebook in Canada: 2027-03-01.' }] }));
  const relevant = edition({ id: 'relevant', citations: [{ sourceId: 'last', quote: 'English ebook in Canada: 2027-03-01.' }] });
  const deps = dependencies(bundle([...unrelated, relevant])); deps.canSearch = false;
  const result = await runDiscovery(request(), deps, new AbortController().signal);
  expect(result.sources.length).toBeLessThanOrEqual(30); expect(result.proposals.releases.book?.date).toBe('2027-03-01');
  expect(result.summary.reasons).toContain('budget'); expect(parseCheckResponse(result).ok).toBe(true);
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
