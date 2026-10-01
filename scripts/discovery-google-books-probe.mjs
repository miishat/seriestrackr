import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = new URL('../', import.meta.url);
const inputPath = new URL('tests/discovery/data/pilot-cases.json', root);
const accessPath = new URL('.superpowers/sdd/2026-09-29-release-discovery/google-books-access.json', root);
const outputPath = new URL('docs/discovery-google-books-probes.json', root);
const keyPath = 'C:/Users/misha/seriestrackr/.env.google-books.local';
const endpoint = 'https://www.googleapis.com/books/v1/volumes';
const byteLimit = 1024 * 1024;
const maxResults = 20;
const maxTotalAttempts = 20;
const spacingMs = 1100;
const timeoutMs = 20000;
const titleSeeds = [
  ['witness', 'Legacies of Betrayal'],
  ['hierarchy', 'The Strength of the Few'],
  ['last-horizon', 'The Pilot'],
  ['ana-and-din', 'A Trade of Blood'],
  ['bound-and-broken', 'Of Empires and Dust'],
  ['devils', 'The Heretics'],
  ['book-of-dead', 'Ascension'],
  ['path-to-ascendancy', 'Deadhouse Landing'],
];

export const normalize = value => typeof value === 'string'
  ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase() : '';

export function datePrecision(value) {
  if (typeof value !== 'string') return 'missing';
  if (/^[1-9]\d{3}$/u.test(value)) return 'year';
  if (/^[1-9]\d{3}-(0[1-9]|1[0-2])$/u.test(value)) return 'month';
  if (/^[1-9]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/u.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value) return 'day';
  }
  return 'invalid';
}

export function saleDatePrecision(value) {
  const precision = datePrecision(value);
  if (precision !== 'invalid' || typeof value !== 'string') return precision;
  // Sale dates are documented datetimes. Validate the calendar day before parsing.
  if (/^[1-9]\d{3}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u.test(value)
    && datePrecision(value.slice(0, 10)) === 'day' && !Number.isNaN(Date.parse(value))) return 'datetime';
  return 'invalid';
}

function readJSON(url) { return JSON.parse(fs.readFileSync(url, 'utf8')); }
function loadKey() {
  try { return (parseEnv(fs.readFileSync(keyPath, 'utf8')).GOOGLE_BOOKS_API_KEY ?? '').trim(); }
  catch { return ''; }
}
function selectedString(value, key, maximum = 500) {
  if (typeof value !== 'string') return null;
  return value.slice(0, maximum).split(key || '\0').join('[REDACTED]')
    .replace(/(?:AIza|sk-)[A-Za-z0-9_-]{12,}/gu, '[REDACTED]');
}

// Returned URLs, descriptions, snippets, error bodies and headers are never copied.
export function selectVolume(item, key = '', fromSaved = false) {
  const info = fromSaved ? item : item?.volumeInfo ?? {};
  const sale = fromSaved ? item : item?.saleInfo ?? {};
  const access = fromSaved ? item : item?.accessInfo ?? {};
  const text = value => selectedString(value, key);
  const id = text(item?.id);
  if (!id || !/^[A-Za-z0-9_-]{1,100}$/u.test(id)) return null;
  const publishedDate = text(info.publishedDate);
  const onSaleDate = text(sale.onSaleDate);
  return {
    id, volumeLink: `https://books.google.com/books?id=${encodeURIComponent(id)}`,
    title: text(info.title), subtitle: text(info.subtitle),
    authors: Array.isArray(info.authors) ? info.authors.slice(0, 20).map(text).filter(Boolean) : [],
    publisher: text(info.publisher), language: text(info.language),
    publishedDate, publishedDatePrecision: datePrecision(publishedDate),
    identifiers: Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers.slice(0, 10)
      .map(value => ({ type: text(value?.type), identifier: text(value?.identifier) })) : [],
    printType: text(info.printType),
    isEbook: typeof sale.isEbook === 'boolean' ? sale.isEbook : null,
    saleability: text(sale.saleability),
    saleCountry: text(fromSaved ? sale.saleCountry : sale.country),
    accessCountry: text(fromSaved ? access.accessCountry : access.country),
    onSaleDate, onSaleDatePrecision: saleDatePrecision(onSaleDate),
  };
}

export function summarize(volumes, target) {
  const english = volumes.filter(volume => volume.language === 'en');
  const authorMatches = english.filter(volume => volume.authors.some(author => normalize(author) === normalize(target.author)));
  const exact = target.arm === 'known-title-assisted'
    ? authorMatches.filter(volume => normalize(volume.title) === normalize(target.title)) : [];
  return {
    retainedVolumes: volumes.length, englishVolumes: english.length,
    excludedLanguageVolumes: volumes.length - english.length,
    englishExactAuthorVolumes: authorMatches.length,
    englishExactTitleAuthorVolumes: target.arm === 'known-title-assisted' ? exact.length : null,
    exactTitleAuthorDayVolumes: target.arm === 'known-title-assisted'
      ? exact.filter(volume => volume.publishedDatePrecision === 'day').length : null,
    exactTitleAuthorEbookVolumes: target.arm === 'known-title-assisted'
      ? exact.filter(volume => volume.isEbook === true).length : null,
    proposalValidation: 'not-performed',
  };
}

function createTargets(cases) {
  const seen = new Set();
  const series = Object.entries(cases).flatMap(([caseId, input]) => {
    if (input.title !== '') throw new Error('nonempty-series-title');
    const identity = `${normalize(input.series)}|${normalize(input.author)}`;
    if (seen.has(identity)) return [];
    seen.add(identity);
    return [{ caseId, arm: 'series-empty-title', series: input.series, author: input.author,
      title: '', query: `"${input.series}" inauthor:"${input.author}"` }];
  });
  const known = titleSeeds.map(([caseId, title]) => ({ caseId, arm: 'known-title-assisted',
    series: cases[caseId].series, author: cases[caseId].author, title,
    query: `intitle:"${title}" inauthor:"${cases[caseId].author}"` }));
  if (series.length !== 12 || known.length !== 8) throw new Error('unexpected-input-count');
  return [...series, ...known];
}

export async function readBoundedJSON(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('missing-body');
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > byteLimit) throw new Error('response-too-large');
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  return { body: JSON.parse(Buffer.concat(chunks).toString('utf8')), bytes };
}

export async function probe(target, key, fetchImpl = fetch) {
  const row = { ...target, checkedAt: new Date().toISOString(), status: null, errorReason: null,
    attempted: true, reused: false, elapsedMs: null, responseBytes: null, totalItems: null, volumes: [] };
  const started = Date.now();
  try {
    const url = new URL(endpoint);
    url.searchParams.set('q', target.query);
    url.searchParams.set('maxResults', String(maxResults));
    url.searchParams.set('langRestrict', 'en');
    url.searchParams.set('showPreorders', 'true');
    url.searchParams.set('key', key);
    const response = await fetchImpl(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    row.status = response.status;
    if (!response.ok) {
      row.errorReason = [401, 403].includes(response.status) ? 'access-denied'
        : response.status === 429 ? 'quota-or-rate-limit' : 'http-error';
      await response.body?.cancel().catch(() => {});
    } else {
      const { body, bytes } = await readBoundedJSON(response);
      row.responseBytes = bytes;
      if (!body || typeof body !== 'object' || (body.items !== undefined && !Array.isArray(body.items))) {
        throw new Error('invalid-response-shape');
      }
      row.totalItems = Number.isSafeInteger(body.totalItems) && body.totalItems >= 0 ? body.totalItems : null;
      row.volumes = (body.items ?? []).slice(0, maxResults).map(item => selectVolume(item, key)).filter(Boolean);
    }
  } catch (error) {
    // Only fixed operational labels leave memory, never exception text or objects.
    row.errorReason = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout'
      : error?.message === 'response-too-large' ? 'response-too-large'
      : error instanceof SyntaxError ? 'invalid-json'
      : error?.message === 'invalid-response-shape' ? 'invalid-response-shape' : 'network-or-body-error';
  }
  row.elapsedMs = Date.now() - started;
  row.summary = summarize(row.volumes, target);
  return row;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && !['--dry-run', '--run'].includes(args[0]))) {
    process.stdout.write('Use --dry-run (default) or --run.\n');
    process.exitCode = 1;
    return;
  }
  const targets = createTargets(readJSON(inputPath));
  const saved = readJSON(accessPath);
  const hierarchy = targets.find(target => target.caseId === 'hierarchy' && target.arm === 'series-empty-title');
  if (saved.requests !== 1 || saved.status !== 200 || saved.caseId !== hierarchy.caseId
    || saved.query !== hierarchy.query || !Array.isArray(saved.items) || saved.items.length > maxResults) {
    throw new Error('invalid-saved-access');
  }
  const key = loadKey();
  if (args[0] !== '--run') {
    process.stdout.write(`${JSON.stringify({ status: 'dry-run', keyPresent: Boolean(key), seriesQueries: 12,
      knownTitleAssistedQueries: 8, reusedAttempts: 1, maximumAdditionalAttempts: 19,
      maximumTotalAttempts: maxTotalAttempts, maxResults, showPreorders: true,
      timeoutMs, byteLimit, spacingMs, networkRequests: 0 })}\n`);
    return;
  }
  if (!key || /[\r\n]/u.test(key)) throw new Error('missing-or-invalid-key');
  const initialVolumes = saved.items.map(item => selectVolume(item, key, true)).filter(Boolean);
  const initial = { ...hierarchy, checkedAt: saved.checkedAt, status: saved.status, errorReason: null,
    attempted: false, reused: true, totalItems: saved.totalItems, volumes: initialVolumes,
    showPreorders: 'omitted in saved controller request',
    metadataLimit: 'saved controller selection has no publisher/identifier/description/order fields',
    summary: summarize(initialVolumes, hierarchy) };
  const report = { provider: 'google-books', startedAt: new Date().toISOString(), completedAt: null,
    runStatus: 'running', additionalAttempts: 0, reusedAttempts: 1, totalAttempts: 1,
    maximumTotalAttempts: maxTotalAttempts, maxResults, showPreorders: true, timeoutMs, byteLimit, spacingMs,
    quotaRemaining: null, billingVerified: false, globalStopReason: null,
    cases: [initial], skipped: [],
    scope: '12 empty-title series queries; 8 assisted known-title queries; candidate metadata only' };
  // Exclusive reservation refuses a live replay, including after an interrupted run.
  const fd = fs.openSync(outputPath, 'wx');
  fs.closeSync(fd);
  const persist = () => fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  persist();
  const remaining = targets.filter(target => target !== hierarchy);
  for (let index = 0; index < remaining.length; index += 1) {
    // Spacing after the preceding completed request is stricter than start spacing.
    await new Promise(resolve => setTimeout(resolve, spacingMs));
    if (report.totalAttempts >= maxTotalAttempts) throw new Error('attempt-limit');
    report.additionalAttempts += 1;
    report.totalAttempts += 1;
    persist();
    const row = await probe(remaining[index], key);
    report.cases.push(row);
    if ([401, 403, 429].includes(row.status)) {
      report.globalStopReason = row.errorReason;
      report.skipped = remaining.slice(index + 1).map(({ caseId, arm }) => ({ caseId, arm, reason: 'global-stop' }));
      break;
    }
    persist();
  }
  report.completedAt = new Date().toISOString();
  report.runStatus = report.globalStopReason ? 'stopped' : 'complete';
  persist();
  const statuses = report.cases.reduce((counts, row) => {
    const status = row.status ?? row.errorReason;
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
  process.stdout.write(`${JSON.stringify({ runStatus: report.runStatus, additionalAttempts: report.additionalAttempts,
    reusedAttempts: 1, totalAttempts: report.totalAttempts, statuses, skipped: report.skipped.length,
    quotaRemaining: null, billingVerified: false })}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  main().catch(() => {
    // No raw error details: they may contain a credentialed request URL.
    process.stdout.write('Probe halted: check local prerequisites or sanitized report; no automatic replay.\n');
    process.exitCode = 1;
  });
}
