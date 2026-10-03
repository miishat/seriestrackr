import { expect, test } from 'vitest';
import { emptyDocument, emptyRelease } from '../../src/features/library/model';
import { safeSelection, staleSeriesIds } from '../../src/features/discovery/autoTrack';
import { seriesFixture } from '../fixtures';
import { response } from './fixtures';
import type { CheckResponse, CheckSummary } from '../../shared/discovery';

const now = new Date('2026-10-10T00:00:00Z');
const check = (checkedAt: string, status: CheckSummary['status'] = 'complete') => ({ ...response().summary, checkedAt, status });
const doc = (series: ReturnType<typeof seriesFixture>[]) => ({ ...emptyDocument(), settings: { ...emptyDocument().settings, market: 'CA' }, series });

test('stale: never checked, older than 7 days, or last check failed; active only', () => {
  const ids = staleSeriesIds(doc([
    seriesFixture({ id: 'never' }),
    seriesFixture({ id: 'old', lastCheck: check('2026-10-02T00:00:00Z') }),
    seriesFixture({ id: 'fresh', lastCheck: check('2026-10-05T00:00:00Z') }),
    seriesFixture({ id: 'failed', lastCheck: check('2026-10-09T00:00:00Z', 'failed') }),
    seriesFixture({ id: 'cancelled', lastCheck: check('2026-10-09T00:00:00Z', 'cancelled') }),
    seriesFixture({ id: 'paused', readingStatus: 'paused' }),
  ]), now);
  expect(ids).toEqual(['never', 'old', 'failed', 'cancelled']);
});

// The default response() proposes a scheduled CA ebook for "Second", position 2, matching seriesFixture().
const matching = (overrides: Partial<CheckResponse> = {}) => response({ seriesId: 's1', ...overrides });
const source = (id: string, url: string) => ({ id, title: id, url });
const withIdentity = (r: CheckResponse, sources: ReturnType<typeof source>[], title = 'Second') => ({
  ...r, proposals: { ...r.proposals, identity: { title, author: 'Example Author', position: 2, citations: [] },
    identityAttribution: { checkedAt: r.summary.checkedAt, sources } },
});
const blankTitle = () => seriesFixture({ next: { ...seriesFixture().next, title: '' } });

test('forward release move on the saved title is safe', () => {
  expect(safeSelection(seriesFixture(), matching())).toEqual({ title: false, book: true, audio: false, coverId: null });
});
test('same or backward status is not applied', () => {
  const same = seriesFixture({ releases: { book: { ...emptyRelease(), state: 'scheduled', origin: 'discovery', date: '2027-03-01' }, audio: emptyRelease() } });
  expect(safeSelection(same, matching())).toBeNull();
  const ahead = seriesFixture({ releases: { book: { ...emptyRelease(), state: 'released', origin: 'discovery', date: '2026-01-01' }, audio: emptyRelease() } });
  expect(safeSelection(ahead, matching())).toBeNull();
});
test('not-found counts as the lowest status', () => {
  const series = seriesFixture({ releases: { book: { ...emptyRelease(), state: 'not-found', origin: 'discovery' }, audio: emptyRelease() } });
  expect(safeSelection(series, matching())).toMatchObject({ book: true });
});
test('manual entries are never overwritten', () => {
  const series = seriesFixture({ releases: { book: { ...emptyRelease(), state: 'announced', origin: 'manual' }, audio: emptyRelease() } });
  expect(safeSelection(series, matching())).toBeNull();
});
test('a manual not-checked entry may be filled', () => {
  expect(safeSelection(seriesFixture({ releases: { book: { ...emptyRelease(), origin: 'manual' }, audio: emptyRelease() } }), matching())).toMatchObject({ book: true });
});
test('a different saved title is never replaced', () => {
  const r = matching();
  const renamed = withIdentity(r, [source('a', 'https://hardcover.app/books/other'), source('b', 'https://books.apple.com/ca/book/other/id1')], 'Other');
  expect(safeSelection(seriesFixture(), renamed)).toBeNull();
});
test('a new title needs two independent sources', () => {
  const same = withIdentity(matching(), [source('a', 'https://hardcover.app/books/second'), source('b', 'https://hardcover.app/books/second-2')]);
  expect(safeSelection(blankTitle(), same)).toBeNull();
  const two = withIdentity(matching(), [source('a', 'https://hardcover.app/books/second'), source('b', 'https://books.apple.com/ca/book/second/id1')]);
  expect(safeSelection(blankTitle(), two)).toMatchObject({ title: true, book: true });
});
test('a title proposal with only one source host is not applied', () => {
  const one = withIdentity(matching(), [source('a', 'https://www.hardcover.app/books/second')]);
  expect(safeSelection(blankTitle(), one)).toBeNull();
});
test('a title proposal with no attribution is not applied', () => {
  const r = matching();
  const bare = { ...r, proposals: { ...r.proposals, identity: { title: 'Second', author: 'Example Author', position: 2, citations: [] }, identityAttribution: null } };
  expect(safeSelection(blankTitle(), bare)).toBeNull();
});
test('conflicted formats are not applied', () => {
  const r = matching();
  const conflicted = { ...r, proposals: { ...r.proposals, conflicts: [{ format: 'book' as const, evidenceIds: ['e1'], reason: 'x' }] } };
  expect(safeSelection(seriesFixture(), conflicted)).toBeNull();
});
test('a format that is turned off is not selected', () => {
  expect(safeSelection(seriesFixture({ formats: { book: false, audio: true } }), matching())).toBeNull();
});
test('a release proposal for another title is not applied', () => {
  const r = matching();
  const other = { ...r, proposals: { ...r.proposals, releases: { ...r.proposals.releases, book: { ...r.proposals.releases.book!, title: 'Other' } } } };
  expect(safeSelection(seriesFixture(), other)).toBeNull();
});
test('released with no date and no source market is not applied', () => {
  const r = matching();
  const book = r.proposals.releases.book!;
  const vague = { ...r, proposals: { ...r.proposals, releases: { ...r.proposals.releases,
    book: { ...book, state: 'released' as const, date: null, provenance: { ...book.provenance, sourceMarket: null } } } } };
  expect(safeSelection(seriesFixture(), vague)).toBeNull();
  const dated = { ...vague, proposals: { ...vague.proposals, releases: { ...vague.proposals.releases, book: { ...vague.proposals.releases.book!, date: '2026-01-01' } } } };
  expect(safeSelection(seriesFixture(), dated)).toMatchObject({ book: true });
});
test('covers are never part of the selection', () => {
  expect(safeSelection(seriesFixture(), matching())?.coverId).toBeNull();
});
