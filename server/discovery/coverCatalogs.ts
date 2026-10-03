import type { CheckRequest, SourceLink } from '../../shared/discovery';
import { normalizeIdentity } from '../../shared/discoveryPolicy';
import type { AuthorSuggestion, CoverCandidate, CoverProvider, CoverRequest } from '../../shared/covers';
import { candidate as parseCandidate, validateCoverImageUrl } from '../../shared/coverValidation';
import { bindWorkTitle, hardcoverAliases } from './workIdentity';

export interface CoverBatch { candidates: CoverCandidate[]; authorSuggestions: AuthorSuggestion[] }
export const MAX_AUTHOR_SUGGESTIONS = 3;
// One suggestion per normalised author and title; the first provider to report it keeps the attribution.
export function dedupeSuggestions(items: AuthorSuggestion[]): AuthorSuggestion[] {
  const seen = new Set<string>();
  return items.filter(item => { const key = `${normalizeIdentity(item.author)}|${normalizeIdentity(item.title)}`; if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, MAX_AUTHOR_SUGGESTIONS);
}
export const emptyBatch = (): CoverBatch => ({ candidates: [], authorSuggestions: [] });

const object = (input: unknown): Record<string, unknown> => input !== null && typeof input === 'object' && !Array.isArray(input)
  ? input as Record<string, unknown> : {};
const text = (input: unknown, max = 300): string | null => typeof input === 'string' && input.trim() && input.length <= max ? input.trim() : null;
const list = (input: unknown): unknown[] => Array.isArray(input) ? input : [];

// Binds a provider record to the exact next or previous work. Author is verified
// before the title so a same-title book by someone else never becomes a candidate.
type Bound = { role: 'next' | 'previous'; title: string } | { mismatch: AuthorSuggestion | null } | null;
export function checkRequestFor(request: CoverRequest, role: 'next' | 'previous'): CheckRequest | null {
  const title = role === 'next' ? request.nextTitle : request.previousTitle;
  if (!title) return null;
  return { requestId: request.requestId, seriesId: request.seriesId, preferredMarket: request.preferredMarket, formats: ['book'], useAi: false, useSearch: false, fallbackMarkets: false,
    target: { series: request.series, author: request.author, position: role === 'next' ? request.position : Math.max(1, request.position - 1), title, orderNote: '' } };
}
export function bindWork(request: CoverRequest, actualTitle: string, actualAuthors: string[], source: SourceLink): Bound {
  for (const role of ['next', 'previous'] as const) {
    const bound = checkRequestFor(request, role);
    const title = bound ? bindWorkTitle(actualTitle, bound) : null;
    if (!title) continue;
    const authorOk = actualAuthors.length > 0 && actualAuthors.every(author => normalizeIdentity(author) === normalizeIdentity(request.author));
    if (authorOk) return { role, title };
    return { mismatch: actualAuthors.length === 1 ? { author: actualAuthors[0], title: actualTitle, source } : null };
  }
  return null;
}
const workKey = (title: string, author: string): string => `${normalizeIdentity(title)}|${normalizeIdentity(author)}`;

const dimension = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 20000 ? value : null;

// Single normaliser for every cover candidate: unsafe URLs, out-of-range dimensions and over-long
// fields are clamped or rejected with the same limits the response parser enforces.
export function sanitizeCover(input: CoverCandidate): CoverCandidate | null {
  const imageUrl = validateCoverImageUrl(input.imageUrl);
  if (!imageUrl) return null;
  try { return parseCandidate({ ...input, imageUrl, width: dimension(input.width), height: dimension(input.height) }); } catch { return null; }
}

function push(batch: CoverBatch, request: CoverRequest, input: { provider: CoverProvider; id: string; actualTitle: string; authors: string[];
  source: SourceLink; imageUrl: unknown; format: CoverCandidate['format']; editionKey: string | null; width?: unknown; height?: unknown }): void {
  const bound = bindWork(request, input.actualTitle, input.authors, input.source);
  if (!bound) return;
  if ('mismatch' in bound) { if (bound.mismatch) batch.authorSuggestions = dedupeSuggestions([...batch.authorSuggestions, bound.mismatch]); return; }
  const imageUrl = validateCoverImageUrl(input.imageUrl);
  if (!imageUrl) return;
  const id = `${input.provider}:${input.id}`;
  if (batch.candidates.some(item => item.id === id)) return;
  const clean = sanitizeCover({ id, title: bound.title, author: request.author, role: bound.role, format: input.format, provider: input.provider,
    source: input.source, imageUrl, workKey: workKey(bound.title, request.author), editionKey: input.editionKey,
    width: input.width as number | null, height: input.height as number | null });
  if (clean) batch.candidates.push(clean);
}

function isbnKey(input: unknown): string | null {
  for (const item of list(input)) {
    const value = text(object(item).identifier, 30)?.replace(/[ -]/g, '').toUpperCase();
    if (value && /^(?:\d{13}|\d{9}[\dX])$/.test(value)) return `isbn:${value}`;
  }
  return null;
}

// Hardcover image field: jsonb with a url, or a bare URL string.
export function hardcoverImage(input: unknown): { url: string; width: unknown; height: unknown } | null {
  const value = typeof input === 'string' ? { url: input } : object(input);
  const url = validateCoverImageUrl(value.url);
  return url ? { url, width: value.width, height: value.height } : null;
}

export function normalizeHardcoverCovers(input: unknown, request: CoverRequest): CoverBatch {
  const batch = emptyBatch();
  const aliases = new Set(hardcoverAliases(request.series).map(normalizeIdentity));
  for (const seriesInput of list(object(object(input).data).series).slice(0, 6)) {
    const series = object(seriesInput);
    const name = text(series.name);
    if (!name || !aliases.has(normalizeIdentity(name))) continue;
    for (const rowInput of list(series.book_series).slice(0, 40)) {
      const row = object(rowInput); const book = object(row.book);
      const id = typeof book.id === 'number' && Number.isSafeInteger(book.id) && book.id > 0 ? String(book.id) : null;
      const slug = text(book.slug); const title = text(book.title);
      if (!id || !title || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || book.compilation === true || row.compilation === true) continue;
      const authors = list(book.contributions).filter(item => text(object(object(item).contributor_role).name)?.toLowerCase() === 'author')
        .map(item => text(object(object(item).author).name)).filter((item): item is string => item !== null);
      const image = hardcoverImage(book.cached_image);
      if (!image) continue;
      // The row position must agree with the bound role so a series lead alone cannot name a next cover.
      const before = batch.candidates.length;
      push(batch, request, { provider: 'hardcover', id: `book:${id}`, actualTitle: title, authors, source: { id: `hardcover:book:${id}`, title, url: `https://hardcover.app/books/${slug}` },
        imageUrl: image.url, format: 'print', editionKey: null, width: image.width, height: image.height });
      const added = batch.candidates[batch.candidates.length - 1];
      if (batch.candidates.length > before && added.role === 'next' && row.position !== request.position) batch.candidates.pop();
      else if (batch.candidates.length > before && added.role === 'previous' && row.position !== request.position - 1) batch.candidates.pop();
    }
  }
  return batch;
}

const googleImageKeys = ['extraLarge', 'large', 'medium', 'small', 'thumbnail', 'smallThumbnail'];
export function normalizeGoogleCovers(input: unknown, request: CoverRequest): CoverBatch {
  const batch = emptyBatch();
  for (const item of list(object(input).items).slice(0, 20)) {
    const raw = object(item); const info = object(raw.volumeInfo);
    if (typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(raw.id)) continue;
    const title = text(info.title);
    const authors = list(info.authors).map(author => text(author)).filter((author): author is string => author !== null);
    if (!title || authors.length !== 1) continue;
    const links = object(info.imageLinks);
    const imageUrl = googleImageKeys.map(key => validateCoverImageUrl(links[key])).find(url => url !== null) ?? null;
    push(batch, request, { provider: 'googlebooks', id: raw.id, actualTitle: title, authors, imageUrl,
      source: { id: `googlebooks:${raw.id}`, title, url: `https://books.google.com/books?id=${raw.id}` },
      format: object(raw.saleInfo).isEbook === true ? 'ebook' : 'print', editionKey: isbnKey(info.industryIdentifiers) ?? `googlebooks:${raw.id}` });
  }
  return batch;
}

export function normalizeAppleCovers(input: unknown, format: 'ebook' | 'audio', request: CoverRequest): CoverBatch {
  const batch = emptyBatch();
  for (const item of list(object(input).results).slice(0, 20)) {
    const raw = object(item);
    const identifier = format === 'ebook' ? raw.trackId : raw.collectionId ?? raw.trackId;
    if (!(typeof identifier === 'number' && Number.isSafeInteger(identifier) && identifier > 0)) continue;
    const title = text(format === 'ebook' ? raw.trackName : raw.collectionName ?? raw.trackName);
    const author = text(raw.artistName);
    const url = text(format === 'ebook' ? raw.trackViewUrl : raw.collectionViewUrl ?? raw.trackViewUrl, 2048);
    if (!title || !author || !url) continue;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !['books.apple.com', 'itunes.apple.com'].includes(parsed.hostname) || parsed.username || parsed.password) continue;
    } catch { continue; }
    push(batch, request, { provider: 'apple', id: `${identifier}:${format}`, actualTitle: title, authors: [author], source: { id: `apple:${identifier}:${format}`, title, url },
      imageUrl: raw.artworkUrl100, format, editionKey: `apple:${identifier}` });
  }
  return batch;
}

export function normalizeOpenLibraryCovers(input: unknown, request: CoverRequest): CoverBatch {
  const batch = emptyBatch();
  for (const item of list(object(input).docs).slice(0, 20)) {
    const raw = object(item);
    const key = text(raw.key, 60); const title = text(raw.title);
    const authors = list(raw.author_name).map(author => text(author)).filter((author): author is string => author !== null);
    if (!key || !/^\/works\/OL\d+W$/.test(key) || !title || authors.length !== 1) continue;
    const edition = text(raw.cover_edition_key, 20);
    const cover = typeof raw.cover_i === 'number' && Number.isSafeInteger(raw.cover_i) && raw.cover_i > 0 ? raw.cover_i : null;
    push(batch, request, { provider: 'openlibrary', id: key.split('/').pop()!, actualTitle: title, authors,
      source: { id: `openlibrary:${key.split('/').pop()}`, title, url: `https://openlibrary.org${key}` },
      imageUrl: cover === null ? null : `https://covers.openlibrary.org/b/id/${cover}-L.jpg`, format: 'print',
      editionKey: edition && /^OL\d+M$/.test(edition) ? edition : null });
  }
  return batch;
}
