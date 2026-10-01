import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { SeriesForm } from '../../src/features/library/SeriesForm';
import { loadLibrary } from '../../src/storage/libraryStorage';
import { emptyDocument, emptyRelease } from '../../src/features/library/model';
import type { LibraryDocument } from '../../src/features/library/model';
import { parseDocument } from '../../src/features/library/validation';
import { decodeBackup, encodeBackup } from '../../src/storage/backup';
import { seriesFixture } from '../fixtures';
import { response } from './fixtures';

afterEach(cleanup);

test('loads version 1 into version 2 memory without rewriting raw storage', () => {
  const raw = JSON.stringify({ version: 1, settings: { market: 'CA', language: 'en',
    theme: 'light', view: 'grid', showCovers: true }, series: [] });
  const setItem = vi.fn();
  const getItem = vi.fn(() => raw);
  const loaded = loadLibrary({ getItem, setItem } as unknown as Storage);
  expect(loaded).toMatchObject({ kind: 'ready', doc: { version: 2, series: [] } });
  expect(getItem).toHaveBeenCalledExactlyOnceWith('seriestrackr:v1');
  expect(setItem).not.toHaveBeenCalled();
});

function acceptedDocument(): LibraryDocument {
  const checked = response();
  const proposal = checked.proposals.releases.book!;
  const primary = proposal.provenance.sources[0];
  return { ...emptyDocument(), settings: { ...emptyDocument().settings, market: 'CA' }, series: [seriesFixture({
    next: { positionOverride: null, title: 'Second', orderNote: '', attribution: { checkedAt: checked.summary.checkedAt, sources: checked.sources } },
    lastCheck: checked.summary,
    releases: { book: { state: proposal.state, date: proposal.date, source: { title: primary.title, url: primary.url },
      origin: 'discovery', lastCheckedAt: proposal.provenance.checkedAt, provenance: proposal.provenance }, audio: emptyRelease() },
  })] };
}

test('populated legacy fields and preferences survive migration without invented checks or writes', () => {
  const legacySeries = seriesFixture({ id: 'legacy-id', marketOverride: 'GB',
    coverUrl: 'https://example.com/cover.jpg', currentBook: { position: 2, title: 'Second' },
    releases: { book: { ...emptyRelease(), state: 'scheduled', date: '2027-03-01',
      source: { title: 'Manual publisher', url: 'https://example.com/manual' }, lastCheckedAt: '2025-01-01T00:00:00Z' },
    audio: { ...emptyRelease(), state: 'announced', origin: 'discovery', lastCheckedAt: '2025-02-01T00:00:00Z' } },
  });
  const { lastCheck, ...oldSeries } = legacySeries;
  const { attribution, ...oldNext } = oldSeries.next;
  const { provenance: bookProvenance, ...oldBook } = oldSeries.releases.book;
  const { provenance: audioProvenance, ...oldAudio } = oldSeries.releases.audio;
  expect([lastCheck, attribution, bookProvenance, audioProvenance]).toEqual([null, null, null, null]);
  const settings = { market: 'CA', language: 'en', theme: 'dark', view: 'list', showCovers: false };
  const legacy = { version: 1, settings, series: [{ ...oldSeries, next: oldNext, releases: { book: oldBook, audio: oldAudio } }] };
  const raw = JSON.stringify(legacy, null, 2);
  const setItem = vi.fn();
  const loaded = loadLibrary({ getItem: () => raw, setItem } as unknown as Storage);
  expect(loaded).toEqual({ kind: 'ready', doc: { version: 2, settings, series: [legacySeries] } });
  expect(setItem).not.toHaveBeenCalled();
  expect(decodeBackup(raw)).toEqual({ ok: true, value: { version: 2, settings, series: [legacySeries] } });
});

test('version 2 attribution, provenance and history round trip through backup', () => {
  const document = acceptedDocument();
  expect(decodeBackup(encodeBackup(document))).toEqual({ ok: true, value: document });
});

test('version 2 requires all metadata slots rather than silently erasing malformed metadata', () => {
  for (const field of ['lastCheck', 'attribution', 'provenance']) {
    const document = structuredClone(acceptedDocument());
    const item = document.series[0];
    const target = field === 'lastCheck' ? item : field === 'attribution' ? item.next : item.releases.book;
    delete (target as unknown as Record<string, unknown>)[field];
    expect(parseDocument(document).ok).toBe(false);
  }
  const document = acceptedDocument();
  expect(parseDocument({ ...document, series: [{ ...document.series[0], lastCheck: { checkedAt: 'today' } }] }).ok).toBe(false);
});

test('version 2 rejects unsafe and incoherent release provenance', () => {
  for (const patch of [
    { sourceMarket: 'ca' }, { preferredMarket: 'US' }, { editionFormat: 'audio' }, { datePrecision: 'month' },
    { checkedAt: '2026-09-29T13:00:00Z' }, { sources: [] },
    { sources: [{ id: 's1', title: 'Second', url: 'http://127.0.0.1/private' }] },
    { sources: [{ id: 's1', title: 'Second', url: 'javascript:alert(1)' }] },
    { sources: [{ id: 's1', title: 'Wrong primary source', url: 'https://example.com/second' }] },
    { rawText: 'unaccepted retrieved content' },
  ]) {
    const document = structuredClone(acceptedDocument());
    Object.assign(document.series[0].releases.book.provenance!, patch);
    expect(parseDocument(document).ok).toBe(false);
  }
  for (const patch of [{ origin: 'manual' }, { state: 'not-found', date: null }, { date: null }]) {
    const document = structuredClone(acceptedDocument());
    Object.assign(document.series[0].releases.book, patch);
    expect(parseDocument(document).ok).toBe(false);
  }
});

test('legacy malformed input remains downloadable raw recovery data', () => {
  const raw = JSON.stringify({ ...emptyDocument(), version: 1, series: [{ id: 'broken' }] }, null, 2);
  const setItem = vi.fn();
  expect(loadLibrary({ getItem: () => raw, setItem } as unknown as Storage)).toMatchObject({ kind: 'recovery', raw });
  expect(setItem).not.toHaveBeenCalled();
});

test('opening and saving the manual form preserves attribution and provenance', () => {
  const original = acceptedDocument().series[0];
  const onUpdate = vi.fn();
  render(createElement(SeriesForm, { series: original, market: 'CA', onUpdate, onCreate: vi.fn(), onCancel: vi.fn() }));
  fireEvent.click(screen.getByRole('button', { name: 'Save series' }));
  expect(onUpdate).toHaveBeenCalledExactlyOnceWith(original);
});

test('manual title and book edits clear only their metadata while preserving audio and history', () => {
  const original = acceptedDocument().series[0];
  original.releases.audio = structuredClone(original.releases.book);
  original.releases.audio.provenance!.editionFormat = 'audio';
  const onUpdate = vi.fn();
  render(createElement(SeriesForm, { series: original, market: 'CA', onUpdate, onCreate: vi.fn(), onCancel: vi.fn() }));
  fireEvent.change(screen.getByLabelText('Next book title'), { target: { value: 'Manual title' } });
  fireEvent.change(screen.getByLabelText('Book release date'), { target: { value: '2027-04-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save series' }));
  const updated = onUpdate.mock.calls[0][0];
  expect(updated.next.attribution).toBeNull();
  expect(updated.releases.book).toMatchObject({ date: '2027-04-01', origin: 'manual', lastCheckedAt: null, provenance: null });
  expect(updated.releases.audio).toEqual(original.releases.audio);
  expect(updated.lastCheck).toEqual(original.lastCheck);
  expect(original.next.attribution).not.toBeNull();
  expect(original.releases.book.provenance).not.toBeNull();
});
