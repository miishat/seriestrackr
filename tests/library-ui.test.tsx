import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../src/app/App';
import { emptyDocument, emptyRelease } from '../src/features/library/model';
import { seriesFixture } from './fixtures';

const key = 'seriestrackr:v1';
test('summary counts available audiobooks including past scheduled dates', () => {
  seed([
    seriesFixture({ id: 'past', releases: { book: emptyRelease(), audio: { ...emptyRelease(), state: 'scheduled', date: '2000-01-01' } } }),
    seriesFixture({ id: 'available', releases: { book: emptyRelease(), audio: { ...emptyRelease(), state: 'released' } } }),
    seriesFixture({ id: 'future', releases: { book: emptyRelease(), audio: { ...emptyRelease(), state: 'scheduled', date: '2099-01-01' } } }),
    seriesFixture({ id: 'completed', readingStatus: 'completed', publicationRunComplete: true, releases: { book: emptyRelease(), audio: { ...emptyRelease(), state: 'released' } } }),
  ]);
  render(<App autoTrack={false} />);
  expect(screen.getByText('Next audiobook available').parentElement).toHaveTextContent('2');
});
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
  render(<App autoTrack={false} />);
  expect(screen.getByRole('dialog', { name: /which releases/i })).toBeVisible();
  await user.selectOptions(screen.getByLabelText('Default Market'), 'GB');
  await user.click(screen.getByRole('button', { name: 'Start tracking' }));
  expect(screen.getByRole('heading', { name: 'What comes next?' })).toBeVisible();
  expect(JSON.parse(localStorage.getItem(key)!).settings.market).toBe('GB');
});

test('setup accepts a user-entered two-letter market', async () => {
  const user = userEvent.setup(); render(<App autoTrack={false} />);
  await user.selectOptions(screen.getByLabelText('Default Market'), 'OTHER');
  await user.type(screen.getByLabelText('Two-letter country code'), 'AU');
  await user.click(screen.getByRole('button', { name: 'Start tracking' }));
  expect(JSON.parse(localStorage.getItem(key)!).settings.market).toBe('AU');
});

test('adding a series starts with unchecked releases and survives reload', async () => {
  const user = userEvent.setup();
  seed([]);
  const first = render(<App autoTrack={false} />);
  await user.click(screen.getByRole('button', { name: 'Add Series' }));
  await user.type(screen.getByLabelText('Name'), 'Example series');
  await user.type(screen.getByLabelText('Author'), 'Example author');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(within(screen.getByRole('article')).getAllByText('Not Checked')).toHaveLength(2);
  first.unmount();
  render(<App autoTrack={false} />);
  expect(screen.getByText('Example series')).toBeVisible();
  expect(JSON.parse(localStorage.getItem(key)!).series[0].lastFinished).toBeNull();
});

test('blank name stays in editor with a labeled error', async () => {
  const user = userEvent.setup(); seed([]); render(<App autoTrack={false} />);
  await user.click(screen.getByRole('button', { name: 'Add Series' }));
  await user.type(screen.getByLabelText('Name'), '   ');
  await user.type(screen.getByLabelText('Author'), 'Writer');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByRole('dialog', { name: 'Add Series' })).toBeVisible();
  expect(screen.getByText(/series name.*required/i)).toBeVisible();
});

test('create rejects Completed without Last finished, then saves coherent completion', async () => {
  const user = userEvent.setup(); seed([]); render(<App autoTrack={false} />);
  await user.click(screen.getByRole('button', { name: 'Add Series' }));
  await user.type(screen.getByLabelText('Name'), 'Finished Cycle');
  await user.type(screen.getByLabelText('Author'), 'Writer');
  await user.selectOptions(within(screen.getByRole('dialog', { name: 'Add Series' })).getByLabelText('Reading Status'), 'completed');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/last finished/i);
  expect(JSON.parse(localStorage.getItem(key)!).series).toHaveLength(0);
  fireEvent.change(within(screen.getByText('Last Finished', { selector: 'legend' }).closest('fieldset')!).getByLabelText('Book Number'), { target: { value: '2' } });
  await user.type(within(screen.getByText('Last Finished', { selector: 'legend' }).closest('fieldset')!).getByLabelText('Title'), 'Finale');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByText('Series completed')).toBeVisible();
  expect(JSON.parse(localStorage.getItem(key)!).series[0].lastFinished).toEqual({ position: 2, title: 'Finale' });
});

test('edit rejects Completed while a known published book remains unread', async () => {
  const user = userEvent.setup(); seed([seriesFixture({ publicationRunComplete: true, latestPublishedPosition: 2 })]); render(<App autoTrack={false} />);
  await user.click(screen.getByRole('button', { name: 'Edit Details' }));
  await user.selectOptions(within(screen.getByRole('dialog', { name: 'Edit Series' })).getByLabelText('Reading Status'), 'completed');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/last finished.*latest published/i);
  expect(JSON.parse(localStorage.getItem(key)!).series[0].readingStatus).toBe('active');
  expect(within(screen.getByRole('article')).getByText('Next unread · Book 2')).toBeVisible();
});

test('custom market stays selected and Other copy never shows the internal placeholder', async () => {
  const user = userEvent.setup(); seed([seriesFixture({ marketOverride: 'DE' })]); render(<App autoTrack={false} />);
  await user.click(screen.getByRole('button', { name: 'Edit Details' }));
  const marketSelect = screen.getByLabelText('Release Market') as HTMLSelectElement;
  expect(marketSelect.value).toBe('DE');
  expect(marketSelect.selectedOptions[0]).toHaveTextContent('DE');
  await user.selectOptions(marketSelect, 'XX');
  await user.clear(screen.getByLabelText('Other market code'));
  await user.type(screen.getByLabelText('Other market code'), 'AU');
});

test('editor focuses the first field and returns focus to its opener', async () => {
  const user = userEvent.setup(); seed([]); render(<App autoTrack={false} />);
  const opener = screen.getByRole('button', { name: 'Add Series' });
  await user.click(opener);
  expect(screen.getByLabelText('Name')).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Close' }));
  expect(opener).toHaveFocus();
});

test('editing release status, date, manual title and cover is visible on the card', async () => {
  const user = userEvent.setup(); seed(); render(<App autoTrack={false} />);
  await user.click(screen.getByRole('button', { name: 'Edit Details' }));
  await user.click(screen.getByRole('tab', { name: 'Next Book & Releases' }));
  await user.clear(within(screen.getByText('Next Unread', { selector: 'legend' }).closest('fieldset')!).getByLabelText('Title'));
  await user.type(within(screen.getByText('Next Unread', { selector: 'legend' }).closest('fieldset')!).getByLabelText('Title'), 'The Next Volume');
  await user.selectOptions(within(screen.getByText('Book Release', { selector: 'legend' }).closest('fieldset')!).getByLabelText('Status'), 'scheduled');
  fireEvent.change(within(screen.getByText('Book Release', { selector: 'legend' }).closest('fieldset')!).getByLabelText('Release Date'), { target: { value: '2028-03-18' } });
  await user.selectOptions(within(screen.getByText('Audiobook Release', { selector: 'legend' }).closest('fieldset')!).getByLabelText('Status'), 'announced');
  await user.click(screen.getByRole('tab', { name: 'Cover & Notes' }));
  await user.type(screen.getByLabelText('Cover URL'), 'https://example.com/cover.jpg');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await user.click(screen.getByRole('button', { name: 'Confirm reset' }));
  expect(screen.getByText('The Next Volume')).toBeVisible();
  expect(screen.getByRole('img', { name: /cover.*The Next Volume/i })).toHaveAttribute('src', 'https://example.com/cover.jpg');
});

test('last finished and override changes require reset while reading status persists', async () => {
  const user = userEvent.setup(); seed(); render(<App autoTrack={false} />);
  await user.click(screen.getByRole('button', { name: 'Edit Details' }));
  await user.selectOptions(within(screen.getByRole('dialog', { name: 'Edit Series' })).getByLabelText('Reading Status'), 'paused');
  fireEvent.change(within(screen.getByText('Last Finished', { selector: 'legend' }).closest('fieldset')!).getByLabelText('Book Number'), { target: { value: '3' } });
  await user.clear(within(screen.getByText('Last Finished', { selector: 'legend' }).closest('fieldset')!).getByLabelText('Title'));
  await user.type(within(screen.getByText('Last Finished', { selector: 'legend' }).closest('fieldset')!).getByLabelText('Title'), 'Third');
  await user.click(screen.getByRole('tab', { name: 'Next Book & Releases' }));
  await user.selectOptions(within(screen.getByText('Audiobook Release', { selector: 'legend' }).closest('fieldset')!).getByLabelText('Status'), 'scheduled');
  fireEvent.change(within(screen.getByText('Audiobook Release', { selector: 'legend' }).closest('fieldset')!).getByLabelText('Release Date'), { target: { value: '2028-04-20' } });
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await user.click(screen.getByRole('button', { name: 'Confirm reset' }));
  const saved = JSON.parse(localStorage.getItem(key)!).series[0];
  expect(saved.readingStatus).toBe('paused');
  expect(saved.lastFinished).toEqual({ position: 3, title: 'Third' });
  expect(saved.next.positionOverride).toBeNull();
  expect(saved.releases.audio.state).toBe('not-checked');
});

test('audiobook schedule and date persist when next-book identity stays the same', async () => {
  const user = userEvent.setup(); seed(); render(<App autoTrack={false} />);
  await user.click(screen.getByRole('button', { name: 'Edit Details' }));
  await user.click(screen.getByRole('tab', { name: 'Next Book & Releases' }));
  await user.selectOptions(within(screen.getByText('Audiobook Release', { selector: 'legend' }).closest('fieldset')!).getByLabelText('Status'), 'scheduled');
  fireEvent.change(within(screen.getByText('Audiobook Release', { selector: 'legend' }).closest('fieldset')!).getByLabelText('Release Date'), { target: { value: '2028-04-20' } });
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(within(screen.getByRole('article')).getByText('Scheduled')).toBeVisible();
  expect(JSON.parse(localStorage.getItem(key)!).series[0].releases.audio).toMatchObject({ state: 'scheduled', date: '2028-04-20', origin: 'manual', lastCheckedAt: null });
});

const coverReply = (body: unknown) => ({ ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => body });
const coverBody = (init: { candidates?: unknown[]; outcomes?: unknown[] } = {}) => ({ requestId: '', seriesId: 's1', candidates: init.candidates ?? [], authorSuggestions: [],
  outcomes: init.outcomes ?? [{ provider: 'openlibrary', state: 'no-match' }] });
const serviceCover = { id: 'c1', title: 'Second', author: 'Example Author', role: 'next', format: 'ebook', provider: 'openlibrary',
  source: { id: 's', title: 'Second', url: 'https://openlibrary.org/works/OL1W' }, imageUrl: 'https://covers.openlibrary.org/b/id/42-L.jpg',
  workKey: 'second|example author', editionKey: null, width: null, height: null };
function stubCoverService(respond: (body: { requestId: string }) => unknown) {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const request = JSON.parse(String(init.body));
    return respond(request) === 'offline' ? Promise.reject(new Error('offline')) : coverReply({ ...(respond(request) as object), requestId: request.requestId, seriesId: request.seriesId });
  }));
}
function stubImage() {
  vi.stubGlobal('Image', class {
    naturalWidth = 600; naturalHeight = 900; onload: (() => void) | null = null; onerror: (() => void) | null = null;
    set src(value: string) { if (value) queueMicrotask(() => this.onload?.()); }
  });
}

test('cover lookup failure gives retry feedback while manual editor stays usable', async () => {
  const user = userEvent.setup(); seed();
  stubCoverService(() => 'offline');
  render(<App autoTrack={false} />);
  await user.click(screen.getByRole('button', { name: 'Edit Details' }));
  await user.click(screen.getByRole('tab', { name: 'Cover & Notes' }));
  await user.click(screen.getByRole('button', { name: 'Find Cover' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/cover service is unavailable|cover search failed/i);
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Find Cover' })).toBeEnabled();
});

test('partial cover provider failure with no results warns that lookup was incomplete', async () => {
  const user = userEvent.setup(); seed();
  stubCoverService(() => coverBody({ outcomes: [{ provider: 'openlibrary', state: 'failed' }, { provider: 'googlebooks', state: 'no-match' }] }));
  render(<App autoTrack={false} />);
  await user.click(screen.getByRole('button', { name: 'Edit Details' }));
  await user.click(screen.getByRole('tab', { name: 'Cover & Notes' }));
  await user.click(screen.getByRole('button', { name: 'Find Cover' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/incomplete/i);
  expect(screen.queryByText(/No covers found/)).toBeNull();
});

test.each(['success', 'empty'] as const)('a later failed cover lookup clears %s results', async (firstResult) => {
  const user = userEvent.setup(); seed();
  let fail = false;
  stubImage();
  stubCoverService(() => fail ? 'offline' : coverBody({ candidates: firstResult === 'success' ? [serviceCover] : [] }));
  render(<App autoTrack={false} />);
  await user.click(screen.getByRole('button', { name: 'Edit Details' }));
  await user.click(screen.getByRole('tab', { name: 'Cover & Notes' }));
  await user.click(screen.getByRole('button', { name: 'Find Cover' }));
  if (firstResult === 'success') expect(await screen.findByRole('button', { name: /Select cover: Second by Example Author/ })).toBeVisible();
  else expect(await screen.findByText(/No covers found/)).toBeVisible();
  fail = true;
  await user.click(screen.getByRole('tab', { name: 'Cover & Notes' }));
  await user.click(screen.getByRole('button', { name: 'Find Cover' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/cover service is unavailable|cover search failed/i);
  expect(screen.queryByRole('button', { name: /Select cover/ })).toBeNull();
  expect(screen.queryByText(/No covers found/)).toBeNull();
});

test('broken cover falls back while keeping its saved URL', () => {
  seed([seriesFixture({ coverUrl: 'https://example.com/broken.jpg' })]); render(<App autoTrack={false} />);
  fireEvent.error(screen.getByRole('img', { name: /cover/i }));
  expect(screen.getByText('No cover available')).toBeVisible();
  expect(JSON.parse(localStorage.getItem(key)!).series[0].coverUrl).toBe('https://example.com/broken.jpg');
});

test('compact poster leads with series name and shows next book separately', async () => {
  seed(); render(<App autoTrack={false} />);
  await userEvent.click(screen.getByRole('button', { name: 'Compact' }));
  const card = screen.getByRole('article');
  expect(within(card).getByRole('heading', { name: 'Example' })).toBeVisible();
  expect(within(card).getAllByText('Second').some(element => !element.closest('details'))).toBe(true);
  expect(within(card).getByText('Example Author')).toBeVisible();
  expect(within(card).getByText('Book 1: First')).toBeVisible();
  expect(card.querySelectorAll('.compact-last-read')).toHaveLength(1);
  expect(card.querySelector(':scope > .compact-last-read')).toBeNull();
  expect(within(card).getByText('Next unread · Book 2')).toBeVisible();
  expect(within(card).queryByText('Last finished: Book 1: First')).toBeNull();
  await userEvent.click(within(card).getByText('Release Details'));
  expect(within(card).queryByText('Last finished: Book 1: First')).toBeNull();
  expect(within(card).getByRole('button', { name: 'Check Releases' })).toBeEnabled();
});

test('announced release shows Announced with Date Unknown where the date appears', async () => {
  seed([seriesFixture({ releases: { book: { ...emptyRelease(), state: 'announced' }, audio: emptyRelease() } })]);
  render(<App autoTrack={false} />);
  const card = screen.getByRole('article');
  expect(within(card).getByText('Announced')).toBeVisible();
  expect(within(card).getByText('Date Unknown')).toBeVisible();
});

test('compact source link uses the saved book title and preserves source details', async () => {
  const source = { title: 'Second: The Third Tale of Witness', url: 'https://example.com/audio' };
  seed([seriesFixture({ releases: { book: emptyRelease(), audio: { ...emptyRelease(), state: 'released', source } } })]);
  render(<App autoTrack={false} />);
  await userEvent.click(screen.getByRole('button', { name: 'Compact' }));
  const card = screen.getByRole('article');
  const link = within(card).getAllByRole('link', { name: 'Second' }).find(element => !element.closest('details'))!;
  expect(link).toHaveAttribute('href', source.url);
  expect(link).toHaveAttribute('title', source.title);
  await userEvent.click(within(card).getByText('Release Details'));
  expect(within(card).getAllByRole('link', { name: 'Second' }).every(element => element.title === source.title)).toBe(true);
});

test('search and release filters use the displayed status after local midnight', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2027, 2, 17, 23, 59, 50));
  const s = seriesFixture({ name: 'Midnight Cycle', author: 'A. Writer', releases: {
    book: { ...emptyRelease(), state: 'scheduled', date: '2027-03-18' }, audio: emptyRelease(),
  } });
  seed([s]); render(<App autoTrack={false} />);
  expect(within(screen.getByRole('article')).getByText('Scheduled')).toBeVisible();
  act(() => vi.advanceTimersByTime(20_000));
  expect(within(screen.getByRole('article')).getByText('Available')).toBeVisible();
  fireEvent.click(screen.getByText('All book statuses'));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Book availability: Available' }));
  expect(screen.getByText('Midnight Cycle')).toBeVisible();
});

test('mark finished asks for an unknown title and offers one-step undo', async () => {
  const user = userEvent.setup(); seed([seriesFixture({ next: { positionOverride: null, title: '', orderNote: '', attribution: null } })]); render(<App autoTrack={false} />);
  await user.click(screen.getByRole('button', { name: 'Mark Finished' }));
  await user.type(screen.getByLabelText('Finished book title'), 'Second');
  await user.click(screen.getByRole('button', { name: 'Finish book' }));
  expect(screen.getByText(/Last finished: Book 2/i)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Undo finish' }));
  expect(screen.getByText(/Last finished: Book 1/i)).toBeVisible();
  expect(JSON.parse(localStorage.getItem(key)!).series[0].next.title).toBe('');
});

test('search and reading status filter select matching cards', () => {
  seed([seriesFixture({ name: 'Amber Cycle', author: 'One' }), seriesFixture({ id: 's2', name: 'Blue Cycle', author: 'Two', readingStatus: 'paused' })]);
  render(<App autoTrack={false} />);
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
  render(<App autoTrack={false} />);
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
  render(<App autoTrack={false} />);
  expect(screen.getByText('Completed Cycle')).toBeVisible();
  fireEvent.click(screen.getByText(group === 'Book availability' ? 'All book statuses' : 'All audiobook statuses'));
  fireEvent.click(screen.getByRole('checkbox', { name: `${group}: Available` }));
  expect(screen.getByRole('heading', { name: 'No matching series' })).toBeVisible();
});

test('delete confirmation names the series and cancel preserves it', async () => {
  const user = userEvent.setup(); seed(); render(<App autoTrack={false} />);
  await user.click(screen.getByRole('button', { name: 'Edit Details' }));
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(within(screen.getByRole('dialog', { name: /delete/i })).getByText(/Delete Example\?/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Cancel delete' }));
  expect(screen.getByText('Example')).toBeVisible();
});

test('release details open and close together across grid and compact cards', async () => {
  seed([seriesFixture(), seriesFixture({ id: 's2', name: 'Another series' })]);
  render(<App autoTrack={false} />);
  const user = userEvent.setup();
  await user.click(screen.getAllByText('Release Details')[0]);
  expect([...document.querySelectorAll<HTMLDetailsElement>('.grid-release-details')].every(details => details.open)).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Compact' }));
  expect([...document.querySelectorAll<HTMLDetailsElement>('.grid-release-details')].every(details => details.open)).toBe(true);
  await user.click(screen.getAllByText('Release Details')[1]);
  expect([...document.querySelectorAll<HTMLDetailsElement>('.grid-release-details')].every(details => !details.open)).toBe(true);
});
