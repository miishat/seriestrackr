import { createHash } from 'node:crypto';
import type { CheckRequest, Citation, EditionEvidence, EvidenceBundle, IdentityEvidence, Source } from '../../shared/discovery';
import { normalizeIdentity } from '../../shared/discoveryPolicy';

const object = (input: unknown): Record<string, unknown> => input !== null && typeof input === 'object' && !Array.isArray(input)
  ? input as Record<string, unknown> : {};
const text = (input: unknown, max = 300): string | null => typeof input === 'string' && input.length <= max && input.trim()
  ? input.trim() : null;
const list = (input: unknown): unknown[] => Array.isArray(input) ? input : [];
const country = (input: unknown): string | null => typeof input === 'string' && /^[a-z]{2}$/i.test(input.trim())
  ? input.trim().toUpperCase() : null;
const hash = (facts: string): string => createHash('sha256').update(facts).digest('hex').slice(0, 12);
const citations = (sourceId: string, facts: string): Citation[] => facts.match(/[\s\S]{1,600}/g)!
  .map(quote => ({ sourceId, quote }));

function excluded(title: string, subtitle: string | null): boolean {
  return /\b(?:companions?|omnibus(?:es)?|antholog(?:y|ies)|novellas?|guides?|samplers?|rpgs?)\b|\b(?:short[\s-]+stor(?:y|ies)|boxed[\s-]+sets?)\b/
    .test(normalizeIdentity(`${title} ${subtitle ?? ''}`));
}

function subtitlePosition(subtitle: string | null, request: CheckRequest): number | null {
  if (!subtitle || !Number.isSafeInteger(request.target.position) || request.target.position <= 0) return null;
  const series = normalizeIdentity(request.target.series).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!series) return null;
  const ordinal = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)';
  const suffix = '(?:\\s*:\\s*(\\S.*)|\\s*\\(([^()]*)\\))?';
  const normalized = normalizeIdentity(subtitle);
  const match = new RegExp(`^${series},? book ${ordinal}${suffix}$`).exec(normalized)
    ?? new RegExp(`^book ${ordinal} of ${series}${suffix}$`).exec(normalized);
  if (!match || (match[3] !== undefined && !match[3].trim())) return null;
  const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const position = /^\d+$/.test(match[1]) ? Number(match[1]) : words.indexOf(match[1]) + 1;
  return Number.isSafeInteger(position) && position > 0 && position === request.target.position ? position : null;
}

function calendarDay(input: unknown): string | null {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const [year, month, day] = input.split('-').map(Number);
  const actual = new Date(0);
  actual.setUTCFullYear(year, month - 1, day);
  return actual.getUTCFullYear() === year && actual.getUTCMonth() === month - 1 && actual.getUTCDate() === day ? input : null;
}

function saleTimestamp(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 100) return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(input);
  if (!match || !calendarDay(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59 ||
    (match[5] !== undefined && (Number(match[5]) > 23 || Number(match[6]) > 59)) || !Number.isFinite(Date.parse(input))) return null;
  return input;
}

function editionKey(input: unknown, volumeId: string): string {
  const identifiers = list(input).slice(0, 20).map(object);
  for (const type of ['ISBN_13', 'ISBN_10']) {
    for (const identifier of identifiers) {
      if (identifier.type !== type) continue;
      const value = text(identifier.identifier, 30)?.replace(/[ -]/g, '').toUpperCase();
      if (value && (type === 'ISBN_13' ? /^\d{13}$/ : /^\d{9}[\dX]$/).test(value)) return `isbn:${value}`;
    }
  }
  return `googlebooks:${volumeId}`;
}

// IDs and conflict suffixes depend only on the validated synthetic facts.
function append(bundle: EvidenceBundle, source: Source, identity: IdentityEvidence | null, edition: EditionEvidence | null): void {
  const existing = bundle.sources.find(item => item.id === source.id);
  if (existing?.text === source.text) return;
  if (existing) source = { ...source, id: `${source.id}:${hash(source.text)}` };
  if (bundle.sources.some(item => item.id === source.id)) return;
  bundle.sources.push(source);
  const remap = (items: Citation[]): Citation[] => items.map(item => ({ ...item, sourceId: source.id }));
  if (identity) bundle.identities.push({ ...identity, citations: remap(identity.citations) });
  if (edition) bundle.editions.push({ ...edition, id: source.id, citations: remap(edition.citations) });
}

export function normalizeGoogleBooks(input: unknown, request: CheckRequest, checkedAt: string): EvidenceBundle {
  const bundle: EvidenceBundle = { sources: [], identities: [], editions: [] };
  for (const item of list(object(input).items).slice(0, 20)) {
    const raw = object(item);
    if (typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(raw.id)) continue;
    const info = object(raw.volumeInfo);
    const title = text(info.title);
    const authors = list(info.authors);
    const author = authors.length === 1 ? text(authors[0]) : null;
    const subtitle = Object.hasOwn(info, 'subtitle') ? text(info.subtitle) : null;
    if (!title || !author || (Object.hasOwn(info, 'subtitle') && !subtitle) || info.language !== 'en' ||
      normalizeIdentity(author) !== normalizeIdentity(request.target.author) ||
      (request.target.title && normalizeIdentity(title) !== normalizeIdentity(request.target.title)) || excluded(title, subtitle)) continue;
    const sale = object(raw.saleInfo);
    const isEbook = sale.isEbook === true;
    const position = subtitlePosition(subtitle, request);
    if (!isEbook && position === null) continue;
    const key = editionKey(info.industryIdentifiers, raw.id);
    const timestamp = saleTimestamp(sale.onSaleDate);
    const saleDay = timestamp?.slice(0, 10) ?? null;
    const saleCountry = country(sale.country);
    const qualified = isEbook && (sale.saleability === 'FOR_PREORDER' || sale.saleability === 'FOR_SALE') &&
      saleCountry !== null && timestamp !== null && saleDay === calendarDay(info.publishedDate);
    const id = `googlebooks:${raw.id}`;
    const facts = `Title: ${title}. Author: ${author}.` +
      (subtitle ? ` Subtitle: ${subtitle}.` : '') +
      ` Language: en. Format: ${isEbook ? 'ebook' : 'unknown'}. Edition: ${key}.` +
      (qualified ? ` Saleability: ${sale.saleability}. Market: ${saleCountry}. On sale: ${timestamp}. Date: ${saleDay}. Precision: day.`
        : ' Market: unknown. Date: unknown. Precision: none.');
    const cited = citations(id, facts);
    const source: Source = { id, title, url: `https://books.google.com/books?id=${raw.id}`, provider: 'googlebooks',
      market: qualified ? saleCountry : null, retrievedAt: checkedAt, text: facts };
    const identity: IdentityEvidence | null = position === null ? null : { title, author, position, citations: cited };
    const edition: EditionEvidence | null = isEbook ? { id, title, author, position, editionKey: key, format: 'ebook', language: 'en',
      market: qualified ? saleCountry : null, date: qualified ? saleDay : null, precision: qualified ? 'day' : 'none', citations: cited } : null;
    append(bundle, source, identity, edition);
  }
  return bundle;
}
