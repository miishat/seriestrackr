import { createHash } from 'node:crypto';
import type { CheckRequest, Citation, EditionEvidence, EditionFormat, EvidenceBundle, Precision, Reason, Source, Usage } from '../../shared/discovery';
import { emptyUsage } from '../../shared/discovery';
import { normalizeIdentity, selectProposals } from '../../shared/discoveryPolicy';
import { fetchProviderJson, ProviderError } from './http';
import { createRateQueue } from './rateQueue';

export type CatalogResult = { evidence: EvidenceBundle; usage: Usage; reasons: Reason[] };
const appleQueue = createRateQueue(3100);
const openLibraryQueue = createRateQueue(1100);
const empty = (): EvidenceBundle => ({ sources: [], identities: [], editions: [] });
const object = (input: unknown): Record<string, unknown> => input !== null && typeof input === 'object' && !Array.isArray(input)
  ? input as Record<string, unknown> : {};
const text = (input: unknown, max = 300): string | null => typeof input === 'string' && input.trim() && input.length <= max ? input.trim() : null;
const list = (input: unknown): unknown[] => Array.isArray(input) ? input : [];
const country = (input: unknown): string | null => typeof input === 'string' && /^[a-z]{2}$/i.test(input.trim()) ? input.trim().toUpperCase() : null;
const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 12);
const citations = (sourceId: string, quote: string): Citation[] => quote.match(/[\s\S]{1,600}/g)!.map(part => ({ sourceId, quote: part }));

function language(input: unknown): string | null {
  const values = list(input).length ? list(input) : [input];
  const normalized = values.map(item => {
    const value = (text(item, 50) ?? text(object(item).key, 50))?.toLowerCase().replace('/languages/', '');
    if (['en', 'eng', 'english'].includes(value ?? '')) return 'en';
    if (['fr', 'fre', 'fra', 'french'].includes(value ?? '')) return 'fr';
    return value && /^[a-z]{2,3}$/.test(value) ? value : null;
  });
  return normalized.length && normalized.every(item => item !== null && item === normalized[0]) ? normalized[0] : null;
}

function date(input: unknown, isoOnly = false): { date: string | null; precision: Precision } {
  const unknown = { date: null, precision: 'none' as const };
  let value = text(input, 100);
  if (!value) return unknown;
  if (isoOnly) {
    if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) || !Number.isFinite(Date.parse(value))) return unknown;
    value = value.slice(0, 10);
  } else {
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const named = /^([a-z]+) (?:(\d{1,2}),? )?(\d{4})$/i.exec(value);
    if (named) {
      const month = months.indexOf(named[1].toLowerCase()) + 1;
      if (!month) return unknown;
      value = `${named[3]}-${String(month).padStart(2, '0')}${named[2] ? `-${named[2].padStart(2, '0')}` : ''}`;
    }
    if (/^\d{4}$/.test(value)) return { date: value, precision: 'year' };
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return { date: value, precision: 'month' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return unknown;
  const [year, month, day] = value.split('-').map(Number);
  const actual = new Date(0);
  actual.setUTCFullYear(year, month - 1, day);
  if (actual.getUTCFullYear() !== year || actual.getUTCMonth() !== month - 1 || actual.getUTCDate() !== day) return unknown;
  return { date: value, precision: 'day' };
}

function isbn(input: unknown): string | null {
  for (const item of Array.isArray(input) ? input : [input]) {
    const value = text(item, 30)?.replace(/[ -]/g, '');
    if (value && /^(?:\d{13}|\d{9}[\dXx])$/.test(value)) return `isbn:${value.toUpperCase()}`;
  }
  return null;
}

// Repeated identical evidence is coalesced; incompatible same-ID records keep distinct citations.
function append(bundle: EvidenceBundle, source: Source, edition?: EditionEvidence): void {
  const existing = bundle.sources.find(item => item.id === source.id);
  if (existing?.text === source.text && existing.url === source.url) return;
  if (existing) {
    source = { ...source, id: `${source.id}:${hash(source.text + source.url)}` };
    if (bundle.sources.some(item => item.id === source.id)) return;
    if (edition) edition = { ...edition, id: source.id, citations: edition.citations.map(item => ({ ...item, sourceId: source.id })) };
  }
  bundle.sources.push(source);
  if (edition) bundle.editions.push(edition);
}

function bibliographicText(edition: Omit<EditionEvidence, 'citations'>): string {
  return `Title: ${edition.title}. Author: ${edition.author}. Format: ${edition.format}. Language: ${edition.language ?? 'unknown'}. Market: ${edition.market ?? 'unknown'}. Date: ${edition.date ?? 'unknown'}. Precision: ${edition.precision}. Edition: ${edition.editionKey ?? 'unknown'}.`;
}

export function normalizeApple(input: unknown, market: string, format: 'ebook' | 'audio', checkedAt: string): EvidenceBundle {
  const bundle = empty();
  for (const item of list(object(input).results).slice(0, 20)) {
    const raw = object(item);
    const identifier = format === 'ebook' ? raw.trackId : raw.collectionId ?? raw.trackId;
    if (!(typeof identifier === 'number' && Number.isSafeInteger(identifier) && identifier > 0)) continue;
    const title = text(format === 'ebook' ? raw.trackName : raw.collectionName ?? raw.trackName);
    const author = text(raw.artistName);
    const url = text(format === 'ebook' ? raw.trackViewUrl : raw.collectionViewUrl ?? raw.trackViewUrl, 2048);
    if (!title || !author || !url) continue;
    let storefront: string | null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !['books.apple.com', 'itunes.apple.com'].includes(parsed.hostname) || parsed.username || parsed.password) continue;
      storefront = country(parsed.pathname.split('/')[1]);
    } catch { continue; }
    const explicitCountry = country(raw.country);
    const actualMarket = storefront ?? explicitCountry;
    const contradictory = storefront !== null && explicitCountry !== null && storefront !== explicitCountry;
    const id = `apple:${identifier}:${actualMarket ?? country(market) ?? 'unknown'}:${format}`;
    const edition = { id, title, author, position: null, editionKey: isbn(raw.isbn13 ?? raw.isbn) ?? `apple:${identifier}`,
      format, language: language(raw.language ?? raw.languages), market: contradictory ? null : actualMarket,
      ...date(raw.releaseDate, true) } satisfies Omit<EditionEvidence, 'citations'>;
    const quote = bibliographicText(edition);
    const narrator = text(raw.narratorName);
    const source: Source = { id, title, url, provider: 'apple', market: edition.market, retrievedAt: checkedAt,
      text: `${quote}${narrator ? ` Narrator: ${narrator}.` : ''}${contradictory ? ' Contradictory country attribution.' : ''}` };
    append(bundle, source, contradictory ? undefined : { ...edition, citations: citations(id, quote) });
  }
  return bundle;
}

function openLibraryFormat(value: unknown): EditionFormat | null {
  const format = text(value)?.toLowerCase();
  if (['ebook', 'e-book', 'electronic resource', 'digital book'].includes(format ?? '')) return 'ebook';
  if (['paperback', 'hardcover', 'hardback', 'print', 'mass market paperback'].includes(format ?? '')) return 'print';
  if (['audiobook', 'audio book', 'audio cd'].includes(format ?? '')) return 'audio';
  return null;
}

export function normalizeOpenLibrary(input: unknown, checkedAt: string): EvidenceBundle {
  const bundle = empty();
  const value = object(input);
  for (const item of Array.isArray(value.docs) ? value.docs.slice(0, 20) : [value]) {
    const raw = object(item);
    const key = text(raw.key, 60);
    const title = text(raw.title);
    const authors = list(raw.author_name).map(item => text(item));
    const author = authors.length === 1 ? authors[0] : null;
    if (!key || !/^\/(?:works\/OL\d+W|books\/OL\d+M)$/.test(key) || !title || !author) continue;
    const isEdition = key.startsWith('/books/');
    const format = isEdition ? openLibraryFormat(raw.physical_format) : null;
    const id = `openlibrary:${key.split('/').pop()}`;
    const facts = { id, title, author, position: null, editionKey: isbn(raw.isbn_13 ?? raw.isbn_10) ?? key,
      format, language: isEdition ? language(raw.languages) : null, market: null, ...(isEdition ? date(raw.publish_date) : { date: null, precision: 'none' as const }) };
    const quote = format ? bibliographicText({ ...facts, format })
      : `Title: ${title}. Author: ${author}. Format: unknown. Language: ${facts.language ?? 'unknown'}. Market: unknown. Date: ${facts.date ?? 'unknown'}. Precision: ${facts.precision}. Edition: ${isEdition ? facts.editionKey : 'unknown'}.`;
    const source: Source = { id, title, url: `https://openlibrary.org${key}`, provider: 'openlibrary', market: null, retrievedAt: checkedAt, text: quote };
    append(bundle, source, format ? { ...facts, format, citations: citations(id, quote) } : undefined);
  }
  return bundle;
}

function merge(destination: EvidenceBundle, incoming: EvidenceBundle): void {
  for (const source of incoming.sources) append(destination, source, incoming.editions.find(item => item.citations.some(cited => cited.sourceId === source.id)));
}

function joinAppleLanguages(evidence: EvidenceBundle, originalLanguages: Map<string, string | null>): void {
  for (const apple of evidence.editions.filter(item => item.id.startsWith('apple:') && item.editionKey?.startsWith('isbn:'))) {
    if (!originalLanguages.has(apple.id)) originalLanguages.set(apple.id, apple.language);
    const originalLanguage = originalLanguages.get(apple.id)!;
    const matches = evidence.editions.filter(item => item.id.startsWith('openlibrary:') && item.editionKey === apple.editionKey &&
      item.format === apple.format && normalizeIdentity(item.title) === normalizeIdentity(apple.title) && normalizeIdentity(item.author) === normalizeIdentity(apple.author));
    const languages = new Set(matches.map(item => item.language));
    if (!matches.length) continue;
    if (languages.size !== 1 || languages.has(null) || (originalLanguage !== null && !languages.has(originalLanguage))) {
      apple.language = null;
      continue;
    }
    apple.language = matches[0].language;
    for (const match of matches) for (const citation of match.citations) {
      if (!apple.citations.some(item => item.sourceId === citation.sourceId && item.quote === citation.quote)) apple.citations.push(citation);
    }
  }
}

export async function collectCatalogs(request: CheckRequest, markets: string[], signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<CatalogResult> {
  const evidence = empty();
  const usage = emptyUsage();
  const reasons: Reason[] = [];
  const originalLanguages = new Map<string, string | null>();
  const unavailable = Symbol('unavailable');
  const checkedAt = new Date().toISOString();
  const reason = (value: Reason) => { if (!reasons.includes(value)) reasons.push(value); };
  const preferred = country(request.preferredMarket);
  const countries = [...new Set([preferred, ...markets.map(country)].filter((item): item is string => item !== null && (item === preferred || ['US', 'GB', 'CA'].includes(item))))].slice(0, 4);
  const formats = [...new Set(request.formats)];
  const queries = new Map<string, Promise<unknown>>();
  const retrieve = (provider: 'apple' | 'openlibrary', path: string): Promise<unknown> => {
    const key = `${provider}:${path}`;
    const cached = queries.get(key);
    if (cached) return cached;
    const queue = provider === 'apple' ? appleQueue : openLibraryQueue;
    const cap = provider === 'apple' ? 12 : 3;
    if (signal.aborted) { reason('cancelled'); return Promise.resolve(unavailable); }
    if (usage[provider] >= cap) { reason('budget'); return Promise.resolve(unavailable); }
    const operation = queue.run(async () => {
      usage[provider]++;
      return fetchProviderJson(provider, path, {}, signal, fetcher);
    }, signal).catch(error => {
      reason(signal.aborted ? 'cancelled' : error instanceof ProviderError ? error.reason : 'provider-error');
      return unavailable;
    });
    queries.set(key, operation);
    return operation;
  };
  const term = `${request.target.title || request.target.series} ${request.target.author}`;
  async function appleSearch(market: string, format: 'book' | 'audio'): Promise<void> {
    const params = new URLSearchParams({ term, country: market.toLowerCase(), entity: format === 'book' ? 'ebook' : 'audiobook', limit: '20' });
    const raw = await retrieve('apple', `/search?${params}`);
    if (raw === unavailable) return;
    const results = object(raw).results;
    if (!Array.isArray(results)) { reason('invalid-evidence'); return; }
    if (results.length > 20) reason('budget');
    const normalized = normalizeApple(raw, market, format === 'book' ? 'ebook' : 'audio', checkedAt);
    if (results.length && !normalized.sources.length) reason('invalid-evidence');
    merge(evidence, normalized);
    joinAppleLanguages(evidence, originalLanguages);
  }

  for (const format of formats) if (countries[0] && !signal.aborted) await appleSearch(countries[0], format);
  if (!signal.aborted) {
    const params = new URLSearchParams({ title: request.target.title || request.target.series, author: request.target.author, limit: '20', fields: 'key,title,author_name,author_key,edition_key,first_publish_year,language' });
    const raw = await retrieve('openlibrary', `/search.json?${params}`);
    const docs = object(raw).docs;
    if (!Array.isArray(docs)) { if (raw !== unavailable) reason('invalid-evidence'); }
    else {
      if (docs.length > 20) reason('budget');
      merge(evidence, normalizeOpenLibrary(raw, checkedAt));
      const candidates = new Map<string, Record<string, unknown>>();
      for (const item of docs.slice(0, 20)) {
        const doc = object(item);
        const names = list(doc.author_name);
        if (names.length !== 1 || normalizeIdentity(String(names[0])) !== normalizeIdentity(request.target.author) ||
          (request.target.title && normalizeIdentity(String(doc.title)) !== normalizeIdentity(request.target.title))) continue;
        for (const key of list(doc.edition_key)) if (typeof key === 'string' && /^OL\d+M$/.test(key) && !candidates.has(key)) candidates.set(key, doc);
      }
      for (const [key, doc] of [...candidates].slice(0, 2)) {
        if (signal.aborted) break;
        const editionRaw = await retrieve('openlibrary', `/books/${key}.json`);
        if (editionRaw === unavailable) continue;
        const edition = object(editionRaw);
        const authorKeys = list(doc.author_key).filter(item => typeof item === 'string');
        const editionAuthors = list(edition.authors).map(item => object(item).key);
        // The requested edition ID and explicit author reference must agree with the search record.
        if (edition.key !== `/books/${key}` || authorKeys.length !== 1 || editionAuthors.length !== 1 || editionAuthors[0] !== `/authors/${authorKeys[0]}`) {
          reason('invalid-evidence'); continue;
        }
        merge(evidence, normalizeOpenLibrary({ ...edition, author_name: doc.author_name }, checkedAt));
      }
      joinAppleLanguages(evidence, originalLanguages);
    }
  }
  for (const market of countries.slice(1)) {
    for (const format of formats) {
      if (signal.aborted) break;
      const proposal = selectProposals(request, evidence, checkedAt).releases[format];
      if (proposal?.date && proposal.provenance.sourceMarket === preferred) continue;
      await appleSearch(market, format);
    }
  }
  if (signal.aborted) reason('cancelled');
  return { evidence, usage, reasons };
}
