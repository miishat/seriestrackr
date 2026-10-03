// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';
import type { CheckRequest } from '../../shared/discovery';
import type { CoverRequest } from '../../shared/covers';
import { createDiscoveryRuntime } from '../../server/discovery/runtime';
import { runDiscovery } from '../../server/discovery/runDiscovery';
import { takeCombinedApple } from './replayApple';

// Expected answers live only in this file. The recorded request builders never see them.
interface Row { url: string; query: unknown; status: number; contentType: string; body: string }
interface ReplayFixture<R> { request: R; responses: Row[] }
const dataUrl = (name: string) => new URL(`./data/pipeline-repair/${name}`, import.meta.url);
const load = <R>(name: string): ReplayFixture<R> => JSON.parse(readFileSync(dataUrl(name), 'utf8'));
const config = { hardcoverToken: 'fixture', googleBooksKey: 'fixture', tavilyKey: 'fixture', deepseekKey: null, model: 'deepseek-flash' } as const;

// The only fetch a replay can reach: recorded rows consumed once each. Anything else is recorded and refused.
function replayFetcher(saved: ReplayFixture<unknown>) {
  const remaining = [...saved.responses];
  const unexpected: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    url.searchParams.delete('key');
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    const query = body?.variables ?? body?.query ?? null;
    const combined = takeCombinedApple(remaining, url);
    if (combined) return combined;
    const index = remaining.findIndex(row => row.url === url.href && JSON.stringify(row.query) === JSON.stringify(query));
    if (index < 0) { unexpected.push(url.hostname); throw Error('unexpected-fixture-request'); }
    const [row] = remaining.splice(index, 1);
    return new Response(row.body, { status: row.status, headers: { 'Content-Type': row.contentType } });
  };
  return { fetcher, remaining, unexpected };
}
async function replay(caseId: string) {
  const saved = load<CheckRequest>(`${caseId}-replay.json`);
  const { fetcher, remaining, unexpected } = replayFetcher(saved);
  const runtime = createDiscoveryRuntime(config, fetcher);
  runtime.now = () => '2026-10-02T00:00:00Z';
  const pending = runDiscovery({ ...saved.request, useAi: false, useSearch: true, fallbackMarkets: true }, runtime, new AbortController().signal);
  await vi.runAllTimersAsync();
  const result = await pending;
  expect(unexpected).toEqual([]);
  expect(remaining).toEqual([]);
  return result;
}
async function replayCover(caseId: string) {
  const saved = load<CoverRequest>(`${caseId}-cover-replay.json`);
  const { fetcher, remaining, unexpected } = replayFetcher(saved);
  const runtime = createDiscoveryRuntime(config, fetcher);
  const pending = runtime.covers(saved.request, new AbortController().signal);
  await vi.runAllTimersAsync();
  const result = await pending;
  expect(unexpected).toEqual([]);
  expect(remaining).toEqual([]);
  return result;
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test('repairs numbered work, relation, lifecycle and clean receipt cases', async () => {
  vi.useFakeTimers();
  const global = vi.fn(async () => { throw Error('network-forbidden'); });
  vi.stubGlobal('fetch', global);
  const blacktongue = await replay('the-blacktongue-thief');
  const darkProfit = await replay('the-dark-profit-saga');
  const malazan = await replay('novels-of-the-malazan-empire');
  const ascension = await replay('book-of-the-dead');
  const path = await replay('path-to-ascendancy');
  const sunEater = await replay('the-sun-eater');
  const band = await replay('the-band');
  expect(blacktongue.proposals.identity).toBeNull();
  expect(blacktongue.proposals.related.map(r => r.relationship)).toContain('prequel');
  expect(darkProfit.proposals.identity).toMatchObject({ title: 'Crypt Currency', position: 4 });
  expect(malazan.proposals.identity).toMatchObject({ title: 'Blood and Bone', position: 5 });
  expect(ascension.proposals.releases.audio).toMatchObject({ date: '2026-08-19' });
  expect(ascension.proposals.releases.book?.state).not.toBe('announced');
  // With no chosen identity and a blank title the release path emits no cover sidecar at all. This does not exercise the stored book 3 art.
  expect(path.proposals.identity).toBeNull();
  expect(path.coverCandidates).toEqual([]);
  expect(path.summary).toMatchObject({ status: 'partial', reasons: ['budget', 'unknown-identity'] });
  expect(sunEater.summary).toMatchObject({ status: 'complete', reasons: [] });
  expect(band.summary).toMatchObject({ status: 'complete', reasons: [] });
  expect(global).not.toHaveBeenCalled();
});

test('prequels never become numbered identity; an author-site continuation does', async () => {
  vi.useFakeTimers();
  const blacktongue = await replay('the-blacktongue-thief');
  const darkProfit = await replay('the-dark-profit-saga');
  expect(blacktongue.proposals.related.map(r => [r.title, r.position])).toEqual([["The Daughters' War", null]]);
  expect(darkProfit.proposals.identity).toMatchObject({ title: 'Crypt Currency', position: 4 });
  expect(darkProfit.proposals.related).toEqual([]);
  expect(darkProfit.summary.reasons).not.toContain('unknown-identity');
  expect(blacktongue.summary).toMatchObject({ status: 'partial', reasons: ['budget', 'unknown-identity'] });
  expect(blacktongue.summary.formats).toEqual({ book: 'unknown', audio: 'unknown' });
  expect(blacktongue.proposals.releases).toEqual({ book: null, audio: null });
});

test('lifecycle: catalogue presence is not an announcement, and a dated audiobook keeps its own date', async () => {
  vi.useFakeTimers();
  const ascension = await replay('book-of-the-dead');
  expect(ascension.proposals.identity).toMatchObject({ title: 'Ascension', position: 5 });
  expect(ascension.proposals.releases.book).toMatchObject({ state: 'catalogued', date: null });
  expect(ascension.proposals.releases.audio).toMatchObject({ state: 'scheduled', date: '2026-08-19' });
  expect(ascension.proposals.releases.audio?.provenance).toMatchObject({ sourceMarket: 'US', editionFormat: 'audio', datePrecision: 'day' });
  // The publisher's general July date is never borrowed for the audiobook.
  expect(JSON.stringify(ascension.proposals.releases.audio)).not.toContain('2026-07-22');
});

test('supplied-title rechecks keep their dates; blank-title autonomous discovery is a separate outcome', async () => {
  vi.useFakeTimers();
  const witness = await replay('the-tale-of-witness');
  const devils = await replay('the-devils');
  const lastHorizon = await replay('the-last-horizon');
  const ana = await replay('ana-and-din-mysteries');
  // Saved-title rechecks: the supplied title is verified, not discovered.
  expect(witness.summary).toMatchObject({ status: 'partial', reasons: ['budget'] });
  expect(devils.summary).toMatchObject({ status: 'partial', reasons: ['budget'] });
  expect(witness.proposals.releases.book).toMatchObject({ title: 'Legacies of Betrayal', date: '2026-10-06' });
  expect(witness.proposals.releases.audio).toMatchObject({ date: '2026-10-01' });
  expect(devils.proposals.releases.book).toMatchObject({ title: 'The Heretics', date: '2027-05-11' });
  // Blank-title autonomous discovery with sparse primary evidence proposes nothing and fabricates no candidate.
  // Unknown identity alone is complete (Last Horizon); a budget reason makes the check partial (Ana and Din).
  expect(lastHorizon.summary).toMatchObject({ status: 'complete', reasons: ['unknown-identity'] });
  expect(ana.summary).toMatchObject({ status: 'partial', reasons: ['budget', 'unknown-identity'] });
  for (const result of [lastHorizon, ana]) {
    expect(result.proposals.identity).toBeNull();
    expect(result.proposals.related).toEqual([]);
    expect(result.proposals.releases).toEqual({ book: null, audio: null });
    expect(result.summary.reasons).toContain('unknown-identity');
  }
});

test('Malazan position 5 is selected from the non-featured Hardcover row without an integer from related text', async () => {
  vi.useFakeTimers();
  const malazan = await replay('novels-of-the-malazan-empire');
  expect(malazan.proposals.identity).toMatchObject({ title: 'Blood and Bone', author: 'Ian C. Esslemont', position: 5 });
  expect(malazan.summary.reasons).not.toContain('unknown-identity');
});

// Cover requests are a separate user action; a release request cannot invoke Find cover.
test('Witness exact-work artwork is offered with its role and format', async () => {
  vi.useFakeTimers();
  const result = await replayCover('the-tale-of-witness');
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0]).toMatchObject({ provider: 'apple', role: 'next', format: 'ebook', title: 'Legacies of Betrayal', author: 'Steven Erikson' });
  expect(result.candidates[0].imageUrl).toMatch(/^https:\/\/is1-ssl\.mzstatic\.com\//);
  expect(result.outcomes).toContainEqual({ provider: 'apple', state: 'ok' });
  expect(result.outcomes).toContainEqual({ provider: 'openlibrary', state: 'no-match' });
});

test('Ana and Din author spelling is a reviewed suggestion, never a silent change or an unrelated work', async () => {
  vi.useFakeTimers();
  const result = await replayCover('ana-and-din-mysteries');
  expect(result.authorSuggestions).toEqual([expect.objectContaining({ author: 'Robert Jackson Bennett', title: 'A Trade of Blood' })]);
  expect(result.candidates.map(c => c.title)).not.toContain('Foundryside');
  expect(result.candidates.every(c => c.author === 'Robert Jackson Benett')).toBe(true);
  expect(result.outcomes).toContainEqual({ provider: 'googlebooks', state: 'quota' });
});

test('Devils cover replay offers only The Heretics as next-work Apple ebook art and none of the recorded candidates carries the old square asset id', async () => {
  vi.useFakeTimers();
  const result = await replayCover('the-devils');
  expect(result.candidates.length).toBeGreaterThan(0);
  expect(result.candidates.every(c => c.role === 'next' && c.title === 'The Heretics')).toBe(true);
  expect(result.candidates[0]).toMatchObject({ provider: 'apple', format: 'ebook' });
  expect(result.candidates.some(c => c.imageUrl.includes('15229572'))).toBe(false);
});

test('Book of the Dead groups print art before audio art and keeps Hardcover geometry', async () => {
  vi.useFakeTimers();
  const result = await replayCover('book-of-the-dead');
  expect(result.candidates[0]).toMatchObject({ provider: 'hardcover', role: 'next', title: 'Ascension', width: 1617, height: 2560 });
  const formats = result.candidates.map(c => c.format);
  expect(formats.lastIndexOf('audio')).toBeGreaterThan(formats.indexOf('print'));
  expect(formats.indexOf('audio')).toBeGreaterThan(formats.indexOf('print'));
});

test('Last Horizon is an honest no-match with a distinct Google quota outcome', async () => {
  vi.useFakeTimers();
  const result = await replayCover('the-last-horizon');
  expect(result.candidates).toEqual([]);
  expect(result.authorSuggestions).toEqual([]);
  expect(result.outcomes).toEqual([
    { provider: 'hardcover', state: 'no-match' }, { provider: 'googlebooks', state: 'quota' },
    { provider: 'apple', state: 'no-match' }, { provider: 'openlibrary', state: 'no-match' }]);
});

test('Dark Profit separates provider quota from no-match and offers no cover', async () => {
  vi.useFakeTimers();
  const result = await replayCover('the-dark-profit-saga');
  expect(result.candidates).toEqual([]);
  expect(result.outcomes.find(o => o.provider === 'googlebooks')?.state).toBe('quota');
  expect(result.outcomes.filter(o => o.provider !== 'googlebooks').every(o => o.state === 'no-match')).toBe(true);
});

test('every replay fixture has a manifest, matching row count and no credential material', () => {
  const manifest = JSON.parse(readFileSync(dataUrl('manifest.json'), 'utf8'));
  const names = readdirSync(dataUrl('')).filter(name => name.endsWith('-replay.json')).sort();
  expect(names.length).toBe(18);
  expect(manifest.replays.fixtures.map((f: { fixture: string }) => f.fixture).sort()).toEqual(names);
  for (const entry of manifest.replays.fixtures) {
    const saved = load<unknown>(entry.fixture);
    expect(entry.responses).toHaveLength(saved.responses.length);
    for (const [i, row] of saved.responses.entries()) {
      expect(['captured', 'captured-rekeyed', 'synthetic']).toContain(entry.responses[i].origin);
      expect(Object.keys(row).sort()).toEqual(['body', 'contentType', 'query', 'status', 'url']);
      expect(new URL(row.url).searchParams.has('key')).toBe(false);
    }
    const text = readFileSync(dataUrl(entry.fixture), 'utf8');
    expect(text).not.toMatch(/Bearer\s|Authorization|api[_-]?key/i);
  }
});

test('requests with no recorded row fail closed instead of reaching the network', async () => {
  vi.useFakeTimers();
  const global = vi.fn(async () => { throw Error('network-forbidden'); });
  vi.stubGlobal('fetch', global);
  const saved = load<CheckRequest>('the-sun-eater-replay.json');
  const { fetcher, unexpected } = replayFetcher({ ...saved, responses: saved.responses.slice(1) });
  const runtime = createDiscoveryRuntime(config, fetcher);
  const pending = runDiscovery({ ...saved.request, useAi: false, useSearch: true, fallbackMarkets: true }, runtime, new AbortController().signal);
  await vi.runAllTimersAsync();
  await pending;
  expect(unexpected).toEqual(['api.hardcover.app']);
  expect(global).not.toHaveBeenCalled();
});

test('The Bound and the Broken proposes its next book again despite a double-space Hardcover author', async () => {
  vi.useFakeTimers();
  const bound = await replay('the-bound-and-the-broken');
  expect(bound.proposals.identity).toMatchObject({ title: 'Of Gods and Ashes', position: 5 });
  expect(bound.proposals.releases.book).toMatchObject({ state: 'catalogued', date: null });
});
