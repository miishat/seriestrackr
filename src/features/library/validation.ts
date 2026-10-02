import type { BookRef, CoverAttribution, Format, LibraryDocument, ReadingStatus, Release, ReleaseState, Result, Series } from './model';
import { isCalendarDate } from './releases';
import { parseAttribution, parseCheckSummary, parseProvenance } from '../../../shared/discoveryValidation';

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

function metadata<T>(value: unknown, parser: (value: unknown) => Result<T>): T | null {
  if (value === null) return null;
  const parsed = parser(value);
  if (parsed.ok === false) throw new Error(parsed.error);
  return parsed.value;
}

function release(value: unknown, path: string, legacy: boolean, format: Format, market: string | null): Release {
  const input = record(value, path);
  const state = oneOf<ReleaseState>(input.state, ['not-checked', 'not-found', 'catalogued', 'announced', 'scheduled', 'released'], `${path}.state`);
  const date = nullable(input.date, (value) => string(value, `${path}.date`));
  if (state === 'scheduled' && (date === null || !isCalendarDate(date))) throw new Error(`${path}.date must be a valid date when scheduled.`);
  if (state !== 'scheduled' && state !== 'released' && date !== null) throw new Error(`${path}.date must be null for ${state}.`);
  if (state === 'released' && date !== null && !isCalendarDate(date)) throw new Error(`${path}.date must be a valid date.`);
  let source: Release['source'] = null;
  if (input.source !== null) {
    const item = record(input.source, `${path}.source`);
    source = { title: string(item.title, `${path}.source.title`, true), url: httpUrl(item.url, `${path}.source.url`) };
  }
  const origin = oneOf(input.origin, ['manual', 'discovery'], `${path}.origin`);
  const lastCheckedAt = nullable(input.lastCheckedAt, (value) => string(value, `${path}.lastCheckedAt`, true));
  const provenance = legacy ? null : metadata(input.provenance, parseProvenance);
  if (provenance !== null) {
    if (origin !== 'discovery' || !['catalogued', 'announced', 'scheduled', 'released'].includes(state)) throw new Error(`${path}.provenance is incompatible with origin or state.`);
    if ((format === 'audio') !== (provenance.editionFormat === 'audio')) throw new Error(`${path}.provenance edition format disagrees.`);
    if (provenance.preferredMarket !== market) throw new Error(`${path}.provenance preferred market disagrees.`);
    // Undated Available needs same-edition publication proof: a verified source market, never catalogue-only evidence.
    if (state === 'released' && date === null && provenance.sourceMarket === null) throw new Error(`${path}.provenance lacks publication proof for an undated release.`);
    if ((date !== null) !== (provenance.datePrecision === 'day')) throw new Error(`${path}.provenance date precision disagrees.`);
    const primary = provenance.sources[0];
    if (!primary || !source || primary.title !== source.title || primary.url !== source.url || lastCheckedAt !== provenance.checkedAt) throw new Error(`${path}.provenance source or checked time disagrees.`);
  }
  return {
    state,
    date,
    source,
    origin,
    lastCheckedAt,
    provenance,
  };
}

function coverAttribution(value: unknown, path: string): CoverAttribution {
  const input = record(value, path);
  const source = record(input.source, `${path}.source`);
  return {
    title: string(input.title, `${path}.title`, true), author: string(input.author, `${path}.author`, true),
    role: oneOf(input.role, ['next', 'previous'], `${path}.role`),
    source: { id: string(source.id, `${path}.source.id`, true), title: string(source.title, `${path}.source.title`, true), url: httpUrl(source.url, `${path}.source.url`) },
    editionKey: nullable(input.editionKey, (key) => string(key, `${path}.editionKey`, true)),
  };
}

function series(value: unknown, path: string, legacy: boolean, defaultMarket: string | null, versioned: boolean): Series {
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
  const lastFinished = nullable(input.lastFinished, (value) => bookRef(value, `${path}.lastFinished`));
  const latestPublishedPosition = nullable(input.latestPublishedPosition, (value) => position(value, `${path}.latestPublishedPosition`));
  if (readingStatus === 'completed' && lastFinished === null) throw new Error(`${path}.lastFinished is required for a completed series.`);
  if (readingStatus === 'completed' && latestPublishedPosition !== null && lastFinished !== null && lastFinished.position < latestPublishedPosition) {
    throw new Error(`${path}.lastFinished must reach the latest published position before completing this series.`);
  }

  const marketOverride = nullable(input.marketOverride, (value) => country(value, `${path}.marketOverride`));
  const attribution = legacy ? null : metadata(next.attribution, parseAttribution);
  if (attribution !== null && (!attribution.sources.length || !string(next.title, `${path}.next.title`).trim())) throw new Error(`${path}.next.attribution requires a title and source.`);
  const coverUrl = nullable(input.coverUrl, (value) => httpUrl(value, `${path}.coverUrl`));
  const attributed = versioned ? nullable(input.coverAttribution, (value) => coverAttribution(value, `${path}.coverAttribution`)) : null;
  if (attributed !== null && coverUrl === null) throw new Error(`${path}.coverAttribution requires a cover URL.`);
  return {
    id: string(input.id, `${path}.id`, true),
    name: string(input.name, `${path}.name`, true),
    author: string(input.author, `${path}.author`, true),
    readingStatus,
    lastFinished,
    currentBook: nullable(input.currentBook, (value) => bookRef(value, `${path}.currentBook`)),
    next: {
      positionOverride: nullable(next.positionOverride, (value) => position(value, `${path}.next.positionOverride`)),
      title: string(next.title, `${path}.next.title`),
      orderNote: string(next.orderNote, `${path}.next.orderNote`),
      attribution,
    },
    publicationRunComplete,
    latestPublishedPosition,
    formats: { book: bookEnabled, audio: audioEnabled } satisfies Record<Format, boolean>,
    marketOverride,
    coverUrl,
    coverAttribution: attributed,
    releases: { book: release(releases.book, `${path}.releases.book`, legacy, 'book', marketOverride ?? defaultMarket), audio: release(releases.audio, `${path}.releases.audio`, legacy, 'audio', marketOverride ?? defaultMarket) },
    lastCheck: legacy ? null : metadata(input.lastCheck, parseCheckSummary),
  };
}

export function parseDocument(input: unknown): Result<LibraryDocument> {
  try {
    const root = record(input, 'document');
    const legacy = root.version === 1;
    if (!legacy && root.version !== 2 && root.version !== 3) throw new Error('Unsupported library version.');
    const settings = record(root.settings, 'settings');
    if (!Array.isArray(root.series)) throw new Error('series must be an array.');
    const market = nullable(settings.market, (value) => country(value, 'settings.market'));
    const parsedSeries = Array.from(root.series, (value, index) => series(value, `series[${index}]`, legacy, market, root.version === 3));
    const ids = new Set(parsedSeries.map((item) => item.id));
    if (ids.size !== parsedSeries.length) throw new Error('Series IDs must be unique.');
    return {
      ok: true,
      value: {
        version: 3,
        settings: {
          market,
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
