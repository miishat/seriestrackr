import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { emptyDocument } from '../../src/features/library/model';
import { useLibrary } from '../../src/features/library/useLibrary';
import { seriesFixture } from '../fixtures';
import { response } from './fixtures';

function mount() {
  const doc = { ...emptyDocument(), settings: { ...emptyDocument().settings, market: 'CA' }, series: [seriesFixture()] };
  localStorage.setItem('seriestrackr:v1', JSON.stringify(doc));
  return renderHook(() => useLibrary());
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

test('finish undo and equal import invalidate snapshots synchronously', () => {
  const { result } = mount();
  const snapshot = result.current.beginDiscovery('s1', 'r1');
  expect(snapshot.ok).toBe(true);
  act(() => { result.current.markFinished('s1'); result.current.undo(); });
  if (snapshot.ok) expect(result.current.isDiscoveryCurrent(snapshot.value)).toBe(false);
  const imported = result.current.beginDiscovery('s1', 'r2');
  act(() => { result.current.replaceLibrary(result.current.doc); });
  if (imported.ok) expect(result.current.isDiscoveryCurrent(imported.value)).toBe(false);
});

test('invalid edits and theme preserve guard while progress and format edits invalidate', () => {
  const { result } = mount();
  const started = result.current.beginDiscovery('s1', 'r1');
  if (started.ok === false) throw new Error(started.error);
  act(() => {
    expect(result.current.updateSeries({ ...result.current.doc.series[0], name: '' }, true).ok).toBe(false);
    result.current.updateSettings({ ...result.current.doc.settings, theme: 'dark' }, false);
  });
  expect(result.current.isDiscoveryCurrent(started.value)).toBe(true);
  act(() => { result.current.updateSeries({ ...result.current.doc.series[0], currentBook: { position: 2, title: 'Second' } }, false); });
  expect(result.current.isDiscoveryCurrent(started.value)).toBe(false);
  const formats = result.current.beginDiscovery('s1', 'r2');
  act(() => { result.current.updateSeries({ ...result.current.doc.series[0], formats: { book: true, audio: false } }, false); });
  if (formats.ok) expect(result.current.isDiscoveryCurrent(formats.value)).toBe(false);
});

test('recording check preserves accepted releases and allows acceptance, with atomic unsaved storage', () => {
  const { result } = mount();
  const started = result.current.beginDiscovery('s1', 'r1');
  if (started.ok === false) throw new Error(started.error);
  const checked = response({ seriesId: 's1' });
  const original = result.current.doc.series[0].releases;
  act(() => { expect(result.current.recordDiscoveryCheck(started.value, checked.summary).ok).toBe(true); });
  expect(result.current.doc.series[0].releases).toEqual(original);
  expect(result.current.isDiscoveryCurrent(started.value)).toBe(true);
  const save = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  act(() => { expect(result.current.acceptDiscovery(started.value, checked, { title: false, book: false, audio: false }).ok).toBe(true); });
  expect(save).not.toHaveBeenCalled();
  act(() => { expect(result.current.acceptDiscovery(started.value, checked, { title: false, book: true, audio: false }).ok).toBe(true); });
  expect(save).toHaveBeenCalledTimes(1);
  expect(result.current.mode).toBe('unsaved');
  expect(result.current.doc.series[0].releases.book.origin).toBe('discovery');
  expect(result.current.isDiscoveryCurrent(started.value)).toBe(false);
});

test('new checks supersede older checks and malformed or stale responses never write', () => {
  const { result } = mount();
  const older = result.current.beginDiscovery('s1', 'old');
  const newer = result.current.beginDiscovery('s1', 'r1');
  if (older.ok) expect(result.current.isDiscoveryCurrent(older.value)).toBe(false);
  if (newer.ok === false || older.ok === false) throw new Error('Cannot start check');
  const save = vi.spyOn(Storage.prototype, 'setItem');
  act(() => {
    expect(result.current.acceptDiscovery(older.value, response({ seriesId: 's1' }), { title: false, book: true, audio: false }).ok).toBe(false);
    const malformed = response({ seriesId: 's1' });
    malformed.proposals.releases.book!.provenance.sources[0].url = 'javascript:alert(1)';
    expect(result.current.acceptDiscovery(newer.value, malformed, { title: false, book: true, audio: false }).ok).toBe(false);
    expect(result.current.recordDiscoveryCheck(newer.value, { ...response().summary, requestId: 'wrong' }).ok).toBe(false);
  });
  expect(save).not.toHaveBeenCalled();
  expect(result.current.isDiscoveryCurrent(newer.value)).toBe(true);
});

test('default market invalidates inheriting series only while override and view remain current', () => {
  const { result } = mount();
  act(() => { result.current.replaceLibrary({ ...result.current.doc, series: [...result.current.doc.series, seriesFixture({ id: 's2', marketOverride: 'US' })] }); });
  const inherited = result.current.beginDiscovery('s1', 'first');
  const overridden = result.current.beginDiscovery('s2', 'second');
  act(() => { result.current.updateSettings({ ...result.current.doc.settings, market: 'GB', view: 'compact' }, true); });
  if (inherited.ok) expect(result.current.isDiscoveryCurrent(inherited.value)).toBe(false);
  if (overridden.ok) expect(result.current.isDiscoveryCurrent(overridden.value)).toBe(true);
});

test.each(['delete-readd', 'reset', 'market', 'override'] as const)('%s invalidates a pending proposal', command => {
  const { result } = mount();
  const started = result.current.beginDiscovery('s1', 'r1');
  act(() => {
    const before = result.current.doc;
    if (command === 'delete-readd') { result.current.deleteSeries('s1'); result.current.replaceLibrary(before); }
    if (command === 'reset') result.current.resetLibrary();
    if (command === 'market') result.current.updateSeries({ ...before.series[0], marketOverride: 'GB' }, true);
    if (command === 'override') result.current.updateSeries({ ...before.series[0], next: { ...before.series[0].next, positionOverride: 2.5 } }, true);
  });
  if (started.ok) expect(result.current.isDiscoveryCurrent(started.value)).toBe(false);
});

test('manual release edit sanitizes provenance before parsing and keeps untouched metadata', () => {
  const { result } = mount();
  const started = result.current.beginDiscovery('s1', 'r1');
  if (started.ok === false) throw new Error(started.error);
  act(() => { result.current.acceptDiscovery(started.value, response({ seriesId: 's1' }), { title: false, book: true, audio: false }); });
  const accepted = result.current.doc.series[0];
  const checking = result.current.beginDiscovery('s1', 'r2');
  act(() => {
    expect(result.current.updateSeries({ ...accepted, releases: { ...accepted.releases, book: { ...accepted.releases.book, date: '2028-01-01' } } }, false).ok).toBe(true);
  });
  expect(result.current.doc.series[0].releases.book.provenance).toBeNull();
  expect(result.current.doc.series[0].releases.book.date).toBe('2028-01-01');
  expect(result.current.doc.series[0].releases.audio).toEqual(accepted.releases.audio);
  if (checking.ok) expect(result.current.isDiscoveryCurrent(checking.value)).toBe(false);
});

test('summary writes clear finish undo but recovery operations are blocked', () => {
  const { result } = mount();
  act(() => { result.current.markFinished('s1'); });
  const started = result.current.beginDiscovery('s1', 'r1');
  if (started.ok === false) throw new Error(started.error);
  act(() => { expect(result.current.recordDiscoveryCheck(started.value, response().summary).ok).toBe(true); });
  expect(result.current.canUndo).toBe(false);
  cleanup();
  localStorage.setItem('seriestrackr:v1', '{broken');
  const recovered = renderHook(() => useLibrary());
  expect(recovered.result.current.beginDiscovery('s1', 'r1').ok).toBe(false);
  expect(recovered.result.current.acceptDiscovery(started.value, response(), { title: false, book: true, audio: false }).ok).toBe(false);
  expect(recovered.result.current.recoveryRaw).toBe('{broken');
});

test('identity and market resets clear their metadata before whole-document validation', () => {
  const { result } = mount();
  const checked = response({ seriesId: 's1' });
  checked.proposals.identity = { title: 'Second', author: 'Example Author', position: 2, citations: checked.proposals.releases.book!.citations };
  checked.proposals.identityAttribution = { checkedAt: checked.summary.checkedAt, sources: checked.proposals.releases.book!.provenance.sources };
  const started = result.current.beginDiscovery('s1', 'r1');
  if (started.ok === false) throw new Error(started.error);
  act(() => {
    result.current.recordDiscoveryCheck(started.value, checked.summary);
    result.current.acceptDiscovery(started.value, checked, { title: true, book: true, audio: false });
  });
  const accepted = result.current.doc.series[0];
  expect(accepted.next.attribution).not.toBeNull();
  act(() => { expect(result.current.updateSeries({ ...accepted, marketOverride: 'GB' }, true).ok).toBe(true); });
  expect(result.current.doc.series[0].next.attribution).toEqual(accepted.next.attribution);
  expect(result.current.doc.series[0].lastCheck).toBeNull();
  expect(result.current.doc.series[0].releases.book.provenance).toBeNull();
  act(() => { expect(result.current.updateSeries({ ...result.current.doc.series[0], next: { ...accepted.next, title: 'Manual title' } }, true).ok).toBe(true); });
  expect(result.current.doc.series[0].next.attribution).toBeNull();
  expect(result.current.doc.series[0].lastCheck).toBeNull();
});

test('market mismatch and hidden formats cannot be accepted without mutation', () => {
  const { result } = mount();
  const started = result.current.beginDiscovery('s1', 'r1');
  if (started.ok === false) throw new Error(started.error);
  const checked = response({ seriesId: 's1' });
  checked.proposals.releases.book!.provenance.preferredMarket = 'US';
  const before = JSON.stringify(result.current.doc);
  act(() => { expect(result.current.acceptDiscovery(started.value, checked, { title: false, book: true, audio: false }).ok).toBe(false); });
  expect(JSON.stringify(result.current.doc)).toBe(before);
  expect(result.current.isDiscoveryCurrent(started.value)).toBe(true);
  act(() => { result.current.updateSeries({ ...result.current.doc.series[0], formats: { book: false, audio: true } }, false); });
  const hidden = result.current.beginDiscovery('s1', 'r1');
  if (hidden.ok === false) throw new Error(hidden.error);
  act(() => { expect(result.current.acceptDiscovery(hidden.value, response({ seriesId: 's1' }), { title: false, book: true, audio: false }).ok).toBe(false); });
});

test('accepting a dialog cover with a book date can be undone without reverting the other accepted fields', () => {
  const { result } = mount();
  const priorAttribution = { title: 'Old', author: 'Example Author', role: 'next' as const, source: { id: 'o', title: 'Old', url: 'https://example.com/old' }, editionKey: null };
  act(() => { result.current.replaceLibrary({ ...result.current.doc, series: [seriesFixture({ coverUrl: 'https://example.com/old.jpg', coverAttribution: priorAttribution })] }); });
  const started = result.current.beginDiscovery('s1', 'r1');
  if (started.ok === false) throw new Error(started.error);
  const checked = response({ seriesId: 's1', coverCandidates: [{ id: 'c1', title: 'Second', author: 'Example Author', role: 'next', format: 'ebook', provider: 'openlibrary',
    source: { id: 's', title: 'Second', url: 'https://openlibrary.org/works/OL1W' }, imageUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg',
    workKey: 'second|example author', editionKey: null, width: 600, height: 900 }] });
  act(() => { expect(result.current.acceptDiscovery(started.value, checked, { title: false, book: true, audio: false, coverId: 'c1' }).ok).toBe(true); });
  expect(result.current.doc.series[0].coverUrl).toBe('https://covers.openlibrary.org/b/id/1-L.jpg');
  expect(result.current.canUndo).toBe(true);
  expect(result.current.undoKind).toBe('cover');
  act(() => { expect(result.current.undo().ok).toBe(true); });
  const restored = result.current.doc.series[0];
  expect(restored.coverUrl).toBe('https://example.com/old.jpg');
  expect(restored.coverAttribution).toEqual(priorAttribution);
  expect(restored.releases.book.origin).toBe('discovery');
  expect(result.current.canUndo).toBe(false);
});
