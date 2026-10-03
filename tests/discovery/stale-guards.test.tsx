import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { CheckRequest, CheckResponse } from '../../shared/discovery';
import { emptyDocument } from '../../src/features/library/model';
import { useDiscovery } from '../../src/features/discovery/useDiscovery';
import { useLibrary } from '../../src/features/library/useLibrary';
import { seriesFixture } from '../fixtures';
import { response } from './fixtures';

const services = vi.hoisted(() => ({ checkDiscovery: vi.fn(), getDiscoveryCapabilities: vi.fn() }));
vi.mock('../../src/services/discovery', () => services);

const capabilities = { search: false, ai: false, googleBooks: false, hardcover: false, model: 'm', pricingAsOf: 'x', estimatedMaxAiUsd: 0,
  limits: { search: 3, ai: 1, googleBooks: 2, hardcover: 1, outputTokens: 2048, inputBytes: 20000 } };
const reply = (requestId: string) => { const base = response({ seriesId: 's1' }); return { ...base, requestId, summary: { ...base.summary, requestId } }; };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };

function mount() {
  const doc = { ...emptyDocument(), settings: { ...emptyDocument().settings, market: 'CA' }, series: [seriesFixture()] };
  localStorage.setItem('seriestrackr:v1', JSON.stringify(doc));
  return renderHook(() => { const library = useLibrary(); return { library, discovery: useDiscovery(library) }; });
}
beforeEach(() => { services.checkDiscovery.mockReset(); services.getDiscoveryCapabilities.mockReset(); services.getDiscoveryCapabilities.mockResolvedValue(capabilities); });
afterEach(() => { cleanup(); localStorage.clear(); });

async function startCheck(hook: ReturnType<typeof mount>) {
  const pending = deferred<CheckResponse>();
  let request!: CheckRequest;
  services.checkDiscovery.mockImplementation((req: CheckRequest) => { request = req; return pending.promise; });
  act(() => hook.result.current.discovery.open('s1'));
  await waitFor(() => expect(hook.result.current.discovery.session?.phase).toBe('ready'));
  let run!: Promise<void>;
  act(() => { run = hook.result.current.discovery.run({ useAi: false, useSearch: false, fallbackMarkets: false }); });
  await waitFor(() => expect(services.checkDiscovery).toHaveBeenCalled());
  return { pending, run, request: () => request };
}

test('nothing is requested for checks on mount', () => {
  mount();
  expect(services.checkDiscovery).not.toHaveBeenCalled();
  expect(services.getDiscoveryCapabilities).not.toHaveBeenCalled();
});

test.each([
  ['title', (s: ReturnType<typeof seriesFixture>) => ({ ...s, next: { ...s.next, title: 'Other' } })],
  ['author', (s: ReturnType<typeof seriesFixture>) => ({ ...s, author: 'Else' })],
  ['progress', (s: ReturnType<typeof seriesFixture>) => ({ ...s, lastFinished: { position: 2, title: 'Second' } })],
  ['market', (s: ReturnType<typeof seriesFixture>) => ({ ...s, marketOverride: 'GB' })],
])('a %s edit during a check aborts it and no late response reaches review', async (_name, edit) => {
  const hook = mount();
  const check = await startCheck(hook);
  const signal = services.checkDiscovery.mock.calls[0][1] as AbortSignal;
  act(() => { expect(hook.result.current.library.updateSeries(edit(hook.result.current.library.doc.series[0]), true).ok).toBe(true); });
  expect(signal.aborted).toBe(true);
  await act(async () => { check.pending.resolve(reply(check.request().requestId)); await check.run; });
  expect(hook.result.current.discovery.session?.phase).not.toBe('review');
  expect(hook.result.current.discovery.session?.response).toBeNull();
});

test('closing before the response discards it', async () => {
  const hook = mount();
  const check = await startCheck(hook);
  act(() => hook.result.current.discovery.close());
  await act(async () => { check.pending.resolve(reply(check.request().requestId)); await check.run; });
  expect(hook.result.current.discovery.session).toBeNull();
});

test('acceptance is refused when the response request or series does not match the snapshot', async () => {
  const hook = mount();
  const check = await startCheck(hook);
  await act(async () => { check.pending.resolve(reply(check.request().requestId)); await check.run; });
  expect(hook.result.current.discovery.session?.phase).toBe('review');
  const session = hook.result.current.discovery.session!;
  const bad = { ...session.response!, requestId: 'other' };
  // Force a mismatched pair through the hook by substituting the published response.
  (session as { response: CheckResponse }).response = bad;
  let outcome!: ReturnType<typeof hook.result.current.discovery.accept>;
  act(() => { outcome = hook.result.current.discovery.accept({ title: false, book: true, audio: false }); });
  expect(outcome.ok).toBe(false);
  expect(hook.result.current.library.doc.series[0].releases.book.origin).toBe('manual');
});
