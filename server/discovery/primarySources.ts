import type { CheckRequest, Citation, EditionEvidence, EvidenceBundle, IdentityEvidence, RelatedWorkEvidence, Source } from '../../shared/discovery';
import { normalizeIdentity } from '../../shared/discoveryPolicy';
import { parseExtraction } from '../../shared/discoveryValidation';
import { isPlaceholderTitle } from './workIdentity';

// Host-specific product blocks only. Every quote is an exact substring of the
// retrieved text. Retrieved prose is data: nothing here follows instructions in it.
const MAX_QUOTE = 600;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const flexible = (s: string) => escape(s.trim()).replace(/\s+/g, '\\s+');
const hostOf = (source: Source): string | null => {
  try { return new URL(source.url).hostname.toLowerCase(); } catch { return null; }
};
const usableTitle = (title: string) => title.length > 0 && title.length <= 300 && !isPlaceholderTitle(title);
// The page's own retrieved title must agree with the product heading, so a
// stray first line (an injected sentence, a banner) cannot become a title.
const titled = (source: Source, title: string) => {
  const page = normalizeIdentity(source.title), heading = normalizeIdentity(title);
  return page.length > 0 && heading.length > 0 && (page.includes(heading) || heading.includes(page));
};
// A numbered identity may never rename a title the request already supplies.
const matchesRequested = (request: CheckRequest, title: string) =>
  !request.target.title.trim() || normalizeIdentity(request.target.title) === normalizeIdentity(title);
const sectionBreak = /\n\s*(?:Recommended(?: Books)?|You May Also Like|Related (?:Books|Products)|Also by|The Complete Series|Customers Also|Reviews?)\b/i;

// A verified block longer than one citation allows is split into exact pieces.
function citationsFor(source: Source, quote: string): Citation[] {
  const pieces: Citation[] = [];
  for (let at = 0; at < quote.length; at += MAX_QUOTE) {
    const piece = quote.slice(at, at + MAX_QUOTE);
    if (piece.trim()) pieces.push({ sourceId: source.id, quote: piece });
  }
  return pieces.every(piece => source.text.includes(piece.quote)) ? pieces : [];
}

function macmillanHeader(source: Source): string | null {
  if (hostOf(source) !== 'us.macmillan.com') return null;
  return source.text.split(/\nBook Details\b/)[0].trim();
}

function macmillanNumbered(source: Source, request: CheckRequest): IdentityEvidence | null {
  const block = macmillanHeader(source);
  if (!block) return null;
  const pattern = new RegExp(`^([^\\n]+)\\n(?:[^\\n]+\\n)?${escape(request.target.series)} \\(Volume ${request.target.position}\\)\\nAuthor: ${escape(request.target.author)}$`, 'i');
  const matched = pattern.exec(block);
  if (!matched || !usableTitle(matched[1].trim()) || !titled(source, matched[1].trim()) || !matchesRequested(request, matched[1].trim())) return null;
  const citations = citationsFor(source, block);
  return citations.length ? { title: matched[1].trim(), author: request.target.author,
    position: request.target.position, citations } : null;
}

function aethonNumbered(source: Source, request: CheckRequest): IdentityEvidence | null {
  const host = hostOf(source);
  if (host !== 'aethonbooks.com' && host !== 'www.aethonbooks.com') return null;
  // The product block ends before buy links, the complete-series list and recommendations.
  const stop = source.text.search(/\n\s*(?:Buy The Book|Read A Sample|See The Reviews|The Complete Series|Recommended|You May Also Like)\b/i);
  const head = stop < 0 ? source.text : source.text.slice(0, stop);
  const { series, author, position } = request.target;
  const pattern = new RegExp(`(?:^|\\n)[ \\t]*${flexible(series)}\\s+${position}:[ \\t]*([^\\n]+)\\n\\s*${flexible(series)}\\s+Book\\s+${position}\\s+By\\s+${flexible(author)}(?![\\w])`, 'gi');
  const found = [...head.matchAll(pattern)];
  if (found.length !== 1 || !usableTitle(found[0][1].trim()) || !titled(source, found[0][1].trim()) || !matchesRequested(request, found[0][1].trim())) return null;
  const citations = citationsFor(source, found[0][0].trim());
  return citations.length ? { title: found[0][1].trim(), author, position, citations } : null;
}

export function parseNumberedPrimary(source: Source, request: CheckRequest): IdentityEvidence | null {
  if (!Number.isInteger(request.target.position)) return null;
  return macmillanNumbered(source, request) ?? aethonNumbered(source, request);
}

const sentences = (text: string) => text.split(/(?<=[.!?])\s+|\n/).map(item => item.trim()).filter(Boolean);
const lineQuote = (source: Source, quote: string): Citation[] => source.text.includes(quote) ? [{ sourceId: source.id, quote }] : [];

function authorSiteContinuation(source: Source, request: CheckRequest): RelatedWorkEvidence | null {
  const host = hostOf(source);
  const { series, author, title: requested } = request.target;
  const compact = author.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!host || !compact || !new RegExp(`^(?:www\\.)?${compact}\\.[a-z]{2,24}$`).test(host)) return null;
  const lines = source.text.split('\n').map(line => line.trim()).filter(Boolean);
  // The page's own masthead must name the requested author.
  if (!lines.slice(0, 5).some(line => normalizeIdentity(line) === normalizeIdentity(author))) return null;
  const headings = lines.slice(0, 25).map(line => ({ line, match: /^(.{1,150}?)\s+(?:is|are)\s+(?:coming|here|out|now available|available|announced|on its way)\b/i.exec(line) }))
    .filter(item => item.match);
  if (headings.length !== 1) return null;
  const title = headings[0].match![1].trim();
  if (!usableTitle(title) || normalizeIdentity(title) === normalizeIdentity(requested) || normalizeIdentity(title) === normalizeIdentity(series)) return null;
  const bare = series.trim().replace(/^the\s+/i, '');
  const link = new RegExp(`\\b(?:next|latest|newest|upcoming)\\s+(?:book|novel|installment|entry|volume)\\s+(?:in|of)\\s+(?:the\\s+)?${flexible(bare)}\\b`, 'i');
  const linked = sentences(source.text.slice(source.text.indexOf(headings[0].line) + headings[0].line.length))
    .filter(item => item.toLowerCase().includes(title.toLowerCase()) && link.test(item));
  if (linked.length !== 1) return null;
  const citations = [...lineQuote(source, headings[0].line), ...lineQuote(source, linked[0])];
  return citations.length === 2 ? { title, author, relationship: 'continuation', position: null, citations } : null;
}

function macmillanPrequel(source: Source, request: CheckRequest): RelatedWorkEvidence | null {
  const header = macmillanHeader(source);
  if (!header || macmillanNumbered(source, request)) return null;
  const { series, author, title: requested } = request.target;
  const lines = header.split('\n').map(line => line.trim()).filter(Boolean);
  const title = lines[0] ?? '';
  const authorLine = lines.find(line => /^Author:/i.test(line));
  if (!usableTitle(title) || !titled(source, title) || !authorLine || normalizeIdentity(authorLine.replace(/^Author:/i, '')) !== normalizeIdentity(author)) return null;
  if (normalizeIdentity(title) === normalizeIdentity(requested)) return null;
  const stop = source.text.search(sectionBreak);
  const copy = stop < 0 ? source.text : source.text.slice(0, stop);
  const known = [series, requested].map(item => item.trim()).filter(Boolean).map(item => flexible(item.replace(/^the\s+/i, ''))).join('|');
  const link = new RegExp(`\\bprequel\\s+(?:novel\\s+)?to\\s+(?:the\\s+)?(?:${known})\\b`, 'i');
  // The sentence must be about this product: it names the heading, or it is a
  // lead sentence that itself opens with the prequel phrase. Negations never count.
  const body = sentences(copy.slice(copy.indexOf(header) + header.length));
  const opens = /^(?:an?\s+|the\s+)?(?:[\w'-]+\s+){0,2}prequel\s+(?:novel\s+)?to\b/i;
  const negated = /\b(?:not|never|no|isn't|wasn't|nor)\b/i;
  const linked = body.filter((item, index) => link.test(item) && !negated.test(item) &&
    (item.toLowerCase().includes(title.toLowerCase()) || (index < 3 && opens.test(item))));
  if (linked.length !== 1) return null;
  const citations = [...lineQuote(source, title), ...lineQuote(source, authorLine), ...lineQuote(source, linked[0])];
  return citations.length === 3 ? { title, author, relationship: 'prequel', position: null, citations } : null;
}

export function parseRelatedPrimary(source: Source, request: CheckRequest): RelatedWorkEvidence | null {
  return authorSiteContinuation(source, request) ?? macmillanPrequel(source, request);
}

function authorReleaseEditions(request: CheckRequest, source: Source, evidence: EvidenceBundle): EditionEvidence[] {
  const authorHost = request.target.author.toLowerCase().replace(/[^a-z0-9]/g, '');
  const host = hostOf(source);
  const title = request.target.title.trim();
  if (!authorHost || !host || !new RegExp(`^(?:www\\.)?${authorHost}\\.[a-z]{2,24}$`).test(host) || !title ||
    !titled(source, title) || !source.text.split('\n').slice(0, 10).some(line => normalizeIdentity(line) === normalizeIdentity(request.target.author))) return [];
  const stop = source.text.search(/\n\s*(?:Comments|Leave a Reply|Related Posts|Recommended)\b/i);
  const block = stop < 0 ? source.text : source.text.slice(0, stop);
  if (!block.includes(title)) return [];
  const announcements = [...block.matchAll(/(?:^|\n)[ \t]*(?:Update:[ \t]*)?All versions will release on ([A-Za-z]+) (\d{1,2}), (\d{4})\.[ \t]*(?=\n|$)/g)];
  if (announcements.length !== 1) return [];
  const found = announcements[0];
  const month = ['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(found[1].toLowerCase()) + 1;
  if (!month) return [];
  const date = `${found[3]}-${String(month).padStart(2, '0')}-${found[2].padStart(2, '0')}`;
  const result: EditionEvidence[] = [];
  for (const format of ['ebook', 'print', 'audio'] as const) {
    if (!request.formats.includes(format === 'audio' ? 'audio' : 'book')) continue;
    const label = format === 'ebook' ? /\bebook\b/i : format === 'print' ? /\b(?:hardcover|paperback|print edition)\b/i : /\b(?:audiobook|audio edition)\b/i;
    const formatLine = block.split('\n').find(line => label.test(line));
    const catalog = evidence.editions.find(item => item.format === format && item.language === 'en' &&
      normalizeIdentity(item.title) === normalizeIdentity(title) && normalizeIdentity(item.author) === normalizeIdentity(request.target.author));
    if (!formatLine || !catalog) continue;
    const item: EditionEvidence = { id: `${source.id}:release:${format}`, title, author: request.target.author,
      position: request.target.position, editionKey: null, format, language: 'en', market: null, date, precision: 'day', publication: 'announced',
      citations: [...catalog.citations, ...citationsFor(source, title), ...citationsFor(source, request.target.author),
        ...citationsFor(source, found[0].trim()), ...citationsFor(source, formatLine)] };
    if (parseExtraction({ identities: [], editions: [item] }, evidence.sources).ok) result.push(item);
  }
  return result;
}

function authorYearAnnouncements(request: CheckRequest, source: Source, evidence: EvidenceBundle): EditionEvidence[] {
  if (!request.formats.includes('book') || !request.target.title.trim()) return [];
  const host = hostOf(source);
  const authorHost = request.target.author.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!host || !authorHost || !new RegExp(`^(?:www\\.)?${authorHost}(?:author)?\\.[a-z]{2,24}$`).test(host)) return [];
  const lines = source.text.split('\n').map(line => line.trim()).filter(Boolean);
  const masthead = lines.slice(0, 10).find(line => normalizeIdentity(line) === normalizeIdentity(request.target.author));
  if (!masthead) return [];
  // An explicit publication schedule is an announcement, never a January 1 date.
  const schedules = lines.filter(line => new RegExp(`^(?:[\\u2022*\\-]\\s*)?20\\d{2}\\s*[\\u2013\\u2014-]\\s*Publication of ${flexible(request.target.title)}[.!]?$`, 'i').test(line));
  if (schedules.length !== 1) return [];
  return evidence.editions.filter(item => item.language === 'en' && item.format !== 'audio' && item.position === request.target.position &&
    normalizeIdentity(item.title) === normalizeIdentity(request.target.title) && normalizeIdentity(item.author) === normalizeIdentity(request.target.author))
    .map(catalog => ({ ...catalog, id: `${source.id}:announcement:${catalog.format}`, editionKey: null, market: null,
      date: null, precision: 'none' as const, publication: 'announced' as const,
      citations: [...catalog.citations, ...citationsFor(source, masthead), ...citationsFor(source, schedules[0])] }))
    .filter(item => parseExtraction({ identities: [], editions: [item] }, evidence.sources).ok);
}

export function interpretPrimarySources(request: CheckRequest, evidence: EvidenceBundle): EvidenceBundle {
  const identities = [...evidence.identities];
  const related = [...(evidence.related ?? [])];
  const add = <T>(list: T[], item: T | null, wrap: (value: T) => Partial<EvidenceBundle>, source: Source) => {
    if (!item || list.some(existing => JSON.stringify(existing) === JSON.stringify(item))) return;
    // Parser output must satisfy the same literal-quote contract as any other evidence.
    if (parseExtraction({ identities: [], editions: [], ...wrap(item) }, [source]).ok) list.push(item);
  };
  for (const source of evidence.sources) {
    add(identities, parseNumberedPrimary(source, request), value => ({ identities: [value] }), source);
    add(related, parseRelatedPrimary(source, request), value => ({ related: [value] }), source);
  }
  const editions = [...evidence.editions];
  for (const source of evidence.sources) {
    const identity = aethonNumbered(source, request);
    if (!identity || !request.formats.includes('book')) continue;
    const blocks = source.text.split(/\nBook Details\s*\n/);
    if (blocks.length !== 2) continue;
    const details = blocks[1].split(/\nAethon Books icon\b/)[0];
    const dates = [...details.matchAll(/(?:^|\n)Publication Date\s*\n([A-Za-z]+) (\d{1,2}), (\d{4})(?=\n|$)/g)];
    if (dates.length !== 1) continue;
    const found = dates[0];
    const month = ['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(found[1].toLowerCase()) + 1;
    if (!month) continue;
    for (const format of ['ebook', 'print'] as const) {
      const field = format === 'ebook' ? /(?:^|\n)Price Ebook\s*\n\d+(?:\.\d+)?(?=\n|$)/ : /(?:^|\n)Price Paper\s*\n\d+(?:\.\d+)?(?=\n|$)/;
      const formatProof = field.exec(details)?.[0].trim();
      const catalog = evidence.editions.find(item => item.format === format && item.language === 'en' &&
        normalizeIdentity(item.title) === normalizeIdentity(identity.title) && normalizeIdentity(item.author) === normalizeIdentity(identity.author));
      if (!catalog || !formatProof) continue;
      const item: EditionEvidence = { id: `${source.id}:publication:${format}`, title: identity.title, author: identity.author,
        position: identity.position, editionKey: null, format, language: 'en', market: null,
        date: `${found[3]}-${String(month).padStart(2,'0')}-${found[2].padStart(2,'0')}`, precision: 'day', publication: 'catalogued',
        citations: [...identity.citations, ...catalog.citations, ...citationsFor(source, formatProof), ...citationsFor(source, found[0].trim())] };
      if (!editions.some(existing => existing.id === item.id) && parseExtraction({ identities: [], editions: [item] }, evidence.sources).ok) editions.push(item);
    }
  }
  for (const source of evidence.sources) for (const item of [...authorReleaseEditions(request, source, evidence), ...authorYearAnnouncements(request, source, evidence)]) {
    if (!editions.some(existing => existing.id === item.id)) editions.push(item);
  }
  return { ...evidence, identities, related, editions };
}
