import { emptyRelease } from './model';
import type { Result, Series } from './model';

export function nextPosition(s: Series): number {
  return s.next.positionOverride ?? Math.floor(s.lastFinished?.position ?? 0) + 1;
}

export function finishNext(s: Series): Result<Series> {
  if (s.readingStatus === 'completed') return { ok: false, error: 'Reopen this series before finishing another book.' };
  const title = s.next.title.trim();
  if (!title) return { ok: false, error: 'Enter the next book title before marking it finished.' };
  const position = nextPosition(s);
  if (!Number.isFinite(position) || position <= 0) return { ok: false, error: 'The next book position must be positive.' };

  const currentBook = s.currentBook;
  return {
    ok: true,
    value: {
      ...s,
      lastFinished: { position, title },
      currentBook: currentBook?.position === position && currentBook.title.trim() === title ? null : currentBook,
      next: { positionOverride: null, title: '', orderNote: '', attribution: null },
      lastCheck: null,
      coverUrl: null,
      releases: { book: emptyRelease(), audio: emptyRelease() },
    },
  };
}

export function isCaughtUp(s: Series): boolean {
  return s.latestPublishedPosition !== null && (s.lastFinished?.position ?? 0) >= s.latestPublishedPosition;
}
