import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SeriesForm } from '../src/features/library/SeriesForm';
import { seriesFixture } from './fixtures';
import type { CoverCandidate, CoverResult } from '../shared/covers';

const services = vi.hoisted(() => ({ fetchCoverCandidates: vi.fn(), decodeCover: vi.fn() }));
vi.mock('../src/services/coverImages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/coverImages')>()), ...services,
}));

const candidate: CoverCandidate = { id: 'c1', title: 'Second', author: 'Example Author', role: 'next', format: 'ebook',
  provider: 'openlibrary', source: { id: 's', title: 'Second', url: 'https://openlibrary.org/works/OL1W' }, imageUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg',
  workKey: 'second|example author', editionKey: null, width: null, height: null };
const result = (): CoverResult => ({ requestId: 'r', seriesId: 's1', candidates: [candidate], authorSuggestions: [], outcomes: [{ provider: 'openlibrary', state: 'ok' }] });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const mount = (onUpdate = vi.fn(), series = seriesFixture()) => {
  render(<SeriesForm series={series} market="CA" onUpdate={onUpdate} onCreate={vi.fn()} onCancel={vi.fn()} />);
  return onUpdate;
};

beforeEach(() => {
  services.fetchCoverCandidates.mockReset();
  services.decodeCover.mockReset();
  services.decodeCover.mockImplementation(async (item: CoverCandidate) => ({ ...item, width: 600, height: 900 }));
});
afterEach(cleanup);

const edits: [string, string, string][] = [
  ['last finished number', 'Last finished book number', '2'],
  ['last finished title', 'Last finished title', 'Renamed'],
  ['next position override', 'Next position override', '5'],
];

test.each(edits)('editing %s aborts a pending cover search', async (_name, label, next) => {
  const pending = deferred<CoverResult>();
  let signal: AbortSignal | undefined;
  services.fetchCoverCandidates.mockImplementation((_request: unknown, s: AbortSignal) => { signal = s; return pending.promise; });
  const user = userEvent.setup();
  mount();
  await user.click(screen.getByRole('button', { name: 'Find cover' }));
  fireEvent.change(screen.getByLabelText(label), { target: { value: next } });
  await waitFor(() => expect(signal?.aborted).toBe(true));
  pending.resolve(result());
  await new Promise(r => setTimeout(r, 0));
  expect(screen.queryByRole('button', { name: /Select cover/ })).toBeNull();
  expect(screen.getByRole('button', { name: 'Find cover' })).toBeEnabled();
});

test.each(edits)('editing %s makes a ready cover result unselectable', async (_name, label, next) => {
  services.fetchCoverCandidates.mockResolvedValue(result());
  const user = userEvent.setup();
  mount();
  await user.click(screen.getByRole('button', { name: 'Find cover' }));
  expect(await screen.findByRole('button', { name: /Select cover/ })).toBeEnabled();
  fireEvent.change(screen.getByLabelText(label), { target: { value: next } });
  await waitFor(() => expect(screen.queryByRole('button', { name: /Select cover/ })).toBeNull());
});

test.each(edits)('editing %s after picking a cover drops it and saves nothing stale', async (_name, label, next) => {
  services.fetchCoverCandidates.mockResolvedValue(result());
  const user = userEvent.setup();
  const onUpdate = mount();
  await user.click(screen.getByRole('button', { name: 'Find cover' }));
  await user.click(await screen.findByRole('button', { name: /Select cover/ }));
  fireEvent.change(screen.getByLabelText(label), { target: { value: next } });
  fireEvent.click(screen.getByRole('button', { name: 'Save series' }));
  expect(onUpdate).toHaveBeenCalledTimes(1);
  expect(onUpdate.mock.calls[0][0]).toMatchObject({ coverUrl: null, coverAttribution: null });
});

test('a manual cover URL survives progress edits', () => {
  const onUpdate = mount(vi.fn(), seriesFixture({ coverUrl: 'https://example.com/manual.jpg' }));
  fireEvent.change(screen.getByLabelText('Next position override'), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save series' }));
  expect(onUpdate.mock.calls[0][0].coverUrl).toBe('https://example.com/manual.jpg');
});

test('the typed other market is used for cover searches', async () => {
  services.fetchCoverCandidates.mockResolvedValue(result());
  const user = userEvent.setup();
  mount();
  fireEvent.change(screen.getByLabelText('Release market'), { target: { value: 'XX' } });
  fireEvent.change(screen.getByLabelText('Other market code'), { target: { value: 'de' } });
  await user.click(screen.getByRole('button', { name: 'Find cover' }));
  await waitFor(() => expect(services.fetchCoverCandidates).toHaveBeenCalled());
  expect(services.fetchCoverCandidates.mock.calls[0][0].preferredMarket).toBe('DE');
});

test('an author suggestion only edits the form draft and saving uses the normal update path', async () => {
  services.fetchCoverCandidates.mockResolvedValue({ ...result(), authorSuggestions: [{ author: 'Robert Jackson Bennett', title: 'The Tainted Cup', source: { id: 'a', title: 'Catalogue', url: 'https://openlibrary.org/works/OL2W' } }] });
  const user = userEvent.setup();
  const onUpdate = mount(vi.fn(), seriesFixture({ author: 'Robert Jackson Benett' }));
  await user.click(screen.getByRole('button', { name: 'Find cover' }));
  const suggestion = await screen.findByRole('button', { name: 'Use Robert Jackson Bennett in the form' });
  expect(screen.getByLabelText('Author')).toHaveValue('Robert Jackson Benett');
  expect(onUpdate).not.toHaveBeenCalled();
  await user.click(suggestion);
  expect(screen.getByLabelText('Author')).toHaveValue('Robert Jackson Bennett');
  expect(onUpdate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save series' }));
  expect(onUpdate).toHaveBeenCalledTimes(1);
  expect(onUpdate.mock.calls[0][0].author).toBe('Robert Jackson Bennett');
});

test('undo restores the cover that was set before an accepted automatic cover', async () => {
  services.fetchCoverCandidates.mockResolvedValue(result());
  const user = userEvent.setup();
  const onUpdate = mount(vi.fn(), seriesFixture({ coverUrl: 'https://example.com/manual.jpg' }));
  await user.click(screen.getByRole('button', { name: 'Find cover' }));
  await user.click(await screen.findByRole('button', { name: /Select cover/ }));
  expect(screen.getByLabelText('Cover URL')).toHaveValue(candidate.imageUrl);
  await user.click(screen.getByRole('button', { name: 'Undo cover choice' }));
  expect(screen.getByLabelText('Cover URL')).toHaveValue('https://example.com/manual.jpg');
  expect(screen.queryByRole('button', { name: 'Undo cover choice' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save series' }));
  expect(onUpdate.mock.calls[0][0]).toMatchObject({ coverUrl: 'https://example.com/manual.jpg', coverAttribution: null });
});

test('a previous-role cover for a series with a blank next title survives saving', async () => {
  services.fetchCoverCandidates.mockResolvedValue({ ...result(), candidates: [{ ...candidate, id: 'p1', title: 'First', role: 'previous' }] });
  const user = userEvent.setup();
  const onUpdate = mount(vi.fn(), seriesFixture({ next: { positionOverride: null, title: '', orderNote: '', attribution: null } }));
  await user.click(screen.getByRole('button', { name: 'Find cover' }));
  await user.click(await screen.findByRole('button', { name: /Select cover: First.*Previous book/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save series' }));
  expect(onUpdate).toHaveBeenCalledTimes(1);
  expect(onUpdate.mock.calls[0][0]).toMatchObject({ coverUrl: candidate.imageUrl, coverAttribution: { role: 'previous', title: 'First' } });
});
