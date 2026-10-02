import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { CoverPicker } from '../src/components/CoverPicker';
import { useCoverSearch } from '../src/components/useCoverSearch';
import type { CoverCandidate, CoverResult } from '../shared/covers';
import { seriesFixture } from './fixtures';

const services = vi.hoisted(() => ({ fetchCoverCandidates: vi.fn(), decodeCover: vi.fn() }));
vi.mock('../src/services/coverImages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/coverImages')>()), ...services,
}));

const candidate = (overrides: Partial<CoverCandidate> = {}): CoverCandidate => ({ id: 'c1', title: 'Second', author: 'Example Author', role: 'next', format: 'ebook',
  provider: 'openlibrary', source: { id: 's', title: 'Second', url: 'https://openlibrary.org/works/OL1W' }, imageUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg',
  workKey: 'second|example author', editionKey: null, width: null, height: null, ...overrides });
const result = (candidates: CoverCandidate[]): CoverResult => ({ requestId: 'r', seriesId: 's1', candidates, authorSuggestions: [],
  outcomes: [{ provider: 'openlibrary', state: 'ok' }] });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };

beforeEach(() => {
  services.fetchCoverCandidates.mockReset();
  services.decodeCover.mockReset();
  services.decodeCover.mockImplementation(async (item: CoverCandidate) => ({ ...item, width: 600, height: 900 }));
});
afterEach(cleanup);

test('nothing is requested on mount', () => {
  render(<CoverPicker series={seriesFixture()} market="CA" onSelect={vi.fn()} />);
  expect(services.fetchCoverCandidates).not.toHaveBeenCalled();
});

test('named choices select a decoded portrait cover with attribution', async () => {
  services.fetchCoverCandidates.mockResolvedValue(result([candidate(), candidate({ id: 'sq', title: 'Square', imageUrl: 'https://covers.openlibrary.org/b/id/2-L.jpg' })]));
  services.decodeCover.mockImplementation(async (item: CoverCandidate) => item.id === 'sq' ? null : { ...item, width: 600, height: 900 });
  const onSelect = vi.fn();
  const user = userEvent.setup();
  render(<CoverPicker series={seriesFixture()} market="CA" onSelect={onSelect} />);
  await user.click(screen.getByRole('button', { name: 'Find cover' }));
  const choice = await screen.findByRole('button', { name: /Second by Example Author, Open Library, Book, Next book/ });
  expect(screen.queryByRole('button', { name: /Square/ })).toBeNull();
  await user.click(choice);
  expect(onSelect).toHaveBeenCalledWith('https://covers.openlibrary.org/b/id/1-L.jpg',
    { title: 'Second', author: 'Example Author', role: 'next', source: candidate().source, editionKey: null });
});

test('audio square art is reviewable but never selectable', async () => {
  services.fetchCoverCandidates.mockResolvedValue(result([candidate({ id: 'au', format: 'audio' })]));
  services.decodeCover.mockImplementation(async (item: CoverCandidate) => ({ ...item, width: 500, height: 500 }));
  const { result: hook } = renderHook(() => useCoverSearch(seriesFixture(), 'CA'));
  await act(async () => { await hook.current.search(); });
  expect(hook.current.state.candidates).toHaveLength(1);
  expect(hook.current.choose('au')).toBeNull();
});

test.each([
  ['title', (s: ReturnType<typeof seriesFixture>) => ({ ...s, next: { ...s.next, title: 'Other' } })],
  ['author', (s: ReturnType<typeof seriesFixture>) => ({ ...s, author: 'Else' })],
  ['progress', (s: ReturnType<typeof seriesFixture>) => ({ ...s, lastFinished: { position: 2, title: 'Second' } })],
])('editing %s while a request is pending discards its response', async (_name, edit) => {
  const pending = deferred<CoverResult>();
  services.fetchCoverCandidates.mockReturnValue(pending.promise);
  const { result: hook, rerender } = renderHook(({ series }) => useCoverSearch(series, 'CA'), { initialProps: { series: seriesFixture() } });
  let search!: Promise<void>;
  act(() => { search = hook.current.search(); });
  expect(hook.current.state.phase).toBe('searching');
  rerender({ series: edit(seriesFixture()) });
  await act(async () => { pending.resolve(result([candidate()])); await search; });
  expect(hook.current.state.phase).toBe('idle');
  expect(hook.current.state.candidates).toEqual([]);
  expect(hook.current.choose('c1')).toBeNull();
  expect(services.fetchCoverCandidates.mock.calls[0][1].aborted).toBe(true);
});

test('market change during image decode aborts and discards', async () => {
  const decode = deferred<CoverCandidate | null>();
  services.fetchCoverCandidates.mockResolvedValue(result([candidate()]));
  services.decodeCover.mockReturnValue(decode.promise);
  const { result: hook, rerender } = renderHook(({ market }) => useCoverSearch(seriesFixture(), market), { initialProps: { market: 'CA' } });
  let search!: Promise<void>;
  act(() => { search = hook.current.search(); });
  await waitFor(() => expect(services.decodeCover).toHaveBeenCalled());
  rerender({ market: 'US' });
  await act(async () => { decode.resolve({ ...candidate(), width: 600, height: 900 }); await search; });
  expect(hook.current.state.candidates).toEqual([]);
  expect(hook.current.choose('c1')).toBeNull();
});

test('unmount before the response never selects', async () => {
  const pending = deferred<CoverResult>();
  services.fetchCoverCandidates.mockReturnValue(pending.promise);
  const { result: hook, unmount } = renderHook(() => useCoverSearch(seriesFixture(), 'CA'));
  let search!: Promise<void>;
  act(() => { search = hook.current.search(); });
  unmount();
  pending.resolve(result([candidate()]));
  await search;
  expect(services.decodeCover).not.toHaveBeenCalled();
});

test('a provider outcome without a match is reported even when another supplies images', async () => {
  services.fetchCoverCandidates.mockResolvedValue({ ...result([candidate()]), outcomes: [{ provider: 'openlibrary', state: 'ok' }, { provider: 'apple', state: 'failed' }] });
  const { result: hook } = renderHook(() => useCoverSearch(seriesFixture(), 'CA'));
  await act(async () => { await hook.current.search(); });
  expect(hook.current.state.outcomes).toContainEqual({ provider: 'apple', state: 'failed' });
  expect(hook.current.state.candidates).toHaveLength(1);
});
