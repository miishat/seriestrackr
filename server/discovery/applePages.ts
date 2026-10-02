import type { CheckRequest, EditionEvidence, EvidenceBundle, Source } from '../../shared/discovery';
import { normalizeIdentity } from '../../shared/discoveryPolicy';
import { orderedTitle } from './seriesOrder';
import { bindWorkTitle } from './workIdentity';

const empty = (): EvidenceBundle => ({ sources: [], identities: [], editions: [] });
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const literal = (value: unknown): string | null => typeof value === 'string' && value.trim() && value.length <= 300 ? value.trim() : null;

export function appleProductUrl(value: string, edition: EditionEvidence): URL | null {
  try {
    const parsed = new URL(value);
    const match = /^\/([a-z]{2})\/(book|audiobook)\/[^/]+\/id([1-9]\d*)$/.exec(parsed.pathname);
    const identifier = /^apple:(\d+):/.exec(edition.id)?.[1];
    if (!/^https:\/\/books\.apple\.com\//.test(value) || parsed.hostname !== 'books.apple.com' || parsed.username || parsed.password || parsed.port || parsed.hash ||
      !match || match[1].toUpperCase() !== edition.market || match[3] !== identifier || match[2] !== (edition.format === 'audio' ? 'audiobook' : 'book')) return null;
    if ([...parsed.searchParams.keys()].some(key => !['l', 'uo', 'at', 'ct', 'itsct', 'itscg', 'mt'].includes(key))) return null;
    return parsed;
  } catch { return null; }
}

export function appleCanonicalTitle(edition: EditionEvidence, request: CheckRequest): string | null {
  const canonical = request.target.title;
  if (!canonical || normalizeIdentity(edition.author) !== normalizeIdentity(request.target.author)) return null;
  if (edition.format === 'audio') return bindWorkTitle(edition.title, request);
  if (edition.format !== 'ebook') return null;
  if (normalizeIdentity(edition.title) === normalizeIdentity(canonical)) return canonical;
  const explicit = orderedTitle(edition.title, request);
  return explicit && normalizeIdentity(explicit.title) === normalizeIdentity(canonical) ? canonical : null;
}

function exactDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return null;
  const day = value.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(Date.parse(value)) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null;
}

function decode(value: string): string {
  return value.replace(/&(?:amp|quot|apos|lt|gt);|&#(?:\d+|x[\da-f]+);/gi, entity => {
    const named: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const codepoint = entity.toLowerCase().startsWith('&#x') ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10);
    return codepoint > 0 && codepoint <= 0x10ffff ? String.fromCodePoint(codepoint) : entity;
  }).trim();
}

function english(value: unknown): boolean {
  const values = Array.isArray(value) ? value : [value];
  return values.length > 0 && values.every(item => typeof item === 'string' && /^(?:en(?:-[a-z]{2})?|eng|english)$/i.test(item.trim()));
}

function productBadgeScope(html: string, title: string): string | null {
  const visible = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|footer|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const hasClass = (attributes: string, name: string): boolean => {
    const classes = /\bclass\s*=\s*["']([^"']*)["']/i.exec(attributes)?.[1].split(/\s+/) ?? [];
    return classes.includes(name);
  };
  const mains = [...visible.matchAll(/<main\b([^>]*)>([\s\S]*?)<\/main\s*>/gi)];
  if (mains.length !== 1 || !hasClass(mains[0][1], 'is-books-theme') || /<main\b/i.test(mains[0][2])) return null;
  const articles = [...mains[0][2].matchAll(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/gi)];
  if (articles.length !== 1 || /<article\b/i.test(articles[0][1])) return null;
  const sections = [...articles[0][1].matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section\s*>/gi)];
  const heroes = sections.filter(section => hasClass(section[1], 'product-hero'));
  const infobars = sections.filter(section => hasClass(section[1], 'section--book-infobar'));
  if (heroes.length !== 1 || infobars.length !== 1 || /<section\b/i.test(infobars[0][2])) return null;
  const headings = [...heroes[0][2].matchAll(/<h1\b([^>]*)>([^<]*)<\/h1\s*>/gi)];
  if (headings.length !== 1 || !hasClass(headings[0][1], 'product-header__title')) return null;
  const heading = decode(headings[0][2]).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
  if (heading !== title || heroes[0].index! >= infobars[0].index!) return null;
  return infobars[0][2];
}

function languageBadges(html: string): string[] | null {
  const result: string[] = [];
  for (const match of html.matchAll(/<figure\b[^>]*class\s*=\s*["'][^"']*\bbook-badge\b[^"']*["'][^>]*>([\s\S]*?)<\/figure\s*>/gi)) {
    const eyebrows = [...match[1].matchAll(/<div\b[^>]*class\s*=\s*["']book-badge__eyebrow["'][^>]*>([^<]*)<\/div\s*>/gi)];
    if (!eyebrows.some(item => decode(item[1]) === 'LANGUAGE')) continue;
    const captions = [...match[1].matchAll(/<div\b[^>]*class\s*=\s*["']book-badge__caption["'][^>]*>([^<]*)<\/div\s*>/gi)];
    if (eyebrows.length !== 1 || captions.length !== 1) return null;
    result.push(decode(captions[0][1]));
  }
  return result;
}

export function normalizeAppleProductPage(html: string, source: Source, edition: EditionEvidence, request: CheckRequest, checkedAt: string): EvidenceBundle {
  const result = empty();
  const url = appleProductUrl(source.url, edition);
  const title = appleCanonicalTitle(edition, request);
  if (!url || !title || Buffer.byteLength(html, 'utf8') > 1048576) return result;
  const products: Record<string, unknown>[] = [];
  const scripts = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)];
  if (scripts.length > 20) return result;
  for (const script of scripts) {
    if (Buffer.byteLength(script[1], 'utf8') > 65536) return result;
    let parsed: unknown;
    try { parsed = JSON.parse(script[1]); } catch { return result; }
    const roots = Array.isArray(parsed) ? parsed : Array.isArray(object(parsed)['@graph']) ? object(parsed)['@graph'] as unknown[] : [parsed];
    if (roots.length > 50) return result;
    for (const root of roots) {
      const candidate = object(root);
      if (candidate['@type'] === 'Book' || candidate['@type'] === 'Audiobook') products.push(candidate);
    }
  }
  if (products.length !== 1) return result;
  const product = products[0];
  if (product.additionalType !== 'Product' || product['@type'] !== (edition.format === 'audio' ? 'Audiobook' : 'Book') ||
    (edition.format === 'ebook' && !['EBook', 'http://schema.org/EBook', 'https://schema.org/EBook'].includes(String(product.bookFormat))) ||
    literal(product.name) !== edition.title || literal(product.author) !== edition.author) return result;
  const pageUrls = [product.url, product['@id']].filter(value => value !== undefined);
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel\s*=\s*["']canonical["']/i.test(match[0])) continue;
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(match[0]);
    if (!href) return result;
    pageUrls.push(decode(href[1]));
  }
  if (pageUrls.some(value => typeof value !== 'string' || !appleProductUrl(value, edition))) return result;
  const badgeScope = productBadgeScope(html, edition.title);
  const badges = badgeScope === null ? [] : languageBadges(badgeScope);
  if (badges === null || badges.length > 1 || badges.some(value => value !== 'English')) return result;
  const hasLanguage = product.inLanguage !== undefined && product.inLanguage !== null;
  if ((hasLanguage && !english(product.inLanguage)) || (!hasLanguage && (edition.format !== 'audio' || badges.length !== 1))) return result;
  if ((edition.language !== null && edition.language !== 'en') || source.text.includes('Language metadata: ambiguous.')) return result;
  const date = exactDate(product.datePublished);
  const sourceId = `apple-page:${/^apple:(\d+):/.exec(edition.id)![1]}:${edition.market}:${edition.format}`;
  const languageQuote = hasLanguage ? `inLanguage: ${JSON.stringify(product.inLanguage)}.` : 'Product LANGUAGE badge: English.';
  const explicitOrder = orderedTitle(edition.title, request);
  const relationship = title === edition.title ? '' : explicitOrder && normalizeIdentity(explicitOrder.title) === normalizeIdentity(title)
    ? ` Canonical title: ${title}. Literal catalog label: ${edition.title}. Requested series: ${request.target.series}. Requested position: ${request.target.position}. Exact supported series-order title relationship.`
    : ` Canonical title: ${title}. Literal audio label: ${edition.title}. Requested series: ${request.target.series}. Requested position: ${request.target.position}. Exact supported unabridged title relationship.`;
  const quote = `Title: ${edition.title}. Author: ${edition.author}. Format: ${edition.format}. Language: en. ${languageQuote} Market: ${edition.market}. Date: ${date ?? 'unknown'}. Precision: ${date ? 'day' : 'none'}. Edition: ${edition.editionKey}.${relationship}`;
  const normalizedSource: Source = { id: sourceId, title: edition.title, url: source.url, provider: 'apple', market: edition.market, retrievedAt: checkedAt, text: quote };
  result.sources.push(normalizedSource);
  const citations = (quote.match(/[\s\S]{1,600}/g) ?? []).map(part => ({ sourceId, quote: part }));
  const qualified: EditionEvidence = { ...edition, id: sourceId, title, language: 'en', date, precision: date ? 'day' : 'none', citations };
  result.editions.push(qualified);
  if (date && edition.date && date !== edition.date) {
    result.sources.push(source);
    result.editions.push({ ...edition, title, language: 'en', citations: [...edition.citations, ...citations] });
  }
  return result;
}
