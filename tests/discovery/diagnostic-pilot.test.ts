// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { runDiagnosticPilot, createDiagnosticFetch, createDiagnosticSink } from '../../scripts/discovery-diagnostic-pilot';
import { runPilot } from '../../scripts/discovery-pilot';
import * as runtimeModule from '../../server/discovery/runtime';
import * as filesystem from 'node:fs';

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, writeFileSync: vi.fn(actual.writeFileSync) };
});
const originalFileWrite = (await vi.importActual<typeof import('node:fs')>('node:fs')).writeFileSync;

test('persistence sink validates fixed fields, caps events and exposes immutable snapshots', () => {
  const sink = createDiagnosticSink();
  const valid = { stage: 'edition', category: 'accepted', sources: 1, identities: 1, editions: 1 };
  for (const bad of [null, {}, { ...valid, stage: 'FAKE_SECRET' }, { ...valid, category: 'FAKE_SECRET' },
    { ...valid, sources: -1 }, { ...valid, sources: 31 }, { ...valid, identities: NaN }, { ...valid, editions: 101 }]) sink.observe(bad);
  for (let i = 0; i < 140; i++) sink.observe({ ...valid, FAKE_SECRET: 'never emit' });
  const snapshot = sink.snapshot();
  expect(snapshot.events).toHaveLength(128); expect(snapshot.droppedEvents).toBe(12);
  expect(snapshot.events.every(event => Object.keys(event).sort().join(',') === 'category,editions,identities,sources,stage')).toBe(true);
  expect(JSON.stringify(snapshot)).not.toContain('FAKE_SECRET');
  snapshot.events.length = 0;
  expect(sink.snapshot().events).toHaveLength(128);
});

const roots: string[] = [];
const workspace = '.superpowers/sdd/2026-09-30-discovery-retrieval-diagnostics';
function root(keys = true) {
  const path = mkdtempSync(resolve(tmpdir(), 'seriestrackr-diagnostic-')); roots.push(path);
  mkdirSync(resolve(path, 'tests/discovery/data'), { recursive: true });
  writeFileSync(resolve(path, 'tests/discovery/data/pilot-cases.json'), JSON.stringify({ example: {
    series: 'Example', author: 'Example Author', position: 2, title: '', preferredMarket: 'CA', formats: ['book', 'audio'],
  } }));
  for (const [file, value] of [['.env.google-books.local', 'GOOGLE_BOOKS_API_KEY=fake-google'],
    ['.env.discovery.local', 'TAVILY_API_KEY=fake-tavily'], ['.env.deepseek.local', 'DEEPSEEK_API_KEY=fake-deepseek']]) {
    writeFileSync(resolve(path, file), keys ? value : 'INVALID NOT ENV');
  }
  return path;
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.mocked(filesystem.writeFileSync).mockImplementation(originalFileWrite); roots.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })); });
const counts = () => ({ hardcover: 0, googlebooks: 0, apple: 0, openlibrary: 0, tavily: 0, deepseek: 0 });
const args = ['--run', '--case', 'example', '--output', 'first'];

test('dry run and unknown input do not read malformed credentials or create reservations', async () => {
  const path = root(false); const print = vi.fn(); const fetcher = vi.fn();
  await runDiagnosticPilot(['--dry-run', '--case', 'example'], { root: path, print, fetcher });
  expect(JSON.parse(print.mock.calls[0][0])).toMatchObject({ requestsMade: 0, caseId: 'example' });
  expect(fetcher).not.toHaveBeenCalled();
  expect(readdirSync(path)).not.toContain('.superpowers');
  await expect(runDiagnosticPilot(['--run', '--case', 'unknown', '--output', 'first'], { root: path, fetcher })).rejects.toThrow('unknown-case');
  expect(fetcher).not.toHaveBeenCalled();
});

test.each(['../outside', '/outside', 'nested/path', 'UPPER', '.', 'first\\child'])('invalid output %s rejects before network', async output => {
  const fetcher = vi.fn();
  await expect(runDiagnosticPilot(['--run', '--case', 'example', '--output', output], { root: root(), fetcher })).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

test('existing junction ancestor rejects before creating outside files', async () => {
  const path = root(); const outside = root();
  symlinkSync(outside, resolve(path, '.superpowers'), 'junction');
  const fetcher = vi.fn();
  await expect(runDiagnosticPilot(args, { root: path, fetcher })).rejects.toThrow('invalid-output');
  expect(readdirSync(outside)).not.toContain('sdd'); expect(fetcher).not.toHaveBeenCalled();
});

test.each([
  ['hardcover', 'https://api.hardcover.app/v1/graphql', 1],
  ['googlebooks', 'https://www.googleapis.com/books/v1/volumes', 2], ['apple', 'https://itunes.apple.com/search', 12],
  ['openlibrary', 'https://openlibrary.org/search.json', 3], ['tavily', 'https://api.tavily.com/search', 3],
  ['deepseek', 'https://api.deepseek.com/chat/completions', 1],
] as const)('counts failed started %s requests and blocks attempt beyond cap', async (provider, url, cap) => {
  const usage = counts(); const fetcher = vi.fn<typeof fetch>(async () => { throw new Error('raw-secret'); });
  const wrapper = createDiagnosticFetch(fetcher, usage, () => {});
  for (let i = 0; i < cap; i++) await expect(wrapper(url)).rejects.toThrow('raw-secret');
  await expect(wrapper(url)).rejects.toThrow('diagnostic-budget');
  expect(fetcher).toHaveBeenCalledTimes(cap); expect(usage[provider]).toBe(cap);
});

test.each(['https://api.deepseek.com:444/chat/completions', 'https://key@api.deepseek.com/chat/completions', 'http://api.deepseek.com/chat/completions', 'https://evil.example/search'])('rejects origin %s before fetch', async url => {
  const fetcher = vi.fn(); const wrapper = createDiagnosticFetch(fetcher, counts(), () => {});
  await expect(wrapper(url)).rejects.toThrow('diagnostic-origin'); expect(fetcher).not.toHaveBeenCalled();
});

test('Apple API and public HTML share the diagnostic twelve-attempt counter', async () => {
  const usage = counts(); const fetcher = vi.fn<typeof fetch>(async () => new Response('fictional'));
  const wrapper = createDiagnosticFetch(fetcher, usage, () => {});
  for (let index = 0; index < 6; index++) {
    await wrapper('https://itunes.apple.com/search');
    await wrapper('https://books.apple.com/ca/book/second/id123');
  }
  await expect(wrapper('https://books.apple.com/ca/audiobook/second/id124')).rejects.toThrow('diagnostic-budget');
  expect(usage.apple).toBe(12); expect(fetcher).toHaveBeenCalledTimes(12);
});

test('redirect cannot trigger an uncounted provider request', async () => {
  const usage = counts(); const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
    expect(init?.redirect).toBe('error'); return new Response(null, { status: 302, headers: { location: 'https://evil.example' } });
  });
  await expect(createDiagnosticFetch(fetcher, usage, () => {})('https://api.tavily.com/search', { redirect: 'follow' })).rejects.toThrow('diagnostic-redirect');
  expect(fetcher).toHaveBeenCalledOnce(); expect(usage.tavily).toBe(1);
});

test.each([{ badSibling: false, adversarial: false }, { badSibling: true, adversarial: false }, { badSibling: false, adversarial: true }])('run reserves, rejects invalid sibling=$badSibling, bounds injected diagnostics=$adversarial without changing results', async ({ badSibling, adversarial }) => {
  vi.useFakeTimers(); const path = root(); const directory = resolve(path, workspace, 'first');
  const sourceText = 'Second by Example Author. Book 2. English ebook in Canada: 2027-03-01. English audio in GB: 2027-03-02.';
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    expect(readFileSync(resolve(directory, 'reservation.json'), 'utf8')).toContain('example');
    const host = new URL(String(input)).hostname;
    if (host === 'www.googleapis.com') return Response.json({ totalItems: 0 });
    if (host === 'itunes.apple.com') return Response.json({ results: [] });
    if (host === 'openlibrary.org') return Response.json({ docs: [] });
    if (host === 'api.tavily.com') return Response.json({ results: [{ title: 'Fictional', url: 'https://example.com/second', content: sourceText }] });
    const body = JSON.parse(String(init?.body)); const sent = JSON.parse(body.messages[1].content).sources;
    const citation = { sourceId: sent[0].id, quote: sourceText };
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
      identities: [{ title: 'Second', author: 'Example Author', position: 2, citations: [citation] }],
      editions: ['ebook', 'audio'].map((format, i) => ({ id: `e${i}`, title: 'Second', author: 'Example Author', position: 2, editionKey: `edition${i}`, format, language: 'en', market: i ? 'GB' : 'CA', date: badSibling && i ? '2027-02-30' : i ? '2027-03-02' : '2027-03-01', precision: 'day', citations: [citation] })),
    }) } }], usage: { prompt_tokens: 100, completion_tokens: 50 } });
  });
  if (adversarial) {
    const original = runtimeModule.createDiscoveryRuntime;
    vi.spyOn(runtimeModule, 'createDiscoveryRuntime').mockImplementation((config, injectedFetch, options) => {
      // Replace only the optional diagnostic producer, retaining real runtime,
      // transport, persistence and discovery acceptance behavior.
      options?.onDiagnostic?.({ stage: 'FAKE_SECRET' } as never);
      for (let i = 0; i < 140; i++) options?.onDiagnostic?.({ stage: 'catalog', category: 'shape', sources: 0, identities: 0, editions: 0, FAKE_SECRET: 'never emit' } as never);
      return original(config, injectedFetch, options);
    });
  }
  const operation = runDiagnosticPilot(args, { root: path, fetcher, print: () => {} });
  await vi.runAllTimersAsync(); await operation;
  const resultText = readFileSync(resolve(directory, 'result.json'), 'utf8'); const result = JSON.parse(resultText);
  if (badSibling) expect(result.proposals.releases).toEqual({ book: null, audio: null });
  else {
    expect(result.proposals.releases.book.date).toBe('2027-03-01');
    expect(result.proposals.releases.audio.provenance.sourceMarket).toBe('GB');
  }
  expect(result.proposals.identity.title).toBe('Second');
  const report = JSON.parse(readFileSync(resolve(directory, 'diagnostics.json'), 'utf8'));
  expect(report.complete).toBe(true); expect(report.counts.deepseek).toBe(1);
  if (adversarial) { expect(report.events).toHaveLength(128); expect(report.droppedEvents).toBeGreaterThanOrEqual(12); }
  else expect(report.events).toContainEqual({ stage: 'edition', category: badSibling ? 'date-precision' : 'accepted', sources: 3, identities: 1, editions: badSibling ? 0 : 2 });
  const allText = readdirSync(directory).map(file => readFileSync(resolve(directory, file), 'utf8')).join('');
  for (const forbidden of [sourceText, 'fake-deepseek', 'fake-google', 'fake-tavily', 'quote', 'messages']) expect(allText).not.toContain(forbidden);
  const baseline: string[] = [];
  vi.restoreAllMocks();
  const baselineRun = runPilot(['--run', '--case', 'example', '--ai'], { root: path, fetcher, print: value => baseline.push(value) });
  await vi.runAllTimersAsync(); await baselineRun;
  const legacy = JSON.parse(baseline[0]);
  const withoutCheckTimes = (value: unknown) => JSON.parse(JSON.stringify(value, (key, item) => key === 'checkedAt' ? undefined : item));
  expect(withoutCheckTimes(result.proposals)).toEqual(withoutCheckTimes(legacy.proposals));
  expect(result.sources).toEqual(legacy.sources);
  expect(result.summary.usage).toEqual(legacy.summary.usage);
  const count = fetcher.mock.calls.length;
  await expect(runDiagnosticPilot(args, { root: path, fetcher })).rejects.toThrow('output-already-reserved');
  expect(fetcher).toHaveBeenCalledTimes(count);
});

test('failed config after reservation stays closed and emits only fixed failure', async () => {
  const path = root(false); const fetcher = vi.fn();
  await expect(runDiagnosticPilot(args, { root: path, fetcher, print: () => {} })).rejects.toThrow('diagnostic-pilot-failed');
  const directory = resolve(path, workspace, 'first');
  expect(JSON.parse(readFileSync(resolve(directory, 'diagnostics.json'), 'utf8')).complete).toBe(false);
  await expect(runDiagnosticPilot(args, { root: path, fetcher })).rejects.toThrow('output-already-reserved');
  expect(fetcher).not.toHaveBeenCalled();
});

test('failure after started requests persists counts and cannot replay or expose raw error', async () => {
  vi.useFakeTimers(); const path = root(); const fetcher = vi.fn<typeof fetch>(async input => Response.json(
    new URL(String(input)).hostname === 'www.googleapis.com' ? { totalItems: 0 } : { results: [], docs: [] }));
  const pending = runDiagnosticPilot(args, { root: path, fetcher, print: () => { throw new Error('FAKE_SECRET raw-output-error'); } });
  const assertion = expect(pending).rejects.toThrow('diagnostic-pilot-failed');
  await vi.runAllTimersAsync(); await assertion;
  const directory = resolve(path, workspace, 'first');
  const reportText = readFileSync(resolve(directory, 'diagnostics.json'), 'utf8'); const report = JSON.parse(reportText);
  expect(report.complete).toBe(false); expect(report.counts.googlebooks).toBeGreaterThan(0);
  expect(Object.values(report.counts).reduce((sum: number, value: number) => sum + value, 0)).toBe(fetcher.mock.calls.length);
  expect(reportText).not.toContain('FAKE_SECRET');
  const before = fetcher.mock.calls.length;
  await expect(runDiagnosticPilot(args, { root: path, fetcher })).rejects.toThrow('output-already-reserved');
  expect(fetcher).toHaveBeenCalledTimes(before);
});

test.each(['reservation.json', 'counts.json'])('initial %s persistence failure is safe and cannot replay', async filename => {
  const path = root(); let failed = false;
  vi.mocked(filesystem.writeFileSync).mockImplementation((file, data, options) => {
    if (!failed && String(file).endsWith(filename)) { failed = true; throw new Error('FAKE_SECRET filesystem failure'); }
    return originalFileWrite(file, data, options);
  });
  const fetcher = vi.fn();
  await expect(runDiagnosticPilot(args, { root: path, fetcher, print: () => {} })).rejects.toThrow('diagnostic-pilot-failed');
  const report = JSON.parse(readFileSync(resolve(path, workspace, 'first/diagnostics.json'), 'utf8'));
  expect(report.complete).toBe(false); expect(Object.values(report.counts)).toEqual([0, 0, 0, 0, 0, 0]);
  expect(JSON.stringify(report)).not.toContain('FAKE_SECRET'); expect(fetcher).not.toHaveBeenCalled();
  await expect(runDiagnosticPilot(args, { root: path, fetcher })).rejects.toThrow('output-already-reserved');
});


