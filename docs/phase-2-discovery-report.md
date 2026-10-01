# Phase 2 release discovery: complete status report

Updated 2026-10-01. Current status: Phase 2 implementation and verification are complete with named coverage and custom-order limits. Fresh final checks passed 1133 tests across 33 files, typecheck, build (55 modules) and all 24 browser tests (14 discovery, 10 existing workflows, 10.7 seconds). The sole final-review P2 was repaired with four expected failing regressions and approved by independent scoped re-review after 82 focused tests, with no new material findings.

The current measured retrieval result is the independently audited 13-case batch: 10 identities, seven book dates and seven audio dates, all 14 dates independently corroborated, zero AI calls. Witness, The Devils and the CA Path to Ascendancy case are named unsupported. Human visual approval was received. Task 8 migration/recovery and Task 9 guarded acceptance were independently approved after 88 and 40 focused tests respectively; the standalone dialog was approved after 43 tests. This continuation remains uncommitted and unmerged.

Sections 1 to 16 below preserve the earlier research and failed-pilot snapshot. Their old counts, gated-task descriptions and allocation diagnosis are historical, superseded for current status by this opening and section 17. Hardcover date research is never accepted release evidence. See [operational usage](discovery-usage.md), the [original plan's execution status](superpowers/plans/2026-09-29-release-discovery.md) and the [specification](superpowers/specs/2026-09-29-release-discovery-design.md).

This is the single handoff document for Phase 2. It consolidates the research, the live pilot results, the provider evaluations, the coverage limits and the recommended next steps. Detailed evidence is linked in the artifact map at the end.

## 1. Where the work lives

| Item | Value |
| --- | --- |
| Branch | `codex/phase2-release-discovery` |
| Worktree | `C:\Users\misha\.codex\worktrees\phase2-release-discovery\seriestrackr` |
| Commits ahead of `main` | 36 |
| Integration state | Not merged. Tasks 8 to 11 (storage migration, acceptance, UI) are gated. |
| Last verified suite | 900 tests passing across 23 files, `tsc --noEmit` clean |

`main` contains only the Phase 1 manual tracker plus untracked research notes. All Phase 2 implementation is on the branch above.

## 2. What Phase 2 is meant to do

On an explicit user request for one series, find the next unread main-series book and separate book and audio release evidence, present cited field-level proposals, and let the user accept selected values into the local tracker without damaging manual data.

Confirmed rules that constrain every decision:

- Book means the earliest supported English ebook or print release. Prefer the selected market; otherwise accept another market and keep the actual source market label. Audio is independent.
- Requests are user triggered, one series at a time. No scheduler, no page-load requests.
- AI is optional, off by default, at most one extraction call per check.
- Free sources come first. Core tracking must work with no network and no AI.
- Never overwrite accepted facts because a provider failed or returned nothing.

## 3. Current status

| Gate | State |
| --- | --- |
| Offline implementation and tests | Passing: 900 tests, typecheck clean, build previously passing |
| Free catalog retrieval | Implemented: Apple, Open Library, Google Books, Tavily search, optional DeepSeek extraction |
| 14-case live release gate | Failed: 3 identities offered, 0 book dates, 0 audio dates |
| Four-case diagnostic follow-up | Failed on dates: 4 identities, 3 undated ebook announcements, 0 dates |
| Google Books evaluation | Complete: strong candidates and identifiers, almost no market-scoped dates |
| Hardcover evaluation | Complete: 4 of 4 identity and ebook dates, 3 of 4 audio dates, no market scoping |
| Google to Apple ISBN join | Implemented and tested, default off |
| Allocation root cause | Identified as the leading blocker, not yet fixed |
| Visual approval for the new UI | Pending |
| Phase completion | Not claimed |

## 4. The provider stack

| Layer | Provider | Intended role | Cost |
| --- | --- | --- | --- |
| 1 | Apple Search API | Storefront ebook and audio evidence, per country | Free, about 20 requests/minute |
| 2 | Open Library | Work identity and explicit edition language | Free, 1 req/s unidentified, 3 identified |
| 3 | Google Books | First-pass identity, ebook ISBNs, language, preorder sale dates | Free with key |
| 4 | Hardcover | Series position, main-versus-companion count, audio editions, ISBN and ASIN | Free with token, 60 requests/minute |
| 5 | Tavily Search | Missing author, publisher and announcement evidence | 1,000 free credits/month |
| 6 | DeepSeek Flash | Optional single extraction call over supplied evidence | Billed, roughly USD 0.001 to 0.008 per call |

Per-check budgets: 12 Apple requests, 3 Open Library, 2 Google Books, 3 Tavily searches, 1 DeepSeek call, 30 sources, 100 editions, 20,000 input bytes, 2,048 output tokens, 180 seconds total.

Excluded or superseded: Gemini (no free Search grounding, unusable trial), Groq Compound (shut down), Bing Search API (retired 11 August 2025), Brave (storage-rights terms), OpenAI web search (paid fallback only), Goodreads (public API dead since 2020), Audible and Amazon PA-API (no practical public access).

## 5. Measured performance by provider

| Provider | Result |
| --- | --- |
| Open Library | Older-title probe 6 of 8 HTTP 200 with 2 HTTP 502. Next-title probe 8 of 8 HTTP 200 with only 4 of 8 returning records. |
| Apple catalog | 16 of 16 HTTP 200 in the CA probe; 11 of 16 format queries had a real candidate after author and title checks, at least one per series. |
| Google Books | 20 of 20 HTTP 200. 11 of 12 series queries had an English exact-author candidate; 5 of 8 seeded titles matched exactly, 7 of 8 as a union. Only 1 of 20 retained volumes carried a market-scoped sale date. |
| Tavily | 42 runtime search attempts in the first live batch, 11 more in the follow-up. Plan usage observed at 12/1000 after the first batch and 42/1000 later; the discrepancy is preserved and unexplained. |
| DeepSeek | Synthetic extraction 5 of 5 with 1,261 ms and 628 tokens. Assisted real-source 5 of 10 then 10 of 10 after prompt refinement, 2,499 and 2,588 ms, about USD 0.0019 total. |
| Hardcover | 8 requests for 4 cases. 4 of 4 identities with explicit positions, 4 of 4 ebook dates, 3 of 4 audio dates. |

Latency is dominated by queue spacing, not model time. A full check ran 19,240 to 30,486 ms in the first batch and 22,926 to 25,151 ms in the follow-up.

## 6. Live pilot results

First batch at commit `0f80cea`: 14 frozen cases, one run each, no retries. 84 Apple, 29 Open Library, 42 Tavily and 14 DeepSeek requests. Result: 3 identities, 0 book dates, 0 audio dates, 13 partial and 1 complete. The three offered identities were manually audited and no unsupported assertion was found. The gate failed.

Four-case follow-up at commit `52641b7`: 5 Google, 24 Apple, 8 Open Library, 11 Tavily and 4 DeepSeek requests. Result: all 4 checks proposed an identity, 3 proposed an undated ebook announcement from Google Books, and none produced a book or audio date. Every case recorded `invalid-evidence`; the first three also recorded `budget`. Path to Ascendancy GB did not record `budget`.

## 7. Google Books evaluation

Evaluated 2026-09-30 with 20 of 20 HTTP 200 responses. Google contributes explicit language, ebook flags, ISBNs, ordinal subtitles for some series, and occasionally a country-scoped preorder sale date. The only audited positive example is Legacies of Betrayal, ISBN 9781409032786, `onSaleDate` 2026-10-01 with sale country CA, corroborated against the Penguin UK page.

Limits: no audiobook evidence, no documented country filter, sensitive to query wording, and the strict normalizer refuses to promote `publishedDate` into a market-scoped date. That refusal is correct but is why Google alone cannot produce the required date.

## 8. Hardcover evaluation

Evaluated 2026-10-01 with 8 bounded GraphQL requests. The archived public documentation is stale; the live schema was captured by introspection. Live `books` has no `series_names`, `has_audiobook` or `isbns`; those moved to `book_series`, `default_ebook_edition`, `default_audio_edition` and `editions`.

| Case | Hardcover finding |
| --- | --- |
| Hierarchy 2 | The Strength of the Few, position 2. Ebook 2025-11-11, ISBN 9781982141257. Audio 2025-11-11, ASIN B0F6F54HND. |
| Ana and Din 3 | A Trade of Blood, position 3. Ebook 2026-08-04, ISBN 9780593723869. Audio 2026-08-04, ISBN 9798217279296, ASIN B0FKVBM6MV. |
| Scholomance 2 | The Last Graduate, position 2. Ebook 2021-09-28, ISBN 9780593128879. Audio 2021-09-28, ASIN B08M4DMT5J. |
| Path to Ascendancy 2 | Deadhouse Landing, position 2. Ebook 2017-11-14, ISBN 9781466868595. No audio edition. |

Query strategy matters: querying `books` by author missed the target in 2 of 4 cases, while querying `series` by exact name succeeded in all 4. The `_like` and `_ilike` operators are disabled by the provider, so an adapter must use exact `_eq` or `_in` matches with enumerated aliases.

Data quality defects observed: A Drop of Corruption carries a 1995-11-24 date beside a correct 2025-04-01 record; an unrelated 12-book series is also named "Scholomance"; Deadhouse Landing appears twice at position 2; a companion sits at position 0.5. Author agreement plus exact position matching is mandatory.

Hardcover is not a market authority. It returned US ISBNs with no market scoping. Its dates matched Apple CA dates in three of four cases, which is more likely explained by same-day global releases than by Canadian availability.

## 9. The blocker: retrieval is not the failure

Thirteen keyless, read-only Apple catalog requests on 2026-09-30 and 2026-10-01 showed that Apple CA already returns a dated edition in both formats for all four diagnostic cases, using the same query shape the pipeline issues.

| Case | Apple CA ebook | Apple CA audio |
| --- | --- | --- |
| Hierarchy 2 | The Strength of the Few, 2025-11-11 | The Strength of the Few: Hierarchy, Book 2 (Unabridged), 2025-11-11 |
| Ana and Din 3 | A Trade of Blood, 2026-08-04 | present in the captured probe at 2026-08-04 |
| Scholomance 2 | The Last Graduate, 2021-09-28 | The Last Graduate: A Novel (Unabridged), 2021-09-28 |
| Path to Ascendancy 2 | Deadhouse Landing, 2017-11-14 and 2017-11-16 | Deadhouse Landing: A Novel of the Malazan Empire (Path to Ascendancy, Book 2) (Unabridged), 2017-11-14 |

The same probe ruled out a suspected parameter bug: `entity=ebook` and `media=ebook` return identical results.

The leading allocation hypothesis was pruning combined with identity timing. Before the in-flight repair, a format role preserved a dated edition only when `selectProposals` already produced a proposal for it; otherwise it reserved prose. The `singletons` sort ordered by preferred market without datedness. Because Google runs first and can consume up to 20 sources toward the 30-source cap, a dated Apple edition could be discarded before identity resolved. Fictional pipeline regressions now reproduce and repair this retention loss, including late identity resolution and complete citation closures. This does not establish allocation as the sole cause of live failures or pass the live release gate.

Separate authorized Hierarchy diagnostics also found an edition title mismatch that rejected a whole model edition batch, and three proposed dates without explicit English proof. A controlled known-title experiment accepted three editions but remained undated. A focused-language experiment retrieved six added sources, five mentioning English, and accepted ten model editions while still returning no eligible date. The prompt's prefix truncation can lose footer metadata; offline regressions now preserve heading/order plus explicit language/release excerpts within the same 20,000-byte budget. Quotes are checked against both sent excerpts and original sources. These diagnostics are separate from the frozen four-case pilot and do not change its immutable results.

## 10. The Google to Apple ISBN join

Implemented and tested, default off. When enabled, `collectCatalogs` takes ISBNs from catalog editions that match the resolved identity and resolves them against the storefront with `/lookup?isbn=...&country=...&entity=...`, canonicalizing a decorated storefront title back to the resolved work title. The explicit language travels from the ISBN-bearing edition to the storefront edition, which is the spec's existing exact-identifier join rule.

Five tests cover the mechanism, the author guard, the skip conditions and the four-request bound.

Value assessment: small gain for ebooks, because Apple already returns exact ebook titles. No gain for audiobooks from Google, because Google emits ebook editions only. The join becomes valuable when paired with Hardcover, which supplies audiobook ISBNs and ASINs for the same lookup path.

## 11. Comparison summary

| Dimension | Google Books | Apple | Hardcover |
| --- | --- | --- | --- |
| Identity and order | Ordinal only when in a subtitle | Text only, often decorated | Explicit position, plus `primary_books_count` excluding companions |
| Market-scoped date | No, except a rare preorder | Yes, per country | No, global and US-weighted |
| Audiobook | None | Yes | Yes |
| ISBN and ASIN | Ebook ISBNs only | None in the response | ISBN-10, ISBN-13, ASIN |
| Best query form | `intitle`/`inauthor` | `term` search or `lookup` by ISBN | `series` by exact name |
| Requests in evaluation | 20 | 16 plus 13 follow-up checks | 8 |
| Result | 7 of 8 titles as a union, ~0 dates | Dates for all 4 formats in both formats | 4 of 4 identity and ebook, 3 of 4 audio |

The providers are complementary. Google supplies identifier and identity candidates, Hardcover supplies ordering and audiobook editions, and Apple supplies the market-scoped date. None of the three should be the sole source.

## 12. Open decisions

1. Whether to fix allocation so dated, market-scoped editions survive pruning. Recommended first, because it addresses the measured failure with no new provider or spend.
2. Whether to add Hardcover as a production source, and in what role. Recommended as identity, ordering and audiobook-edition evidence, not as a date authority.
3. Whether to enable the ISBN join in the pipeline and extend it to Hardcover audio ISBNs and ASINs.
4. Whether to keep pursuing full date discovery or narrow the product claim to title and source review. The plan records this as a real scope choice, not an automatic pass.
5. Further bounded diagnostic testing is authorized by the user's later instruction permitting necessary calls above the initial per-case ceilings. Each experiment must have a unique reservation, recorded actual counts and no automatic retries. The original pilot allowances remain closed. This authorization does not enable background or automatic billed product calls.

## 13. Recommended next steps, in order

1. Fix allocation priority: when identity is unresolved, retain dated market-scoped editions ahead of undated ones, and sort `singletons` by datedness before market. Verify offline against the frozen fixtures.
2. Extend the ISBN join to accept Hardcover audiobook ISBNs and ASINs.
3. Add a Hardcover adapter that queries `series` by exact name, requires author agreement and an exact position, and treats a missing audio edition as unknown.
4. Re-run the four diagnostic cases offline against fixtures. Only then request a new live allowance.
5. Obtain the visual approval for the Phase 2 mockup before wiring UI, and keep storage migration gated until the date scope passes or is narrowed.

## 14. Artifact map

All paths are relative to `C:\Users\misha\.codex\worktrees\phase2-release-discovery\seriestrackr`.

Specifications and plans: `docs\superpowers\specs\2026-09-29-release-discovery-design.md`, `docs\superpowers\plans\2026-09-29-release-discovery.md`, `docs\superpowers\plans\2026-09-30-google-books-integration.md`, `docs\superpowers\plans\2026-09-30-discovery-retrieval-diagnostics.md`, `docs\superpowers\plans\2026-09-30-discovery-fact-windows.md`.

Reports and evaluations: `docs\discovery-recommendation.md`, `docs\discovery-evaluation.md`, `docs\discovery-initial-findings.md`, `docs\discovery-existing-apps.md`, `docs\discovery-pilot-report.md`, `docs\discovery-four-case-pilot-report.md`, `docs\discovery-google-books-evaluation.md`, `docs\discovery-hardcover-comparison.md`, `docs\phase-2-discovery-report.md` (this file).

Raw evidence: `docs\discovery-catalog-probes.json`, `docs\discovery-next-title-probes.json`, `docs\discovery-apple-probes.json`, `docs\discovery-gemini-check.json`, `docs\discovery-deepseek-check.json`, `docs\discovery-deepseek-real-check.json`, `docs\discovery-deepseek-live-catalog.json`, `docs\discovery-deepseek-real-evidence.json`, `docs\discovery-google-books-probes.json`, `docs\discovery-hardcover-probes.json`, `docs\discovery-hardcover-schema.json`, `docs\discovery-four-case-pilot-results.json`.

Implementation: `shared\discovery.ts`, `shared\discoveryPolicy.ts`, `shared\discoveryValidation.ts`, `server\discovery\*.ts` (config, http, rateQueue, catalogs, googleBooks, search, deepseek, prompt, evidenceAllocation, runDiscovery, runtime, server, main, diagnostics), `scripts\discovery-pilot.ts`, `scripts\discovery-diagnostic-pilot.ts`, `scripts\discovery-google-books-probe.mjs`, `scripts\discovery-hardcover-probe.ts`.

Tests: `tests\discovery\*.test.ts` including `isbn-join.test.ts`, `config.test.ts`, `catalogs.test.ts`, `pipeline.test.ts`, `pilot.test.ts`, `google-books.test.ts`, `diagnostics.test.ts`.

Credentials: `.env.discovery.local`, `.env.deepseek.local`, `.env.google-books.local`, `.env.hardcover.local`. All are Git-ignored, exist only in the local worktree and main checkout, and never enter reports, backups or the browser bundle.

## 15. How to run

```powershell
# Offline verification, no network and no keys needed
npm.cmd test -- --run
npm.cmd run typecheck
npm.cmd run build

# Hardcover probe, dry run first
npm.cmd exec tsx scripts/discovery-hardcover-probe.ts
npm.cmd exec tsx scripts/discovery-hardcover-probe.ts -- --run
npm.cmd exec tsx scripts/discovery-hardcover-probe.ts -- --introspect

# Frozen pilot, one case, dry run and then live
npm.cmd exec tsx scripts/discovery-pilot.ts -- --dry-run
npm.cmd exec tsx scripts/discovery-pilot.ts -- --run --case <id> --ai
```

## 16. Caveats and what is not proven

Four and fourteen case samples, one run each, no retries. Never a benchmark. No worldwide completeness, no store stock verification and no market scoping from Hardcover. Hardcover is community data behind a beta API whose terms were not reviewed in this run. The allocation root cause is strongly supported but not yet proven. The ISBN join is implemented and unit tested but not measured against live coverage. Tasks 8 to 11 remain gated, and no phase completion is claimed.

## 17. 2026-10-01 continuation: free-pages evidence and corrections

This is an append-only continuation. Sections above and the original 14-case and four-case pilot tables remain historical. The [new 13-case free-pages report](discovery-free-pages-pilot-report.md) records 10 identities, seven book dates and seven audio dates, independently corroborated with zero AI. Actual provider starts were Apple combined API/page 70, Hardcover 13, Google Books 13, Open Library 32 and Tavily 15. Witness, The Devils and the CA Path to Ascendancy case were unsupported. Partial statuses retain independently supported facts.

Corrections to earlier recommendations: Hardcover dates are NEVER accepted market/edition release evidence, including a discovered Hierarchy audio October 11 error against the supported November 11 day. Hardcover identity requires exact alias/position, author-role agreement, featured main membership, compilation exclusion and a qualifying exact-title English edition/format. `primary_books_count` is an aggregate, not membership proof. Apple documented ISBN lookup is ebook-only and does not accept ASINs or prove audiobook lookup.

Apple HTML product evidence now requires explicit same-edition English, exact product binding and date proof, with fixed HTTPS URLs, HTML MIME, 1 MiB/20-second limits, no redirects/cookies, a shared global 3100 ms queue and 12 combined starts/six HTML maximum. Dates retain actual source market or null. Supported primary-series entries include explicitly publisher-numbered novellas such as Murderbot Volume 2, without promoting fractional companion entries or claiming next full-length novel coverage.

The live GB control returned a CA fallback; it does not prove preferred GB retrieval. Deterministic controls separately passed eligible preferred GB precedence and withheld-CA fallback independently by format. Tasks 8 to 11 are complete: migration/recovery, guarded acceptance, app wiring, browser/manual offline behavior and keyboard review passed. Actual wired views at 1440 and 390 pixels were readable without horizontal overflow. Rebuilt credential scanning against four actual service values found no leak across three frontend assets; frontend imports contain no server modules. Local `dev:all` started at frontend `127.0.0.1:3000` and service `127.0.0.1:3001`, with frontend HTTP 200 and proxied capabilities success without provider calls. See [usage](discovery-usage.md). No implementation gate remains pending. Changes remain uncommitted and unmerged; no push or deployment occurred. Broad `git diff --check` has existing trailing-blank warnings in ten unrelated files, which were preserved; this report does not claim a globally clean diff.

## 18. Execution rulings and costs

These nine existing ledger rulings are retained in chronological order. They record implementation decisions and their practical costs if wrong, not new authorization.

| Order | Ruling and reason | Cost if wrong |
| --- | --- | --- |
| 1 | Retain the ignored evidence workspace while Phase 2 is active. Exclusive live reservations and recovery evidence must survive to prevent replay. | Retained scratch files. |
| 2 | Treat the user's bounded necessary live experimentation authorization as covering approved experiments above the initial ceilings. It does not enable automatic billed product calls. | Small recorded test usage. |
| 3 | Emit a Hardcover identity only with an explicitly English, supported-format edition matching the title. Exclude translation-only records and preserve ambiguity between English works. | Genuine titles with missing edition metadata fall back to other providers. |
| 4 | Strip only Unicode bidi presentation controls when matching an Apple visible H1 to the literal API/JSON-LD title for product-badge binding. Other spelling and relationship guards stay exact. | Titles distinguished only by presentation controls may compare equal. |
| 5 | Use the specification's named-unsupported coverage alternative. Preserve supported date discovery and honest unknowns for Witness, The Devils and CA Path to Ascendancy. | Users may need manual review for these series. |
| 6 | Accept explicitly numbered primary serialized entries, including publisher Volume 2 Artificial Condition. Keep companions/fractional novellas excluded and describe the feature as series entries. | A user wanting novels only must review the sequence. |
| 7 | Preserve legacy manual HTTP(S) validation and apply strict URL whitelists to new discovery metadata. Narrowing legacy inputs would break valid v1 recovery. | Legacy links retain the existing broader allowance. |
| 8 | Use shared `normalizeIdentity` throughout acceptance and the dialog. | Equivalent spelling variants preserve unselected same-work facts. |
| 9 | Leave nonblank custom-order notes source-only/manual because the current evidence schema cannot attest arbitrary custom-order semantics. Numeric identity does not prove agreement; fractional positions still require cited identity. | Valid custom-ordered series need manual entry. |
