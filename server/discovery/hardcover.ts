import { emitDiagnostic, diagnosticCounts, diagnosticRecordRef, type DiagnosticObserver, type DiagnosticRule } from './diagnostics';
import type { CheckRequest, EditionFormat, EvidenceBundle, Reason } from '../../shared/discovery';
import { emptyUsage } from '../../shared/discovery';
import { normalizeIdentity } from '../../shared/discoveryPolicy';
import { parseExtraction } from '../../shared/discoveryValidation';
import type { CatalogResult } from './catalogs';
import { fetchProviderJson, ProviderError } from './http';
import { createRateQueue } from './rateQueue';
import { bindWorkTitle, hardcoverAliases, isPlaceholderTitle } from './workIdentity';
import { hardcoverImage, sanitizeCover } from './coverCatalogs';
import type { CoverCandidate } from '../../shared/covers';
import type { RetrievalContext } from './retrievalContext';

export const hardcoverQueue = createRateQueue(1100);
const queue = hardcoverQueue;
const empty = (): EvidenceBundle => ({ sources: [], identities: [], editions: [] });
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max = 300): string | null => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null;
const id = (value: unknown): string | null => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : null;
const fail = (reason: Reason = 'invalid-evidence'): never => { throw new ProviderError('hardcover', reason); };
const list = (value: unknown, max: number, onOverflow?: () => void): unknown[] => {
  if (!Array.isArray(value)) return fail();
  if (value.length > max) { onOverflow?.(); return fail('budget'); }
  return value;
};
export { hardcoverAliases };

const query = `query DiscoveryHardcover($names: [String!]!, $position: float8!) {
  series(where: {name: {_in: $names}}, order_by: {id: asc}, limit: 20) {
    id name author { name } book_series(where: {position: {_eq: $position}}, limit: 21) {
      id position featured compilation details
      book { id slug title compilation cached_image contributions(limit: 31) { author { name } contributor_role { name } }
        editions(where: {language: {_or: [{code2: {_eq: "en"}}, {code3: {_eq: "eng"}}]}}, limit: 21) { id title edition_format reading_format { format } isbn_10 isbn_13 language { code2 code3 } }
      }
    }
  }
}`;
function editionFormat(raw: unknown): EditionFormat | null {
  const value = text(raw)?.toLowerCase();
  if (['ebook', 'e-book'].includes(value ?? '')) return 'ebook';
  if (['paperback', 'hardcover', 'hardback', 'mass market paperback', 'print'].includes(value ?? '')) return 'print';
  if (['audiobook', 'audio book', 'audio cd', 'listened'].includes(value ?? '')) return 'audio';
  return null;
}
function resolvedEditionFormat(raw: Record<string, unknown>): EditionFormat | null {
  const literalFormat = editionFormat(raw.edition_format); const readingValue = text(object(raw.reading_format).format)?.toLowerCase();
  const readingFormat = readingValue === 'read' ? 'print' : editionFormat(readingValue);
  if (readingValue === 'read') {
    if (literalFormat === 'print') return 'print';
    return raw.edition_format === null || raw.edition_format === undefined || raw.edition_format === '' ? 'print' : null;
  }
  return literalFormat && readingFormat && literalFormat !== readingFormat ? null : literalFormat ?? readingFormat;
}
function language(raw: unknown): string | null {
  const value = object(raw);
  const codes = [value.code2, value.code3].filter(item => item !== undefined && item !== null && item !== '').map(item => {
    const code = text(item, 3)?.toLowerCase();
    return code === 'eng' ? 'en' : code === 'fra' || code === 'fre' ? 'fr' : code && /^[a-z]{2,3}$/.test(code) ? code : null;
  });
  return codes.length && codes.every(code => code !== null && code === codes[0]) ? codes[0] : null;
}
function editionKey(raw: Record<string, unknown>, identifier: string): string {
  for (const input of [raw.isbn_13, raw.isbn_10]) {
    const value = text(input, 30)?.replace(/[ -]/g, '');
    if (value && /^(?:\d{13}|\d{9}[\dXx])$/.test(value)) return `isbn:${value.toUpperCase()}`;
  }
  return `hardcover:edition:${identifier}`;
}
export function normalizeHardcover(input: unknown, request: CheckRequest, checkedAt: string, onDiagnostic?: DiagnosticObserver, covers?: CoverCandidate[]): EvidenceBundle {
  const envelope = object(input);
  if (Object.hasOwn(envelope, 'errors')) return fail();
  const evidence = empty();
  const reject = (rule: DiagnosticRule, recordId: string | null, kind: 'book' | 'edition' = 'book') => emitDiagnostic(onDiagnostic, {
    stage: 'catalog', category: rule === 'request-bound' ? 'bounds' : 'target-mismatch', ...diagnosticCounts(evidence), provider: 'hardcover', rule,
    ...(recordId === null ? {} : { recordRef: diagnosticRecordRef(`hardcover:${kind}:${recordId}`) }),
  });
  const overflow = () => reject('request-bound', null);
  // The author is matched here, not in the query: Hardcover stores some author names with stray whitespace, which an exact server filter misses.
  // Twenty series rows is the sentinel for the raw result; only series by the requested author then count toward the six-row ambiguity bound.
  const rawSeries = list(object(envelope.data).series, 19, overflow);
  const wantedAuthor = normalizeIdentity(request.target.author);
  const seriesRows = list(rawSeries.filter(item => {
    const author = text(object(object(item).author).name);
    if (author === null || normalizeIdentity(author) === wantedAuthor) return true;
    reject('author-mismatch', null); return false;
  }), 5, overflow);
  const rows = seriesRows.flatMap(item => { const series = object(item); return list(series.book_series, 20, overflow).map(row => ({ ...object(row), series: { name: series.name, author: object(series.author).name } })); });
  const aliases = new Set(hardcoverAliases(request.target.series).map(normalizeIdentity));
  if (!rows.length) reject('no-match', null);
  const seen = new Set<string>();
  for (const inputRow of rows) {
    const row = object(inputRow); const book = object(row.book); const bookId = id(book.id);
    const series = text(object(row.series).name); const title = text(book.title); const slug = text(book.slug);
    if (!bookId || !series || !title || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) { reject('unsupported-title', bookId); continue; }
    if (!aliases.has(normalizeIdentity(series))) { reject('series-mismatch', bookId); continue; }
    const seriesAuthor = text(object(row.series).author);
    if (seriesAuthor !== null && normalizeIdentity(seriesAuthor) !== normalizeIdentity(request.target.author)) { reject('author-mismatch', bookId); continue; }
    if (isPlaceholderTitle(title)) { reject('placeholder-title', bookId); continue; }
    if (book.compilation !== false || row.compilation !== false) { reject('compilation', bookId); continue; }
    if (row.position !== request.target.position ||
      (row.details !== null && row.details !== undefined && row.details !== '' && text(row.details) !== String(request.target.position))) { reject('position-mismatch', bookId); continue; }
    // `featured` is diagnostic metadata only: a series need not be the book's featured series.
    const contributions = list(book.contributions, 30);
    const authors = contributions.filter(item => text(object(object(item).contributor_role).name)?.toLowerCase() === 'author')
      .map(item => text(object(object(item).author).name));
    if (!authors.includes(request.target.author) && !authors.some(author => author && normalizeIdentity(author) === normalizeIdentity(request.target.author))) { reject('author-mismatch', bookId); continue; }
    const editions = list(book.editions, 20, overflow);
    const qualifyingEdition = editions.map(object).find(raw => id(raw.id) && text(raw.title) &&
      normalizeIdentity(String(raw.title)) === normalizeIdentity(title) && language(raw.language) === 'en' && resolvedEditionFormat(raw));
    if (!qualifyingEdition) {
      const titleMatches = editions.map(object).filter(raw => id(raw.id) && text(raw.title) && normalizeIdentity(String(raw.title)) === normalizeIdentity(title));
      reject(!titleMatches.length ? 'unsupported-title' : !titleMatches.some(raw => language(raw.language) === 'en') ? 'edition-language' : 'edition-format', bookId);
      continue;
    }
    const sourceId = `hardcover:book:${bookId}`;
    const quote = `Title: ${title}. Author: ${request.target.author}. Series: ${series}. Position: ${request.target.position}. Role: Author. English edition: ${id(qualifyingEdition.id)}. Language: en. Format: ${resolvedEditionFormat(qualifyingEdition)}.`;
    const url = `https://hardcover.app/books/${slug}`;
    const identityCitations = quote.match(/[\s\S]{1,600}/g)!.map(part => ({ sourceId, quote: part }));
    if (!seen.has(sourceId)) {
      seen.add(sourceId);
      evidence.sources.push({ id: sourceId, title, url, provider: 'hardcover', market: null, retrievedAt: checkedAt, text: quote });
      evidence.identities.push({ title, author: request.target.author, position: request.target.position, citations: identityCitations });
      // Image metadata is a sidecar: a missing or unusable image never discards the verified identity.
      const image = covers ? hardcoverImage(book.cached_image) : null;
      if (covers && image && (!request.target.title.trim() || bindWorkTitle(title, request) !== null) && covers.length < 9) {
        const clean = sanitizeCover({ id: `hardcover:book:${bookId}`, title, author: request.target.author, role: 'next', format: 'print', provider: 'hardcover',
          source: { id: sourceId, title, url }, imageUrl: image.url, workKey: `${normalizeIdentity(title)}|${normalizeIdentity(request.target.author)}`,
          editionKey: null, width: image.width as number | null, height: image.height as number | null });
        if (clean) covers.push(clean);
      }
    } else if (evidence.sources.find(source => source.id === sourceId)?.text !== quote) return fail();
    for (const inputEdition of editions) {
      const raw = object(inputEdition); const editionId = id(raw.id);
      const format = resolvedEditionFormat(raw);
      const editionTitle = text(raw.title);
      if (!editionId || !editionTitle || normalizeIdentity(editionTitle) !== normalizeIdentity(title)) { reject('unsupported-title', editionId, 'edition'); continue; }
      if (!format) { reject('edition-format', editionId, 'edition'); continue; }
      const edition = { id: `hardcover:edition:${editionId}`, title, author: request.target.author, position: request.target.position,
        editionKey: editionKey(raw, editionId), format, language: language(raw.language), market: null, date: null, precision: 'none' as const, publication: 'catalogued' as const };
      const facts = `Title: ${title}. Author: ${edition.author}. Position: ${edition.position}. Raw format: ${text(raw.edition_format) ?? 'unknown'}. Reading format: ${text(object(raw.reading_format).format) ?? 'unknown'}. Format: ${format}. Language: ${edition.language ?? 'unknown'}. Market: unknown. Date: ${edition.date ?? 'unknown'}. Precision: ${edition.precision}. Edition: ${edition.editionKey}.`;
      if (seen.has(edition.id)) {
        if (evidence.sources.find(source => source.id === edition.id)?.text !== facts) return fail();
        continue;
      }
      seen.add(edition.id);
      evidence.sources.push({ id: edition.id, title, url, provider: 'hardcover', market: null, retrievedAt: checkedAt, text: facts });
      evidence.editions.push({ ...edition, citations: [...identityCitations, ...facts.match(/[\s\S]{1,600}/g)!.map(part => ({ sourceId: edition.id, quote: part }))] });
    }
    if (evidence.sources.length > 30 || evidence.identities.length > 30 || evidence.editions.length > 100) return fail('budget');
  }
  const parsed = parseExtraction(evidence, evidence.sources);
  return parsed.ok ? parsed.value : fail();
}
export async function collectHardcover(request: CheckRequest, token: string | null | undefined, signal: AbortSignal, fetcher: typeof fetch = fetch, onDiagnostic?: DiagnosticObserver, context?: RetrievalContext): Promise<CatalogResult> {
  const usage = emptyUsage(); const key = token?.trim();
  if (!key) return { evidence: empty(), usage, reasons: [] };
  try {
    const raw = await queue.run(async () => {
      if (context && !context.claim('hardcover')) throw new ProviderError('hardcover', 'budget');
      usage.hardcover++;
      return fetchProviderJson('hardcover', '/v1/graphql', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: /^Bearer\s/i.test(key) ? key : `Bearer ${key}` },
        body: JSON.stringify({ query, variables: { names: hardcoverAliases(request.target.series), position: request.target.position } }) }, signal, fetcher, onDiagnostic);
    }, signal);
    const covers: CoverCandidate[] = [];
    return { evidence: normalizeHardcover(raw, request, new Date().toISOString(), onDiagnostic, covers), usage, reasons: [], ...(covers.length ? { covers } : {}) };
  } catch (error) {
    return { evidence: empty(), usage, reasons: [signal.aborted ? 'cancelled' : error instanceof ProviderError ? error.reason : 'provider-error'] };
  }
}







