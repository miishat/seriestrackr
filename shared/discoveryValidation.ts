import type {
  Attribution, CheckRequest, CheckResponse, CheckSummary, Citation, Conflict,
  EditionEvidence, EvidenceBundle, Format, IdentityEvidence, Parsed, Provenance,
  ReleaseProposal, Source, SourceLink, Target, Usage,
} from './discovery';

function fail(path: string, message: string): never { throw new Error(`${path}: ${message}`); }
function object(input: unknown, path: string, required: string[], optional: string[] = []): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail(path, 'expected object');
  const value = input as Record<string, unknown>;
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, 'required');
  for (const key of Object.keys(value)) if (![...required, ...optional].includes(key)) fail(`${path}.${key}`, 'unexpected field');
  return value;
}
function string(input: unknown, path: string, max: number, min = 1): string {
  if (typeof input !== 'string' || input.length < min || input.length > max || (min > 0 && !input.trim())) fail(path, 'invalid string');
  return input as string;
}
function nullableString(input: unknown, path: string, max: number): string | null {
  return input === null ? null : string(input, path, max);
}
function number(input: unknown, path: string, integer = false): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input <= 0 || (integer && !Number.isInteger(input))) fail(path, 'expected positive finite number');
  return input as number;
}
function count(input: unknown, path: string): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0) fail(path, 'expected nonnegative integer');
  return input as number;
}
function boolean(input: unknown, path: string): boolean {
  if (typeof input !== 'boolean') fail(path, 'expected boolean');
  return input as boolean;
}
function oneOf<T extends string>(input: unknown, path: string, values: readonly T[]): T {
  if (typeof input !== 'string' || !values.includes(input as T)) fail(path, 'unknown value');
  return input as T;
}
function array<T>(input: unknown, path: string, max: number, parse: (value: unknown, path: string) => T): T[] {
  if (!Array.isArray(input) || input.length > max) fail(path, 'invalid array');
  return (input as unknown[]).map((value, index) => parse(value, `${path}[${index}]`));
}
function unique(values: string[], path: string): void {
  if (new Set(values).size !== values.length) fail(path, 'duplicate values');
}
function country(input: unknown, path: string): string {
  const value = string(input, path, 2);
  if (!/^[A-Z]{2}$/.test(value)) fail(path, 'expected uppercase country code');
  return value;
}
function nullableCountry(input: unknown, path: string): string | null {
  return input === null ? null : country(input, path);
}
function calendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const actual = new Date(Date.UTC(year, month - 1, day));
  return actual.getUTCFullYear() === year && actual.getUTCMonth() === month - 1 && actual.getUTCDate() === day;
}
function timestamp(input: unknown, path: string): string {
  const value = string(input, path, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail(path, 'invalid timestamp');
  return value;
}
function url(input: unknown, path: string): string {
  const value = string(input, path, 2048);
  let parsed: URL;
  try { parsed = new URL(value); } catch { return fail(path, 'invalid URL'); }
  const ipv6 = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
    ? parsed.hostname.slice(1, -1).toLowerCase() : null;
  const unsafeIpv6 = ipv6 !== null && (
    ipv6 === '::' || ipv6 === '::1' || ipv6.startsWith('::ffff:') ||
    /^f[cd]/.test(ipv6) || /^fe[89ab]/.test(ipv6) ||
    /^ff/.test(ipv6) || /^::[0-9a-f]/.test(ipv6));
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname ||
    unsafeIpv6 ||
    /^(localhost|.*\.localhost|.*\.local)$/i.test(parsed.hostname) ||
    /^(127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(parsed.hostname) ||
    parsed.hostname === '[::1]') fail(path, 'unsafe URL');
  return value;
}
function sourceLink(input: unknown, path: string): SourceLink {
  const value = object(input, path, ['id', 'title', 'url']);
  return { id: string(value.id, `${path}.id`, 100), title: string(value.title, `${path}.title`, 300), url: url(value.url, `${path}.url`) };
}
function source(input: unknown, path: string): Source {
  const value = object(input, path, ['id', 'title', 'url', 'provider', 'market', 'retrievedAt', 'text']);
  return {
    id: string(value.id, `${path}.id`, 100), title: string(value.title, `${path}.title`, 300), url: url(value.url, `${path}.url`),
    provider: oneOf(value.provider, `${path}.provider`, ['apple', 'openlibrary', 'googlebooks', 'tavily', 'deepseek', 'hardcover']),
    market: nullableCountry(value.market, `${path}.market`), retrievedAt: timestamp(value.retrievedAt, `${path}.retrievedAt`),
    text: string(value.text, `${path}.text`, 20000),
  };
}
function citation(input: unknown, path: string): Citation {
  const value = object(input, path, ['sourceId', 'quote']);
  return { sourceId: string(value.sourceId, `${path}.sourceId`, 100), quote: string(value.quote, `${path}.quote`, 600) };
}
function citations(input: unknown, path: string): Citation[] {
  const items = array(input, path, 30, citation);
  if (!items.length) fail(path, 'at least one citation required');
  return items;
}
function identity(input: unknown, path: string): IdentityEvidence {
  const value = object(input, path, ['title', 'author', 'position', 'citations']);
  return { title: string(value.title, `${path}.title`, 300), author: string(value.author, `${path}.author`, 300),
    position: number(value.position, `${path}.position`), citations: citations(value.citations, `${path}.citations`) };
}
function edition(input: unknown, path: string): EditionEvidence {
  const value = object(input, path, ['id', 'title', 'author', 'position', 'editionKey', 'format', 'language', 'market', 'date', 'precision', 'citations']);
  const precision = oneOf(value.precision, `${path}.precision`, ['day', 'month', 'year', 'none']);
  const date = nullableString(value.date, `${path}.date`, 10);
  const validDate = precision === 'day' ? date !== null && calendarDate(date)
    : precision === 'month' ? date !== null && /^\d{4}-(0[1-9]|1[0-2])$/.test(date)
    : precision === 'year' ? date !== null && /^\d{4}$/.test(date) : date === null;
  if (!validDate) fail(`${path}.date`, 'date and precision disagree');
  return {
    id: string(value.id, `${path}.id`, 100), title: string(value.title, `${path}.title`, 300),
    author: string(value.author, `${path}.author`, 300), position: value.position === null ? null : number(value.position, `${path}.position`),
    editionKey: nullableString(value.editionKey, `${path}.editionKey`, 100),
    format: oneOf(value.format, `${path}.format`, ['ebook', 'print', 'audio']),
    language: nullableString(value.language, `${path}.language`, 30), market: nullableCountry(value.market, `${path}.market`),
    date, precision, citations: citations(value.citations, `${path}.citations`),
  };
}
function target(input: unknown, path: string): Target {
  const value = object(input, path, ['series', 'author', 'position', 'title', 'orderNote']);
  return { series: string(value.series, `${path}.series`, 300), author: string(value.author, `${path}.author`, 300),
    position: number(value.position, `${path}.position`), title: string(value.title, `${path}.title`, 300, 0),
    orderNote: string(value.orderNote, `${path}.orderNote`, 500, 0) };
}
function request(input: unknown): CheckRequest {
  const value = object(input, 'request', ['requestId', 'seriesId', 'target', 'preferredMarket', 'formats', 'useAi']);
  const formats = array<Format>(value.formats, 'request.formats', 2, (item, path) => oneOf(item, path, ['book', 'audio']));
  if (!formats.length) fail('request.formats', 'at least one format required');
  unique(formats, 'request.formats');
  return { requestId: string(value.requestId, 'request.requestId', 100), seriesId: string(value.seriesId, 'request.seriesId', 100),
    target: target(value.target, 'request.target'), preferredMarket: country(value.preferredMarket, 'request.preferredMarket'),
    formats, useAi: boolean(value.useAi, 'request.useAi') };
}
function extraction(input: unknown, suppliedSources: Source[]): EvidenceBundle {
  const value = object(input, 'evidence', ['identities', 'editions'], ['sources']);
  const sources = array(suppliedSources, 'sources', 30, source);
  unique(sources.map(item => item.id), 'sources');
  if (value.sources !== undefined) {
    const embedded = array(value.sources, 'evidence.sources', 30, source);
    if (JSON.stringify(embedded) !== JSON.stringify(sources)) fail('evidence.sources', 'must match supplied sources');
  }
  const identities = array(value.identities, 'evidence.identities', 30, identity);
  const editions = array(value.editions, 'evidence.editions', 100, edition);
  unique(editions.map(item => item.id), 'evidence.editions');
  if ((identities.length || editions.length) && !sources.length) fail('sources', 'evidence needs sources');
  const sourceById = new Map(sources.map(item => [item.id, item]));
  for (const item of [...identities, ...editions]) {
    for (const cited of item.citations) {
      const referenced = sourceById.get(cited.sourceId);
      if (!referenced || !referenced.text.includes(cited.quote)) fail('evidence.citations', 'quote must appear in supplied source');
    }
  }
  return { sources, identities, editions };
}
function attribution(input: unknown, path: string, provenance = false): Attribution | Provenance {
  const extra = provenance ? ['preferredMarket', 'sourceMarket', 'language', 'editionFormat', 'editionKey', 'datePrecision', 'interpreted'] : [];
  const value = object(input, path, ['checkedAt', 'sources', ...extra]);
  const sources = array(value.sources, `${path}.sources`, 30, sourceLink);
  unique(sources.map(item => item.id), `${path}.sources`);
  const base: Attribution = { checkedAt: timestamp(value.checkedAt, `${path}.checkedAt`), sources };
  if (!provenance) return base;
  return {
    ...base, preferredMarket: country(value.preferredMarket, `${path}.preferredMarket`),
    sourceMarket: nullableCountry(value.sourceMarket, `${path}.sourceMarket`),
    language: oneOf(value.language, `${path}.language`, ['en']),
    editionFormat: oneOf(value.editionFormat, `${path}.editionFormat`, ['ebook', 'print', 'audio']),
    editionKey: nullableString(value.editionKey, `${path}.editionKey`, 100),
    datePrecision: oneOf(value.datePrecision, `${path}.datePrecision`, ['day', 'month', 'year', 'none']),
    interpreted: boolean(value.interpreted, `${path}.interpreted`),
  };
}
function release(input: unknown, path: string): ReleaseProposal {
  const value = object(input, path, ['title', 'position', 'state', 'date', 'provenance', 'citations']);
  const state = oneOf(value.state, `${path}.state`, ['announced', 'scheduled']);
  const date = nullableString(value.date, `${path}.date`, 10);
  if ((state === 'scheduled' && (date === null || !calendarDate(date))) || (state === 'announced' && date !== null)) fail(`${path}.date`, 'invalid release date');
  const provenance = attribution(value.provenance, `${path}.provenance`, true) as Provenance;
  if ((state === 'scheduled' && provenance.datePrecision !== 'day') ||
    (state === 'announced' && provenance.datePrecision === 'day')) fail(`${path}.provenance.datePrecision`, 'state and date precision disagree');
  return { title: string(value.title, `${path}.title`, 300), position: number(value.position, `${path}.position`),
    state, date, provenance, citations: citations(value.citations, `${path}.citations`) };
}
function conflict(input: unknown, path: string): Conflict {
  const value = object(input, path, ['format', 'evidenceIds', 'reason']);
  const evidenceIds = array(value.evidenceIds, `${path}.evidenceIds`, 100, (item, at) => string(item, at, 100));
  if (evidenceIds.length < 2) fail(`${path}.evidenceIds`, 'conflict needs multiple evidence IDs');
  unique(evidenceIds, `${path}.evidenceIds`);
  return { format: oneOf(value.format, `${path}.format`, ['book', 'audio']), evidenceIds, reason: string(value.reason, `${path}.reason`, 500) };
}
function usage(input: unknown, path: string): Usage {
  const value = object(input, path, ['apple', 'openlibrary', 'googlebooks', 'tavily', 'deepseek', 'hardcover', 'inputTokens', 'outputTokens']);
  return { apple: count(value.apple, `${path}.apple`), openlibrary: count(value.openlibrary, `${path}.openlibrary`),
    googlebooks: count(value.googlebooks, `${path}.googlebooks`), hardcover: count(value.hardcover, `${path}.hardcover`),
    tavily: count(value.tavily, `${path}.tavily`), deepseek: count(value.deepseek, `${path}.deepseek`),
    inputTokens: value.inputTokens === null ? null : count(value.inputTokens, `${path}.inputTokens`),
    outputTokens: value.outputTokens === null ? null : count(value.outputTokens, `${path}.outputTokens`) };
}
function summary(input: unknown, path: string): CheckSummary {
  const value = object(input, path, ['requestId', 'checkedAt', 'status', 'reasons', 'formats', 'usage']);
  const formats = object(value.formats, `${path}.formats`, ['book', 'audio']);
  return {
    requestId: string(value.requestId, `${path}.requestId`, 100), checkedAt: timestamp(value.checkedAt, `${path}.checkedAt`),
    status: oneOf(value.status, `${path}.status`, ['complete', 'partial', 'failed', 'cancelled']),
    reasons: array(value.reasons, `${path}.reasons`, 8, (item, at) => oneOf(item, at,
      ['missing-key', 'quota', 'timeout', 'provider-error', 'invalid-evidence', 'budget', 'unknown-identity', 'cancelled'])),
    formats: { book: oneOf(formats.book, `${path}.formats.book`, ['supported', 'unknown', 'not-requested']),
      audio: oneOf(formats.audio, `${path}.formats.audio`, ['supported', 'unknown', 'not-requested']) },
    usage: usage(value.usage, `${path}.usage`),
  };
}
function response(input: unknown): CheckResponse {
  const value = object(input, 'response', ['requestId', 'seriesId', 'summary', 'proposals', 'sources']);
  const proposalsValue = object(value.proposals, 'response.proposals', ['identity', 'identityAttribution', 'releases', 'conflicts']);
  const releasesValue = object(proposalsValue.releases, 'response.proposals.releases', ['book', 'audio']);
  const sources = array(value.sources, 'response.sources', 30, sourceLink);
  unique(sources.map(item => item.id), 'response.sources');
  const identityValue = proposalsValue.identity === null ? null : identity(proposalsValue.identity, 'response.proposals.identity');
  const attributionValue = proposalsValue.identityAttribution === null ? null
    : attribution(proposalsValue.identityAttribution, 'response.proposals.identityAttribution') as Attribution;
  if ((identityValue === null) !== (attributionValue === null)) fail('response.proposals', 'identity and attribution must agree');
  const releases: Record<Format, ReleaseProposal | null> = {
    book: releasesValue.book === null ? null : release(releasesValue.book, 'response.proposals.releases.book'),
    audio: releasesValue.audio === null ? null : release(releasesValue.audio, 'response.proposals.releases.audio'),
  };
  const parsedSummary = summary(value.summary, 'response.summary');
  const requestId = string(value.requestId, 'response.requestId', 100);
  if (requestId !== parsedSummary.requestId) fail('response.summary.requestId', 'request ID mismatch');
  const responseSources = new Map(sources.map(item => [item.id, item]));
  function checkAttribution(cited: Citation[], attributed: Attribution, path: string): void {
    const attributedIds = new Set(attributed.sources.map(item => item.id));
    for (const item of attributed.sources) {
      if (JSON.stringify(responseSources.get(item.id)) !== JSON.stringify(item)) fail(path, 'attribution source absent or mismatched');
    }
    for (const item of cited) if (!attributedIds.has(item.sourceId)) fail(path, 'citation source absent from attribution');
  }
  if (identityValue && attributionValue) checkAttribution(identityValue.citations, attributionValue, 'response.proposals.identityAttribution');
  for (const format of ['book', 'audio'] as const) {
    const proposal = releases[format];
    if (proposal) checkAttribution(proposal.citations, proposal.provenance, `response.proposals.releases.${format}.provenance`);
  }
  for (const format of ['book', 'audio'] as const) {
    if (parsedSummary.formats[format] === 'supported' && releases[format] === null) fail(`response.summary.formats.${format}`, 'supported format needs proposal');
  }
  return {
    requestId, seriesId: string(value.seriesId, 'response.seriesId', 100), summary: parsedSummary,
    proposals: { identity: identityValue, identityAttribution: attributionValue, releases,
      conflicts: array(proposalsValue.conflicts, 'response.proposals.conflicts', 100, conflict) },
    sources,
  };
}
function parse<T>(operation: () => T): Parsed<T> {
  try { return { ok: true, value: operation() }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'invalid input' }; }
}
export const parseCheckRequest = (input: unknown): Parsed<CheckRequest> => parse(() => request(input));
export const parseCheckResponse = (input: unknown): Parsed<CheckResponse> => parse(() => response(input));
export const parseExtraction = (input: unknown, sources: Source[]): Parsed<EvidenceBundle> => parse(() => extraction(input, sources));

export const parseAttribution = (input: unknown): Parsed<Attribution> => parse(() => attribution(input, 'attribution') as Attribution);
export const parseProvenance = (input: unknown): Parsed<Provenance> => parse(() => attribution(input, 'provenance', true) as Provenance);
export const parseCheckSummary = (input: unknown): Parsed<CheckSummary> => parse(() => summary(input, 'summary'));
