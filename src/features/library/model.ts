import type { Attribution, CheckSummary, Provenance } from '../../../shared/discovery';

export type ReadingStatus = 'active' | 'paused' | 'dropped' | 'completed';
export type ReleaseState = 'not-checked' | 'not-found' | 'announced' | 'scheduled' | 'released';
export type Format = 'book' | 'audio';
export interface BookRef { position: number; title: string }
export interface Release {
  state: ReleaseState;
  date: string | null;
  source: { title: string; url: string } | null;
  origin: 'manual' | 'discovery';
  lastCheckedAt: string | null;
  provenance: Provenance | null;
}
export interface Series {
  id: string;
  name: string;
  author: string;
  readingStatus: ReadingStatus;
  lastFinished: BookRef | null;
  currentBook: BookRef | null;
  next: { positionOverride: number | null; title: string; orderNote: string; attribution: Attribution | null };
  publicationRunComplete: boolean;
  latestPublishedPosition: number | null;
  formats: Record<Format, boolean>;
  marketOverride: string | null;
  coverUrl: string | null;
  releases: Record<Format, Release>;
  lastCheck: CheckSummary | null;
}
export interface LibraryDocument {
  version: 2;
  settings: {
    market: string | null;
    language: 'en';
    theme: 'light' | 'dark';
    view: 'grid' | 'compact' | 'list';
    showCovers: boolean;
  };
  series: Series[];
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function emptyRelease(): Release {
  return { state: 'not-checked', date: null, source: null, origin: 'manual', lastCheckedAt: null, provenance: null };
}

export function emptyDocument(): LibraryDocument {
  return { version: 2, settings: { market: null, language: 'en', theme: 'light', view: 'grid', showCovers: true }, series: [] };
}
