import { useState } from 'react';
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
  await user.click(screen.getByRole('button', { name: 'Find Cover' }));
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

function Harness({ initial = seriesFixture(), onUndo }: { initial?: ReturnType<typeof seriesFixture>; onUndo?: () => void }) {
  const [series, setSeries] = useState(initial);
  return <>
    <button type="button" onClick={() => setSeries(current => ({ ...current, author: 'Else' }))}>edit author</button>
    <button type="button" onClick={() => setSeries(current => ({ ...current, coverUrl: 'https://example.com/typed.jpg', coverAttribution: null }))}>edit url</button>
    <output aria-label="cover">{series.coverUrl ?? 'none'}</output>
    <CoverPicker series={series} market="CA"
      onSelect={(url, attribution) => setSeries(current => ({ ...current, coverUrl: url, coverAttribution: attribution }))}
      onUndo={(url, attribution) => { onUndo?.(); setSeries(current => ({ ...current, coverUrl: url, coverAttribution: attribution })); }} />
  </>;
}
const twoCovers = () => services.fetchCoverCandidates.mockResolvedValue(result([candidate(), candidate({ id: 'c2', imageUrl: 'https://covers.openlibrary.org/b/id/2-L.jpg' })]));

test('undo after repeated picks returns to the cover from before the first pick', async () => {
  twoCovers();
  const user = userEvent.setup();
  render(<Harness initial={seriesFixture({ coverUrl: 'https://example.com/start.jpg' })} />);
  await user.click(screen.getByRole('button', { name: 'Find Cover' }));
  const choices = await screen.findAllByRole('button', { name: /Second by Example Author/ });
  await user.click(choices[0]); await user.click(choices[1]);
  expect(screen.getByLabelText('cover')).toHaveTextContent('2-L.jpg');
  await user.click(screen.getByRole('button', { name: 'Undo cover choice' }));
  expect(screen.getByLabelText('cover')).toHaveTextContent('https://example.com/start.jpg');
  expect(screen.queryByRole('button', { name: 'Undo cover choice' })).toBeNull();
});

test.each(['edit author', 'edit url'])('undo is withdrawn after %s so it cannot overwrite that edit', async name => {
  twoCovers();
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Find Cover' }));
  await user.click((await screen.findAllByRole('button', { name: /Second by Example Author/ }))[0]);
  expect(screen.getByRole('button', { name: 'Undo cover choice' })).toBeVisible();
  await user.click(screen.getByRole('button', { name }));
  expect(screen.queryByRole('button', { name: 'Undo cover choice' })).toBeNull();
});

test('a blank previous title is sent as null so the service accepts the request', async () => {
  services.fetchCoverCandidates.mockResolvedValue(result([]));
  const base = seriesFixture();
  const { result: hook } = renderHook(() => useCoverSearch({ ...base, lastFinished: { position: 1, title: '  ' } }, 'CA'));
  await act(async () => { await hook.current.search(); });
  expect(services.fetchCoverCandidates.mock.calls[0][0].previousTitle).toBeNull();
});

test.each([
  ['next title with no last finished title', (s: ReturnType<typeof seriesFixture>) => ({ ...s, next: { ...s.next, title: ' ' }, lastFinished: null }), /next book/i],
  ['author', (s: ReturnType<typeof seriesFixture>) => ({ ...s, author: '' }), /author/i],
  ['series name', (s: ReturnType<typeof seriesFixture>) => ({ ...s, name: '' }), /series name/i],
])('a missing %s explains what to fill in instead of calling the service', async (_name, edit, message) => {
  const { result: hook } = renderHook(() => useCoverSearch(edit(seriesFixture()), 'CA'));
  await act(async () => { await hook.current.search(); });
  expect(services.fetchCoverCandidates).not.toHaveBeenCalled();
  expect(hook.current.state.phase).toBe('error');
  expect(hook.current.state.error).toMatch(message);
});

const noNext = () => seriesFixture({ next: { positionOverride: null, title: '', orderNote: '', attribution: null }, lastFinished: { position: 1, title: 'First' } });

test('a blank next title still searches for the last read book and offers a selectable previous cover', async () => {
  services.fetchCoverCandidates.mockResolvedValue(result([candidate({ id: 'p1', title: 'First', role: 'previous', workKey: 'first|example author' })]));
  const onSelect = vi.fn();
  const user = userEvent.setup();
  render(<CoverPicker series={noNext()} market="CA" onSelect={onSelect} />);
  expect(screen.getByText('No next title yet. Covers for the last book you read are offered.')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Find Cover' }));
  expect(services.fetchCoverCandidates).toHaveBeenCalledTimes(1);
  expect(services.fetchCoverCandidates.mock.calls[0][0]).toMatchObject({ nextTitle: '', previousTitle: 'First' });
  await user.click(await screen.findByRole('button', { name: /Select cover: First by Example Author, Open Library, Book, Previous book/ }));
  expect(onSelect).toHaveBeenCalledWith('https://covers.openlibrary.org/b/id/1-L.jpg',
    { title: 'First', author: 'Example Author', role: 'previous', source: candidate().source, editionKey: null });
});

test('with neither a next title nor a last finished title the search names both and sends nothing', async () => {
  const user = userEvent.setup();
  render(<CoverPicker series={seriesFixture({ next: { positionOverride: null, title: ' ', orderNote: '', attribution: null }, lastFinished: null })} market="CA" onSelect={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: 'Find Cover' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/next book's title or a last finished title/);
  expect(services.fetchCoverCandidates).not.toHaveBeenCalled();
});
