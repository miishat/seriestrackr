// Bounded Hardcover GraphQL probe. Dry run by default; every live query needs
// an explicit --run. Evaluation harness only: it never touches library storage,
// never imports browser code and never prints or persists the token.
//
// Live schema facts confirmed by --introspect on 2026-10-01 (the archived docs
// are stale): books has no series_names/has_audiobook/isbns; those moved to the
// book_series, default_*_edition and editions relationships.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadDiscoveryConfig } from '../server/discovery/config';

const endpoint = 'https://api.hardcover.app/v1/graphql';
const outputPath = 'docs/discovery-hardcover-probes.json';
const schemaPath = 'docs/discovery-hardcover-schema.json';
const casesPath = 'tests/discovery/data/pilot-cases.json';
const caseIds = ['hierarchy', 'ana-and-din', 'scholomance', 'path-to-ascendancy-gb'];
// Exact series names as stored on Hardcover. _ilike/_like are disabled by the
// provider, so aliases must be enumerated and matched with _in.
const seriesNames: Record<string, string[]> = {
  hierarchy: ['Hierarchy'],
  'ana-and-din': ['Ana and Din Mysteries', 'Ana and Din'],
  scholomance: ['The Scholomance', 'Scholomance'],
  'path-to-ascendancy-gb': ['Path to Ascendancy'],
};
const maxBooksPerCase = 20;
const maxEditionsRecorded = 20;
const maxTotalRequests = 10;
const maxBytes = 1024 * 1024;
const spacingMs = 1100;
const timeoutMs = 20000;

type CaseInput = { series: string; author: string; position: number; title: string; preferredMarket: string; formats: string[] };

const booksQuery = (author: string): string => `query Probe {
  books(where: { contributions: { author: { name: { _eq: ${JSON.stringify(author)} } } } }, limit: ${maxBooksPerCase}) {
    id title subtitle release_date release_year audio_seconds
    book_series(limit: 10) { position featured series { name primary_books_count is_completed } }
    default_ebook_edition { release_date isbn_13 edition_format }
    default_audio_edition { release_date isbn_13 asin edition_format audio_seconds }
    editions(limit: ${maxEditionsRecorded}) { edition_format physical_format release_date release_year isbn_13 isbn_10 asin language_id country_id audio_seconds }
  }
}`;

const seriesQuery = (names: string[]): string => `query Probe {
  series(where: { name: { _in: ${JSON.stringify(names)} } }, limit: 5) {
    name primary_books_count is_completed
    book_series(limit: 60) {
      position featured
      book { id title release_date audio_seconds
        default_ebook_edition { release_date isbn_13 edition_format }
        default_audio_edition { release_date isbn_13 asin edition_format audio_seconds } }
    }
  }
}`;

function sanitize(value: unknown, token: string, maximum = 400): string | null {
  if (typeof value !== 'string') return null;
  let text = value.slice(0, maximum);
  if (token) text = text.split(token).join('[REDACTED]');
  return text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gu, 'Bearer [REDACTED]');
}

function isIgnored(path: string): boolean {
  try { execFileSync('git', ['check-ignore', '-q', path], { stdio: 'ignore' }); return true; } catch { return false; }
}

function readCases(): [string, CaseInput][] {
  const parsed = JSON.parse(readFileSync(casesPath, 'utf8')) as Record<string, CaseInput>;
  return caseIds.map(id => {
    const input = parsed[id];
    if (!input) throw new Error('unknown-case');
    return [id, input] as [string, CaseInput];
  });
}

async function boundedJson(query: string, token: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: 'POST', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
  });
  if (!response.body) throw new Error(`http-${response.status}`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > maxBytes) { await reader.cancel().catch(() => {}); throw new Error('response-too-large'); }
    chunks.push(part.value);
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  const text = new TextDecoder().decode(joined);
  try { return JSON.parse(text); } catch { throw new Error('invalid-json'); }
}

const num = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const str = (value: unknown, token: string, maximum = 300): string | null => sanitize(value, token, maximum);

function readEdition(value: unknown, token: string): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  return { release_date: str(item.release_date, token, 40), edition_format: str(item.edition_format, token, 60),
    physical_format: str(item.physical_format, token, 60), isbn_13: str(item.isbn_13, token, 20),
    isbn_10: str(item.isbn_10, token, 20), asin: str(item.asin, token, 20),
    language_id: num(item.language_id), country_id: num(item.country_id), audio_seconds: num(item.audio_seconds) };
}

function readBook(value: unknown, token: string): Record<string, unknown> {
  const item = (value ?? {}) as Record<string, unknown>;
  const series = Array.isArray(item.book_series) ? item.book_series.map(entry => {
    const link = (entry ?? {}) as Record<string, unknown>;
    const parent = (link.series ?? {}) as Record<string, unknown>;
    return { position: num(link.position), featured: link.featured === true, compilation: null,
      series: str(parent.name, token, 200), primary_books_count: num(parent.primary_books_count), is_completed: parent.is_completed === true };
  }) : [];
  const editions = Array.isArray(item.editions)
    ? item.editions.slice(0, maxEditionsRecorded).map(edition => readEdition(edition, token)).filter(Boolean) : [];
  return { id: num(item.id), title: str(item.title, token), subtitle: str(item.subtitle, token),
    release_date: str(item.release_date, token, 40), release_year: num(item.release_year), audio_seconds: num(item.audio_seconds),
    book_series: series, default_ebook_edition: readEdition(item.default_ebook_edition, token),
    default_audio_edition: readEdition(item.default_audio_edition, token), editions };
}

function readBooks(body: unknown, token: string): { failure: string | null; summary: Record<string, unknown> } {
  const errors = (body as { errors?: unknown })?.errors;
  if (Array.isArray(errors) && errors.length) {
    return { failure: 'graphql-errors', summary: { errors: errors.slice(0, 3).map(error => sanitize((error as { message?: unknown })?.message ?? '', token)) } };
  }
  const books = (body as { data?: { books?: unknown } })?.data?.books;
  if (!Array.isArray(books)) return { failure: 'unexpected-shape', summary: { dataKeys: Object.keys((body as { data?: object })?.data ?? {}) } };
  return { failure: null, summary: { bookCount: books.length, books: books.map(book => readBook(book, token)) } };
}

function readSeries(body: unknown, token: string): { failure: string | null; summary: Record<string, unknown> } {
  const errors = (body as { errors?: unknown })?.errors;
  if (Array.isArray(errors) && errors.length) {
    return { failure: 'graphql-errors', summary: { errors: errors.slice(0, 3).map(error => sanitize((error as { message?: unknown })?.message ?? '', token)) } };
  }
  const series = (body as { data?: { series?: unknown } })?.data?.series;
  if (!Array.isArray(series)) return { failure: 'unexpected-shape', summary: { dataKeys: Object.keys((body as { data?: object })?.data ?? {}) } };
  return { failure: null, summary: { seriesCount: series.length, series: series.map(entry => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const links = Array.isArray(item.book_series) ? item.book_series : [];
    return { name: str(item.name, token, 200), primary_books_count: num(item.primary_books_count),
      is_completed: item.is_completed === true,
      books: links.map(link => {
        const entryLink = (link ?? {}) as Record<string, unknown>;
        const book = (entryLink.book ?? {}) as Record<string, unknown>;
        return { position: num(entryLink.position), featured: entryLink.featured === true,
          title: str(book.title, token), release_date: str(book.release_date, token, 40), audio_seconds: num(book.audio_seconds),
          default_ebook_edition: readEdition(book.default_ebook_edition, token),
          default_audio_edition: readEdition(book.default_audio_edition, token) };
      }) };
  }) } };
}

const typeQuery = (name: string): string =>
  `query Probe { __type(name: ${JSON.stringify(name)}) { name fields { name type { kind name ofType { kind name ofType { kind name } } } } } }`;

function typeFields(body: unknown): unknown {
  const type = (body as { data?: { __type?: Record<string, unknown> } })?.data?.__type;
  if (!type) return { errors: (body as { errors?: unknown })?.errors ?? 'type-not-found' };
  const render = (value: unknown): string => {
    const item = value as { kind?: string; name?: string | null; ofType?: unknown } | null;
    if (!item) return '';
    if (item.kind === 'NON_NULL') return `${render(item.ofType)}!`;
    if (item.kind === 'LIST') return `[${render(item.ofType)}]`;
    return item.name ?? '';
  };
  return { name: type.name, fields: (Array.isArray(type.fields) ? type.fields : []).map(field => {
    const item = field as { name: string; type: unknown };
    return { name: item.name, type: render(item.type) };
  }) };
}

export function parseArgs(argv: string[]): { run: boolean; introspect: boolean; replace: boolean } {
  const flags = argv.filter(value => value.startsWith('-'));
  for (const flag of flags) if (!['--run', '--dry-run', '--introspect', '--replace'].includes(flag)) throw new Error('unknown-flag');
  if (flags.includes('--run') && flags.includes('--dry-run')) throw new Error('conflicting-flags');
  return { run: flags.includes('--run'), introspect: flags.includes('--introspect'), replace: flags.includes('--replace') };
}

async function main(): Promise<void> {
  const { run, introspect, replace } = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const config = loadDiscoveryConfig(root);
  const tokenFile = resolve(root, '.env.hardcover.local');
  const token = config.hardcoverToken;
  const cases = readCases();
  if (!run && !introspect) {
    console.log(JSON.stringify({ mode: 'dry-run', provider: 'hardcover', endpoint,
      keyPresent: Boolean(token), keyFile: tokenFile, keyFileIgnored: existsSync(tokenFile) ? isIgnored(tokenFile) : null,
      caseIds: cases.map(([id]) => id),
      bounds: { maxBooksPerCase, maxEditionsRecorded, maxTotalRequests, maxBytes, spacingMs, timeoutMs, retries: 0 },
      note: 'No requests made. A live run needs --run and a separate allowance.' }, null, 2));
    return;
  }
  if (!existsSync(tokenFile) || !isIgnored(tokenFile)) throw new Error('token-file-not-ignored');
  if (!token) throw new Error('missing-key');
  if (introspect) {
    const schema: Record<string, unknown> = {};
    for (const name of ['books', 'editions', 'series', 'book_series']) {
      schema[name] = typeFields(await boundedJson(typeQuery(name), token, AbortSignal.timeout(timeoutMs)));
      await new Promise(resume => setTimeout(resume, spacingMs));
    }
    writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);
    console.log(JSON.stringify({ mode: 'introspect', schema: schemaPath, types: Object.keys(schema) }, null, 2));
    return;
  }
  if (existsSync(outputPath) && !replace) throw new Error('report-already-exists');

  let requests = 0;
  const results: unknown[] = [];
  for (const [caseId, input] of cases) {
    const record: Record<string, unknown> = { caseId, series: input.series, author: input.author, position: input.position,
      preferredMarket: input.preferredMarket, startedAt: new Date().toISOString(), books: null, seriesMatch: null };
    try {
      if (requests >= maxTotalRequests) throw new Error('request-budget-exhausted');
      requests++;
      record.books = readBooks(await boundedJson(booksQuery(input.author), token, AbortSignal.timeout(timeoutMs)), token);
      await new Promise(resume => setTimeout(resume, spacingMs));
      if (requests >= maxTotalRequests) throw new Error('request-budget-exhausted');
      requests++;
      record.seriesMatch = readSeries(await boundedJson(seriesQuery(seriesNames[caseId] ?? [input.series]), token, AbortSignal.timeout(timeoutMs)), token);
    } catch (error) {
      record.failure = error instanceof Error ? sanitize(error.message, token) : 'error';
    }
    results.push(record);
    if (requests < maxTotalRequests) await new Promise(resume => setTimeout(resume, spacingMs));
  }
  const report = { provider: 'hardcover', startedAt: new Date().toISOString(), endpoint, requestsMade: requests,
    caseIds: cases.map(([id]) => id),
    bounds: { maxBooksPerCase, maxEditionsRecorded, maxTotalRequests, maxBytes, spacingMs, timeoutMs, retries: 0 }, results };
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ mode: 'run', report: outputPath, requestsMade: requests, caseCount: cases.length }, null, 2));
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'error'); process.exitCode = 1; });
