// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { classifyExtractionFailure, emitDiagnostic } from '../../server/discovery/diagnostics';
import { collectCatalogs } from '../../server/discovery/catalogs';
import { runDiscovery } from '../../server/discovery/runDiscovery';
import { createDiscoveryRuntime } from '../../server/discovery/runtime';
import { emptyUsage } from '../../shared/discovery';
import { request } from './fixtures';
import { extractEvidence } from '../../server/discovery/deepseek';

afterEach(() => vi.useRealTimers());

test.each([
  ['evidence.citations: quote must appear in supplied source', 'citation'],
  ['evidence.editions: duplicate values', 'duplicate-id'],
  ['evidence.editions[0].date: date and precision disagree', 'date-precision'],
  ['evidence.editions[0].FAKE_SECRET: unexpected field', 'shape'],
  ['FAKE_SECRET arbitrary raw text', 'shape'],
])('classifies %s into a fixed enum', (error, expected) => expect(classifyExtractionFailure(error)).toBe(expected));

const valid = { stage: 'edition' as const, category: 'accepted' as const, sources: 1, identities: 0, editions: 1 };
test('emitter copies only fixed fields, freezes events and isolates observer exceptions', () => {
  const events: unknown[] = [];
  const input = { ...valid, FAKE_SECRET: 'not emitted' };
  expect(() => emitDiagnostic(event => { events.push(event); expect(Object.isFrozen(event)).toBe(true); throw new Error('failure'); }, input)).not.toThrow();
  expect(events).toEqual([valid]);
  expect(input).toHaveProperty('FAKE_SECRET');
});
test.each([
  { ...valid, sources: -1 }, { ...valid, sources: 31 }, { ...valid, identities: 31 },
  { ...valid, editions: 101 }, { ...valid, sources: NaN }, { ...valid, sources: 1.1 },
  { ...valid, stage: 'FAKE_SECRET' }, { ...valid, category: 'FAKE_SECRET' },
])('invalid event cannot escape through observer %#', event => {
  const observer = vi.fn(); emitDiagnostic(observer, event as typeof valid); expect(observer).not.toHaveBeenCalled();
});

test('oversize catalog emits bounds without changing provider attempts', async () => {
  vi.useFakeTimers(); const events: unknown[] = [];
  const fetcher: typeof fetch = async input => Response.json(new URL(String(input)).hostname === 'www.googleapis.com'
    ? { items: Array.from({ length: 21 }, () => ({})) } : { results: [], docs: [] });
  const pending = collectCatalogs(request({ formats: ['book'] }), ['CA'], new AbortController().signal, fetcher,
    { googleBooksKey: 'fake', onDiagnostic: event => events.push(event) });
  await vi.runAllTimersAsync(); const result = await pending;
  expect(result.reasons).toContain('budget');
  expect(events).toContainEqual({ stage: 'catalog', category: 'bounds', sources: 0, identities: 0, editions: 0 });
  expect(result.usage.googlebooks).toBe(2);
});

test('allocation drop emits retained counts and throwing observers preserve response', async () => {
  const evidence = { identities: [], editions: [], sources: Array.from({ length: 31 }, (_, i) => ({
    id: `s${i}`, title: 'Fictional', url: `https://example.com/${i}`, provider: 'tavily' as const,
    market: null, retrievedAt: '2026-09-30T00:00:00Z', text: 'Fictional source text',
  })) };
  const deps = { catalogs: async () => ({ evidence, usage: emptyUsage(), reasons: [] }),
    search: vi.fn(), extract: vi.fn(), now: () => '2026-09-30T00:00:00Z', canSearch: false, canExtract: false };
  const baseline = await runDiscovery(request(), deps, new AbortController().signal);
  const events: unknown[] = [];
  const observed = await runDiscovery(request(), { ...deps, onDiagnostic: event => { events.push(event); throw new Error('observer'); } }, new AbortController().signal);
  expect(observed).toEqual(baseline);
  expect(events).toContainEqual({ stage: 'allocation', category: 'bounds', sources: 30, identities: 0, editions: 0 });
});

test('runtime passes the observer to extraction without emitting it in public response', async () => {
  const events: unknown[] = [];
  const runtime = createDiscoveryRuntime({ tavilyKey: null, deepseekKey: 'fake', model: 'deepseek-flash' },
    async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ identities: [], editions: [] }) } }] }),
    { onDiagnostic: event => events.push(event) });
  const extracted = await runtime.extract(request({ useAi: true }), { sources: [], identities: [], editions: [] }, new AbortController().signal);
  expect(events).toContainEqual({ stage: 'edition', category: 'accepted', sources: 0, identities: 0, editions: 0 });
  expect(extracted).not.toHaveProperty('diagnostics');
});

test('prompt construction failure reports zero evidence because no payload was sent', async () => {
  const quote = 'x'.repeat(600);
  const sources = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, title: 'Second', url: `https://example.com/${i}`,
    provider: 'tavily' as const, market: null, retrievedAt: '2026-09-30T00:00:00Z', text: 'y'.repeat(19000) + quote }));
  const identities = sources.map(source => ({ title: 'Second', author: 'Example Author', position: 2,
    citations: [{ sourceId: source.id, quote }] }));
  const events: unknown[] = []; const fetcher = vi.fn();
  await expect(extractEvidence(request({ useAi: true }), { sources, identities, editions: [] },
    { tavilyKey: null, deepseekKey: 'fake', model: 'deepseek-flash' }, new AbortController().signal, fetcher, event => events.push(event)))
    .rejects.toMatchObject({ reason: 'budget' });
  expect(fetcher).not.toHaveBeenCalled();
  expect(events).toEqual([{ stage: 'prompt', category: 'bounds', sources: 0, identities: 0, editions: 0 }]);
});

test.each([false, true])('runtime throwing observer preserves attempts, usage and cancellation=%s', async cancel => {
  vi.useFakeTimers();
  const run = async (throwing: boolean) => {
    const controller = new AbortController(); const attempts: string[] = []; const events: unknown[] = [];
    const runtime = createDiscoveryRuntime({ tavilyKey: null, deepseekKey: null, googleBooksKey: 'fake', model: 'deepseek-flash' }, async input => {
      const host = new URL(String(input)).hostname; attempts.push(host);
      if (cancel && attempts.length === 2) controller.abort();
      return Response.json(host === 'www.googleapis.com' ? { items: Array.from({ length: 21 }, () => ({})) } : { results: [], docs: [] });
    }, throwing ? { onDiagnostic: event => { events.push(event); throw new Error('observer'); } } : {});
    runtime.now = () => '2026-09-30T00:00:00Z';
    const pending = runDiscovery(request({ formats: ['book'] }), runtime, controller.signal);
    await vi.runAllTimersAsync(); return { result: await pending, attempts, events };
  };
  const baseline = await run(false); const observed = await run(true);
  expect(observed.result).toEqual(baseline.result); expect(observed.attempts).toEqual(baseline.attempts);
  expect(observed.events.length).toBeGreaterThan(0);
  expect(observed.result.summary.usage.googlebooks).toBe(observed.attempts.filter(host => host === 'www.googleapis.com').length);
  if (cancel) expect(observed.result.summary.status).toBe('cancelled');
});

test('malicious model field never appears in public response and events have exactly fixed fields', async () => {
  const events: object[] = [];
  const runtime = createDiscoveryRuntime({ tavilyKey: null, deepseekKey: 'fake', model: 'deepseek-flash' }, async () =>
    Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ identities: [], editions: [{ FAKE_SECRET: 'never emit' }] }) } }] }),
    { onDiagnostic: event => events.push(event) });
  runtime.catalogs = async () => ({ evidence: { sources: [], identities: [], editions: [] }, usage: emptyUsage(), reasons: [] });
  const result = await runDiscovery(request({ useAi: true }), runtime, new AbortController().signal);
  expect(JSON.stringify({ result, events })).not.toContain('FAKE_SECRET');
  for (const event of events) expect(Object.keys(event).sort()).toEqual(['category', 'editions', 'identities', 'sources', 'stage']);
  expect(events).toContainEqual({ stage: 'edition', category: 'shape', sources: 0, identities: 0, editions: 0 });
});
