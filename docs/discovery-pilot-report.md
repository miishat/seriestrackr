# Bounded discovery pilot

Updated 2026-09-30. The authorized 14-case production retrieval batch at backend commit `0f80cea` is complete; the live release gate did not pass. It made 84 Apple requests, 29 Open Library requests, 42 Tavily basic search attempts and 14 DeepSeek extraction attempts, with one run per case and no retries. Three identities were offered and manually source-audited; no book or audio release was offered. The separately tested offline repairs at `5cf3bd0` have not had a live evaluation. Library migrations and UI wiring remain gated. See the [remediation plan](superpowers/plans/2026-09-30-discovery-pilot-remediation.md).

## Original pilot backend behavior at `0f80cea`

`runDiscovery` validates its input, collects catalogs once with the complete ordered country set, then makes at most three adaptive searches and one explicitly requested extraction. Catalog transport keeps its existing check-local deduplication, attempt counters and global rate queues. Source namespaces prevent collisions between queries from redirecting citations. Unrelated factual records are discarded before priority pruning; retained bundles have at most 30 sources, 30 identities and 100 editions. Structured contradictions are grouped even before identity resolution. A conflict that cannot fit suppresses its format proposal and adds a budget reason.

AI stays disabled by default. Without AI, arbitrary prose remains inert and source links remain reviewable. An extraction cannot replace a supplied source or its text. Deterministic facts are kept independently, contradictory AI facts remain conflicts, and only actually reported trustworthy token counts replace null after an AI attempt. Empty successful retrieval can complete with unknown facts. Operational failure with no useful evidence is failed; retained useful evidence with an operational failure or missing capability is partial. Caller cancellation retains attempt accounting and stops subsequent work. No result creates an automatic not-found release.

The CLI reads only `pilot-cases.json`. Expected assertions never enter runtime queries, extraction input or reports. A run selects exactly one case. Reports include factual fields, provenance links, conflicts, summary reasons, counts and latency. They omit quotations, raw retrieved text, prompts, model content and key values. The executable saves no report files and changes no library state.

## Frozen evaluation inputs and expectations

The input file contains eight known cases from the recommendation, four additional frozen cases and two controls. Every input title is empty. The four additional cases are Mistborn / Brandon Sanderson / 2, Murderbot Diaries / Martha Wells / 2, Scholomance / Naomi Novik / 2 and The Masquerade / Seth Dickinson / 2. Inputs were frozen before any production run. CA is an evaluation market only.

The separate expected file contains manually researched primary-source identity/order assertions and specific listed format/date assertions. Null format entries mean unverified, never absence of announcement. Listed dates do not prove exhaustive earliest availability. Explicit language and actual edition market still need verification against live retrieved sources. Earlier assisted trial results are not substituted for new retrieval evidence.

| Case | Independent identity/order evidence | Format facts available in this source snapshot |
| --- | --- | --- |
| Witness 3 | [Penguin UK](https://www.penguin.co.uk/books/405106/legacies-of-betrayal-the-third-tale-of-witness-by-erikson-steven/9781409032786) identifies the third Witness novel | Listed GB ebook and [audio](https://www.penguin.co.uk/books/405106/legacies-of-betrayal-the-third-tale-of-witness/9781529991000) 2026-10-01; CA requires separate evidence |
| Hierarchy 2 | [Simon & Schuster CA](https://www.simonandschuster.ca/books/The-Strength-of-the-Few/James-Islington/Hierarchy/9781982141257) names The Strength of the Few and Book 2 | Listed CA ebook 2025-11-11; audio unknown in this snapshot |
| Last Horizon 4 | [Author July archive](https://www.willwight.com/a-blog-of-dubious-intent/archives/07-2025) identifies The Pilot as fourth | Author release post does not establish a country/format exact date pair |
| Ana and Din 3 | [Publisher series order](https://www.penguinrandomhouse.com/series/LVI/ana-and-din-mysteries/) identifies A Trade of Blood | [US format listing](https://www.penguinrandomhouse.com/books/735560/a-trade-of-blood-by-robert-jackson-bennett/audio/) gives ebook and audio 2026-08-04; CA unknown |
| Bound and the Broken 4 | [Author order](https://www.ryancahillauthor.com/books) distinguishes Of Empires and Dust from novellas | Exact edition dates unknown |
| Devils 2 | [June author update](https://joeabercrombie.com/progress-report-june-26/) names The Heretics as the sequel | Country days without explicit edition-format pair do not freeze a release assertion |
| Book of the Dead 5 | [Publisher listing](https://aethonbooks.com/2026/06/12/july-2026-litrpg-progression-fantasy-releases/) identifies Ascension at position 5 | General launch listing does not establish exact English edition/market dates |
| Path to Ascendancy 2 | [Penguin UK ebook](https://www.penguin.co.uk/books/421794/deadhouse-landing-by-esslemont-ian-c/9781473510593) explicitly identifies position 2 | Listed GB ebook and [audio](https://www.penguin.co.uk/books/421794/deadhouse-landing-by-esslemont-ian-c/9781473542198) 2017-11-16; CA remains separately unverified |
| Mistborn 2 | [Author original trilogy](https://www.brandonsanderson.com/pages/the-mistborn-saga-the-original-trilogy) identifies The Well of Ascension | Hardcover August 2007 is month precision only; country/audio unknown |
| Murderbot Diaries 2 | [Publisher Volume 2](https://us.macmillan.com/books/9781250186935/artificialcondition/) identifies Artificial Condition | Dynamic selector alone is insufficient format evidence; [author page](https://www.marthawells.com/murderbot.htm) categorizes early entries as novellas |
| Scholomance 2 | [Publisher sequel listing](https://www.penguinrandomhouse.com/books/609362/the-last-graduate-by-naomi-novik/audio/) identifies The Last Graduate | Listed US audio 2021-09-28; CA/earliest book remain unknown |
| The Masquerade 2 | [Publisher Volume 2](https://us.macmillan.com/books/9781466875135/themonsterbarucormorant/) identifies The Monster Baru Cormorant | Dynamic selector alone is insufficient format evidence; CA/audio unknown |

Witness subtitle aliases, Ascension's full listing title, and the punctuated versus unpunctuated Esslemont author spelling need explicit live review. Identity matching uses Unicode NFKC, case and whitespace normalization; this report does not authorize broad fuzzy matching. Murderbot's serialized-entry/novella ordering is a scope question for review, not permission to substitute a different main novel. Decimal and novella behavior is covered separately by offline policy/pipeline regressions.

The `ana-and-din-withheld-ca` fixture withholds CA evidence in deterministic offline tests and verifies independent US format attribution. The production CLI does not hide real CA evidence. `path-to-ascendancy-gb` verifies GB preference over earlier CA dates and later GB paperback dates using deterministic fixtures. Fixture texts are fictional and do not establish measured live retrieval coverage.

## Provider terms review

Official full terms were accessed on 2026-09-30. This review describes applicable provisions and unresolved use constraints; it is not an unconditional rights grant.

- [Apple Search API overview and legal section](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/index.html) permits catalog search and mapping. Promotional media has additional badge, attribution and streaming restrictions. This pipeline uses factual bibliographic metadata and source links, with no artwork, previews or other promotional assets. No blanket permission to archive bodies is inferred.
- [Open Library licensing](https://openlibrary.org/developers/licensing) states that Internet Archive asserts no new proprietary rights over its catalog, while preserving possible existing contribution/jurisdiction rights. The controller reviewed the full [API guidance](https://openlibrary.org/developers/api): it explicitly supports human-facing real-time low-volume lookup and prohibits bulk/high-traffic backend use. This user-triggered personal lookup makes one search and at most two record requests at the default 1.1-second spacing, fitting that lookup scope. The generic backend uncertainty is resolved for this concrete implementation. Persist accepted factual fields and links only; source bodies remain transient.
- [Tavily platform terms](https://www.tavily.com/terms), updated May 4, 2026, section 2 covers documented API integration and order-form limits. Sections 9.1-9.2 allow provider processing of customer input for service improvement. Section 10.2 leaves third-party terms applicable. The controller verified documented AI-application integration for this use. Public targets only, basic search, generated answers disabled; accepted facts and links are retained while source text remains transient. The earlier scratch note's claimed section 3.2 performance-publication restriction was not relied on here; this is a private evaluation report, not a public benchmark. The key, free allowance and disabled pay-as-you-go setting were confirmed before this batch; see the account observations below.
- [DeepSeek Open Platform Terms](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html), effective April 29, 2026, section 1.1 covers downstream API integration; section 4.1 requires lawful input rights and section 4.2 assigns any output rights subject to law and terms. Section 8.1 requires AI disclosure and recognizes errors. [General terms](https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html), March 27, 2026, section 3.1 requires accuracy checking and AI identification when disseminating output. Proposals preserve interpreted provenance and need source review. No model response or prompt is retained. Third-party source rights remain applicable when supplying evidence text to this API.

Generic third-party-rights provisions do not introduce a blanket user-approval gate for this facts-and-links retention design. If a specific restricted source is encountered, assess that actual restriction before using it. The concrete provider lookup/integration scope, credentials, account setting and consent were reviewed for this completed batch. They do not establish retrieval coverage or authorize another batch.

## Completed authorization and account observations

The user authorized exactly 14 frozen cases once, at most 42 free Tavily searches and 14 DeepSeek calls, an approximate USD 0.12 AI estimate, and no retries. The user supplied the Tavily key through the ignored local file and confirmed pay-as-you-go disabled. The controller confirmed both credential files were ignored before using them locally. No key value entered reports or provider inputs beyond the required authentication headers.

Before the batch, Tavily GET `/usage` returned HTTP 200 with plan usage 0/1000 and pay-as-you-go usage 0. After the batch, the controller observed plan usage 12/1000 and pay-as-you-go usage 0. Null pay-as-you-go limit metadata did not establish the setting; the user's explicit disabled-setting confirmation was the prerequisite. Runtime counters record **42 search attempts**, while the observed account counter changed by **12**. Those are different measurements. The discrepancy is unresolved; do not infer charged credits, caching, reporting delay or a bill from it. The authorization's search and AI attempt allowances are exhausted.

Per-check limits stayed unchanged: 12 Apple requests, three Open Library requests, three Tavily basic searches, one optional DeepSeek request, 20,000 complete serialized input bytes, 2,048 output tokens and 180 seconds. Apple/Open Library queue spacing stayed 3.1/1.1 seconds; provider HTTP timeouts remained 20 seconds and DeepSeek 45 seconds. No automatic retries, model repair, arbitrary page fetching or extra retrieval endpoint was used by the production pipeline.

The original USD 0.1184064 estimate for 14 capped calls used the Task 5 dated peak estimate, approximating each input byte as a token. It was an estimate, not a dollar guarantee. No DeepSeek balance deduction or invoice was checked. Ten pipeline reports have unknown input/output tokens after rejection. Four report trustworthy usage, totaling 19,654 input and 2,385 output tokens; that subtotal excludes unknown cases and is not a batch token total or measured cost. Some additional response-envelope counts appear in metadata-only diagnostics below, separately from pipeline usage.

Working Windows commands are `npm.cmd exec tsx scripts/discovery-pilot.ts -- --dry-run` and the single-case `npm.cmd exec tsx scripts/discovery-pilot.ts -- --run --case <id> --ai`. PowerShell's `npm.ps1` forwarding dropped arguments in an earlier dry run, so that invocation was not accepted as run evidence. The first three live cases used the CLI; remaining unrun cases used a metadata-only wrapper around the same production `runPilot`/runtime, unchanged payloads and budgets, once each. The wrapper recorded envelope validation booleans, counts and usage metadata; it retained no prompt, retrieved body or model response. It added no provider call or retry.

## Live results

All cases used blank input titles. Every case made six Apple requests, three Tavily searches and one DeepSeek request. Open Library counts and full check latency differed below. Both format outcomes were unknown in every case; all release proposals were null. Complete means planned operations completed, not complete factual coverage.

| Case | Identity offered | Status / reasons | Open Library attempts | Latency ms | Pipeline input / output tokens |
| --- | --- | --- | ---: | ---: | --- |
| Witness 3 | None | partial: budget, invalid-evidence, unknown-identity | 2 | 22,382 | unknown / unknown |
| Hierarchy 2 | None | partial: budget, invalid-evidence, unknown-identity | 1 | 21,585 | unknown / unknown |
| Last Horizon 4 | None | partial: invalid-evidence, unknown-identity | 1 | 20,426 | unknown / unknown |
| Ana and Din 3 | None | partial: budget, invalid-evidence, unknown-identity | 1 | 23,391 | unknown / unknown |
| Bound and the Broken 4 | Of Empires and Dust, decorated audio catalog title | partial: budget | 1 | 22,532 | 3,880 / 690 |
| Devils 2 | None | partial: invalid-evidence, budget, unknown-identity | 3 | 22,621 | 5,213 / 11 |
| Book of the Dead 5 | Ascension, decorated listing title | complete | 1 | 23,254 | 5,409 / 733 |
| Path to Ascendancy 2 | None | partial: budget, invalid-evidence, unknown-identity | 3 | 30,486 | unknown / unknown |
| Mistborn 2 | None | partial: budget, invalid-evidence, unknown-identity | 3 | 21,527 | unknown / unknown |
| Murderbot Diaries 2 | None | partial: budget, invalid-evidence, unknown-identity | 3 | 22,509 | unknown / unknown |
| Scholomance 2 | None | partial: budget, invalid-evidence, unknown-identity | 3 | 23,768 | unknown / unknown |
| The Masquerade 2 | The Monster Baru Cormorant | partial: budget | 3 | 22,677 | 5,152 / 951 |
| Ana and Din, withheld-CA fixture control | None | partial: budget, invalid-evidence, unknown-identity | 1 | 19,240 | unknown / unknown |
| Path to Ascendancy, GB-preferred control | None | partial: budget, invalid-evidence, unknown-identity | 3 | 21,771 | unknown / unknown |
| **Total** | **3 identities; 0 book; 0 audio** | **13 partial; 1 complete** | **29** | **19,240 to 30,486 per case** | **4 reporting cases; 10 unknown** |

Field-level coverage: known cases 2/8 identity/order, additional cases 1/4, controls 0/2. No release proposal means no live date, language, format or market assertion was offered for acceptance. Neither control produced a release proposal, so this batch does not establish live independent-format fallback. The withheld-CA name refers to the deterministic fixture only; its live production input did not suppress actual CA evidence.

### Manual audit of every offered identity

| Offered identity | Cited runtime source reviewed by controller | Independent corroboration | Finding |
| --- | --- | --- | --- |
| Of Empires and Dust: The Bound and the Broken, Book 4 (Unabridged), Ryan Cahill, 4 | [Apple CA audio listing](https://books.apple.com/ca/audiobook/of-empires-and-dust-the-bound-and/id1824333097?uo=4), explicit title, author and Book 4 | [Author books page](https://www.ryancahillauthor.com/books), fourth main novel distinct from novellas | Supported identity/order; storefront decorations remain a title usability and exact-matching limitation |
| Ascension, RinoZ, 5, returned with listing decorations | [Fantastic Fiction series page](https://www.fantasticfiction.com/r/rinoz/book-of-the-dead/), explicit fifth entry, title and author | [Aethon July 2026 release listing](https://aethonbooks.com/2026/06/12/july-2026-litrpg-progression-fantasy-releases/), Book 5 Ascension | Supported identity/order; a secondary cited source was checked against a publisher source; no edition date was offered |
| The Monster Baru Cormorant, Seth Dickinson, 2 | [Goodreads series page](https://www.goodreads.com/series/199001-the-masquerade), explicit Book 2, title and author | [Apple US ebook listing](https://books.apple.com/us/book/the-monster-baru-cormorant/id1333501426), Book 2 and publisher sequel description | Supported identity/order; no release fact was offered |

No unsupported offered assertion was found in these three identity audits. This small, low-coverage output does not prove universal accuracy or readiness for release integration. The cited secondary pages establish traceable reviewed identities in this sample; they do not remove the priority for primary sources or establish independent edition facts.

### Metadata observations and their limits

At the original pilot commit `0f80cea`, production rejected the entire extraction when `parseExtraction` or `checkTarget` failed. This was intentional strict behavior, not an accidental partial-result parser. It preserved deterministic catalog evidence and source links. The 2026-09-30 offline repair below changes the internal batch handling without changing these dated live observations. Literal quote matching establishes traceability; it does not establish semantic entailment of each claimed field.

- Path to Ascendancy, Mistborn and Murderbot had valid schema and quote checks but an edition/target relationship failure. The recorded checks do not reconstruct the exact offending text.
- GB-preferred Path to Ascendancy isolated the relationship failure to edition title: author and position checks passed. This supports investigating work versus edition title handling; it does not prove that removing a subtitle would be safe.
- Scholomance had a false literal-quote check and an edition relationship failure. Quote containment must remain required.
- The Ana and Din control returned three distinct identity titles and failed the combined identity author/position relationship check. That combined check does not isolate author from position. Edition author and position checks passed, while edition titles failed. Stronger target-only extraction must exclude neighboring entries and preserve ambiguity rejection.
- Ana and Din's envelope was HTTP 200, normal completion, valid JSON, one identity and two editions, with diagnostic 3,234 input / 516 output tokens. A valid envelope alone did not make its extraction acceptable. Devils had a valid empty extraction; its summary also contains catalog/retrieval reasons, so the summary does not attribute every invalid-evidence reason to AI.

The additional recorded diagnostic input/output pairs are Path to Ascendancy 5,526/892, Mistborn 3,598/316, Murderbot 3,450/385, Scholomance 3,412/537, Ana and Din control 3,234/798 and GB Path to Ascendancy 5,514/868. These counts are response metadata, not a reconstructed batch bill. The earliest three cases lack this wrapper evidence. No raw responses were saved, so do not invent specific parser diagnoses for Witness, Hierarchy or Last Horizon, or recreate purported real quotations for tests.

## Original backend verification and live gate decision

Fresh controller verification at backend commit `0f80cea` passed 347/347 tests across 18 files, `npm.cmd run typecheck`, and `npm.cmd run build` (47 modules). These checks used offline fixtures and made no live requests. The documentation subagent subsequently encountered a Codex usage limit. On resumption, the report, recommendation and amended repair plan received independent review; no live-result correction was needed. Offline repair execution is authorized, while new live calls remain separately gated.

Offline focused checks passed 44/44 pipeline/pilot tests after pruning and summary fixes. The full suite had passed 304/304 before two final initial self-review regressions; focused checks and typechecking were rerun after those fixes and both review rounds. The CLI dry run through `npm.cmd` reported zero requests. Fake-provider tests cover bounds, source namespaces, oracle exclusion, one extraction, secret-free payloads, cancellation, conflict preservation, market controls and unknown versus failure behavior. Those deterministic checks remain useful but do not supersede the live findings.

The gate did not pass: six known identities remain unresolved (Witness, Hierarchy, Last Horizon, Ana and Din, Devils and Path to Ascendancy), and release coverage is zero. A named scope limitation is evidence for a revised decision, not automatic approval of a title-only product. The completed authorization contains no remaining search or AI attempts. The original input, result, audit and account observations above remain the immutable record of that batch.

## 2026-09-30 offline repair at `5cf3bd0`

The user authorized the free offline repair. Tasks 1 through 5 received individual independent approval. Independent whole-repair source review approved `0f80cea..5cf3bd0` with no Critical, Important or Minor findings. The reviewer confirmed citation closures, bounds, minimum preservation and batch isolation integrate, with no additional provider calls, raw evidence persistence, expected-oracle imports or frontend secret exposure. No additional search or extraction request was made for these repairs. Their passing fictional fixtures test behavior, not improved live coverage or general accuracy.

| Repair | Commit and tested behavior |
| --- | --- |
| Target-only instructions | `a8d2d8b`: request only the requested position, use explicitly supported canonical titles, and omit unsupported editions rather than remove decorations |
| Bounded allocation | `79fdd68` plus reviewed fix `f968e21`: protect retained identity alternatives, whole conflicts and citation dependencies at both 30-source and 20,000-byte bounds; reserve useful order/format evidence without treating prose markers as facts |
| Minimum preservation | `f968e21`: prevent a pruned qualifying exact-day edition from exposing a later false minimum when identity resolves later; suppress the affected work/format with a budget reason when its minimum cannot be recovered |
| Internal batch isolation | `942f49c`: valid identity evidence survives an invalid whole AI edition batch with `invalid-evidence`, partial status and trustworthy reported usage; deterministic catalog evidence stays independently validated |
| Canonical boundaries | `9449a04`: explicit canonical evidence may coexist with decorated display metadata; unsupported decorated titles, title prefixes and punctuation-distinct authors cannot establish an exact relationship |
| Independent format/market matrix | `5cf3bd0`: synthetic policy/pipeline cases cover language, date precision, conflicts and selected-market versus actual-market or country-unspecified fallback independently for book and audio |

Invalid transport/envelopes, malformed output and global schema/array-limit failures still reject the entire extraction. Identity records are validated as a batch; different valid target-position titles remain ambiguous. An invalid nonempty identity batch suppresses all AI editions, including a known-title request. A valid empty identity batch can use a known exact input title for edition validation. Any invalid AI edition rejects the entire AI edition batch, so dropping a conflicting record cannot manufacture an earliest date. A valid empty extraction remains complete/unknown unless separate retrieval reasons make the overall check partial.

The source, request, time and token bounds remain unchanged. Validation uses the source text actually supplied in the bounded prompt, with exact normalized title/author relationships and literal quotations. There is no alias joining, subtitle stripping, inferred English from country/work metadata, new provider endpoint, retry, model repair or raw evidence persistence. Validated bounded `Citation.quote` values remain transient API review fields only; reports, library records and backups retain no quotes, raw pages, prompts, model bodies or credentials.

Fresh controller verification after the last source change at `5cf3bd0` passed `npm.cmd test -- --run` with **403/403 tests across 18 files, exit 0**, `npm.cmd run typecheck` with **exit 0**, and `npm.cmd run build` with **exit 0 and 47 modules transformed**. Exact outputs are in the ignored workflow logs `remediation-final-tests.log`, `remediation-final-typecheck.log` and `remediation-final-build.log`. These are offline results. The prior 347-test checkpoint above remains historical.

## Frozen proposed follow-up, awaiting new consent

This is a new allowance proposal, not a retry under the exhausted original authorization. Run each named input once with both formats requested and an empty title, using existing input cases only. Expected assertions must remain outside provider queries and extraction input.

| Existing input case ID | Series | Author | Position | Preferred market | Input title | Formats |
| --- | --- | --- | ---: | --- | --- | --- |
| `hierarchy` | Hierarchy | James Islington | 2 | CA | empty | book, audio |
| `ana-and-din` | Ana and Din | Robert Jackson Bennett | 3 | CA | empty | book, audio |
| `scholomance` | Scholomance | Naomi Novik | 2 | CA | empty | book, audio |
| `path-to-ascendancy-gb` | Path to Ascendancy | Ian C. Esslemont | 2 | GB | empty | book, audio |

The proposed maximum is **12 free Tavily basic search attempts and four DeepSeek extraction calls total**, with no retries. Normal per-check catalog limits, queues and time/byte/token bounds remain unchanged. These four diagnostic cases probe identity rejection, ambiguity, literal quotations and edition-title relationships. They do not replace the original eight-case release acceptance criterion or establish broader coverage. Audit every offered identity and every proposed edition's title relationship, English language, format, exact calendar date and actual country or explicitly unspecified country. Prefer supported selected-market exact days, then supported fallback days independently by format; preserve unknowns and conflicts.

The controller refreshed the [official DeepSeek price table](https://api-docs.deepseek.com/quick_start/pricing) on 2026-09-30. `deepseek-flash` is DeepSeek-V4.1-Flash; peak uncached input is USD 0.30/million tokens and output USD 1.20/million, with off-peak USD 0.15 and USD 0.60. A conservative planning proxy of 20,000 input tokens for the 20,000 UTF-8-byte cap plus 2,048 output tokens gives **USD 0.0084576 per call and USD 0.0338304 for four calls, approximately USD 0.04**, at peak rates. This is an estimate, not a guaranteed bill or verified account deduction. It assumes no cache discount and does not schedule an off-peak run or automation.

Read-only Tavily GET `/usage` at **2026-09-30T20:44:46.161Z** returned HTTP 200: key usage 42, key limit null, plan usage 42/1000, pay-as-you-go usage 0 and pay-as-you-go limit null. This snapshot leaves **958 plan credits** at that time, exceeding the proposed 12. It now agrees numerically with the original runtime's 42 search attempts; the earlier post-batch 12/1000 observation remains preserved, and no explanation for the difference is inferred. The user's prior confirmation that pay-as-you-go is disabled remains applicable; null limit metadata does not prove that setting. See the [official usage endpoint](https://docs.tavily.com/documentation/api-reference/endpoint/usage).

Fresh concrete consent and the new live run remain pending. A present key, remaining credits or the earlier batch approval does not authorize new searches or extraction. Keep migrations and UI wiring gated until the tested release scope passes or the user explicitly chooses a narrower source-review feature. A title-only result cannot automatically pass release discovery.
