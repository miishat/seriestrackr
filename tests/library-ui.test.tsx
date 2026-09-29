import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../src/app/App';
import { emptyDocument, emptyRelease } from '../src/features/library/model';
import { seriesFixture } from './fixtures';

const key = 'seriestrackr:v1';
function seed(series = [seriesFixture()]) {
  localStorage.setItem(key, JSON.stringify({ ...emptyDocument(), settings: { ...emptyDocument().settings, market: 'CA' }, series }));
}
beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

test('setup selects a country before the library is usable', async () => {
  const user = userEvent.setup();
  render(<App />);
  expect(screen.getByRole('dialog', { name: /which releases/i })).toBeVisible();
  await user.selectOptions(screen.getByLabelText('Default market'), 'GB');
  await user.click(screen.getByRole('button', { name: 'Start tracking' }));
  expect(screen.getByRole('heading', { name: 'What comes next?' })).toBeVisible();
  expect(JSON.parse(localStorage.getItem(key)!).settings.market).toBe('GB');
});

test('setup accepts a user-entered two-letter market', async () => {
  const user = userEvent.setup(); render(<App />);
  await user.selectOptions(screen.getByLabelText('Default market'), 'OTHER');
  await user.type(screen.getByLabelText('Two-letter country code'), 'AU');
  await user.click(screen.getByRole('button', { name: 'Start tracking' }));
  expect(JSON.parse(localStorage.getItem(key)!).settings.market).toBe('AU');
});

test('adding a series starts with unchecked releases and survives reload', async () => {
  const user = userEvent.setup();
  seed([]);
  const first = render(<App />);
  await user.click(screen.getByRole('button', { name: 'Add series' }));
  await user.type(screen.getByLabelText('Series name'), 'Example series');
  await user.type(screen.getByLabelText('Author'), 'Example author');
  await user.click(screen.getByRole('button', { name: 'Save series' }));
  expect(within(screen.getByRole('article')).getAllByText('Not checked')).toHaveLength(2);
  first.unmount();
  render(<App />);
  expect(screen.getByText('Example series')).toBeVisible();
  expect(JSON.parse(localStorage.getItem(key)!).series[0].lastFinished).toBeNull();
});

test('blank name stays in editor with a labeled error', async () => {
  const user = userEvent.setup(); seed([]); render(<App />);
  await user.click(screen.getByRole('button', { name: 'Add series' }));
  await user.type(screen.getByLabelText('Series name'), '   ');
  await user.type(screen.getByLabelText('Author'), 'Writer');
  await user.click(screen.getByRole('button', { name: 'Save series' }));
  expect(screen.getByRole('dialog', { name: 'Add series' })).toBeVisible();
  expect(screen.getByText(/series name.*required/i)).toBeVisible();
});

test('editor focuses the first field and returns focus to its opener', async () => {
  const user = userEvent.setup(); seed([]); render(<App />);
  const opener = screen.getByRole('button', { name: 'Add series' });
  await user.click(opener);
  expect(screen.getByLabelText('Series name')).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(opener).toHaveFocus();
});

test('editing release status, date, manual title and cover is visible on the card', async () => {
  const user = userEvent.setup(); seed(); render(<App />);
  await user.click(screen.getByRole('button', { name: 'Edit details' }));
  await user.clear(screen.getByLabelText('Next book title'));
  await user.type(screen.getByLabelText('Next book title'), 'The Next Volume');
  await user.selectOptions(screen.getByLabelText('Book status'), 'scheduled');
  fireEvent.change(screen.getByLabelText('Book release date'), { target: { value: '2028-03-18' } });
  await user.selectOptions(screen.getByLabelText('Audiobook status'), 'announced');
  await user.type(screen.getByLabelText('Cover URL'), 'https://example.com/cover.jpg');
  await user.click(screen.getByRole('button', { name: 'Save series' }));
  await user.click(screen.getByRole('button', { name: 'Confirm reset' }));
  expect(screen.getByText('The Next Volume')).toBeVisible();
  expect(screen.getByText('No cover available')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Edit details' }));
  await user.type(screen.getByLabelText('Cover URL'), 'https://example.com/cover.jpg');
  await user.click(screen.getByRole('button', { name: 'Save series' }));
  expect(screen.getByRole('img', { name: /cover.*The Next Volume/i })).toHaveAttribute('src', 'https://example.com/cover.jpg');
});

test('last finished and override changes require reset while reading status persists', async () => {
  const user = userEvent.setup(); seed(); render(<App />);
  await user.click(screen.getByRole('button', { name: 'Edit details' }));
  await user.selectOptions(within(screen.getByRole('dialog', { name: 'Edit series' })).getByLabelText('Reading status'), 'paused');
  fireEvent.change(screen.getByLabelText('Last finished book number'), { target: { value: '3' } });
  await user.clear(screen.getByLabelText('Last finished title'));
  await user.type(screen.getByLabelText('Last finished title'), 'Third');
  await user.click(screen.getByText('Optional progress and series details'));
  fireEvent.change(screen.getByLabelText('Next position override'), { target: { value: '3.5' } });
  await user.selectOptions(screen.getByLabelText('Audiobook status'), 'scheduled');
  fireEvent.change(screen.getByLabelText('Audiobook release date'), { target: { value: '2028-04-20' } });
  await user.click(screen.getByRole('button', { name: 'Save series' }));
  await user.click(screen.getByRole('button', { name: 'Confirm reset' }));
  const saved = JSON.parse(localStorage.getItem(key)!).series[0];
  expect(saved.readingStatus).toBe('paused');
  expect(saved.lastFinished).toEqual({ position: 3, title: 'Third' });
  expect(saved.next.positionOverride).toBe(3.5);
  expect(saved.releases.audio.state).toBe('not-checked');
});

test('audiobook schedule and date persist when next-book identity stays the same', async () => {
  const user = userEvent.setup(); seed(); render(<App />);
  await user.click(screen.getByRole('button', { name: 'Edit details' }));
  await user.selectOptions(screen.getByLabelText('Audiobook status'), 'scheduled');
  fireEvent.change(screen.getByLabelText('Audiobook release date'), { target: { value: '2028-04-20' } });
  await user.click(screen.getByRole('button', { name: 'Save series' }));
  expect(within(screen.getByRole('article')).getByText('Scheduled')).toBeVisible();
  expect(JSON.parse(localStorage.getItem(key)!).series[0].releases.audio).toMatchObject({ state: 'scheduled', date: '2028-04-20', origin: 'manual', lastCheckedAt: null });
});

test('cover lookup failure gives retry feedback while manual editor stays usable', async () => {
  const user = userEvent.setup(); seed();
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Edit details' }));
  await user.click(screen.getByRole('button', { name: 'Find cover' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/cover search failed/i);
  expect(screen.getByRole('button', { name: 'Save series' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Find cover' })).toBeEnabled();
});

test.each(['success', 'empty'] as const)('a later failed cover lookup clears %s results', async (firstResult) => {
  const user = userEvent.setup(); seed();
  let fail = false;
  vi.stubGlobal('fetch', vi.fn((url: string) => fail
    ? Promise.reject(new Error('offline'))
    : Promise.resolve({ ok: true, json: async () => url.includes('openlibrary')
      ? { docs: firstResult === 'success' ? [{ cover_i: 42 }] : [] }
      : { items: [] } })));
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Edit details' }));
  await user.click(screen.getByRole('button', { name: 'Find cover' }));
  if (firstResult === 'success') expect(await screen.findByRole('img', { name: 'Possible book cover' })).toBeVisible();
  else expect(await screen.findByText(/No covers found/)).toBeVisible();
  fail = true;
  await user.click(screen.getByRole('button', { name: 'Find cover' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/cover search failed/i);
  expect(screen.queryByRole('img', { name: 'Possible book cover' })).toBeNull();
  expect(screen.queryByText(/No covers found/)).toBeNull();
});

test('broken cover falls back while keeping its saved URL', () => {
  seed([seriesFixture({ coverUrl: 'https://example.com/broken.jpg' })]); render(<App />);
  fireEvent.error(screen.getByRole('img', { name: /cover/i }));
  expect(screen.getByText('No cover available')).toBeVisible();
  expect(JSON.parse(localStorage.getItem(key)!).series[0].coverUrl).toBe('https://example.com/broken.jpg');
});

test('search and release filters use the displayed status after local midnight', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2027, 2, 17, 23, 59, 50));
  const s = seriesFixture({ name: 'Midnight Cycle', author: 'A. Writer', releases: {
    book: { ...emptyRelease(), state: 'scheduled', date: '2027-03-18' }, audio: emptyRelease(),
  } });
  seed([s]); render(<App />);
  expect(within(screen.getByRole('article')).getByText('Scheduled')).toBeVisible();
  act(() => vi.advanceTimersByTime(20_000));
  expect(within(screen.getByRole('article')).getByText('Available')).toBeVisible();
  fireEvent.click(screen.getByText('All book statuses'));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Book availability: Available' }));
  expect(screen.getByText('Midnight Cycle')).toBeVisible();
});

test('mark finished asks for an unknown title and offers one-step undo', async () => {
  const user = userEvent.setup(); seed([seriesFixture({ next: { positionOverride: null, title: '', orderNote: '' } })]); render(<App />);
  await user.click(screen.getByRole('button', { name: 'Mark finished' }));
  await user.type(screen.getByLabelText('Finished book title'), 'Second');
  await user.click(screen.getByRole('button', { name: 'Finish book' }));
  expect(screen.getByText(/Last finished: Book 2/i)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Undo finish' }));
  expect(screen.getByText(/Last finished: Book 1/i)).toBeVisible();
  expect(JSON.parse(localStorage.getItem(key)!).series[0].next.title).toBe('');
});

test('search and reading status filter select matching cards', () => {
  seed([seriesFixture({ name: 'Amber Cycle', author: 'One' }), seriesFixture({ id: 's2', name: 'Blue Cycle', author: 'Two', readingStatus: 'paused' })]);
  render(<App />);
  fireEvent.change(screen.getByLabelText('Search series or author'), { target: { value: '  TWO  ' } });
  expect(screen.getByText('Blue Cycle')).toBeVisible();
  expect(screen.queryByText('Amber Cycle')).toBeNull();
  fireEvent.change(screen.getByLabelText('Search series or author'), { target: { value: '' } });
  fireEvent.click(screen.getByText('All reading statuses'));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Reading status: Paused' }));
  expect(screen.getByText('Blue Cycle')).toBeVisible();
  expect(screen.queryByText('Amber Cycle')).toBeNull();
});

test('multiple reading choices are OR while release group narrows the result', () => {
  seed([
    seriesFixture({ name: 'Amber Cycle', readingStatus: 'active' }),
    seriesFixture({ id: 's2', name: 'Blue Cycle', readingStatus: 'paused' }),
    seriesFixture({ id: 's3', name: 'Gray Cycle', readingStatus: 'dropped' }),
  ]);
  render(<App />);
  fireEvent.click(screen.getByText('All reading statuses'));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Reading status: Active' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Reading status: Paused' }));
  expect(screen.getByText('Amber Cycle')).toBeVisible();
  expect(screen.getByText('Blue Cycle')).toBeVisible();
  expect(screen.queryByText('Gray Cycle')).toBeNull();
  fireEvent.click(screen.getByText('All book statuses'));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Book availability: Available' }));
  expect(screen.getByRole('heading', { name: 'No matching series' })).toBeVisible();
});

test.each(['Book availability', 'Audiobook availability'] as const)('completed series do not match a %s filter when releases are hidden', (group) => {
  seed([
    seriesFixture({ name: 'Completed Cycle', readingStatus: 'completed', publicationRunComplete: true,
      releases: { book: { ...emptyRelease(), state: 'released' }, audio: { ...emptyRelease(), state: 'released' } } }),
    seriesFixture({ id: 's2', name: 'Active Cycle' }),
  ]);
  render(<App />);
  expect(screen.getByText('Completed Cycle')).toBeVisible();
  fireEvent.click(screen.getByText(group === 'Book availability' ? 'All book statuses' : 'All audiobook statuses'));
  fireEvent.click(screen.getByRole('checkbox', { name: `${group}: Available` }));
  expect(screen.getByRole('heading', { name: 'No matching series' })).toBeVisible();
});

test('delete confirmation names the series and cancel preserves it', async () => {
  const user = userEvent.setup(); seed(); render(<App />);
  await user.click(screen.getByRole('button', { name: 'Edit details' }));
  await user.click(screen.getByRole('button', { name: 'Delete series' }));
  expect(within(screen.getByRole('dialog', { name: /delete/i })).getByText(/Delete Example\?/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Cancel delete' }));
  expect(screen.getByText('Example')).toBeVisible();
});
