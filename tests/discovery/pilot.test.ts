// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { parsePilotArgs, readPilotCases, runPilot } from '../../scripts/discovery-pilot';
import { runDiscovery, type DiscoveryDependencies } from '../../server/discovery/runDiscovery';
import { emptyUsage } from '../../shared/discovery';
import { bundle, edition } from './fixtures';

const roots: string[] = [];
function tempRoot() {
  const root = mkdtempSync(resolve(tmpdir(), 'seriestrackr-offline-pilot-')); roots.push(root);
  mkdirSync(resolve(root, 'tests/discovery/data'), { recursive: true });
  writeFileSync(resolve(root, 'tests/discovery/data/pilot-cases.json'), readFileSync(resolve('tests/discovery/data/pilot-cases.json')));
  // Deliberately invalid oracle data makes an accidental read fail loudly.
  writeFileSync(resolve(root, 'tests/discovery/data/pilot-expected.json'), 'ORACLE_ONLY_SECRET_TITLE_THIS_IS_NOT_JSON');
  writeFileSync(resolve(root, '.env.discovery.local'), 'TAVILY_API_KEY=fake-tavily-secret');
  writeFileSync(resolve(root, '.env.deepseek.local'), 'DEEPSEEK_API_KEY=fake-deepseek-secret\nDEEPSEEK_MODEL=deepseek-flash');
  writeFileSync(resolve(root, '.env.google-books.local'), 'GOOGLE_BOOKS_API_KEY=fake-google-secret');
  return root;
}
afterEach(() => { vi.useRealTimers(); for (const root of roots.splice(0)) rmSync(root, { recursive: true }); });
function runtime(evidence = bundle([])): DiscoveryDependencies {
  return { catalogs: vi.fn(async () => ({ evidence, usage: { ...emptyUsage(), googlebooks: 2 }, reasons: [] })),
    search: vi.fn(async () => bundle([])), extract: vi.fn(async () => ({ evidence: bundle([]), usage: emptyUsage() })),
    canSearch: true, canExtract: true, now: () => '2026-09-30T00:00:00Z' };
}
test('no flags default to dry run; explicit run needs exactly one case', () => {
  expect(parsePilotArgs([])).toEqual({ run: false, caseId: null, ai: false });
  expect(parsePilotArgs(['--', '--run', '--case', 'mistborn', '--ai'])).toEqual({ run: true, caseId: 'mistborn', ai: true });
});
test.each([['--run'], ['--run', '--dry-run', '--case', 'mistborn'], ['--all'], ['--run', '--case', 'mistborn', '--case', 'devils'], ['--case'], ['--case', '--run']].map(args => ({ args })))('unsafe or ambiguous flags $args fail', ({ args }) => {
  expect(() => parsePilotArgs(args)).toThrow();
});
test('four unfamiliar cases and eight known cases plus two controls are frozen without titles', () => {
  const cases = readPilotCases(process.cwd()); expect(Object.keys(cases)).toHaveLength(14);
  for (const item of Object.values(cases)) expect(item.target.title).toBe('');
  expect(cases.mistborn.target).toMatchObject({ author: 'Brandon Sanderson', position: 2 });
  expect(cases.murderbot.target).toMatchObject({ author: 'Martha Wells', position: 2 });
  expect(cases.scholomance.target).toMatchObject({ author: 'Naomi Novik', position: 2 });
  expect(cases.masquerade.target).toMatchObject({ author: 'Seth Dickinson', position: 2 });
  expect(cases['path-to-ascendancy-gb'].preferredMarket).toBe('GB');
});
test('dry run validates presence and planned bounds with zero requests, no secrets or oracle content', async () => {
  const root = tempRoot(); const fetcher = vi.fn(); const deps = runtime(); const print = vi.fn();
  await runPilot(['--dry-run', '--ai'], { root, fetcher, runtime: deps, print });
  const output = print.mock.calls.map(call => call[0]).join(''); const report = JSON.parse(output);
  expect(report.requestsMade).toBe(0); expect(report.liveGate).toBe('pending'); expect(report.plan).toHaveLength(14);
  expect(report.plan[0].queries).toEqual({ hardcoverMax: 0, appleMax: 12, openlibraryMax: 3, googleBooksMax: 2, tavilyMax: 3, deepseekMax: 1 });
  expect(report.keyPresence).toEqual({ search: true, ai: true, googleBooks: true, hardcover: false });
  expect(output).not.toContain('fake-google-secret');
  expect(output).not.toContain('fake-tavily-secret'); expect(output).not.toContain('fake-deepseek-secret'); expect(output).not.toContain('ORACLE_ONLY');
  expect(fetcher).not.toHaveBeenCalled(); expect(deps.catalogs).not.toHaveBeenCalled();
  expect(deps.search).not.toHaveBeenCalled(); expect(deps.extract).not.toHaveBeenCalled();
});
test.each(['blank', 'absent'])('Google %s ignored env file produces absent key presence without requests', async mode => {
  const root = tempRoot(); writeFileSync(resolve(root, '.env.discovery.local'), 'TAVILY_API_KEY=');
  writeFileSync(resolve(root, '.env.deepseek.local'), 'DEEPSEEK_API_KEY='); const print = vi.fn();
  if (mode === 'blank') writeFileSync(resolve(root, '.env.google-books.local'), 'GOOGLE_BOOKS_API_KEY=" "');
  else rmSync(resolve(root, '.env.google-books.local'));
  const fetcher = vi.fn(); const deps = runtime();
  await runPilot([], { root, print, fetcher, runtime: deps });
  const output = print.mock.calls[0][0]; const report = JSON.parse(output);
  expect(report.keyPresence).toEqual({ search: false, ai: false, googleBooks: false, hardcover: false });
  expect(report.plan.every((item: { queries: { googleBooksMax: number } }) => item.queries.googleBooksMax === 0)).toBe(true);
  expect(report.requestsMade).toBe(0); expect(output).not.toContain('fake-google-secret');
  expect(fetcher).not.toHaveBeenCalled(); expect(deps.catalogs).not.toHaveBeenCalled();
  expect(deps.search).not.toHaveBeenCalled(); expect(deps.extract).not.toHaveBeenCalled();
});
test('explicit run invokes one production pipeline and excludes source text and quotes from output', async () => {
  const root = tempRoot(); const req = readPilotCases(root).mistborn;
  const identity = { title: 'Fictional Found Title', author: req.target.author, position: 2,
    citations: [{ sourceId: 's1', quote: 'Fictional Found Title by Brandon Sanderson. Book 2.' }] };
  const found = bundle([edition({ title: identity.title, author: req.target.author })], [identity]);
  const deps = runtime(found); const print = vi.fn();
  await runPilot(['--run', '--case', 'mistborn'], { root, runtime: deps, print });
  expect(deps.catalogs).toHaveBeenCalledOnce(); expect(vi.mocked(deps.catalogs).mock.calls[0][0].target.title).toBe('');
  const output = print.mock.calls[0][0]; const report = JSON.parse(output);
  expect(report.caseId).toBe('mistborn'); expect(report.proposals.identity.title).toBe(identity.title);
  expect(report.summary.usage.googlebooks).toBe(2); expect(output).not.toContain('fake-google-secret');
  expect(output).not.toContain('www.googleapis.com');
  expect(output).not.toContain('quote'); expect(output).not.toContain('English ebook in Canada');
  expect(output).not.toContain('ORACLE_ONLY'); expect(output).not.toContain('fake-tavily-secret');
  expect(deps.extract).not.toHaveBeenCalled();
});
test('unknown case fails before constructing any provider operation', async () => {
  const root = tempRoot(); const fetcher = vi.fn();
  await expect(runPilot(['--run', '--case', 'unknown'], { root, fetcher })).rejects.toThrow('unknown-case');
  expect(fetcher).not.toHaveBeenCalled();
});
test('production transport uses only one input case and never loads the oracle or secrets into JSON payloads', async () => {
  vi.useFakeTimers(); const root = tempRoot(); const print = vi.fn();
  const fetcher = vi.fn(async (url: URL | RequestInfo) => {
    const value = String(url); return new Response(JSON.stringify(value.includes('itunes.apple.com') ? { results: [] } : value.includes('openlibrary.org') ? { docs: [] } : value.includes('www.googleapis.com') ? { totalItems: 0 } : { results: [] }),
      { headers: { 'content-type': 'application/json' } });
  });
  const operation = runPilot(['--run', '--case', 'mistborn'], { root, fetcher: fetcher as typeof fetch, print });
  await vi.runAllTimersAsync(); await operation;
  expect(fetcher).toHaveBeenCalled();
  const bodies = fetcher.mock.calls.map(call => (call as unknown as [unknown, RequestInit])[1]?.body ?? '').join('');
  expect(bodies).toContain('Mistborn Brandon Sanderson book 2');
  expect(bodies).not.toContain('ORACLE_ONLY'); expect(bodies).not.toContain('fake-tavily-secret'); expect(bodies).not.toContain('fake-deepseek-secret');
  expect(bodies).not.toContain('The Well of Ascension');
  const report = JSON.parse(print.mock.calls[0][0]); expect(report.summary.usage).toMatchObject({ apple: 3, openlibrary: 1, googlebooks: 1, tavily: 3, deepseek: 0 });
  expect(print.mock.calls[0][0]).not.toContain('fake-google-secret');
});
test('withheld CA control selects independent US factual editions without relabeling', async () => {
  const req = readPilotCases(process.cwd())['ana-and-din-withheld-ca'];
  req.target.title = 'Fictional Found Title';
  const found = bundle(['ebook', 'audio'].map((format, index) => edition({ id: `us-${index}`, title: req.target.title,
    author: req.target.author, position: 3, format: format as 'ebook' | 'audio', market: 'US', editionKey: `us-${index}` })));
  const result = await runDiscovery(req, runtime(found), new AbortController().signal);
  expect(result.proposals.releases.book?.provenance.sourceMarket).toBe('US');
  expect(result.proposals.releases.audio?.provenance.sourceMarket).toBe('US');
});
test('GB preferred control keeps later local dates over earlier CA and later paperback', async () => {
  const req = readPilotCases(process.cwd())['path-to-ascendancy-gb']; req.target.title = 'Fictional Found Title';
  const found = bundle(['ebook', 'audio'].flatMap((format, index) => ['CA', 'GB'].map(market => edition({ id: `${index}-${market}`,
    title: req.target.title, author: req.target.author, format: format as 'ebook' | 'audio', editionKey: `${index}-${market}`,
    market, date: market === 'CA' ? '2017-11-14' : '2017-11-16' }))).concat([
    edition({ id: 'later-print', title: req.target.title, author: req.target.author, format: 'print', market: 'GB', date: '2018-08-23', editionKey: 'print' }),
  ]));
  const result = await runDiscovery(req, runtime(found), new AbortController().signal);
  for (const format of ['book', 'audio'] as const) {
    expect(result.proposals.releases[format]?.date).toBe('2017-11-16'); expect(result.proposals.releases[format]?.provenance.sourceMarket).toBe('GB');
  }
});


test('dry run includes optional Hardcover count without exposing token content', async () => {
  const root = tempRoot(); writeFileSync(resolve(root, '.env.hardcover.local'), 'HARDCOVER_API_TOKEN=fake-hardcover-secret');
  const print = vi.fn(); const fetcher = vi.fn();
  await runPilot(['--dry-run'], { root, print, fetcher, runtime: runtime() });
  const report = JSON.parse(print.mock.calls[0][0]);
  expect(report.keyPresence.hardcover).toBe(true); expect(report.plan[0].queries.hardcoverMax).toBe(1);
  expect(print.mock.calls[0][0]).not.toContain('fake-hardcover-secret'); expect(fetcher).not.toHaveBeenCalled();
});
