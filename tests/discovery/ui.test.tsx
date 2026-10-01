import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { emptyDocument } from '../../src/features/library/model';
import { useLibrary } from '../../src/features/library/useLibrary';
import { useDiscovery } from '../../src/features/discovery/useDiscovery';
import { seriesFixture } from '../fixtures';
import { response } from './fixtures';
import { checkDiscovery, getDiscoveryCapabilities } from '../../src/services/discovery';

vi.mock('../../src/services/discovery', () => ({ checkDiscovery: vi.fn(), getDiscoveryCapabilities: vi.fn() }));
const capabilities = { search: false, ai: false, googleBooks: false, hardcover: false, model: 'deepseek-flash', limits: { search: 3, ai: 1, googleBooks: 2, hardcover: 1, outputTokens: 2048, inputBytes: 20000 }, pricingAsOf: '2026-09-29', estimatedMaxAiUsd: 0.01 } as const;
function mount() {
  const doc = emptyDocument();
  doc.settings.market = 'CA'; doc.series = [seriesFixture()];
  localStorage.setItem('seriestrackr:v1', JSON.stringify(doc));
  vi.mocked(getDiscoveryCapabilities).mockResolvedValue(capabilities);
  vi.mocked(checkDiscovery).mockImplementation(async request => response({ requestId: request.requestId, seriesId: request.seriesId,
    summary: { ...response().summary, requestId: request.requestId } }));
  return renderHook(() => { const library = useLibrary(); return { library, discovery: useDiscovery(library) }; });
}
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });
test('render makes no requests; explicit open and run send only latest target with AI off', async () => {
  const { result } = mount();
  expect(getDiscoveryCapabilities).not.toHaveBeenCalled(); expect(checkDiscovery).not.toHaveBeenCalled();
  await act(async () => { result.current.discovery.open('s1'); });
  expect(result.current.discovery.session?.phase).toBe('ready');
  await act(async () => { await result.current.discovery.run(false); });
  expect(checkDiscovery).toHaveBeenCalledTimes(1);
  expect(vi.mocked(checkDiscovery).mock.calls[0][0]).toMatchObject({ seriesId: 's1', preferredMarket: 'CA', formats: ['book', 'audio'], useAi: false });
  expect(Object.keys(vi.mocked(checkDiscovery).mock.calls[0][0]).sort()).toEqual(['formats', 'preferredMarket', 'requestId', 'seriesId', 'target', 'useAi']);
  expect(result.current.discovery.session?.phase).toBe('review');
  expect(result.current.library.doc.series[0].releases.book.origin).toBe('manual');
});
test.each(['edit', 'finish-undo', 'equal-import'] as const)('late result after %s never records history or review', async mutation => {
  const { result } = mount();
  let complete!: (value: ReturnType<typeof response>) => void;
  vi.mocked(checkDiscovery).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  await act(async () => { result.current.discovery.open('s1'); });
  let running!: Promise<void>;
  act(() => { running = result.current.discovery.run(false); });
  const sent = vi.mocked(checkDiscovery).mock.calls[0][0];
  act(() => {
    const library = result.current.library;
    if (mutation === 'edit') library.updateSeries({ ...library.doc.series[0], formats: { book: true, audio: false } }, false);
    if (mutation === 'finish-undo') { library.markFinished('s1'); library.undo(); }
    if (mutation === 'equal-import') library.replaceLibrary(library.doc);
  });
  await act(async () => { complete(response({ requestId: sent.requestId, seriesId: sent.seriesId, summary: { ...response().summary, requestId: sent.requestId } })); await running; });
  expect(result.current.discovery.session?.phase).toBe('error');
  expect(result.current.library.doc.series[0].lastCheck).toBeNull();
  expect(result.current.discovery.accept({ title: false, book: true, audio: false }).ok).toBe(false);
});
test('closed and superseded generations ignore late capabilities and checks even if abort is ignored', async () => {
  const { result } = mount();
  const pending: ((value: typeof capabilities) => void)[] = [];
  vi.mocked(getDiscoveryCapabilities).mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  act(() => { result.current.discovery.open('s1'); result.current.discovery.open('s1'); });
  await act(async () => { pending[0](capabilities); });
  expect(result.current.discovery.session?.phase).toBe('preparing');
  await act(async () => { pending[1](capabilities); });
  let complete!: (value: ReturnType<typeof response>) => void;
  vi.mocked(checkDiscovery).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  let running!: Promise<void>; act(() => { running = result.current.discovery.run(false); });
  const sent = vi.mocked(checkDiscovery).mock.calls[0][0];
  act(() => result.current.discovery.close());
  await act(async () => { complete(response({ requestId: sent.requestId, seriesId: sent.seriesId, summary: { ...response().summary, requestId: sent.requestId } })); await running; });
  expect(result.current.discovery.session).toBeNull(); expect(result.current.library.doc.series[0].lastCheck).toBeNull();
});
test('operational error preserves accepted facts and retries require another run', async () => {
  const { result } = mount(); const original = result.current.library.doc.series[0].releases;
  vi.mocked(checkDiscovery).mockRejectedValue(new Error('Discovery service is unavailable.'));
  await act(async () => { result.current.discovery.open('s1'); });
  await act(async () => { await result.current.discovery.run(false); });
  expect(result.current.discovery.session?.phase).toBe('error');
  expect(result.current.library.doc.series[0].releases).toEqual(original); expect(checkDiscovery).toHaveBeenCalledTimes(1);
});
test('run uses the latest override position market formats and target rather than values at open', async () => {
  const { result } = mount();
  await act(async () => { result.current.discovery.open('s1'); });
  act(() => { const series = result.current.library.doc.series[0];
    result.current.library.updateSeries({ ...series, marketOverride: 'GB', formats: { book: false, audio: true },
      next: { ...series.next, title: 'New Second', positionOverride: 2.5, orderNote: 'Optional novella' } }, true);
  });
  await act(async () => { await result.current.discovery.run(true); });
  expect(vi.mocked(checkDiscovery).mock.calls[0][0]).toMatchObject({ preferredMarket: 'GB', formats: ['audio'], useAi: false,
    target: { title: 'New Second', position: 2.5, orderNote: 'Optional novella' } });
});
test('unmount aborts and invalidates late results without storage history', async () => {
  const { result, unmount } = mount();
  await act(async () => { result.current.discovery.open('s1'); });
  let complete!: (value: ReturnType<typeof response>) => void;
  vi.mocked(checkDiscovery).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  let running!: Promise<void>; act(() => { running = result.current.discovery.run(false); });
  const [sent, signal] = vi.mocked(checkDiscovery).mock.calls[0];
  unmount(); expect(signal.aborted).toBe(true);
  complete(response({ requestId: sent.requestId, seriesId: sent.seriesId, summary: { ...response().summary, requestId: sent.requestId } }));
  await running;
  expect(JSON.parse(localStorage.getItem('seriestrackr:v1')!).series[0].lastCheck).toBeNull();
});
test('repeated run clicks cannot start concurrent POST requests', async () => {
  const { result } = mount();
  await act(async () => { result.current.discovery.open('s1'); });
  let complete!: (value: ReturnType<typeof response>) => void;
  vi.mocked(checkDiscovery).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  let running!: Promise<void>; act(() => { running = result.current.discovery.run(false); void result.current.discovery.run(false); });
  expect(checkDiscovery).toHaveBeenCalledTimes(1); const sent = vi.mocked(checkDiscovery).mock.calls[0][0];
  await act(async () => { complete(response({ requestId: sent.requestId, seriesId: sent.seriesId, summary: { ...response().summary, requestId: sent.requestId } })); await running; });
});
