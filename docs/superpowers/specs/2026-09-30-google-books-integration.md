# Google Books integration amendment

Date: 2026-09-30. Status: integration approved; implementation follows the existing subagent-driven method. This is a focused amendment to the [phase 2 design](2026-09-29-release-discovery-design.md), informed by the [bounded Google Books evaluation](../../discovery-google-books-evaluation.md). It authorizes offline implementation and fictional tests. It does not authorize another live batch or pass the release-discovery gate.

## Purpose and boundaries

Add optional Google Books retrieval for bibliographic identity and English ebook evidence before optional extraction. Preserve Apple book/audio storefront retrieval, Open Library edition-language joins, exact title matching, independent format/market policy and honest unknowns. No source ranking, prior researched title, publication metadata or query preference establishes a release fact.

The adapter returns the existing `EvidenceBundle`. It adds no aliases, schema for work relationships, new dependency, persistent cache, frontend flow, library migration or automatic request. Task 8 and later of the original phase 2 plan remain gated by the existing pilot requirements and visual approval. The original 14-case pilot remains immutable and its allowance spent. The separate four-case Tavily/DeepSeek consent proposal remains pending. All implementation tests use fictional records and injected fake fetches.

## Configuration, contracts and transport

- Provider is `googlebooks`. `Usage.googlebooks` is a required nonnegative safe integer, validated like every existing provider counter. `emptyUsage()` initializes it to zero. Existing response fixtures and report assertions must adopt the field.
- `DiscoveryConfig.googleBooksKey?: string | null` remains optional for existing callers. `loadDiscoveryConfig` reads `GOOGLE_BOOKS_API_KEY` only from the separate Git-ignored `.env.google-books.local`, using the existing native environment parser and sanitized validation. Missing or blank keys normally disable Google. Do not read another provider's file, `.env`, VITE variables or process environment for this key. Do not create, copy or inspect real credentials during implementation.
- Capabilities add `googleBooks: boolean` and `limits.googleBooks: 2`. The boolean means configured key presence, not quota availability, verified account settings or permission for a live pilot. Producing capabilities performs no provider request.
- Fixed list endpoint: `https://www.googleapis.com/books/v1/volumes`. Reject every other path, detail endpoint, absolute destination and redirect. Use the current JSON-only, 20-second, 1 MiB transport with sanitized failures. Keep the 180-second check deadline and cancellation propagation.
- Each check makes at most two unique Google list requests, with `maxResults=20`, `showPreorders=true`, and `langRestrict=en`. Cap records locally to the first 20 even if the provider violates the requested bound and report `budget` when excess records are present. No pagination, volume details, returned-URL fetches, scraping or retries.
- Google has a module-global queue with at least 1,100 ms between request starts across checks and runtimes. Duplicate queries within one check coalesce and count once. A request counts when its queue callback starts, including failed requests. Cancellation before that callback starts counts zero. Google has its own cap independent of Apple 12, Open Library 3, Tavily 3 and DeepSeek 1.
- Missing or blank Google configuration leaves the current Apple/Open Library request order and queries unchanged. Optional absence alone adds no `missing-key` reason for Google.
- Request URLs can contain the key only in memory at the fixed transport boundary. No keys, keyed URLs, provider error bodies, raw records, prompts or descriptions enter reports, logs, browser requests, storage or backups.

## Bounded synthetic evidence

Create `server/discovery/googleBooks.ts` with `normalizeGoogleBooks(input: unknown, request: CheckRequest, checkedAt: string): EvidenceBundle`. It performs no network access. Treat records as untrusted unknown JSON and reject malformed fields conservatively.

Require a bounded valid volume ID, nonblank title at most 300 characters, exactly one nonblank author at most 300 characters matching `request.target.author` through the existing `normalizeIdentity`, and literal record language `en`. `langRestrict` alone proves no language. With a supplied target title, require its exact normalized match. Keep title punctuation, subtitles and edition decorations intact; do not strip or join them. Keep a separate subtitle only if it is a bounded string, without inventing one from the title. An absent subtitle is allowed, but a present malformed or oversized subtitle rejects the whole record so companion markers cannot be hidden by omission.

Use source IDs beginning `googlebooks:`. Construct source links as `https://books.google.com/books?id=<validatedID>` and ignore `infoLink`, descriptions, snippets and all returned URLs. Synthetic text includes only bounded literal title, exact author, optional subtitle, explicit `en`, ebook/unknown format, syntactically valid ISBN where present, and the qualified sale facts below. Citation chunks must be literal substrings at most 600 characters, within existing citation bounds. Source text has no raw `publishedDate` field.

`saleInfo.isEbook === true` is the only Google ebook proof. `printType=BOOK`, false/absent `isEbook`, access metadata and text-to-speech never prove print or audio. A bibliographic source may support strict identity without an ebook; it produces no edition unless ebook is explicitly true. An English exact-author ebook can produce `date: null`, `precision: 'none'`, `market: null` as an undated announcement. With unknown title, policy still requires validated identity before any dependent release can be proposed.

Reject records containing companion, omnibus, anthology, novella, short-story, boxed-set, guide, sampler or RPG markers in title or subtitle. Match these conservatively as words/phrases after the existing normalization, including ordinary whitespace or hyphen variants for `short story` and `boxed set`. Do not infer that an unmarked record must be a main-series work; only the strict identity grammar below can establish position.

### Country-scoped ebook sale day

A Google exact day requires every item below:

1. Explicit ebook, literal `en` and exact single author/title eligibility above.
2. `saleInfo.saleability` is exactly `FOR_PREORDER` or `FOR_SALE`.
3. `saleInfo.country` explicitly validates as a two-letter country under the existing catalog country contract, including normalization to uppercase. Lowercase valid codes are accepted and normalized; malformed or absent codes are not.
4. `saleInfo.onSaleDate` is a valid complete ISO datetime with timezone. Validate literal calendar day, time and offset components as well as finite parsing; rollover dates such as February 30 are invalid.
5. `volumeInfo.publishedDate` is a calendar-valid exact `YYYY-MM-DD` and equals the first ten characters of the valid sale datetime.

Use that literal sale calendar day without converting to UTC or the browser timezone. Only this qualified sale record supplies `market`; never copy the preferred/query country, access country or an unqualified sales country. Include qualified sale datetime, day, saleability and country in the synthetic source with literal citations. Do not expose the bibliographic publication field even when it supplied the equality guard.

Missing, partial, malformed or disagreeing sale/publication dates yield an unknown ebook announcement when other ebook eligibility holds. Remove rejected sale dates, all raw publication dates and unqualified country attribution entirely from source text, so extraction cannot bypass deterministic qualification. Do not preserve partial Google publication dates as month/year release evidence. The equality guard is deliberately conservative for this first version: it can discard a useful sale record, and publication metadata alone never establishes availability. Differences between edition identifiers continue through the existing edition policy rather than being mislabeled conflicts.

### Optional deterministic identity

Identity requires an integer target position, exact single author, literal `en`, eligible unmarked record, and only one of these complete subtitle forms, after NFKC/lowercase/whitespace normalization:

- `<exact series>,? Book <positive integer|One..Ten>` with an optional colon suffix or parenthesized suffix.
- `Book <positive integer|One..Ten> of <exact series>` with an optional colon suffix or parenthesized suffix.

Escape the exact normalized series before building anchored grammar. Preserve its punctuation. Number words mean One through Ten only; numeric tokens are positive safe integers and must equal the requested position. Require at least one character inside an allowed suffix. Fractional positions, title-only ordinal text, description parsing, Tale grammar, sequel wording, fuzzy series, localized aliases and companion inference produce no identity. A known input title must still match exactly.

Identity citations contain the literal synthetic title, author and subtitle, proving the supplied relationship. Keep two distinct qualifying titles at the same target position as alternatives. The current `selectProposals` ambiguity rule rejects them; never choose the first result, highest rank or earliest date to resolve identity.

## Collection and runtime integration

Preserve the first four arguments and add an optional fifth argument:

```ts
collectCatalogs(
  request: CheckRequest,
  markets: string[],
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  options: { googleBooksKey?: string | null } = {},
): Promise<CatalogResult>
```

`createDiscoveryRuntime` passes `{ googleBooksKey: config.googleBooksKey }` as the fifth argument. `runDiscovery` copies the actual returned Google counter into its final usage, including cancelled collection snapshots.

When configured, perform one initial Google query before Apple. Unknown-title input uses series plus `inauthor:<author>` without an expected title seed. Known-title input uses `intitle:<title>` plus `inauthor:<author>`. Serialize parameters with `URLSearchParams`; no `inpublisher` or invented country filter.

Merge the first response, then use the current `selectProposals(request, evidence, checkedAt).identity` to derive an effective title only when it returns one valid identity. Use that effective title for Apple terms, Open Library search title and exact edition-candidate filtering. Keep the complete supplied title when known. Ambiguous identities retain the original unknown-title series query. Do not mutate the caller request or seed fixtures/research answers into retrieval.

Preserve current preferred-format Apple requests, Open Library search and at most two editions, and bounded per-format Apple fallback. After those operations, a second Google query is allowed when requested book date or required identity remains unresolved and the alternate query differs. If the initial query used series, use only a validated selected identity's title for the alternate. If the initial query used known title, use the original series as the alternate because title queries can miss known works. Missing audio alone never triggers another Google request. An ambiguous initial series result with no selected identity has no title alternate and therefore stays at one request. Select effective title again after merges; ambiguity always suppresses retitling.

Generalize the catalog merge to copy all source dependencies, every identity and every edition, remapping all citation source IDs. Identical duplicates coalesce; same-ID incompatible facts keep distinct source/edition IDs and literal citations so the current policy retains conflicts. Do not drop one side of a date conflict or one identity alternative. Never transfer Google language proof into Apple: preserve the existing Open Library-only ISBN language join.

The existing 30-source, 30-identity, 100-edition allocation, full dependency closures, minimum-loss suppression, 20,000-byte prompt and 2,048-token output guards remain intact. Newly retained Google evidence consumes those limits. No budget expansion or allocation/prompt rewrite is included.

## Verification and reporting

Offline red/green checks must cover strict contracts, separate secret file parsing, fixed endpoint rejection, response/timeout/redirect bounds, global queue accounting, eligible ebook/identity records, rejected-date absence in extraction inputs, punctuation and ambiguity, citation remapping, known-title misses, language-join isolation, exact market selection, cancellation and retained allocation suppression. Update pilot dry-run/report fields to expose configured presence, `googleBooksMax: 2` when configured or `0` when absent/blank, and required `summary.usage.googlebooks`, with zero dry-run requests and no secrets. Capabilities retain the fixed limit `2` even when disabled.

Finish implementation with focused Vitest tests, full offline unit tests, typecheck and build, plus independent task and whole-integration review. Reports distinguish offline fixture results from measured live coverage. Do not replay the 20-call Google research, original pilot or proposed four-case batch. Any future live evaluation needs its own agreed provider allowance and pending AI consent before execution.
