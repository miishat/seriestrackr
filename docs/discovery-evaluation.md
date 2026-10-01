# Release discovery evaluation brief

Date: 2026-09-29

Phase one records release information manually. The [phase-two recommendation](discovery-recommendation.md) compares free catalogs, free search and minimal optional AI. Evidence includes [initial findings](discovery-initial-findings.md), [older-title probes](discovery-catalog-probes.json), [next-title probes](discovery-next-title-probes.json) and [Canadian Apple catalog probes](discovery-apple-probes.json). No provider has been adopted or validated end to end. DeepSeek passed the refined assisted real-evidence test for the eight series and two market-rule cases; free production search access remains untested. These examples are not production seed data.

Confirmed user choices: book availability means the earliest qualifying English ebook or print edition. Prefer the selected market; when no supported date exists there, accept another market and retain its source-market label. Apply this independently to audio. Prioritize free retrieval and minimal AI; the user authorized token-billed DeepSeek tests before provider selection. Core tracking remains independent of AI.

## Acceptance examples

| Series to investigate | Identity and author confirmed? | Next main-series book confirmed? | Book and audio date evidence collected? |
| --- | --- | --- | --- |
| The Witness Trilogy | Steven Erikson; Tales of Witness alias | Sample 2 -> 3: Legacies of Betrayal | UK ebook/audio evidence; CA ebook candidate |
| The Hierarchy | James Islington | Sample 1 -> 2: The Strength of the Few | CA publisher ebook evidence; catalog book/audio candidates |
| The Last Horizon | Will Wight | Sample 3 -> 4: The Pilot | CA audio candidate; ebook query yielded unrelated results |
| Ana and Din Mysteries | Robert Jackson Bennett | Sample 2 -> 3: A Trade of Blood | US publisher dates; CA ebook/audio candidates |
| The Bound and the Broken | Ryan Cahill | Sample 3 -> 4: Of Empires and Dust | CA audio candidate; ebook query empty |
| The Devils | Joe Abercrombie | Sample 1 -> 2: The Heretics | Author UK/US announcement; CA ebook candidate, audio unverified |
| Book of the Dead by RinoZ | RinoZ | Sample 4 -> 5: Ascension | Publisher listing; CA audio candidate, ebook query empty |
| Path to Ascendancy | Ian C. Esslemont | Sample 1 -> 2: Deadhouse Landing | UK format/edition evidence; CA ebook/audio candidates |

Sample progress is synthetic. Sources, dates, query limitations and unmatched fields are recorded in the recommendation. Catalog candidates require language and edition verification before acceptance; none establishes complete coverage or the latest installment overall.

## Questions for provider evaluation

For each example, first confirm the author and exact series identity from reliable sources. Can a candidate source identify the next main-series position and title after a specified last-finished book, while distinguishing side stories and alternate reading orders? Can it distinguish an announcement without a date from no result, a dated schedule, and an available release? Does it give separate book and audiobook dates for a selected market, with edition or format details where necessary? How fresh is its information, and can an individual field be traced to a source URL and checked time?

For each candidate provider, record concrete query inputs, response or page evidence, field-level results for all eight examples, missing or conflicting fields, country and format coverage, update frequency, rate limits, data access terms, attribution rules, credential requirements, and cost. Keep failures and ambiguous matches visible. A missing result is not evidence that no book has been announced. Compare free sources first, and present any paid service or credential need before choosing one.

The future flow should show proposed field changes with sources and let the user accept selected values while preserving manual entries. Network failures must leave accepted data intact. Changed reading progress must invalidate older proposals. Automated scraping, a new AI service, and background scheduling require separate decisions; this document authorizes none of them.

## 2026-10-01 evaluation update

Custom-order notes are an explicit unsupported automatic-proposal case. Nonblank notes retain source links and unknowns for manual review because numeric identity cannot prove an arbitrary note's order semantics. Fractional positions still require cited identity. The 13 latest pilot inputs had blank notes, so their measured outcomes are unchanged.

The earlier brief is a historical research snapshot. The [free-pages report](discovery-free-pages-pilot-report.md) now preserves an independently audited 13-case production batch: 10 identities, seven book dates and seven audio dates; all 14 dates corroborated, zero AI calls. Known-case support is 5/8, with Witness, The Devils and the CA Path to Ascendancy case named unsupported. Earlier failed pilots retain their original results.

Evaluate the feature as next numbered primary-series entry, not universal next full-length novel. Murderbot's publisher-numbered Volume 2 novella qualifies for that bounded claim; companions and fractional positions do not. Exact English edition/format/day and actual market remain required. Hardcover provides qualified identity/order/format/ISBN evidence only, NEVER accepted dates. Apple ebook ISBN lookup must not be described as ASIN or audiobook support. Supported same-product Apple page evidence supplies the latest dates.

The live GB control produced a supported CA fallback, not evidence of successful preferred GB retrieval or absence of a GB edition. Deterministic offline controls passed eligible preferred GB precedence over earlier CA evidence and withheld-CA fallback independently by format. Phase 2 implementation and verification are complete: 1133 tests across 33 files, typecheck, build and all 24 browser tests passed. Migration/recovery, guarded acceptance, app wiring, manual offline behavior and desktop/mobile inspection passed. Independent scoped re-review approved the custom-order repair after 82 focused tests with no new material findings. Local startup, frontend HTTP 200 and proxied capabilities succeeded without provider calls; rebuilt frontend credential scanning found no leak. All continuation edits remain uncommitted and unmerged. Startup, optional AI choice and persistence rules are documented in [usage](discovery-usage.md), with the [plan](superpowers/plans/2026-09-29-release-discovery.md) and [specification](superpowers/specs/2026-09-29-release-discovery-design.md).
