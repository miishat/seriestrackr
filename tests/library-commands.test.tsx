import { StrictMode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { emptyDocument, emptyRelease } from '../src/features/library/model';
import type { LibraryDocument, Series } from '../src/features/library/model';
import { useLibrary } from '../src/features/library/useLibrary';
import { seriesFixture } from './fixtures';

const key = 'seriestrackr:v1';
const dated = () => ({
  book: { ...emptyRelease(), state: 'scheduled' as const, date: '2027-03-01' },
  audio: { ...emptyRelease(), state: 'released' as const, date: '2027-02-01' },
});

function seeded(series: Series[] = [seriesFixture()]): LibraryDocument {
  return { ...emptyDocument(), settings: { ...emptyDocument().settings, market: 'CA' }, series };
}

function newSeries(overrides: Partial<Series> = {}): Omit<Series, 'id'> {
  const { id: _id, ...input } = seriesFixture(overrides);
  return input;
}

function mount(doc: LibraryDocument = seeded()) {
  window.localStorage.setItem(key, JSON.stringify(doc));
  return renderHook(() => useLibrary(), { wrapper: StrictMode });
}

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); });

test('finishing and undo restore the complete previous document and clear cover with next identity', () => {
  const original = seeded([seriesFixture({ coverUrl: 'https://example.com/next.jpg', releases: dated(), currentBook: { position: 2, title: 'Second' } })]);
  const { result } = mount(original);
  expect(result.current.mode).toBe('ready');
  act(() => { expect(result.current.markFinished('s1').ok).toBe(true); });
  expect(result.current.doc.series[0]).toMatchObject({
    lastFinished: { position: 2, title: 'Second' }, currentBook: null, coverUrl: null,
    releases: { book: emptyRelease(), audio: emptyRelease() },
  });
  expect(result.current.canUndo).toBe(true);
  act(() => { expect(result.current.undo().ok).toBe(true); });
  expect(JSON.stringify(result.current.doc)).toBe(JSON.stringify(original));
  expect(result.current.canUndo).toBe(false);
});

test.each(['edit', 'add', 'delete', 'import', 'reset', 'settings'] as const)(
  '%s after finishing invalidates undo', (command) => {
    const { result } = mount();
    act(() => { expect(result.current.markFinished('s1').ok).toBe(true); });
    expect(result.current.canUndo).toBe(true);
    act(() => {
      let outcome;
      switch (command) {
        case 'edit': outcome = result.current.updateSeries({ ...result.current.doc.series[0], readingStatus: 'paused' }, false); break;
        case 'add': outcome = result.current.addSeries(newSeries({ name: 'Another' })); break;
        case 'delete': outcome = result.current.deleteSeries('s1'); break;
        case 'import': outcome = result.current.replaceLibrary(seeded()); break;
        case 'reset': outcome = result.current.resetLibrary(); break;
        case 'settings': outcome = result.current.updateSettings({ ...result.current.doc.settings, theme: 'dark' }, false); break;
      }
      expect(outcome.ok).toBe(true);
    });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.undo().ok).toBe(false);
  },
);

test('invalid domain update leaves both data and undo intact', () => {
  const { result } = mount();
  act(() => { result.current.markFinished('s1'); });
  const before = JSON.stringify(result.current.doc);
  act(() => {
    const outcome = result.current.updateSeries({ ...result.current.doc.series[0], name: ' ' }, true);
    expect(outcome.ok).toBe(false);
  });
  expect(JSON.stringify(result.current.doc)).toBe(before);
  expect(result.current.canUndo).toBe(true);
});

test('quota failure retains changed state and undo in memory', () => {
  const { result } = mount();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });
  act(() => { expect(result.current.markFinished('s1').ok).toBe(true); });
  expect(result.current.doc.series[0].lastFinished?.position).toBe(2);
  expect(result.current.mode).toBe('unsaved');
  expect(result.current.error).toMatch(/quota exceeded/);
  expect(result.current.canUndo).toBe(true);
  act(() => { expect(result.current.undo().ok).toBe(true); });
  expect(result.current.doc.series[0].lastFinished?.position).toBe(1);
  expect(result.current.mode).toBe('unsaved');
});

test('unavailable storage starts an editable unsaved document', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage denied'); });
  const { result } = renderHook(() => useLibrary(), { wrapper: StrictMode });
  expect(result.current.mode).toBe('unsaved');
  expect(result.current.error).toMatch(/storage denied/);
  act(() => { expect(result.current.addSeries(newSeries()).ok).toBe(true); });
  expect(result.current.doc.series).toHaveLength(1);
  expect(result.current.mode).toBe('ready');
});

test('identity changes require confirmation and reset release metadata but keep a legacy manual cover; a cover edit retains dates', () => {
  const original = seriesFixture({ coverUrl: 'https://example.com/next.jpg', releases: dated() });
  const { result } = mount(seeded([original]));
  act(() => { expect(result.current.updateSeries({ ...original, coverUrl: 'https://example.com/replacement.jpg' }, false).ok).toBe(true); });
  expect(result.current.doc.series[0].releases).toEqual(dated());
  const changed = { ...result.current.doc.series[0], lastFinished: { position: 2, title: 'Second' } };
  act(() => {
    const outcome = result.current.updateSeries(changed, false);
    expect(outcome.ok).toBe(false);
    if (outcome.ok === false) expect(outcome.error).toMatch(/confirm|reset/i);
  });
  expect(result.current.doc.series[0].releases).toEqual(dated());
  act(() => { expect(result.current.updateSeries(changed, true).ok).toBe(true); });
  expect(result.current.doc.series[0].releases).toEqual({ book: emptyRelease(), audio: emptyRelease() });
  expect(result.current.doc.series[0].coverUrl).toBe('https://example.com/replacement.jpg');
});

test('next-book identity and effective market changes use distinct cover behavior', () => {
  const original = seriesFixture({ coverUrl: 'https://example.com/next.jpg', releases: dated(), marketOverride: 'US' });
  const { result } = mount(seeded([original]));
  act(() => { expect(result.current.updateSeries({ ...original, marketOverride: 'GB' }, false).ok).toBe(false); });
  act(() => { expect(result.current.updateSeries({ ...original, marketOverride: 'GB' }, true).ok).toBe(true); });
  expect(result.current.doc.series[0].coverUrl).toBe(original.coverUrl);
  expect(result.current.doc.series[0].releases).toEqual({ book: emptyRelease(), audio: emptyRelease() });
  const withDates = { ...result.current.doc.series[0], releases: dated() };
  act(() => { expect(result.current.updateSeries(withDates, false).ok).toBe(true); });
  act(() => { expect(result.current.updateSeries({ ...withDates, next: { ...withDates.next, orderNote: 'alternate order' } }, false).ok).toBe(false); });
  act(() => { expect(result.current.updateSeries({ ...withDates, next: { ...withDates.next, orderNote: 'alternate order' } }, true).ok).toBe(true); });
  expect(result.current.doc.series[0].coverUrl).toBe(original.coverUrl);
  expect(result.current.doc.series[0].releases).toEqual({ book: emptyRelease(), audio: emptyRelease() });
});

test('default market resets inheriting records only and requires confirmation when affected', () => {
  const inherited = seriesFixture({ releases: dated(), coverUrl: 'https://example.com/next.jpg' });
  const overridden = seriesFixture({ id: 's2', marketOverride: 'US', releases: dated() });
  const { result } = mount(seeded([inherited, overridden]));
  const changed = { ...result.current.doc.settings, market: 'GB' };
  act(() => { expect(result.current.updateSettings(changed, false).ok).toBe(false); });
  expect(result.current.doc.settings.market).toBe('CA');
  act(() => { expect(result.current.updateSettings(changed, true).ok).toBe(true); });
  expect(result.current.doc.series[0].releases).toEqual({ book: emptyRelease(), audio: emptyRelease() });
  expect(result.current.doc.series[0].coverUrl).toBe(inherited.coverUrl);
  expect(result.current.doc.series[1].releases).toEqual(dated());
});

test('completed status requires publication completion and clears current book', () => {
  const original = seriesFixture({ currentBook: { position: 2, title: 'Second' } });
  const { result } = mount(seeded([original]));
  act(() => { expect(result.current.updateSeries({ ...original, readingStatus: 'completed' }, false).ok).toBe(false); });
  expect(result.current.doc.series[0].currentBook).toEqual(original.currentBook);
  act(() => { expect(result.current.updateSeries({ ...original, readingStatus: 'completed', publicationRunComplete: true }, false).ok).toBe(true); });
  expect(result.current.doc.series[0].currentBook).toBeNull();
});

test('changing format visibility retains hidden release data and deliberate overrides', () => {
  const original = seriesFixture({ releases: dated(), next: { positionOverride: 2.5, title: 'Interlude', orderNote: 'side story', attribution: null } });
  const { result } = mount(seeded([original]));
  act(() => {
    expect(result.current.updateSeries({ ...original, formats: { book: false, audio: true } }, false).ok).toBe(true);
  });
  expect(result.current.doc.series[0].releases).toEqual(dated());
  act(() => {
    expect(result.current.updateSeries({ ...result.current.doc.series[0], next: { ...original.next, orderNote: 'revised side story' } }, true).ok).toBe(true);
  });
  expect(result.current.doc.series[0].next).toEqual({ positionOverride: 2.5, title: 'Interlude', orderNote: 'revised side story', attribution: null });
  expect(result.current.doc.series[0].releases).toEqual({ book: emptyRelease(), audio: emptyRelease() });
  act(() => {
    expect(result.current.updateSeries({ ...result.current.doc.series[0], formats: { book: true, audio: false }, releases: dated() }, false).ok).toBe(true);
  });
  expect(result.current.doc.series[0].releases).toEqual(dated());
});

test('a failed finish leaves an earlier undo available', () => {
  const { result } = mount(seeded([seriesFixture(), seriesFixture({ id: 's2', next: { positionOverride: null, title: '', orderNote: '', attribution: null } })]));
  act(() => { expect(result.current.markFinished('s1').ok).toBe(true); });
  act(() => { expect(result.current.markFinished('s2').ok).toBe(false); });
  expect(result.current.canUndo).toBe(true);
});

test('consecutive calls in one act use the latest document', () => {
  const { result } = mount();
  act(() => {
    expect(result.current.updateSettings({ ...result.current.doc.settings, theme: 'dark' }, false).ok).toBe(true);
    expect(result.current.addSeries(newSeries({ name: 'Another' })).ok).toBe(true);
  });
  expect(result.current.doc.settings.theme).toBe('dark');
  expect(result.current.doc.series).toHaveLength(2);
});

test('recovery blocks ordinary commands until import or reset and preserves the raw text', () => {
  window.localStorage.setItem(key, '{broken');
  const { result } = renderHook(() => useLibrary(), { wrapper: StrictMode });
  expect(result.current.mode).toBe('recovery');
  expect(result.current.recoveryRaw).toBe('{broken');
  act(() => { expect(result.current.addSeries(newSeries()).ok).toBe(false); });
  expect(result.current.mode).toBe('recovery');
  act(() => { expect(result.current.replaceLibrary(seeded()).ok).toBe(true); });
  expect(result.current.mode).toBe('ready');
  expect(result.current.recoveryRaw).toBeNull();
});

test('failed recovery reset keeps original raw text available for download', () => {
  window.localStorage.setItem(key, '{broken');
  const { result } = renderHook(() => useLibrary());
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });
  act(() => { expect(result.current.resetLibrary().ok).toBe(true); });
  expect(result.current.mode).toBe('unsaved');
  expect(result.current.recoveryRaw).toBe('{broken');
});

const attribution = { title: 'Second', author: 'Example Author', role: 'next' as const,
  source: { id: 's', title: 'Second', url: 'https://openlibrary.org/works/OL1W' }, editionKey: null };

test('finishing clears the cover URL and attribution together', () => {
  const { result } = mount(seeded([seriesFixture({ coverUrl: 'https://example.com/a.jpg', coverAttribution: attribution })]));
  act(() => { expect(result.current.markFinished('s1').ok).toBe(true); });
  expect(result.current.doc.series[0]).toMatchObject({ coverUrl: null, coverAttribution: null });
});

test.each([
  ['title', (s: Series) => ({ ...s, next: { ...s.next, title: 'Other', attribution: null } })],
  ['author', (s: Series) => ({ ...s, author: 'Someone Else' })],
  ['progress', (s: Series) => ({ ...s, lastFinished: { position: 2, title: 'Second' } })],
])('a %s change clears an automatic target cover', (_name, edit) => {
  const original = seriesFixture({ coverUrl: 'https://example.com/a.jpg', coverAttribution: attribution });
  const { result } = mount(seeded([original]));
  act(() => { expect(result.current.updateSeries(edit(original), true).ok).toBe(true); });
  expect(result.current.doc.series[0]).toMatchObject({ coverUrl: null, coverAttribution: null });
});

test('a legacy manual cover survives an identity change but a changed manual URL is kept', () => {
  const original = seriesFixture({ coverUrl: 'https://example.com/manual.jpg' });
  const { result } = mount(seeded([original]));
  act(() => { expect(result.current.updateSeries({ ...original, author: 'Someone Else' }, true).ok).toBe(true); });
  expect(result.current.doc.series[0].coverUrl).toBe('https://example.com/manual.jpg');
});

test('picking a new cover during a title edit keeps the new automatic cover', () => {
  const original = seriesFixture({ coverUrl: 'https://example.com/a.jpg', coverAttribution: attribution });
  const { result } = mount(seeded([original]));
  const picked = { ...attribution, title: 'Other' };
  act(() => { expect(result.current.updateSeries({ ...original, next: { ...original.next, title: 'Other' },
    coverUrl: 'https://example.com/b.jpg', coverAttribution: picked }, true).ok).toBe(true); });
  expect(result.current.doc.series[0]).toMatchObject({ coverUrl: 'https://example.com/b.jpg', coverAttribution: picked });
});

test('failed v2 recovery import retains recoveryRaw and the stored bytes', () => {
  const raw = JSON.stringify({ version: 2, settings: 'broken', series: [] });
  window.localStorage.setItem(key, raw);
  const { result } = renderHook(() => useLibrary(), { wrapper: StrictMode });
  expect(result.current.mode).toBe('recovery');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  act(() => { expect(result.current.replaceLibrary(seeded([seriesFixture()])).ok).toBe(true); });
  expect(result.current.mode).toBe('unsaved');
  expect(result.current.recoveryRaw).toBe(raw);
  expect(window.localStorage.getItem(key)).toBe(raw);
});

test('a saved identity change clears an attributed cover that targets another title even when it was picked this session', () => {
  const original = seriesFixture({ coverUrl: 'https://example.com/a.jpg', coverAttribution: attribution });
  const { result } = mount(seeded([original]));
  const stale = { ...attribution, title: 'Elsewhere', source: { ...attribution.source, id: 'z' } };
  act(() => { expect(result.current.updateSeries({ ...original, author: 'Someone Else',
    coverUrl: 'https://example.com/z.jpg', coverAttribution: stale }, true).ok).toBe(true); });
  expect(result.current.doc.series[0]).toMatchObject({ coverUrl: null, coverAttribution: null });
});

test('setAutomaticCover fills an empty cover only while the identity is unchanged', () => {
  const { result } = mount(seeded([]));
  let created!: Series;
  act(() => { const added = result.current.addSeries(newSeries()); if (added.ok) created = added.value; });
  const attribution = { title: created.next.title, author: created.author, role: 'next' as const, source: { id: 'h', title: 'Hardcover', url: 'https://hardcover.app/books/x' }, editionKey: null };
  act(() => { expect(result.current.setAutomaticCover(created, 'https://assets.hardcover.app/x.jpg', attribution).ok).toBe(true); });
  expect(result.current.doc.series.find(s => s.id === created.id)?.coverUrl).toBe('https://assets.hardcover.app/x.jpg');
  act(() => { expect(result.current.setAutomaticCover(created, 'https://assets.hardcover.app/y.jpg', attribution).ok).toBe(false); });
});
