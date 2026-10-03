import type { AuthorSuggestion, CoverCandidate, CoverProvider, CoverRequest, CoverResult } from '../../shared/covers';
import { MAX_COVER_CANDIDATES } from '../../shared/coverValidation';
import type { DiscoveryConfig } from './config';
import { appleQueue, googleBooksQueue, openLibraryQueue } from './catalogs';
import { dedupeSuggestions, emptyBatch, normalizeAppleCovers, normalizeGoogleCovers, normalizeHardcoverCovers, normalizeOpenLibraryCovers, type CoverBatch } from './coverCatalogs';
import { diagnosticCounts, emitDiagnostic, type DiagnosticObserver } from './diagnostics';
import { hardcoverQueue } from './hardcover';
import { fetchProviderJson, ProviderError } from './http';
import { hardcoverAliases } from './workIdentity';

// Separate from the check budget: Hardcover 1, Google 2, Apple 2, Open Library 2.
const budget: Record<CoverProvider, number> = { hardcover: 1, googlebooks: 2, apple: 2, openlibrary: 2 };

const hardcoverQuery = `query CoverHardcover($names: [String!]!, $author: String!, $positions: [float8!]!) {
  series(where: {name: {_in: $names}, author: {name: {_eq: $author}}}, order_by: {id: asc}, limit: 6) {
    id name author { name } book_series(where: {position: {_in: $positions}}, limit: 21) {
      position
      book { id slug title compilation cached_image contributions(limit: 31) { author { name } contributor_role { name } } }
    }
  }
}`;

type Tracker = { calls: number; quota: boolean; failed: boolean; batch: CoverBatch };

export async function collectCoverCandidates(request: CoverRequest, config: DiscoveryConfig, signal: AbortSignal,
  fetcher: typeof fetch = fetch, onDiagnostic?: DiagnosticObserver): Promise<CoverResult> {
  const combined = AbortSignal.any([signal, AbortSignal.timeout(90000)]);
  const trackers = new Map<CoverProvider, Tracker>();
  const run = async (provider: CoverProvider, queue: { run<T>(job: () => Promise<T>, signal: AbortSignal): Promise<T> }, path: string, init: RequestInit,
    normalize: (raw: unknown) => CoverBatch): Promise<CoverBatch | null> => {
    const tracker = trackers.get(provider)!;
    if (combined.aborted || tracker.calls >= budget[provider]) return null;
    tracker.calls++;
    try {
      const raw = await queue.run(() => fetchProviderJson(provider, path, init, combined, fetcher, onDiagnostic), combined);
      const batch = normalize(raw);
      tracker.batch.candidates.push(...batch.candidates);
      tracker.batch.authorSuggestions = dedupeSuggestions([...tracker.batch.authorSuggestions, ...batch.authorSuggestions]);
      return batch;
    } catch (error) {
      const reason = error instanceof ProviderError ? error.reason : 'provider-error';
      if (reason === 'quota' || reason === 'budget') tracker.quota = true; else tracker.failed = true;
    }
    return null;
  };
  const start = (provider: CoverProvider): void => { trackers.set(provider, { calls: 0, quota: false, failed: false, batch: emptyBatch() }); };
  const jobs: Promise<void>[] = [];
  const author = request.author;
  // Each searched title keeps the role it came from, so a blank next title can never be mistaken for the last read book.
  const entries = ([['next', request.nextTitle], ['previous', request.previousTitle ?? '']] as const).filter(([, title]) => title.trim() !== '');
  const titles = entries.map(([, title]) => title);
  const hasRole = (batch: CoverBatch | null, title: string) => {
    const role = entries.find(([, name]) => name === title)?.[0] ?? 'previous';
    return batch?.candidates.some(item => item.role === role) ?? false;
  };

  const token = config.hardcoverToken?.trim();
  if (token) {
    start('hardcover');
    const positions = request.previousTitle && request.position > 1 ? [request.position, request.position - 1] : [request.position];
    jobs.push(run('hardcover', hardcoverQueue, '/v1/graphql', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: /^Bearer\s/i.test(token) ? token : `Bearer ${token}` },
      body: JSON.stringify({ query: hardcoverQuery, variables: { names: hardcoverAliases(request.series), author, positions } }) },
    raw => normalizeHardcoverCovers(raw, request)).then(() => undefined));
  }
  const googleKey = config.googleBooksKey?.trim();
  if (googleKey) {
    start('googlebooks');
    jobs.push((async () => {
      // Slot one is the exact-author search; the remaining slot may run one title-only fallback for a known title without a candidate.
      const exact = titles[0];
      if (!exact) return;
      const first = await run('googlebooks', googleBooksQueue, `/books/v1/volumes?${new URLSearchParams({ q: `intitle:${exact} inauthor:${author}`, key: googleKey, maxResults: '20', langRestrict: 'en' })}`, {},
        raw => normalizeGoogleCovers(raw, request));
      const missing = titles.find(title => !hasRole(first, title));
      if (missing) await run('googlebooks', googleBooksQueue, `/books/v1/volumes?${new URLSearchParams({ q: `intitle:${missing}`, key: googleKey, maxResults: '20', langRestrict: 'en' })}`, {},
        raw => normalizeGoogleCovers(raw, request));
    })());
  }
  start('apple');
  jobs.push((async () => {
    for (const [entity, format] of [['ebook', 'ebook'], ['audiobook', 'audio']] as const) {
      const params = new URLSearchParams({ term: `${titles[0] ?? ''} ${author}`, country: request.preferredMarket.toLowerCase(), entity, limit: '20' });
      await run('apple', appleQueue, `/search?${params}`, {}, raw => normalizeAppleCovers(raw, format, request));
    }
  })());
  start('openlibrary');
  jobs.push((async () => {
    const exact = titles[0];
    if (!exact) return;
    const fields = 'key,title,author_name,cover_edition_key,cover_i';
    const first = await run('openlibrary', openLibraryQueue, `/search.json?${new URLSearchParams({ title: exact, author, limit: '20', fields })}`, {},
      raw => normalizeOpenLibraryCovers(raw, request));
    const missing = titles.find(title => !hasRole(first, title));
    if (missing) await run('openlibrary', openLibraryQueue, `/search.json?${new URLSearchParams({ title: missing, limit: '20', fields })}`, {},
      raw => normalizeOpenLibraryCovers(raw, request));
  })());
  await Promise.all(jobs);

  const candidates: CoverCandidate[] = []; const suggestions: AuthorSuggestion[] = [];
  const outcomes: CoverResult['outcomes'] = [];
  for (const [provider, tracker] of trackers) {
    const found = tracker.batch.candidates.length;
    const state = found ? 'ok' : tracker.quota ? 'quota' : tracker.failed ? 'failed' : 'no-match';
    outcomes.push({ provider, state });
    emitDiagnostic(onDiagnostic, { stage: 'cover', category: found ? 'accepted' : 'target-mismatch', ...diagnosticCounts({ sources: [], identities: [], editions: [] }),
      provider, ...(found ? {} : { rule: state === 'quota' ? 'http-quota' as const : state === 'failed' ? 'http-failure' as const : 'no-match' as const }) });
    candidates.push(...tracker.batch.candidates); suggestions.push(...tracker.batch.authorSuggestions);
  }
  const seen = new Set<string>();
  // Rank each provider by role, then format (audio art last), then resolution, and interleave providers so one prolific provider cannot crowd out the rest.
  const area = (item: CoverCandidate) => (item.width ?? 0) * (item.height ?? 0);
  const rank = (left: CoverCandidate, right: CoverCandidate) => Number(left.role === 'previous') - Number(right.role === 'previous') ||
    Number(left.format === 'audio') - Number(right.format === 'audio') || area(right) - area(left);
  const lanes = [...trackers.keys()].map(provider => candidates.filter(item => item.provider === provider).sort(rank)
    .filter(item => { if (seen.has(item.imageUrl)) return false; seen.add(item.imageUrl); return true; }));
  const ordered: CoverCandidate[] = [];
  for (let depth = 0; ordered.length < MAX_COVER_CANDIDATES && lanes.some(lane => depth < lane.length); depth++) {
    for (const lane of lanes) if (depth < lane.length && ordered.length < MAX_COVER_CANDIDATES) ordered.push(lane[depth]);
  }
  const authorSuggestions = dedupeSuggestions(suggestions);
  return { requestId: request.requestId, seriesId: request.seriesId, candidates: ordered, authorSuggestions, outcomes };
}
