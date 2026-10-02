// @vitest-environment node
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { caseIds, ceilings, runRepairPilot, summarizeEvents, titleModes } from '../../scripts/discovery-pipeline-repair-pilot';

const dataDir = new URL('./data/pipeline-repair/', import.meta.url);
const roots: string[] = [];
const workspace = '.superpowers/sdd/2026-10-02-release-pipeline-repair-pilot';
function root(keys = true) {
  const path = mkdtempSync(resolve(tmpdir(), 'seriestrackr-repair-pilot-')); roots.push(path);
  mkdirSync(resolve(path, 'tests/discovery/data'), { recursive: true });
  cpSync(dataDir, resolve(path, 'tests/discovery/data/pipeline-repair'), { recursive: true });
  if (keys) for (const [file, value] of [['.env.google-books.local', 'GOOGLE_BOOKS_API_KEY=fake-google'], ['.env.discovery.local', 'TAVILY_API_KEY=fake-tavily'],
    ['.env.deepseek.local', 'DEEPSEEK_API_KEY=fake-deepseek'], ['.env.hardcover.local', 'HARDCOVER_API_TOKEN=fake-hardcover']]) writeFileSync(resolve(path, file), value);
  return path;
}
afterEach(() => { vi.useRealTimers(); roots.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })); });
const run = ['--run', '--case', 'the-sun-eater', '--mode', 'saved-title', '--output', 'first'];

// Serves recorded rows by URL so a pilot run can complete without a network.
function recorded(caseId: string) {
  const saved = JSON.parse(readFileSync(new URL(`${caseId}-replay.json`, dataDir), 'utf8'));
  const rows = [...saved.responses];
  return vi.fn<typeof fetch>(async input => {
    const url = new URL(String(input)); url.searchParams.delete('key');
    const index = rows.findIndex(row => row.url === url.href);
    if (index < 0) throw new Error('unrecorded');
    const [row] = rows.splice(index, 1);
    return new Response(row.body, { status: row.status, headers: { 'Content-Type': row.contentType } });
  });
}

test('dry run prints the case, the exact title mode and ceilings, and makes no request or reservation', async () => {
  const path = root(false); const print = vi.fn(); const fetcher = vi.fn();
  await runRepairPilot(['--dry-run', '--case', 'the-devils', '--mode', 'blank-title'], { root: path, print, fetcher });
  const out = JSON.parse(print.mock.calls[0][0]);
  expect(out).toMatchObject({ mode: 'dry-run', caseId: 'the-devils', titleMode: 'blank-title', requestsMade: 0, ai: 'disabled', keyPresence: 'not-read',
    retries: 0, automaticRerun: false, ceilings, target: { title: '' }, otherMode: 'saved-title' });
  expect(out.titleModeMeaning).toBe(titleModes['blank-title']);
  // Default is the saved-title recheck, and the saved title is the user's own input.
  const saved = vi.fn();
  await runRepairPilot(['--case', 'the-devils'], { root: path, print: saved, fetcher });
  expect(JSON.parse(saved.mock.calls[0][0])).toMatchObject({ titleMode: 'saved-title', target: { title: 'The Heretics' } });
  expect(fetcher).not.toHaveBeenCalled();
  expect(readdirSync(path)).not.toContain('.superpowers');
});

test('the two modes are distinct and neither feeds a researched title', async () => {
  const path = root(false);
  const titles: Record<string, string[]> = {};
  for (const id of caseIds) {
    titles[id] = [];
    for (const mode of ['saved-title', 'blank-title']) {
      const print = vi.fn(); await runRepairPilot(['--dry-run', '--case', id, '--mode', mode], { root: path, print });
      titles[id].push(JSON.parse(print.mock.calls[0][0]).target.title);
    }
  }
  expect(caseIds).toHaveLength(11);
  expect(titles['the-tale-of-witness']).toEqual(['Legacies of Betrayal', '']);
  expect(titles['book-of-the-dead']).toEqual(['Ascension', '']);
  // Originally blank targets stay blank in both modes.
  for (const id of ['the-blacktongue-thief', 'novels-of-the-malazan-empire', 'path-to-ascendancy', 'the-dark-profit-saga', 'the-last-horizon', 'ana-and-din-mysteries']) expect(titles[id]).toEqual(['', '']);
  expect(titles['the-dark-profit-saga']).not.toContain('Crypt Currency');
  expect(titles['novels-of-the-malazan-empire']).not.toContain('Blood and Bone');
});

test.each([[['--run', '--case', 'the-sun-eater', '--output', 'first']], [['--run', '--case', 'the-sun-eater', '--mode', 'saved-title']],
  [['--run', '--case', 'unknown', '--mode', 'saved-title', '--output', 'first']], [['--run', '--dry-run', '--case', 'the-sun-eater', '--mode', 'saved-title', '--output', 'first']],
  [['--run', '--case', 'the-sun-eater', '--mode', 'other', '--output', 'first']], [['--run', '--case', 'the-sun-eater', '--mode', 'saved-title', '--output', '../outside']],
  [['--run', '--case', 'the-sun-eater', '--mode', 'saved-title', '--output', 'UPPER']], [['--run', '--run', '--case', 'the-sun-eater', '--mode', 'saved-title', '--output', 'first']],
  [['--dry-run', '--case', 'the-sun-eater', '--output', 'first']]])('invalid arguments %j reject before any request', async args => {
  const fetcher = vi.fn(); const path = root();
  await expect(runRepairPilot(args, { root: path, fetcher, print: () => {} })).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  expect(readdirSync(path)).not.toContain('.superpowers');
});

test('live run exports sanitized decisions and measured starts within ceilings, then refuses a repeated output name', async () => {
  vi.useFakeTimers();
  const path = root(); const fetcher = recorded('the-sun-eater');
  const printed = vi.fn();
  const operation = runRepairPilot(run, { root: path, fetcher, print: printed, now: () => '2026-10-02T00:00:00Z' });
  await vi.runAllTimersAsync(); await operation;
  const directory = resolve(path, workspace, 'first');
  expect(readdirSync(directory).sort()).toEqual(['counts.json', 'diagnostics.json', 'reservation.json', 'result.json']);
  const counts = JSON.parse(readFileSync(resolve(directory, 'counts.json'), 'utf8'));
  expect(counts.ceilings).toEqual(ceilings);
  expect(Object.values(counts.starts).reduce((sum: number, value) => sum + (value as number), 0)).toBe(fetcher.mock.calls.length);
  for (const provider of Object.keys(ceilings) as (keyof typeof ceilings)[]) expect(counts.starts[provider]).toBeLessThanOrEqual(ceilings[provider]);
  expect(counts.starts.deepseek).toBe(0);
  const result = JSON.parse(readFileSync(resolve(directory, 'result.json'), 'utf8'));
  expect(result).toMatchObject({ caseId: 'the-sun-eater', titleMode: 'saved-title', status: 'complete', reasons: [], remainingUnknowns: [] });
  expect(result.decisions.releases.book).toMatchObject({ state: 'scheduled', date: '2025-11-18' });
  const report = JSON.parse(readFileSync(resolve(directory, 'diagnostics.json'), 'utf8'));
  expect(report).toMatchObject({ complete: true, caseId: 'the-sun-eater' });
  const everything = readdirSync(directory).map(file => readFileSync(resolve(directory, file), 'utf8')).join('') + printed.mock.calls.join('');
  for (const forbidden of ['fake-google', 'fake-tavily', 'fake-deepseek', 'fake-hardcover', 'Bearer', 'Authorization']) expect(everything).not.toContain(forbidden);
  const before = fetcher.mock.calls.length;
  await expect(runRepairPilot(run, { root: path, fetcher, print: () => {} })).rejects.toThrow('output-already-reserved');
  expect(fetcher).toHaveBeenCalledTimes(before);
});

test('invalid key configuration closes after reservation and a rerun is refused without a request', async () => {
  const path = root(); writeFileSync(resolve(path, '.env.discovery.local'), 'INVALID NOT ENV');
  const fetcher = vi.fn();
  await expect(runRepairPilot(run, { root: path, fetcher, print: () => {} })).rejects.toThrow('repair-pilot-failed');
  expect(JSON.parse(readFileSync(resolve(path, workspace, 'first/diagnostics.json'), 'utf8')).complete).toBe(false);
  await expect(runRepairPilot(run, { root: path, fetcher, print: () => {} })).rejects.toThrow('output-already-reserved');
  expect(fetcher).not.toHaveBeenCalled();
});

test('provider quota failures are counted apart from no-match outcomes', () => {
  expect(summarizeEvents([{ provider: 'googlebooks', rule: 'http-quota' }, { provider: 'googlebooks', rule: 'http-quota' }, { provider: 'openlibrary', rule: 'no-match' },
    { provider: 'apple', rule: 'http-failure' }, { rule: 'evidence-bound' }, {}])).toEqual({
    rejectedRules: { 'http-quota': 2, 'no-match': 1, 'http-failure': 1, 'evidence-bound': 1 },
    providers: { googlebooks: { quota: 2, failure: 0, noMatch: 0 }, openlibrary: { quota: 0, failure: 0, noMatch: 1 }, apple: { quota: 0, failure: 1, noMatch: 0 } } });
});
