import { emptyRelease } from '../src/features/library/model';
import type { Series } from '../src/features/library/model';

export function seriesFixture(overrides: Partial<Series> = {}): Series {
  return {
    id: 's1',
    name: 'Example',
    author: 'Example Author',
    readingStatus: 'active',
    lastFinished: { position: 1, title: 'First' },
    currentBook: null,
    next: { positionOverride: null, title: 'Second', orderNote: '', attribution: null },
    publicationRunComplete: false,
    latestPublishedPosition: null,
    formats: { book: true, audio: true },
    marketOverride: null,
    coverUrl: null,
    coverAttribution: null,
    releases: { book: emptyRelease(), audio: emptyRelease() },
    lastCheck: null,
    autoUpdate: null,
    ...overrides,
  };
}
