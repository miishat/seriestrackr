import { createHash } from 'node:crypto';
import type { CheckRequest, Citation, EditionEvidence, EditionFormat, EvidenceBundle, Precision, Reason, Source, Usage } from '../../shared/discovery';
import { emptyUsage } from '../../shared/discovery';
import { parseExtraction } from '../../shared/discoveryValidation';
import { normalizeIdentity, selectProposals } from '../../shared/discoveryPolicy';
import { fetchProviderJson, fetchAppleProductText, ProviderError } from './http';
import { appleCanonicalTitle, appleProductUrl, normalizeAppleProductPage } from './applePages';
import { createRateQueue } from './rateQueue';
import { normalizeGoogleBooks } from './googleBooks';
import { diagnosticCounts, emitDiagnostic, type DiagnosticObserver } from './diagnostics';
import { createRetrievalContext, type RetrievalContext, type RetrievalPhase } from './retrievalContext';

// overflow names the formats whose exact Apple record set could not be proven complete within the record limit.
export type CatalogResult = { evidence: EvidenceBundle; usage: Usage; reasons: Reason[]; overflow?: Array<'book' | 'audio'> };
// Shared by every collection so cached metadata promises stay valid across phases.
const unavailable = Symbol('unavailable');
const appleQueue = createRateQueue(3100);
const openLibraryQueue = createRateQueue(1100);
const googleBooksQueue = createRateQueue(1100);
const empty = (): EvidenceBundle => ({ sources: [], identities: [], editions: [] });
const object = (input: unknown): Record<string, unknown> => input !== null && typeof input === 'object' && !Array.isArray(input)
  ? input as Record<string, unknown> : {};
const text = (input: unknown, max = 300): string | null => typeof input === 'string' && input.trim() && input.length <= max ? input.trim() : null;
const list = (input: unknown): unknown[] => Array.isArray(input) ? input : [];
const country = (input: unknown): string | null => typeof input === 'string' && /^[a-z]{2}$/i.test(input.trim()) ? input.trim().toUpperCase() : null;
const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 12);
const citations = (sourceId: string, quote: string): Citation[] => quote.match(/[\s\S]{1,600}/g)!.map(part => ({ sourceId, quote: part }));

type LanguageMetadata = { state: 'absent' | 'explicit' | 'ambiguous'; value: string | null };

function languageMetadata(input: unknown): LanguageMetadata {
  const values = input === null || input === undefined ? [] : Array.isArray(input) ? input : [input];
  if (!values.length) return { state: 'absent', value: null };
  const normalized = values.map(item => {
    const value = (text(item, 50) ?? text(object(item).key, 50))?.toLowerCase().replace('/languages/', '');
    if (['en', 'eng', 'english'].includes(value ?? '')) return 'en';
    if (['fr', 'fre', 'fra', 'french'].includes(value ?? '')) return 'fr';
    return value && /^[a-z]{2,3}$/.test(value) ? value : null;
  });
  return normalized.every(item => item !== null && item === normalized[0])
    ? { state: 'explicit', value: normalized[0] } : { state: 'ambiguous', value: null };
}
const language = (input: unknown): string | null => languageMetadata(input).value;

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
function append(bundle: EvidenceBundle, source: Source, edition?: EditionEvidence): string {
  const existing = bundle.sources.find(item => item.id === source.id);
  if (existing?.text === source.text && existing.url === source.url) return existing.id;
  if (existing) {
    source = { ...source, id: `${source.id}:${hash(source.text + source.url)}` };
    if (bundle.sources.some(item => item.id === source.id)) return source.id;
    if (edition) edition = { ...edition, id: source.id, citations: edition.citations.map(item => ({ ...item, sourceId: source.id })) };
  }
  bundle.sources.push(source);
  if (edition) bundle.editions.push(edition);
  return source.id;
}

function bibliographicText(edition: Omit<EditionEvidence, 'citations'>): string {
  return `Title: ${edition.title}. Author: ${edition.author}. Format: ${edition.format}. Language: ${edition.language ?? 'unknown'}. Market: ${edition.market ?? 'unknown'}. Date: ${edition.date ?? 'unknown'}. Precision: ${edition.precision}. Edition: ${edition.editionKey ?? 'unknown'}.`;
}

export function normalizeApple(input: unknown, market: string, format: 'ebook' | 'audio', checkedAt: string): EvidenceBundle {
  return normalizeAppleRecords(input, market, format, checkedAt);
}

const APPLE_RECORD_LIMIT = 20;
// Over-limit responses are grouped deterministically by relevance: exact work
// records (and records sharing their identifier) keep their response order and
// come first, so a target or conflicting alternative past the 20th row survives.
// The caller always marks any over-limit response with the budget reason.
// `incomplete.value` is raised when the exact set cannot be proven complete: unknown
// relevance, or more exact rows than the limit retains.
function boundedAppleRecords(rows: unknown[], format: 'ebook' | 'audio', relevance?: { title: string; author: string }, incomplete?: { value: boolean }): unknown[] {
  if (rows.length <= APPLE_RECORD_LIMIT) return rows;
  if (!relevance?.title.trim()) { if (incomplete) incomplete.value = true; return rows.slice(0, APPLE_RECORD_LIMIT); }
  const idOf = (raw: Record<string, unknown>) => format === 'ebook' ? raw.trackId : raw.collectionId ?? raw.trackId;
  const titleOf = (raw: Record<string, unknown>) => format === 'ebook' ? raw.trackName : raw.collectionName ?? raw.trackName;
  const exactIds = new Set(rows.map(object).filter(raw => typeof titleOf(raw) === 'string' && normalizeIdentity(String(titleOf(raw))) === normalizeIdentity(relevance.title) &&
    typeof raw.artistName === 'string' && normalizeIdentity(raw.artistName) === normalizeIdentity(relevance.author)).map(idOf));
  const exact = rows.filter(row => exactIds.has(idOf(object(row))));
  const rest = rows.filter(row => !exactIds.has(idOf(object(row))));
  if (exact.length > APPLE_RECORD_LIMIT && incomplete) incomplete.value = true;
  return [...exact, ...rest].slice(0, APPLE_RECORD_LIMIT);
}

function normalizeAppleRecords(input: unknown, market: string, format: 'ebook' | 'audio', checkedAt: string, languageStates?: Map<string, LanguageMetadata>,
  relevance?: { title: string; author: string }, incomplete?: { value: boolean }): EvidenceBundle {
  const bundle = empty();
  for (const item of boundedAppleRecords(list(object(input).results), format, relevance, incomplete)) {
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
    const metadata = languageMetadata([raw.language, raw.languages].filter(value => value !== null && value !== undefined)
      .flatMap(value => Array.isArray(value) ? value : [value]));
    const edition = { id, title, author, position: null, editionKey: isbn(raw.isbn13 ?? raw.isbn) ?? `apple:${identifier}`,
      format, language: metadata.value, market: contradictory ? null : actualMarket,
      ...date(raw.releaseDate, true) } satisfies Omit<EditionEvidence, 'citations'>;
    const quote = bibliographicText(edition);
    const narrator = text(raw.narratorName);
    const source: Source = { id, title, url, provider: 'apple', market: edition.market, retrievedAt: checkedAt,
      text: `${quote}${metadata.state === 'ambiguous' ? ' Language metadata: ambiguous.' : ''}${narrator ? ` Narrator: ${narrator}.` : ''}${contradictory ? ' Contradictory country attribution.' : ''}` };
    const sourceId = append(bundle, source, contradictory ? undefined : { ...edition, citations: citations(id, quote) });
    languageStates?.set(sourceId, metadata);
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

function merge(destination: EvidenceBundle, incoming: EvidenceBundle): Map<string, string> {
  const aliases = new Map<string, string>();
  // Map every source before copying facts, including all citations to shared sources.
  for (const source of incoming.sources) {
    // Google may assign a different collision alias when the same rows arrive
    // in another order. Reuse the retained facts before generating another ID.
    const retained = source.provider === 'googlebooks' ? destination.sources.find(item => item.text === source.text && item.url === source.url &&
      item.provider === source.provider && item.market === source.market && item.title === source.title) : undefined;
    aliases.set(source.id, retained?.id ?? append(destination, { ...source }));
  }
  const remap = (items: Citation[]) => items.map(item => ({ ...item, sourceId: aliases.get(item.sourceId) ?? item.sourceId }));
  for (const identity of incoming.identities) {
    const copied = { ...identity, citations: remap(identity.citations) };
    if (!destination.identities.some(item => JSON.stringify(item) === JSON.stringify(copied))) destination.identities.push(copied);
  }
  for (const edition of incoming.editions) {
    let copied = { ...edition, id: aliases.get(edition.id) ?? edition.id, citations: remap(edition.citations) };
    const existing = destination.editions.find(item => item.id === copied.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(copied)) copied = { ...copied, id: `${copied.id}:${hash(JSON.stringify(copied))}` };
    if (!destination.editions.some(item => item.id === copied.id)) destination.editions.push(copied);
  }
  return aliases;
}

function joinAppleLanguages(evidence: EvidenceBundle, originalLanguages: Map<string, LanguageMetadata>): void {
  for (const apple of evidence.editions.filter(item => item.id.startsWith('apple:') && item.editionKey?.startsWith('isbn:'))) {
    const originalLanguage = originalLanguages.get(apple.id);
    const matches = evidence.editions.filter(item => item.id.startsWith('openlibrary:') && item.editionKey === apple.editionKey &&
      item.format === apple.format && normalizeIdentity(item.title) === normalizeIdentity(apple.title) && normalizeIdentity(item.author) === normalizeIdentity(apple.author));
    const languages = new Set(matches.map(item => item.language));
    if (!matches.length) continue;
    if (!originalLanguage || originalLanguage.state === 'ambiguous' || languages.size !== 1 || languages.has(null) ||
      (originalLanguage.state === 'explicit' && !languages.has(originalLanguage.value))) {
      apple.language = null;
      continue;
    }
    apple.language = matches[0].language;
    for (const match of matches) for (const citation of match.citations) {
      if (!apple.citations.some(item => item.sourceId === citation.sourceId && item.quote === citation.quote)) apple.citations.push(citation);
    }
  }
}

export async function collectCatalogs(request: CheckRequest, markets: string[], signal: AbortSignal, fetcher: typeof fetch = fetch,
  options: { googleBooksKey?: string | null; onDiagnostic?: DiagnosticObserver; appleIsbnJoin?: boolean; appleProductPages?: boolean; seedEvidence?: EvidenceBundle;
  context?: RetrievalContext; phase?: RetrievalPhase } = {}): Promise<CatalogResult> {
  const evidence = empty();
  const context = options.context ?? createRetrievalContext();
  const seeded = { sources: new Set<string>(), identities: new Set<string>() };
  const reasons: Reason[] = [];
  const overflow = new Set<'book' | 'audio'>();
  const originalLanguages = new Map<string, LanguageMetadata>();
  const checkedAt = new Date().toISOString();
  const reason = (value: Reason) => {
    if (!reasons.includes(value)) reasons.push(value);
    if (value === 'budget' || value === 'invalid-evidence') emitDiagnostic(options.onDiagnostic,
      { stage: 'catalog', category: value === 'budget' ? 'bounds' : 'shape', ...diagnosticCounts(evidence) });
  };
  if (options.seedEvidence) {
    const seed = parseExtraction(options.seedEvidence, options.seedEvidence.sources);
    if (seed.ok) {
      merge(evidence, seed.value);
      // Enrichment seeds are already retained by the caller; they are context, not new evidence.
      if (options.phase === 'enrich') {
        seed.value.sources.forEach(source => seeded.sources.add(source.id));
        seed.value.identities.forEach(identity => seeded.identities.add(JSON.stringify(identity)));
      }
    } else reason('invalid-evidence');
  }
  const preferred = country(request.preferredMarket);
  const countries = [...new Set([preferred, ...markets.map(country)].filter((item): item is string => item !== null && (item === preferred || ['US', 'GB', 'CA'].includes(item))))].slice(0, 4);
  const formats = [...new Set(request.formats)];
  const queries = context.cache;
  const hydrated = new Set<string>();
  const googleBooksKey = options.googleBooksKey?.trim() ?? '';
  const seriesQuery = `${request.target.series} inauthor:${request.target.author}`;
  const titleQuery = (title: string) => `intitle:${title} inauthor:${request.target.author}`;

  const effectiveRequest = (): CheckRequest => {
    if (request.target.title) return request;
    const identity = selectProposals(request, evidence, checkedAt).identity;
    return identity ? { ...request, target: { ...request.target, title: identity.title } } : request;
  };
  const initialTitle = effectiveRequest().target.title;
  const initialQuery = initialTitle ? titleQuery(initialTitle) : seriesQuery;
  const retrieve = (provider: 'apple' | 'openlibrary' | 'googlebooks', path: string): Promise<unknown> => {
    const key = `${provider}:${path}`;
    const cached = queries.get(key);
    if (cached) return cached;
    const queue = { apple: appleQueue, openlibrary: openLibraryQueue, googlebooks: googleBooksQueue }[provider];
    if (signal.aborted) { reason('cancelled'); return Promise.resolve(unavailable); }
    if (!context.canClaim(provider)) { emitDiagnostic(options.onDiagnostic, { stage: 'catalog', category: 'bounds', ...diagnosticCounts(evidence), provider, rule: 'request-bound' }); reason('budget'); return Promise.resolve(unavailable); }
    const operation = queue.run(async () => {
      if (!context.claim(provider)) throw new ProviderError(provider, 'budget');
      return fetchProviderJson(provider, path, {}, signal, fetcher, options.onDiagnostic);
    }, signal).catch(error => {
      reason(signal.aborted ? 'cancelled' : error instanceof ProviderError ? error.reason : 'provider-error');
      return unavailable;
    });
    queries.set(key, operation);
    return operation;
  };
  async function googleSearch(query: string): Promise<void> {
    const params = new URLSearchParams({ q: query, key: googleBooksKey, maxResults: '20', showPreorders: 'true', langRestrict: 'en' });
    const raw = await retrieve('googlebooks', `/books/v1/volumes?${params}`);
    if (raw === unavailable) return;
    const envelope = object(raw);
    if (!Array.isArray(envelope.items)) {
      if (!Object.hasOwn(envelope, 'items') && envelope.totalItems === 0) return;
      reason('invalid-evidence'); return;
    }
    if (envelope.items.length > 20) reason('budget');
    // Query narrowing must not erase alternatives for an originally unknown title.
    merge(evidence, normalizeGoogleBooks(raw, request, checkedAt));
  }
  async function appleSearch(market: string, format: 'book' | 'audio'): Promise<void> {
    const target = effectiveRequest().target;
    const term = `${target.title || target.series} ${target.author}`;
    const params = new URLSearchParams({ term, country: market.toLowerCase(), entity: format === 'book' ? 'ebook' : 'audiobook', limit: '20' });
    const raw = await retrieve('apple', `/search?${params}`);
    if (raw === unavailable) return;
    const results = object(raw).results;
    if (!Array.isArray(results)) { reason('invalid-evidence'); return; }
    if (results.length > 20) reason('budget');
    const languageStates = new Map<string, LanguageMetadata>();
    const incomplete = { value: false };
    const normalized = normalizeAppleRecords(raw, market, format === 'book' ? 'ebook' : 'audio', checkedAt, languageStates,
      { title: target.title, author: request.target.author }, incomplete);
    if (incomplete.value) overflow.add(format);
    if (results.length && !normalized.sources.length) reason('invalid-evidence');
    for (const [incomingId, actualId] of merge(evidence, normalized)) {
      if (!originalLanguages.has(actualId) && languageStates.has(incomingId)) originalLanguages.set(actualId, languageStates.get(incomingId)!);
    }
    joinAppleLanguages(evidence, originalLanguages);
  }

  async function hydrateApple(market: string): Promise<void> {
    if (!options.appleProductPages) return;
    const targetRequest = effectiveRequest();
    if (!targetRequest.target.title) return;
    const candidates = evidence.editions.filter(edition => edition.id.startsWith('apple:') && edition.market === market &&
      formats.includes(edition.format === 'audio' ? 'audio' : 'book') && appleCanonicalTitle(edition, targetRequest) !== null)
      .sort((left, right) => (left.date ?? '9999-99-99').localeCompare(right.date ?? '9999-99-99') || left.id.localeCompare(right.id))
      .map(edition => ({ edition, source: evidence.sources.find(source => source.id === edition.id) }))
      .filter((item): item is { edition: EditionEvidence; source: Source } => item.source !== undefined && appleProductUrl(item.source.url, item.edition) !== null);
    const ordered: typeof candidates = [];
    for (const format of formats) {
      const candidate = candidates.find(item => (format === 'audio' ? item.edition.format === 'audio' : item.edition.format === 'ebook'));
      if (candidate) ordered.push(candidate);
    }
    ordered.push(...candidates.filter(item => !ordered.includes(item)));
    for (const { edition, source } of ordered) {
      if (signal.aborted) { reason('cancelled'); break; }
      const key = `${market}:${edition.id}`;
      if (hydrated.has(key)) continue;
      const proposal = selectProposals(request, evidence, checkedAt).releases[edition.format === 'audio' ? 'audio' : 'book'];
      if (proposal?.date && proposal.provenance.sourceMarket === preferred) continue;
      if (!context.canClaim('apple', true)) { reason('budget'); break; }
      hydrated.add(key);
      try {
        const html = await appleQueue.run(async () => {
          if (!context.claim('apple', true)) throw new ProviderError('apple', 'budget');
          return fetchAppleProductText(source.url, signal, fetcher, options.onDiagnostic);
        }, signal);
        const normalized = normalizeAppleProductPage(html, source, edition, targetRequest, checkedAt);
        if (!normalized.sources.length) reason('invalid-evidence');
        merge(evidence, normalized);
      } catch (error) {
        reason(signal.aborted ? 'cancelled' : error instanceof ProviderError ? error.reason : 'provider-error');
      }
    }
  }

  // ISBN join: an explicit edition identifier is stronger evidence than title
  // text. Catalog-supplied ISBNs are resolved directly against the storefront
  // so a decorated storefront title (series, ordinal, Unabridged) can still
  // supply the market-scoped date for the exact edition.
  const appleIsbnJoin = async (): Promise<void> => {
    const market = countries[0];
    const target = effectiveRequest().target;
    if (!market || !target.title || !formats.includes('book')) return;
    const workTitle = normalizeIdentity(target.title);
    const workAuthor = normalizeIdentity(request.target.author);
    const candidates = new Map<string, EditionEvidence[]>();
    for (const item of evidence.editions) {
      if (!item.editionKey?.startsWith('isbn:') || item.format !== 'ebook' || item.id.startsWith('apple:')) continue;
      if (normalizeIdentity(item.title) !== workTitle || normalizeIdentity(item.author) !== workAuthor) continue;
      candidates.set(item.editionKey, [...(candidates.get(item.editionKey) ?? []), item]);
    }
    for (const [key, matches] of [...candidates].slice(0, 4)) {
      if (signal.aborted) return;
      const proposal = selectProposals(request, evidence, checkedAt).releases.book;
      if (proposal?.date && proposal.provenance.sourceMarket === preferred) continue;
      const params = new URLSearchParams({ isbn: key.slice('isbn:'.length),
        country: market.toLowerCase(), entity: 'ebook', limit: '5' });
      const raw = await retrieve('apple', `/lookup?${params}`);
      if (raw === unavailable) continue;
      const results = object(raw).results;
      if (!Array.isArray(results)) { reason('invalid-evidence'); continue; }
      if (results.length > 5) { reason('budget'); continue; }
      const responseIsbns = results.flatMap(item => {
        const record = object(item);
        return [record.isbn13, record.isbn].filter(value => value !== null && value !== undefined);
      });
      if (responseIsbns.some(value => isbn(value) !== key)) { reason('invalid-evidence'); continue; }
      const languageStates = new Map<string, LanguageMetadata>();
      const normalized = normalizeAppleRecords(raw, market, 'ebook', checkedAt, languageStates);
      if (normalized.editions.length !== 1 || normalized.sources.length !== 1) continue;
      const edition = normalized.editions[0];
      if (normalizeIdentity(edition.author) !== workAuthor) continue;
      const metadata = languageStates.get(edition.id);
      const languages = new Set(matches.map(item => item.language));
      const catalogLanguage = languages.size === 1 && !languages.has(null) ? matches[0].language : null;
      const joinedLanguage = metadata?.state === 'absent' ? catalogLanguage
        : metadata?.state === 'explicit' && catalogLanguage === metadata.value ? metadata.value : null;
      const association = `ISBN lookup: ${key}. Returned edition: ${edition.editionKey}. Canonical title: ${target.title}.`;
      const source = normalized.sources[0];
      source.text += ` ${association}`;
      const joined = empty();
      joined.sources.push(source);
      const joinedCitations = [...edition.citations, ...citations(source.id, association)];
      for (const match of matches) for (const citation of match.citations) {
        if (!joinedCitations.some(item => item.sourceId === citation.sourceId && item.quote === citation.quote)) joinedCitations.push(citation);
      }
      joined.editions.push({ ...edition, title: target.title, editionKey: key, language: joinedLanguage, citations: joinedCitations });
      for (const [incomingId, actualId] of merge(evidence, joined)) {
        if (!originalLanguages.has(actualId) && languageStates.has(incomingId)) originalLanguages.set(actualId, languageStates.get(incomingId)!);
      }
    }
  };

  if (googleBooksKey && !signal.aborted) await googleSearch(initialQuery);
  for (const format of formats) if (countries[0] && !signal.aborted) await appleSearch(countries[0], format);
  if (countries[0] && !signal.aborted) await hydrateApple(countries[0]);
  if (!signal.aborted) {
    const target = effectiveRequest().target;
    const params = new URLSearchParams({ title: target.title || target.series, author: target.author, limit: '20', fields: 'key,title,author_name,author_key,edition_key,first_publish_year,language' });
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
        if (names.length !== 1 || normalizeIdentity(String(names[0])) !== normalizeIdentity(target.author) ||
          (target.title && normalizeIdentity(String(doc.title)) !== normalizeIdentity(target.title))) continue;
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
    if (!signal.aborted) await hydrateApple(market);
  }
  if (googleBooksKey && !signal.aborted) {
    const proposals = selectProposals(request, evidence, checkedAt);
    const needsIdentity = (!request.target.title || !Number.isInteger(request.target.position)) && !proposals.identity;
    const needsBook = formats.includes('book') && !proposals.releases.book?.date;
    const alternate = request.target.title ? seriesQuery : proposals.identity ? titleQuery(proposals.identity.title) : null;
    if ((needsBook || needsIdentity) && alternate && alternate !== initialQuery) await googleSearch(alternate);
  }
  if (options.appleIsbnJoin && !signal.aborted) await appleIsbnJoin();
  if (countries[0] && !signal.aborted) await hydrateApple(countries[0]);
  if (signal.aborted) reason('cancelled');
  if (seeded.sources.size) {
    evidence.sources = evidence.sources.filter(source => !seeded.sources.has(source.id));
    evidence.identities = evidence.identities.filter(identity => !seeded.identities.has(JSON.stringify(identity)));
  }
  // Usage is the shared aggregate for this check, never a freshly reset counter.
  const counts = context.snapshot();
  const usage = { ...emptyUsage(), apple: counts.apple, openlibrary: counts.openlibrary, googlebooks: counts.googlebooks, hardcover: counts.hardcover };
  return { evidence, usage, reasons, ...(overflow.size ? { overflow: [...overflow] } : {}) };
}

