import type { BookRef, Format, LibraryDocument, ReadingStatus, Release, ReleaseState, Result, Series } from './model';
import { isCalendarDate } from './releases';

type RecordValue = Record<string, unknown>;

function record(value: unknown, path: string): RecordValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`);
  return value as RecordValue;
}

function string(value: unknown, path: string, nonblank = false): string {
  if (typeof value !== 'string' || (nonblank && !value.trim())) throw new Error(`${path} must be ${nonblank ? 'a nonblank' : 'a'} string.`);
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean.`);
  return value;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], path: string): T {
  if (typeof value !== 'string' || !options.includes(value as T)) throw new Error(`${path} is invalid.`);
  return value as T;
}

function nullable<T>(value: unknown, parse: (value: unknown) => T): T | null {
  return value === null ? null : parse(value);
}

function position(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`${path} must be a positive finite number.`);
  return value;
}

function country(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^[A-Z]{2}$/.test(value)) throw new Error(`${path} must be a two-letter uppercase country code.`);
  return value;
}

function httpUrl(value: unknown, path: string): string {
  const url = string(value, path, true);
  try {
    const parsed = new URL(url);
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname) return url;
  } catch {
    // The shared error below covers malformed URLs and unsupported schemes.
  }
  throw new Error(`${path} must be an HTTP(S) URL.`);
}

function bookRef(value: unknown, path: string): BookRef {
  const input = record(value, path);
  return { position: position(input.position, `${path}.position`), title: string(input.title, `${path}.title`, true) };
}

function release(value: unknown, path: string): Release {
  const input = record(value, path);
  const state = oneOf<ReleaseState>(input.state, ['not-checked', 'not-found', 'announced', 'scheduled', 'released'], `${path}.state`);
  const date = nullable(input.date, (value) => string(value, `${path}.date`));
  if (state === 'scheduled' && (date === null || !isCalendarDate(date))) throw new Error(`${path}.date must be a valid date when scheduled.`);
  if (state !== 'scheduled' && state !== 'released' && date !== null) throw new Error(`${path}.date must be null for ${state}.`);
  if (state === 'released' && date !== null && !isCalendarDate(date)) throw new Error(`${path}.date must be a valid date.`);
  let source: Release['source'] = null;
  if (input.source !== null) {
    const item = record(input.source, `${path}.source`);
    source = { title: string(item.title, `${path}.source.title`, true), url: httpUrl(item.url, `${path}.source.url`) };
  }
  return {
    state,
    date,
    source,
    origin: oneOf(input.origin, ['manual', 'discovery'], `${path}.origin`),
    lastCheckedAt: nullable(input.lastCheckedAt, (value) => string(value, `${path}.lastCheckedAt`, true)),
  };
}

function series(value: unknown, path: string): Series {
  const input = record(value, path);
  const next = record(input.next, `${path}.next`);
  const formats = record(input.formats, `${path}.formats`);
  const releases = record(input.releases, `${path}.releases`);
  const bookEnabled = boolean(formats.book, `${path}.formats.book`);
  const audioEnabled = boolean(formats.audio, `${path}.formats.audio`);
  if (!bookEnabled && !audioEnabled) throw new Error(`${path}.formats must enable at least one format.`);
  const readingStatus = oneOf<ReadingStatus>(input.readingStatus, ['active', 'paused', 'dropped', 'completed'], `${path}.readingStatus`);
  const publicationRunComplete = boolean(input.publicationRunComplete, `${path}.publicationRunComplete`);
  if (readingStatus === 'completed' && !publicationRunComplete) throw new Error(`${path}.publicationRunComplete must be true for a completed series.`);

  return {
    id: string(input.id, `${path}.id`, true),
    name: string(input.name, `${path}.name`, true),
    author: string(input.author, `${path}.author`, true),
    readingStatus,
    lastFinished: nullable(input.lastFinished, (value) => bookRef(value, `${path}.lastFinished`)),
    currentBook: nullable(input.currentBook, (value) => bookRef(value, `${path}.currentBook`)),
    next: {
      positionOverride: nullable(next.positionOverride, (value) => position(value, `${path}.next.positionOverride`)),
      title: string(next.title, `${path}.next.title`),
      orderNote: string(next.orderNote, `${path}.next.orderNote`),
    },
    publicationRunComplete,
    latestPublishedPosition: nullable(input.latestPublishedPosition, (value) => position(value, `${path}.latestPublishedPosition`)),
    formats: { book: bookEnabled, audio: audioEnabled } satisfies Record<Format, boolean>,
    marketOverride: nullable(input.marketOverride, (value) => country(value, `${path}.marketOverride`)),
    coverUrl: nullable(input.coverUrl, (value) => httpUrl(value, `${path}.coverUrl`)),
    releases: { book: release(releases.book, `${path}.releases.book`), audio: release(releases.audio, `${path}.releases.audio`) },
  };
}

export function parseDocument(input: unknown): Result<LibraryDocument> {
  try {
    const root = record(input, 'document');
    if (root.version !== 1) throw new Error('Unsupported library version.');
    const settings = record(root.settings, 'settings');
    if (!Array.isArray(root.series)) throw new Error('series must be an array.');
    const parsedSeries = Array.from(root.series, (value, index) => series(value, `series[${index}]`));
    const ids = new Set(parsedSeries.map((item) => item.id));
    if (ids.size !== parsedSeries.length) throw new Error('Series IDs must be unique.');
    return {
      ok: true,
      value: {
        version: 1,
        settings: {
          market: nullable(settings.market, (value) => country(value, 'settings.market')),
          language: oneOf(settings.language, ['en'], 'settings.language'),
          theme: oneOf(settings.theme, ['light', 'dark'], 'settings.theme'),
          view: oneOf(settings.view, ['grid', 'compact', 'list'], 'settings.view'),
          showCovers: boolean(settings.showCovers, 'settings.showCovers'),
        },
        series: parsedSeries,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
