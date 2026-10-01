import { expect, test } from 'vitest';
import { emptyDocument, emptyRelease } from '../src/features/library/model';
import { finishNext, isCaughtUp, nextPosition } from '../src/features/library/progress';
import { displayRelease, isCalendarDate, localToday } from '../src/features/library/releases';
import { parseDocument } from '../src/features/library/validation';
import { seriesFixture } from './fixtures';

test('an unstarted series begins at the first book', () => {
  expect(nextPosition(seriesFixture({ lastFinished: null }))).toBe(1);
});

test('finishing advances both-format progress and clears next metadata', () => {
  const before = seriesFixture({
    coverUrl: 'https://example.com/second.jpg',
    releases: {
      book: { ...emptyRelease(), state: 'released', date: '2026-01-01' },
      audio: { ...emptyRelease(), state: 'scheduled', date: '2027-01-01' },
    },
  });
  const result = finishNext(before);
  expect(result.ok).toBe(true);
  if (result.ok === false) throw new Error(result.error);
  expect(result.value.lastFinished).toEqual({ position: 2, title: 'Second' });
  expect(nextPosition(result.value)).toBe(3);
  expect(result.value.next).toEqual({ positionOverride: null, title: '', orderNote: '', attribution: null });
  expect(result.value.coverUrl).toBeNull();
  expect(result.value.releases).toEqual({ book: emptyRelease(), audio: emptyRelease() });
  expect(before.lastFinished?.position).toBe(1);
  expect(before.coverUrl).toBe('https://example.com/second.jpg');
});

test('unknown title cannot fabricate a finished book', () => {
  const s = seriesFixture({ next: { title: '  ', positionOverride: null, orderNote: '', attribution: null } });
  expect(finishNext(s).ok).toBe(false);
});

test('completed series cannot advance', () => {
  expect(finishNext(seriesFixture({ readingStatus: 'completed', publicationRunComplete: true })).ok).toBe(false);
});

test('decimal override becomes finished position and next defaults to main sequence', () => {
  const s = seriesFixture({ next: { title: 'Interlude', positionOverride: 2.5, orderNote: 'side story', attribution: null } });
  expect(nextPosition(s)).toBe(2.5);
  const result = finishNext(s);
  if (result.ok === false) throw new Error(result.error);
  expect(result.value.lastFinished).toEqual({ position: 2.5, title: 'Interlude' });
  expect(nextPosition(result.value)).toBe(3);
});

test('finishing only clears current book when it is the next book', () => {
  const different = finishNext(seriesFixture({ currentBook: { position: 1, title: 'First' } }));
  if (different.ok === false) throw new Error(different.error);
  expect(different.value.currentBook).toEqual({ position: 1, title: 'First' });
  const same = finishNext(seriesFixture({ currentBook: { position: 2, title: 'Second' } }));
  if (same.ok === false) throw new Error(same.error);
  expect(same.value.currentBook).toBeNull();
});

test('caught up requires known latest position and does not change reading status', () => {
  expect(isCaughtUp(seriesFixture())).toBe(false);
  const s = seriesFixture({ latestPublishedPosition: 1 });
  expect(isCaughtUp(s)).toBe(true);
  expect(s.readingStatus).toBe('active');
  expect(isCaughtUp(seriesFixture({ latestPublishedPosition: 2 }))).toBe(false);
});

test('calendar dates reject rollover and release on the calendar day', () => {
  expect(isCalendarDate('2027-02-29')).toBe(false);
  expect(isCalendarDate('2028-02-29')).toBe(true);
  expect(isCalendarDate('2027-04-31')).toBe(false);
  expect(isCalendarDate('2027-03-1')).toBe(false);
  const r = { ...emptyRelease(), state: 'scheduled' as const, date: '2027-03-01' };
  expect(displayRelease(r, '2027-02-28')).toBe('scheduled');
  expect(displayRelease(r, '2027-03-01')).toBe('released');
  expect(displayRelease(r, '2027-03-02')).toBe('released');
  expect(r.state).toBe('scheduled');
});

test('localToday formats the local calendar components', () => {
  expect(localToday(new Date(2027, 0, 2, 23, 59))).toBe('2027-01-02');
});

const valid = () => ({ ...emptyDocument(), series: [seriesFixture()] });
const parsed = (value: unknown) => parseDocument(value).ok;

test('parser accepts a valid library and removes unrecognized fields', () => {
  const input = { ...valid(), injected: 'top', settings: { ...valid().settings, injected: 'settings' }, series: [{ ...seriesFixture(), injected: 'series' }] };
  const result = parseDocument(input);
  expect(result.ok).toBe(true);
  if (result.ok === false) throw new Error(result.error);
  expect(result.value).toEqual(valid());
  expect(result.value).not.toBe(input);
  expect(result.value.series[0]).not.toBe(input.series[0]);
});

test('parser rejects wrong versions, types, and duplicate IDs', () => {
  expect(parsed({ ...valid(), version: 99 })).toBe(false);
  expect(parsed({ ...valid(), settings: { ...valid().settings, showCovers: 'yes' } })).toBe(false);
  expect(parsed({ ...valid(), series: [seriesFixture(), seriesFixture()] })).toBe(false);
});

test('parser rejects a sparse series array instead of keeping an unvalidated slot', () => {
  const series = new Array(1);
  expect(parsed({ ...valid(), series })).toBe(false);
});

test('parser rejects empty identity, invalid country and no enabled format', () => {
  for (const changed of [
    { name: ' ' }, { author: '' }, { id: '' },
    { marketOverride: 'ca' }, { formats: { book: false, audio: false } },
  ]) expect(parsed({ ...valid(), series: [seriesFixture(changed)] })).toBe(false);
  expect(parsed({ ...valid(), settings: { ...valid().settings, market: 'CAN' } })).toBe(false);
});

test('parser rejects invalid BookRef positions and blank BookRef titles', () => {
  for (const position of [0, -1, Number.POSITIVE_INFINITY, Number.NaN, '2']) {
    expect(parsed({ ...valid(), series: [seriesFixture({ lastFinished: { position: position as number, title: 'First' } })] })).toBe(false);
  }
  expect(parsed({ ...valid(), series: [seriesFixture({ lastFinished: { position: 2, title: ' ' } })] })).toBe(false);
  expect(parsed({ ...valid(), series: [seriesFixture({ currentBook: { position: 2, title: '' } })] })).toBe(false);
  expect(parsed({ ...valid(), series: [seriesFixture({ lastFinished: { position: 2.5, title: 'Interlude' } })] })).toBe(true);
});

test('parser rejects invalid URLs and release-date combinations', () => {
  expect(parsed({ ...valid(), series: [seriesFixture({ coverUrl: 'javascript:alert(1)' })] })).toBe(false);
  expect(parsed({ ...valid(), series: [seriesFixture({ releases: { book: { ...emptyRelease(), source: { title: 'Source', url: 'file:///tmp/x' } }, audio: emptyRelease() } })] })).toBe(false);
  expect(parsed({ ...valid(), series: [seriesFixture({ releases: { book: { ...emptyRelease(), state: 'scheduled', date: null }, audio: emptyRelease() } })] })).toBe(false);
  expect(parsed({ ...valid(), series: [seriesFixture({ releases: { book: { ...emptyRelease(), state: 'announced', date: '2027-01-01' }, audio: emptyRelease() } })] })).toBe(false);
  expect(parsed({ ...valid(), series: [seriesFixture({ releases: { book: { ...emptyRelease(), state: 'released', date: '2027-02-29' }, audio: emptyRelease() } })] })).toBe(false);
});

test('parser requires publication completion before reading status completed', () => {
  expect(parsed({ ...valid(), series: [seriesFixture({ readingStatus: 'completed' })] })).toBe(false);
  expect(parsed({ ...valid(), series: [seriesFixture({ readingStatus: 'completed', publicationRunComplete: true })] })).toBe(true);
});

test('completed status requires finished progress through the known final published book', () => {
  const completed = { readingStatus: 'completed' as const, publicationRunComplete: true };
  expect(parsed({ ...valid(), series: [seriesFixture({ ...completed, lastFinished: null })] })).toBe(false);
  expect(parsed({ ...valid(), series: [seriesFixture({ ...completed, latestPublishedPosition: 2 })] })).toBe(false);
  expect(parsed({ ...valid(), series: [seriesFixture({ ...completed, latestPublishedPosition: 1 })] })).toBe(true);
  expect(parsed({ ...valid(), series: [seriesFixture({ ...completed, lastFinished: { position: 2, title: 'Second' }, latestPublishedPosition: 2 })] })).toBe(true);
});
