# Google Books Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user already selected this method and approved integration; proceed through the existing controller's review gates without another method or approval question.

**Goal:** Add an optional bounded Google Books catalog that supplies traceable strict identity and qualified English ebook evidence without weakening existing discovery policy.

**Architecture:** Extend service configuration, fixed HTTP transport and public usage/capabilities contracts, then add a focused pure normalizer. Integrate two bounded list queries into the existing collector and pass the key through the runtime; existing proposal policy and allocation remain authoritative.

**Tech Stack:** Existing TypeScript 5.8, Node.js 22.13.1+, native fetch/HTTP/environment parsing, Vitest 3 and npm. No dependency changes.

**Spec:** [2026-09-30-google-books-integration.md](../specs/2026-09-30-google-books-integration.md). Read alongside the [phase 2 design](../specs/2026-09-29-release-discovery-design.md), [original implementation plan](2026-09-29-release-discovery.md), [remediation](2026-09-30-discovery-pilot-remediation.md) and [evaluation](../../discovery-google-books-evaluation.md). The amendment controls Google-specific behavior.

## Global Constraints

- Provider is `googlebooks`. `Usage.googlebooks` is a required nonnegative safe integer. `emptyUsage()` initializes it to zero.
- `DiscoveryConfig.googleBooksKey?: string | null`; read `GOOGLE_BOOKS_API_KEY` only from Git-ignored `.env.google-books.local`. Missing or blank normally disables Google and preserves existing request order/queries.
- Capabilities add `googleBooks: boolean` and `limits.googleBooks: 2`; presence is configured, not quota checked.
- Fixed list endpoint `https://www.googleapis.com/books/v1/volumes`, 20-second timeout, 1 MiB response, no redirects, retries, details, pagination or returned-URL fetching.
- At most two unique Google requests per check, 20 records per request, `showPreorders=true`, `langRestrict=en`, and mandatory literal per-record `en`.
- Module-global 1,100 ms start spacing. Cached duplicates do not add attempts; failed started requests count; queued cancellation does not count.
- Keep existing Apple 12/Open Library 3/Tavily 3/DeepSeek 1 limits, 180-second deadline, 30 sources/30 identities/100 editions, 20,000 UTF-8 bytes/2,048 tokens and minimum-loss guards.
- Titles retain punctuation/subtitles and exact matching uses existing `normalizeIdentity`; no aliases or stripping.
- Google ebook requires `isEbook === true`; no Google print/audio and no Google-to-Apple language join.
- Qualified day requires `FOR_PREORDER`/`FOR_SALE`, explicit valid sale country, valid full ISO sale datetime and a literal calendar day equal to valid exact-day publication metadata. No timezone shifting. Ordinary publication metadata alone never proves availability.
- Rejected sale dates, all raw publication dates, descriptions and unqualified markets are absent from synthetic AI source text. Unknown eligible ebook announcements have null date, precision `none`, null country.
- Strict exact-series subtitle grammar only, integer target position, exact single author and exact known title; reject companion/omnibus/anthology/novella/short-story/boxed-set/guide/sampler/RPG markers.
- Preserve ambiguity and conflicting evidence with all remapped citations. Use selected identity only to derive an effective query title.
- All unit checks are fictional/fake-fetch offline tests. No real keys in tests, live calls or consent renewal. The controller may separately prepare the authorized key and run a zero-request configured dry run. Original 14-case allowance spent; four-case consent separately approved and run after review; Task 8 and later gate unchanged.
- Do not use em dashes. Do not select Astra unless the user specifically requests it.
- Use high reasoning effort only when writing an implementation plan or specification. Use medium effort or lower for all other work, including implementation, reviews, debugging, research, and test execution. This rule applies globally to the main agent and all subagents.

## Review Focus

1. A known title with punctuation, subtitle or query operator characters must remain complete in matching and retrieval, and must not become a different work. Pin in Tasks 2 and 3.
2. A valid ISO sale timestamp that shifts day in UTC must retain its literal day, while calendar rollover or publication disagreement must leave no date in AI input. Pin in Task 2 and Task 3 extraction spy.
3. Two valid target-position titles or a reused volume ID with incompatible facts must preserve alternatives and citations so policy suppresses unsupported identity/date selection. Pin in Tasks 2 and 3.
4. A second runtime waiting in the global Google queue must count no cancelled queued request, while a failed already-started request counts once and exposes no secret. Pin in Tasks 1 and 3.
5. Extra Google sources near aggregate/prompt limits must preserve protected citation closures and minimum-loss suppression; Google ISBN language must not rescue Apple language. Pin in Task 3.

## File ownership and interfaces

Each worker owns only the files in its task during that task. Workers are not alone in the worktree: preserve other changes and stage explicit owned paths. Tasks run sequentially with implementation, spec review and quality review before the next task. The controller owns this spec/plan, final preflight and whole-integration review. No source commit belongs to the planning author.

| Task | Files and responsibility |
| --- | --- |
| 1 | Modify `shared/discovery.ts`, `shared/discoveryValidation.ts`, `server/discovery/config.ts`, `server/discovery/http.ts`, `server/discovery/server.ts`, `scripts/discovery-pilot.ts`, `.env.example`; tests `tests/discovery/contracts.test.ts`, `tests/discovery/config.test.ts`, `tests/discovery/http.test.ts`, `tests/discovery/server.test.ts`, `tests/discovery/pilot.test.ts`, `tests/discovery/deepseek.test.ts`. Public contracts, separate configuration/setup instructions, HTTP allowlist and zero-call pilot/capability reporting. |
| 2 | Create `server/discovery/googleBooks.ts`, `tests/discovery/google-books.test.ts`. Pure normalizer, bounded synthetic sources, strict ordinal identity and qualified sale facts. No collector edits. |
| 3 | Modify `server/discovery/catalogs.ts`, `server/discovery/runtime.ts`, `server/discovery/runDiscovery.ts`; tests `tests/discovery/catalogs.test.ts`, `tests/discovery/pipeline.test.ts`, `tests/discovery/pilot.test.ts`; create `tests/discovery/runtime.test.ts`. Collector queries/queue/merge, runtime plumbing, final counters and end-to-end offline guards. |

Existing helpers/signatures inspected for planning: `normalizeIdentity(s: string)`, `selectProposals(request, evidence, checkedAt, interpreted?)`, `fetchProviderJson(provider, path, init, signal, fetcher = fetch)`, `createRateQueue(intervalMs).run(operation, signal)`, `collectCatalogs(request, markets, signal, fetcher = fetch)`, `loadDiscoveryConfig(root)`, `createDiscoveryRuntime(config, fetcher = fetch)`, `runDiscovery(input, dependencies, caller)` and `runPilot(args, options)`. Reuse existing fixture `request`, `response`, `bundle`, `edition` and fake-timer/fake-fetch conventions. Do not introduce a replacement normalization or policy module.

### Task 1: Extend provider, configuration, transport and reporting contracts

**Files:** Own Task 1 paths in the table. `.gitignore` already ignores `*.local` and `.env.*`; inspect its patterns without reading credentials and only edit it if the separate filename is not covered. Existing fixtures use `emptyUsage`, so no fixture redesign is needed.

**Interfaces:** Produce required `Usage.googlebooks`, `Provider` member `googlebooks`, optional `DiscoveryConfig.googleBooksKey`, `Capabilities.googleBooks` and literal limit `2`. HTTP accepts only `/books/v1/volumes` plus query parameters for Google. Existing signatures stay intact. Pilot dry-run uses `keyPresence.googleBooks` and `queries.googleBooksMax: configured ? 2 : 0`; capability limit stays `2` when disabled.

- [x] **Step 1: Add behavioral contract and configuration regressions.** In `contracts.test.ts`, import `emptyUsage` and add these cases using existing `response()`/`bundle()` helpers:

```ts
test('Google usage is required and rejects unsafe counts', () => {
  const valid = response();
  expect(emptyUsage().googlebooks).toBe(0);
  expect(parseCheckResponse(valid).ok).toBe(true);
  const { googlebooks: omitted, ...withoutGoogle } = valid.summary.usage;
  expect(omitted).toBe(0);
  expect(parseCheckResponse({ ...valid, summary: {
    ...valid.summary, usage: withoutGoogle,
  } }).ok).toBe(false);
  for (const count of [-1, 0.5, null, '1', Number.MAX_SAFE_INTEGER + 1]) {
    expect(parseCheckResponse({ ...valid, summary: { ...valid.summary,
      usage: { ...valid.summary.usage, googlebooks: count },
    } }).ok).toBe(false);
  }
});
test('Google is a supported source provider', () => {
  const evidence = bundle([edition()]);
  evidence.sources[0].provider = 'googlebooks';
  expect(parseExtraction(evidence, evidence.sources).ok).toBe(true);
});
```

Extend config expectations with `googleBooksKey: null`. Write a fictional `.env.google-books.local` in the existing temporary-root helper and assert the key is trimmed, multiline/quoted parsing retains existing rules, process environment stays unchanged, and wrong-file `GOOGLE_BOOKS_API_KEY` values are ignored. Missing/blank key is null. Duplicate/malformed assignments and filesystem errors are sanitized `invalid-config`, with no key content in the error.

- [x] **Step 2: Add fixed transport regressions.** Extend the existing table with `googlebooks`, `/books/v1/volumes?q=Example&key=fake-google-secret`, and its exact fixed URL. Assert `redirect: 'error'`. Add this table before implementation:

```ts
test.each([
  '/books/v1/volumes/Fictional01', '/volumes',
  'https://elsewhere.example/books/v1/volumes',
  '//elsewhere.example/books/v1/volumes',
  '/books/v1/volumes#secret', '/books/v1/../volumes',
  '/books/v1/volumes/extra', '/books%2fv1/volumes',
])('Google rejects destination %s before fetch', async path => {
  const fetcher = vi.fn<typeof fetch>(async () => json());
  await expect(fetchProviderJson('googlebooks', path, {}, signal(), fetcher))
    .rejects.toMatchObject({ reason: 'provider-error', message: 'provider-error' });
  expect(fetcher).not.toHaveBeenCalled();
});
```

Include Google in existing 20-second timeout, 1 MiB streaming, malformed JSON, JSON MIME-only, redirect/off-origin, cancellation and 429/5xx tables. Check errors never contain the fictional key, body or URL. Existing generic 1,100 ms queue tests establish spacing mechanics; Task 3 pins actual global Google queue use.

- [x] **Step 3: Pin zero-call capabilities and pilot output.** Update server's exact capabilities expectation to include `googleBooks: true`, `limits.googleBooks: 2` with fake configured key, and false for absent/blank/omitted optional key. Assert no dependency/provider work and no secret values. In pilot temp roots add a fake separate Google file, assert `keyPresence.googleBooks`, `googleBooksMax: 2`, and zero fetch/dependency calls on dry-run. In existing fake-runtime run tests assert `summary.usage.googlebooks` is zero. Keep invalid oracle sentinel and original case inputs unchanged. Add absent/blank controls with `googleBooksMax: 0` and assert report never contains `fake-google-secret`. Update the two exact `Usage` object expectations in `tests/discovery/deepseek.test.ts` to include `googlebooks: 0`, preserving optional-AI zero-call behavior.

- [x] **Step 4: Establish red.** Run `npm.cmd test -- tests/discovery/contracts.test.ts tests/discovery/config.test.ts tests/discovery/http.test.ts tests/discovery/server.test.ts tests/discovery/pilot.test.ts`. Expected failures name missing Google fields, unsupported provider/path, or old exact response expectations, not unrelated setup errors. Record failures for the controller.

- [x] **Step 5: Implement the bounded contract additions.** Add Google to provider union and source parser allowlist; add usage field to required object keys and `count` parser. Configuration uses existing `readEnv`/`key`, with separate filename. Add fixed host and exact list path to `http.ts` without relaxing other paths. Extend server/pilot booleans and limits; leave pilot execution flags/consent text unchanged. Add a blank `GOOGLE_BOOKS_API_KEY=` stanza to `.env.example`, naming `.env.google-books.local` as the separate ignored service file; change its two-file comment to cover all three. Include no real key. Representative additions:

```ts
// shared/discovery.ts additions inside existing declarations
// Provider includes 'googlebooks'; Usage contains googlebooks: number.
// Capabilities contains googleBooks: boolean and limits.googleBooks: 2.
export const emptyUsage = (): Usage => ({ apple: 0, openlibrary: 0,
  googlebooks: 0, tavily: 0, deepseek: 0, inputTokens: 0, outputTokens: 0 });

// server/discovery/config.ts within loadDiscoveryConfig
const google = readEnv(root, '.env.google-books.local');
// Include in the existing returned object:
// googleBooksKey: key(google.GOOGLE_BOOKS_API_KEY)

// server/discovery/http.ts exact allowlist branch
// provider === 'googlebooks' ? pathname === '/books/v1/volumes' : existing branches
// bases.googlebooks = 'https://www.googleapis.com'
```

- [x] **Step 6: Green, commit and review.** Rerun the Step 4 command plus `tests/discovery/deepseek.test.ts`, and `npm.cmd run typecheck`. Fix explicit old usage/capability expectations in owned tests; do not make the new counter optional in the parser. Self-review, stage owned files and commit `feat: add optional Google Books service contracts`, then report red/green output, changed paths and commit ID for independent task spec/quality review. Resolve findings in scoped fix commits and obtain approval before Task 2. Do not stage credentials or historical report JSON.

### Task 2: Normalize strict Google identity and ebook evidence

**Files:** Create only `server/discovery/googleBooks.ts` and `tests/discovery/google-books.test.ts`.

**Interfaces:** Consume `CheckRequest`, `EvidenceBundle`, `Source`, `IdentityEvidence`, `EditionEvidence`, `Citation` and existing `normalizeIdentity`. Export only the required collector-facing entry point:

```ts
export function normalizeGoogleBooks(
  input: unknown, request: CheckRequest, checkedAt: string,
): EvidenceBundle;
```

Return empty arrays on malformed input or no eligible records. Helpers remain private. Process the first 20 list items; collector owns malformed-envelope/excess-record reasons. Construct IDs/links from volume IDs matching `^[A-Za-z0-9_-]{1,64}$`. Title/author/subtitle limits are 300; reject oversized title/author and present malformed/oversized subtitle as a whole record. Absent subtitle is allowed. Never omit or truncate a supplied subtitle to bypass companion exclusion. Prefer syntactically valid ISBN-13, otherwise ISBN-10, as `isbn:<digits/X>` under the existing adapter convention; fall back to `googlebooks:<volumeID>`. No ISBN join to another provider.

- [x] **Step 1: Write a fictional positive date/identity test.** Define a local factory in the new test file; use existing `request` and parser/policy helpers. This fixture is synthetic and contains no researched title:

```ts
const at = '2026-09-30T00:00:00Z';
const volume = () => ({ id: 'Fictional01', volumeInfo: {
  title: 'Second', subtitle: 'Example, Book Two',
  authors: ['Example Author'], language: 'en', publishedDate: '2027-03-01',
  industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780000000002' }],
  infoLink: 'https://elsewhere.example/ignored', description: 'ignored 1999-01-01',
}, saleInfo: { isEbook: true, saleability: 'FOR_PREORDER', country: 'GB',
  onSaleDate: '2027-03-01T00:15:00+14:00' } });

test('qualified literal sale day and strict subtitle yield cited evidence', () => {
  const req = request({ target: { ...request().target, title: '' } });
  const evidence = normalizeGoogleBooks({ items: [volume()] }, req, at);
  expect(evidence.identities[0]).toMatchObject({ title: 'Second', position: 2 });
  expect(evidence.editions[0]).toMatchObject({ format: 'ebook', language: 'en',
    date: '2027-03-01', precision: 'day', market: 'GB' });
  expect(evidence.sources[0].url).toBe('https://books.google.com/books?id=Fictional01');
  expect(parseExtraction(evidence, evidence.sources).ok).toBe(true);
  const selected = selectProposals(req, evidence, at);
  expect(selected.releases.book?.date).toBe('2027-03-01');
  expect(selected.releases.book?.provenance.sourceMarket).toBe('GB');
  expect(selected.releases.audio).toBeNull();
  expect(evidence.sources[0].text).not.toContain('publishedDate');
  expect(evidence.sources[0].text).not.toContain('1999-01-01');
});
```

- [x] **Step 2: Add date qualification rejection tables.** Using a fresh `volume()` per row, vary sale date among absent, year, month, bare day, invalid February 30, invalid leap day, malformed ISO, invalid time/offset and a valid different literal day. Vary publication metadata among absent, year/month, invalid day, datetime, disagreement. Vary saleability outside the two allowed values and country absent/malformed. For every row assert an eligible ebook remains `{ date: null, precision: 'none', market: null }`, policy offers only an undated announcement when identity/known title qualifies, and synthetic text contains neither rejected date value nor publication-date labels nor an unqualified country. Include valid leap day, `FOR_SALE`, `Z`, fractional seconds, offsets and lowercase country normalized to uppercase as positive controls. Inspect source text directly, not just edition fields.

- [x] **Step 3: Add identity/eligibility tables.** Both subtitle grammars must accept integers and words One through Ten, exact series punctuation, optional comma in the first grammar, and nonempty parenthesized/colon suffix. Reject zero/negative/fractional/unsafe integers, wrong position, Eleven, arbitrary trailing words, prefix/suffix near matches, wrong series punctuation, Tale/sequel grammar, ordinal only in title/description and target fractional position. Literal normalized `Example` is not `Examples`. Test NFKC/case/whitespace equivalence without punctuation deletion. For known title, `Second: A Subtitle` must remain whole; `Second` cannot match it. Missing subtitle still permits a known-title ebook with null position.

Test absent/wrong/multiple authors, absent/fr/eng/EN language, nonboolean ebook flag, false ebook with `printType=BOOK`, missing or unsafe ID, malformed list/null input, 21 rows locally capped, long fields and literal quote chunks. Identity-only explicitly English non-ebook record may retain identity, never editions. Test every forbidden marker plus whitespace/hyphen phrase variants and assert no accepted identity/edition from it. Add two eligible target-position titles, assert both identities survive and `selectProposals` returns no identity or dependent release. Test source/citations contain exact full title, author and subtitle, ignore malicious descriptions/URLs, and never mutate input.

- [x] **Step 4: Establish red.** Run `npm.cmd test -- tests/discovery/google-books.test.ts`. Expect import failure for absent module first. After creating entry point, the same test cases must fail behaviorally until implemented; record the meaningful red cases.

- [x] **Step 5: Implement bounded allowlist normalization.** Read unknown objects with private checked helpers; never serialize a raw volume. Require exact eligibility before creating facts. Validate raw calendar components independently of `Date.parse` rollover. Derive a day only after the full conjunction. Anchor escaped exact-series grammar and compare the parsed safe integer to the requested integer. Use one synthetic string as the citation basis:

```ts
// Build only from bounded validated facts, never raw descriptions/date fields.
const facts = `Title: ${title}. Author: ${author}.` +
  (subtitle ? ` Subtitle: ${subtitle}.` : '') +
  ` Language: en. Format: ${isEbook ? 'ebook' : 'unknown'}.` +
  ` Edition: ${editionKey}.` +
  (qualified ? ` Saleability: ${saleability}. Market: ${saleCountry}.` +
    ` On sale: ${saleTimestamp}. Date: ${saleDay}. Precision: day.`
    : ' Market: unknown. Date: unknown. Precision: none.');
const citations = facts.match(/[\s\S]{1,600}/g)!
  .map(quote => ({ sourceId, quote }));
// Source.market and EditionEvidence.market are qualified ? saleCountry : null.
// EditionEvidence is created only for isEbook === true.
// IdentityEvidence is created only for a strict matching subtitle position.
```

Coalesce identical duplicate records but retain incompatible same-ID rows with deterministic content-hash suffixes on source/edition IDs, keeping original volume edition key. Remap every citation to the retained source. Hash only sanitized synthetic facts, not raw descriptions or rejected dates. Keep different qualified dates with same edition/country as conflicting evidence. An overlong or absent subtitle cannot earn identity through truncation.

- [x] **Step 6: Green, commit and review.** Run `npm.cmd test -- tests/discovery/google-books.test.ts tests/discovery/contracts.test.ts tests/discovery/policy.test.ts` and `npm.cmd run typecheck`. Self-review and commit only the two created files as `feat: normalize strict Google Books evidence`. Report fictional matrix coverage, qualified/unknown examples, red/green results, files and commit ID for independent spec/quality review. Resolve findings in scoped fix commits and obtain approval before Task 3.

### Task 3: Integrate bounded collection, merge and runtime accounting

**Files:** Own Task 3 paths in the table. Preserve allocation/prompt/policy implementations. `tests/discovery/runtime.test.ts` is a new focused fake-fetch runtime test file with Node Vitest environment.

**Interfaces:** Consume Task 2 normalizer and Task 1 contracts. Produce the backward-compatible fifth collector argument and configured runtime wiring:

```ts
export async function collectCatalogs(
  request: CheckRequest, markets: string[], signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  options: { googleBooksKey?: string | null } = {},
): Promise<CatalogResult>;
// runtime catalogs delegate:
catalogs: (request, markets, signal) => collectCatalogs(
  request, markets, signal, fetcher, { googleBooksKey: config.googleBooksKey }),
// runDiscovery after the final catalog snapshot:
usage.googlebooks = catalogs.usage.googlebooks;
```

- [x] **Step 1: Add collector disabled/order/query regressions.** Extend the local fake-timer `collect` helper with fifth options argument. With absent/null/blank key assert identical legacy URL sequence/terms and `usage.googlebooks === 0`, without a Google `missing-key`. With fake enabled key assert first request is the fixed Google list, contains all bounds and no country/startIndex/details. Unknown input q is `Example inauthor:Example Author`; known q is `intitle:Second inauthor:Example Author`. Use titles/authors containing `&`, `+`, quotes and punctuation; inspect decoded query parameters and complete Apple/OL titles to prove URL serialization and no truncation/stripping. No researched title input. Add this direct behavioral test using existing `json` and fake-timer conventions:

```ts
test('enabled Google series lookup narrows later catalog terms only by identity', async () => {
  vi.useFakeTimers();
  const req = request({ target: { ...request().target, title: '' }, formats: ['book'] });
  const urls: URL[] = [];
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input)); urls.push(url);
    return url.hostname === 'www.googleapis.com' ? json({ items: [{
      id: 'Fictional01', volumeInfo: { title: 'Second',
        subtitle: 'Example, Book Two', authors: ['Example Author'], language: 'en' },
      saleInfo: { isEbook: true },
    }] }) : json({ results: [], docs: [] });
  };
  const pending = collectCatalogs(req, ['CA'], new AbortController().signal,
    fetcher, { googleBooksKey: 'fake-google-secret' });
  await vi.runAllTimersAsync();
  const result = await pending;
  expect(urls[0].hostname).toBe('www.googleapis.com');
  expect(urls[0].searchParams.get('q')).toBe('Example inauthor:Example Author');
  expect(urls.find(url => url.hostname === 'itunes.apple.com')?.searchParams.get('term'))
    .toBe('Second Example Author');
  expect(urls.find(url => url.hostname === 'openlibrary.org')?.searchParams.get('title'))
    .toBe('Second');
  expect(result.usage.googlebooks).toBe(2);
  expect(req.target.title).toBe('');
  expect(parseExtraction(result.evidence, result.evidence.sources).ok).toBe(true);
});
```

- [x] **Step 2: Add effective-target and alternate-query regressions.** Reuse fictional volume from Task 2 as local test data, not a production lookup. Initial unknown series response with strict identity switches subsequent Apple term to `Second Example Author`, OL `title=Second` and exact OL candidate filter. Initial ambiguous two-title response keeps `Example Example Author` and original OL series query, retains both identities and no chosen title. Wrong series/subtitle/author/language cannot retitle. Known-title input never loses punctuation/subtitle.

Assert second Google title query after Apple/OL/fallback only if book exact date or needed identity unresolved and validated identity supplies a different title. An unresolved known-title first query gets a series alternate, including known title that only appears in the series response. No alternate when series identity unresolved/ambiguous, when all requested book/identity needs are resolved, or when only audio is missing. Google never contributes audio. Queries stop at two regardless of empty/failed responses and existing other caps. Cache identical query paths within one check.

- [x] **Step 3: Add actual queue, error and cancellation accounting.** Use `vi.resetModules()` plus dynamic import in isolated tests so module-global timing starts cleanly; do not reset modules during concurrent promises. Launch two enabled collections through one module with delayed fake Google fetches, record `performance.now()` starts and require at least 1,100 ms separation. Cancel the second while queued: zero Google attempts/fetches for it, retained cancellation reason. Cancel a started Google request: one attempt, no later provider work. Return fake 429, 5xx, malformed envelope and oversize `items`: accurate attempts, deduplicated sanitized reasons, successful prior evidence retained. A failure is no retry permission. Keep existing Apple/OL start/cancellation tests intact.

- [x] **Step 4: Add merge, isolation and bounded pipeline regressions.** Within collection, return the same Google ID in both queries with different qualified sale days: source/edition IDs remain unique, quotes point to both immutable texts, parser succeeds, policy exposes conflict. Return two identities sharing original source ID with incompatible text and preserve both alternatives. Exercise multiple editions/citations per source through normalized provider data rather than an implementation-only merge test. Identical rows coalesce without extra source/edition duplication.

Match a Google ebook ISBN to an Apple row with absent language and no OL language proof: Apple remains unknown, Google remains ebook. Existing exact OL ISBN join remains positive. Assert CA book preference and independent GB audio fallback; unqualified sale country cannot appear as CA evidence.

In `pipeline.test.ts`, use fake dependencies and actual normalizer/collector to assert Google summary counter survives complete/partial/cancelled paths. Add an extraction spy capturing supplied `evidence.sources` for rejected Google dates and assert the rejected strings and raw publication dates are absent before fake extraction. Keep `useAi: false` asserting zero extraction by default. At 30-source/30-identity/100-edition and 20,000-byte boundaries, extend the existing fictional allocation/minimum-loss fixtures with Google sources and literal citations. Require dependency closures/conflicting alternatives preserved or existing affected-format/identity `budget` suppression, no false later minimum, no byte/token expansion and no source mutation. Do not weaken saturation assertions to make Google fit.

- [x] **Step 5: Add runtime/pilot end-to-end wiring regressions.** In the new runtime test import `createDiscoveryRuntime`, `request`, `vi`, `expect`, `test`, `afterEach`; use fake timers and fake fetch only. Construct config with omitted key and explicit fake key, call `runtime.catalogs(req, ['CA'], signal)`, advance timers and inspect fixed Google call only for the configured runtime. No Tavily/DeepSeek calls arise from config creation. Assert final Google usage by running `runDiscovery` with runtime and `useAi:false`, no search key. In `pilot.test.ts`, fake runtime returns usage `{ ...emptyUsage(), googlebooks: 2 }`; sanitized run output includes exactly that counter while excluding source text, quotes, key and provider URL. Dry-run still has zero operations.

- [x] **Step 6: Establish red.** Run `npm.cmd test -- tests/discovery/catalogs.test.ts tests/discovery/runtime.test.ts tests/discovery/pipeline.test.ts tests/discovery/pilot.test.ts`. Failures should isolate missing fifth options behavior, ineffective retitle, lost identity/citation/counter or missing configured runtime request. Record meaningful failures, preserving unrelated passing legacy cases.

- [x] **Step 7: Implement queries, queue and effective title.** Add `googleBooksQueue = createRateQueue(1100)` at module scope. Generalize `retrieve` provider union/queue/cap map to include Google and increment only in queue callback. Keep existing cache before cap check and return accounting snapshot on cancellation. Build paths with `URLSearchParams`:

```ts
const seriesQuery = `${request.target.series} inauthor:${request.target.author}`;
const titleQuery = (title: string) => `intitle:${title} inauthor:${request.target.author}`;
const initialQuery = request.target.title ? titleQuery(request.target.title) : seriesQuery;
const googleBooksKey = options.googleBooksKey?.trim() ?? '';
const googlePath = (q: string) => `/books/v1/volumes?${new URLSearchParams({
  q, key: googleBooksKey, maxResults: '20', showPreorders: 'true', langRestrict: 'en',
})}`;
const effectiveRequest = (): CheckRequest => {
  if (request.target.title) return request;
  const identity = selectProposals(request, evidence, checkedAt).identity;
  return identity ? { ...request, target: { ...request.target, title: identity.title } } : request;
};
```

Normalize `options.googleBooksKey?.trim()` once; only enter Google branch when nonblank. Google list with absent `items` and `totalItems: 0` is a valid empty response; malformed nonempty envelope records `invalid-evidence`. Over-20 items records `budget` but normalizes first 20. First Google merge precedes legacy Apple/OL sequence. Read effective request for all later Apple/OL queries/filtering. After fallback, calculate missing book day and required unknown/fractional identity through current policy, choose the alternate described in Step 2, and request only if different and within cap. Use original series alternate for initial known title; never derive title from ranking or descriptions. Preserve all original provider stop conditions.

Always call `normalizeGoogleBooks(raw, request, checkedAt)` with the original request for both Google responses. Test a contradictory target identity returned by the refined second query: both alternatives must survive, suppressing identity and dependent releases. Do not use the effective derived-title request to narrow normalization.

- [x] **Step 8: Implement complete citation-preserving merge and accounting.** Existing `merge` currently calls `append` with just one edition for each source and drops identities; replace this behavior without changing normalization policy. First map every incoming source ID through duplicate/coalescing rules, then copy every identity/edition with all citations mapped. Clone citation arrays before remapping and never mutate incoming bundles. Preserve incompatible duplicate source IDs using deterministic hashes and preserve edition conflict keys; disambiguate conflicting edition IDs similarly. Keep existing Apple `originalLanguages` alias map return and OL-only join filters. Add runtime fifth-argument options and copy `catalogs.usage.googlebooks` in `runDiscovery` before applying reasons/bounding. No change to extraction call counts, allocation algorithm or policy.

- [x] **Step 9: Green, commit, review and final offline validation.** Rerun Step 6 plus `tests/discovery/google-books.test.ts`, `tests/discovery/contracts.test.ts`, `tests/discovery/http.test.ts`, `tests/discovery/config.test.ts`, `tests/discovery/server.test.ts`, `tests/discovery/policy.test.ts`, then `npm.cmd run typecheck`. Self-review, stage only owned paths and commit `feat: integrate bounded Google Books discovery`, then provide the commit for independent task spec/quality review. Resolve findings in scoped fix commits and obtain approval. Controller then runs `npm.cmd test -- --run`, `npm.cmd run typecheck`, `npm.cmd run build` once after last source change and obtains whole-integration review. Record exit codes/test counts and any limitations; do not claim live coverage or gate completion.

## Execution report requirements

Implementation checkpoint at `b802f28`: Task 1 committed `fb4bbc8`, Task 2 committed `220d2cf`, Task 3 committed `5a22ceb` with reviewed coalescing fix `b802f28`. All three tasks passed independent review. Controller fresh checks passed 818/818 tests across 20 files, typecheck and a 47-module build. The independent whole-integration review completed through a medium-effort ephemeral CLI with the diff supplied inline after local file reads were blocked. It found plural companion exclusion gaps, fixed at `52641b7` after 14 meaningful RED cases. A fresh scoped independent review accepted the fix with no new blocking issue. Final checks passed 832/832 tests across 20 files, typecheck and build. Review was diff-only and did not independently execute tests. Task 3 Step 9 is complete; no live coverage or phase gate pass is claimed. The provided Google key was separately prepared by the controller and its actual configured dry run made zero requests.

For each task return owned changed files, meaningful red behavior, exact green commands/results, review findings/resolutions and scoped commit ID. Controller checks that staged paths exclude secrets, probe data and unrelated work, and records a final offline result. Any revised design boundary belongs in this amendment before implementation continues.

The [Google evaluation](../../discovery-google-books-evaluation.md), original 14-case pilot and proposed four-case batch keep their historical meaning. Integration acceptance concerns the offline contracts above. Implementation workers install no credentials or make live calls. The separately approved four-case batch completed at `52641b7` within all ceilings and returned no dates or audio proposals. See [pilot report](../../discovery-four-case-pilot-report.md). No UI wiring, storage migration or phase gate pass is claimed. The completed allowance permits no replay.
