# Phase 2 discovery recommendation

Updated 2026-09-30. Status: optional Google Books integration and independent review are complete through `52641b7`, including the reviewed plural companion filter fix. Fresh checks passed 832/832 tests, typecheck and build. The separately approved [four-case pilot](discovery-four-case-pilot-report.md) completed once per case with no retries: four proposed identities, three undated ebook announcements, no supported book dates and no audiobook proposals. Usage was 5 Google Books, 24 Apple, 8 Open Library, 11 Tavily and 4 DeepSeek requests, within approved ceilings. The release-date gate remains failed. The original 14-case pilot and separate 20-attempt Google research retain their historical results. DeepSeek remains the sole optional AI candidate; library migrations and UI wiring remain gated.

Gemini-only follow-up checked on 2026-09-29 using the user-configured `gemini-3.8-flash`. The endpoint accepted one request, but no usable answer was produced across four attempts: three returned HTTP 503 and one exhausted the deliberately small connectivity-test output cap. Extraction quality and live discovery remain unverified. This model has free text generation, but Google Search grounding is not available on its free tier according to the current [pricing](https://ai.google.dev/gemini-api/docs/pricing). See the trial details below.

## Recommendation

Keep Google Books alongside Apple and Open Library, with free catalogs first, free search for gaps and at most one optional DeepSeek extraction. The follow-up now demonstrates four corroborated identities but no date coverage. Before storage/UI work, revise the retrieval checkpoint to diagnose allocation and rejected extraction using fictional fixtures and sanitized rejection categories. Preserve the existing date and evidence requirements. Do not add paid retries or switch AI providers on these results alone. Core tracking stays independent of the service and AI.

The user confirmed that date discovery remains in scope. The [retrieval diagnostics plan](superpowers/plans/2026-09-30-discovery-retrieval-diagnostics.md) adds bounded server-only failure categories and a replay-safe diagnostic runner before choosing a repair. It does not infer the rejected field from the earlier report. The user separately approved live testing, including expanded provider comparisons as needed. Offline diagnostics are implemented and reviewed; the replay-safe runner is under final review before the first diagnostic run. A [standalone visual preview](mockups/phase-2-discovery.html) is prepared independently; it demonstrates fictional states, not measured date coverage, and awaits visual review before product UI wiring.

Evaluate this provider stack first:

1. Apple's public ebook/audiobook catalog for selected-market edition evidence, with Open Library for work/edition support. When its separate key is configured, Google Books runs an initial bounded identity/ebook query before Apple and may make one different follow-up query. Explicit order evidence can refine later catalog queries. Google does not supply print/audio or transfer its language metadata into Apple. The historical manually audited CA ebook preorder is research evidence, not a live integration result.
2. Tavily's free Search API for finding author and publisher evidence. Disable generated answers, automatic parameter selection, crawling and research mode.
3. Only when source text needs interpretation, use DeepSeek Flash as the user-selected candidate, with one bounded extraction over supplied evidence. The synthetic and assisted research trials passed their small prepared evidence sets after prompt clarification. The later production retrieval pilot offered three supported identities and no releases, so those earlier passes do not establish production coverage. Do not ask the model to recall release dates from training data; catalog/search review remains usable without AI.

The 14-case production pilot ran once per case, with 84 Apple requests, 29 Open Library requests, 42 Tavily search attempts and 14 DeepSeek attempts. Identity coverage was 2/8 known cases, 1/4 additional cases and 0/2 controls; book/audio coverage was zero. All three offered identities were manually source-audited, with no unsupported offered assertion found. This does not prove universal accuracy, complete free coverage or readiness for release integration. The six unresolved known identities are Witness, Hierarchy, Last Horizon, Ana and Din, Devils and Path to Ascendancy.

Tavily access was validated and the user confirmed pay-as-you-go disabled before the batch. Account plan usage was observed at 0/1000 before and 12/1000 after, with pay-as-you-go usage 0 in both snapshots. Preserve those dated observations. A read-only refresh on 2026-09-30T20:44:46.161Z returned HTTP 200 and plan usage 42/1000, agreeing numerically with the 42 runtime attempts; no explanation for the earlier difference is inferred. Runtime attempts and account counters are different measurements, not a charge calculation. No DeepSeek invoice or balance deduction was verified. Ten original pipeline token reports are unknown. The original maximum-call estimate was approximately USD 0.12, not a measured bill.

The [reviewed remediation plan](superpowers/plans/2026-09-30-discovery-pilot-remediation.md) was implemented offline without changing providers or budgets. Target-only instructions and bounded evidence allocation now preserve cited identity alternatives, whole conflicts and useful order/format evidence. The reviewed allocation fix prevents a pruned qualifying day from producing a later false minimum after identity resolution. Valid identities now survive rejection of the entire AI edition batch, with partial status, `invalid-evidence` and trustworthy reported usage; malformed outer output still fails completely. Invalid or ambiguous identities suppress AI editions, and an invalid edition rejects the whole AI edition batch. Strict title, quote, English edition language, format, exact-day and actual-market validation remain required. Canonical work titles must come from explicit evidence; decorated edition titles cannot be stripped or fuzzily joined. Existing bounded `Citation.quote` excerpts are transient API review fields only, never persisted in reports, library records or backups.

At `5cf3bd0`, fresh controller checks passed 403/403 tests across 18 files, typechecking and a 47-module build, all with exit 0. Tasks 1 through 5 received individual independent approval, and whole-repair source review approved `0f80cea..5cf3bd0` with no Critical, Important or Minor findings. The reviewer confirmed allocation and batch isolation integrate without additional provider calls, raw persistence, expected-oracle imports or frontend secret exposure. These synthetic results test the repairs and do not improve the original measured coverage or prove universal accuracy. The completed live authorization has no remaining search/AI attempts. The later four-case follow-up is reported separately below; migrations and UI wiring remain gated by failed date coverage. A narrower source-review feature would require an explicit user choice.

Update on 2026-09-29: the user requested DeepSeek as the alternative to evaluate and authorized bounded API trials before deciding on adoption. Free catalogs and free search remain the first layers. DeepSeek is token-billed and still needs external retrieval. The supplied key was used for one synthetic request and two real-evidence comparison requests. The synthetic run passed; the real-evidence runs passed 5/10 and then 10/10 cases after explicit fallback and citation instructions. The hidden key file remains Git-ignored. This authorizes the trial, not ongoing paid operation.

## Confirmed product rules

- Book means the earliest supported English ebook or print release among qualifying editions. Prefer the selected market when a supported date is available; otherwise use a supported date from any market. Apply this independently to book and audio. Display and persist the actual source market, including an explicit unspecified-market label for a publisher launch with no country scope. Never relabel a fallback date as the preferred market. An observed minimum is not proof that no earlier edition exists.
- Audio has independent evidence and state. An ebook release does not establish audiobook availability.
- Requests are user-triggered, initially one series at a time. No background scheduler or automatic checks on page load.
- Review changes individually with sources. Rejected proposals and manual values remain intact. Conflicts remain visible.
- AI is optional. With AI disabled, structured catalog results can still become proposals and search results remain available for the user to review.
- Free catalog/search quotas remain operational limits. Exhaustion produces a retry-later state. The user separately authorized bounded, token-billed DeepSeek research; it does not authorize tier switching or unlimited paid operation.

## Approaches compared

| Approach | Strength | Limitation | Decision |
| --- | --- | --- | --- |
| Keyless catalogs only | No account setup and deterministic metadata processing | Tested title searches have gaps; sequence and forthcoming announcements require other evidence | Useful first layer, insufficient as the sole phase-2 promise |
| Free catalogs plus free search, optional one-call extraction | Handles heterogeneous author/publisher evidence while limiting AI use | Requires a local service and one search key, plus an optional AI key; free quotas and coverage need validation | Recommended pilot |
| Free catalogs plus free search, DeepSeek as AI alternative | Can interpret the same bounded source evidence through an OpenAI-compatible API | Token-billed API; still needs external retrieval; assisted research passed but production release coverage was zero | User-selected candidate; current retrieval flow needs repair and re-evaluation |
| Search-grounded AI for every check | Can combine retrieval and interpretation | More AI use; retention constraints and account quotas; paid allowances are not necessarily free accounts | Do not use as the default |

## Provider evidence and costs

| Provider | Verified access/cost information | Intended role or reason to defer |
| --- | --- | --- |
| Open Library | Public low-volume APIs; documented 1 request/second without identification, 3 identified. [Guidelines](https://openlibrary.org/developers/api). [Licensing](https://openlibrary.org/developers/licensing) asserts no new proprietary rights but notes possible pre-existing rights. | Work/edition lookup, with source links and conservative matching. Freshness is not guaranteed. |
| Apple Search API | Documented country, ebook and audiobook filters; approximately 20 calls/minute. [Search documentation](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html). | Selected-store edition evidence. No complete print catalog or authoritative main-series ordering. Documentation is archived; live reliability must be checked. |
| Google Books | The user supplied a key and authorized the [20-attempt catalog evaluation](discovery-google-books-evaluation.md): all HTTP 200, including one reused access query. Five of eight assisted queries had English exact-title/author matches; one separately scoped CA ebook preorder sale datetime was manually edition-audited. [Volume schema](https://developers.google.com/books/docs/v1/reference/volumes) keeps publication and sales facts distinct. Quota remaining and billing are unverified. | Optional backend adapter implemented and independently reviewed per task. Two requests/check maximum, explicit English/ebook proof and qualified sale-day evidence. No Google print/audio. Whole-integration review is complete; follow-up returned three undated ebook announcements and no dates. |
| Tavily Search | [Pricing](https://docs.tavily.com/documentation/api-credits): 1,000 recurring free credits/month, no credit card; basic search costs 1 credit, advanced 2. [Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search) can return results without a generated answer. | Access and the bounded production batch were tested. Keep the free plan with pay-as-you-go disabled; the current combined retrieval flow has insufficient coverage. |
| Gemini Flash-Lite, extraction only | [Pricing](https://ai.google.dev/gemini-api/docs/pricing) lists free input/output for Gemini 3.5 Flash-Lite and Gemini 2.5 Flash-Lite. [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) depend on the project and are not guaranteed. | Historical candidate; superseded by the user's DeepSeek trial choice. |
| Gemini 3.8 Flash, configured trial | [Pricing](https://ai.google.dev/gemini-api/docs/pricing) lists free text input/output, but no free-tier Google Search grounding. The supplied key reached the generation endpoint; the four-request trial produced no usable answer. | Historical trial; no longer the selected AI alternative. It does not meet the free live-search requirement as a standalone provider. |
| Gemini Google Search grounding | Some models list free grounding, but the [terms](https://ai.google.dev/gemini-api/terms#grounding-with-google-search) impose extraction/storage restrictions, including restrictions on building databases from grounded results. | Do not base persistent library enrichment on this without resolving the use-case fit. Ordinary non-grounded extraction is the candidate above. |
| DeepSeek Flash, extraction only | [Pricing](https://api-docs.deepseek.com/quick_start/pricing) identifies `deepseek-flash` as DeepSeek-V4.1-Flash. Per million tokens: uncached input USD 0.15 off-peak / 0.30 peak; output USD 0.60 / 1.20. Charges use granted or topped-up balance; no recurring free tier is listed. | User-selected evidence-parser trial. [Responses API documentation](https://api-docs.deepseek.com/guides/responses_api) says built-in `web_search` tools are ignored, so this does not replace catalogs or search. Synthetic and assisted real-evidence trials have run; see the saved trial records. |
| Brave Search / Answers | [Pricing](https://brave.com/search/api/) lists monthly credits but also paid rates; its FAQ requires a plan granting storage rights to store results. | Defer in favor of the no-card free search candidate. |
| OpenAI web search | [Pricing](https://developers.openai.com/api/docs/pricing) lists USD 10/1,000 search calls plus model/search-content tokens. [Web search guide](https://developers.openai.com/api/docs/guides/tools-web-search) supports citations and domain filters. | Paid fallback only if the user later changes the budget constraint. Not part of the proposed stack. |
| Groq Compound | The former search documentation redirects to [deprecations](https://console.groq.com/docs/deprecations), which states Compound shut down September 21, 2026. | Exclude this obsolete integration. |

Free-tier data use matters: Gemini's pricing indicates free-tier content may improve its products. Tavily's [terms](https://www.tavily.com/terms) allow processing inputs for service improvement and leave third-party rights applicable. Submit public bibliographic facts, target position and country only, without personal notes, backups, account identifiers or the entire library. Persist accepted factual fields and citations rather than archived page text; confirm the selected provider contract fits this exact retention before integration. Apple's [overview](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/index.html) has additional conditions for promotional assets, so the proposed discovery layer does not copy artwork or previews.

## Evidence from the eight acceptance examples

The positions below are synthetic evaluation inputs, not the user's progress and not claims about the latest book overall. Publication evidence is a dated research snapshot, not live stock verification. Missing cells mean unverified, not no announcement.

| Series / author | Sample last finished -> target | Evidence collected | Gap |
| --- | --- | --- | --- |
| Witness / Steven Erikson | 2 -> 3, Legacies of Betrayal | Penguin UK labels the [ebook](https://www.penguin.co.uk/books/405106/legacies-of-betrayal-the-third-tale-of-witness-by-erikson-steven/9781409032786) and [audio](https://www.penguin.co.uk/books/405106/legacies-of-betrayal-the-third-tale-of-witness/9781529991000) for 2026-10-01. | UK dates may serve as explicitly labelled fallbacks when CA dates are missing. Alias handling needed. |
| Hierarchy / James Islington | 1 -> 2, The Strength of the Few | [Canadian publisher ebook](https://www.simonandschuster.ca/books/The-Strength-of-the-Few/James-Islington/Hierarchy/9781982141257) gives 2025-11-11 and sequence position. | Separate CA audio evidence and earliest-print comparison not established. |
| Last Horizon / Will Wight | 3 -> 4, The Pilot | [Author's July 2025 archive](https://www.willwight.com/a-blog-of-dubious-intent/archives/07-2025) identifies the released fourth book. | Exact separate market/format dates not established. |
| Ana and Din / Robert Jackson Bennett | 2 -> 3, A Trade of Blood | [Series page](https://www.penguinrandomhouse.com/series/LVI/ana-and-din-mysteries/) gives position; [US publisher format page](https://www.penguinrandomhouse.com/books/735560/a-trade-of-blood-by-robert-jackson-bennett/audio/) lists hardcover and audio on 2026-08-04. | US dates can be labelled fallbacks if CA evidence is missing; compare ebook before claiming earliest. |
| Bound and the Broken / Ryan Cahill | 3 -> 4, Of Empires and Dust | [Author order](https://www.ryancahillauthor.com/books) distinguishes main book 4 from novellas; [title page](https://www.ryancahillauthor.com/ofempiresanddust) links book/audio. | Exact CA format dates not established; rereleases and novellas must not change next-main position. |
| Devils / Joe Abercrombie | 1 -> 2, The Heretics | [June 2026 author update](https://joeabercrombie.com/progress-report-june-26/) names the sequel and different UK/US days in May; [April update](https://joeabercrombie.com/progress-report-april-26/) establishes 2027. | Format-specific and CA dates not established. Do not combine different markets into a conflict. |
| Book of the Dead / RinoZ | 4 -> 5, Ascension | [Publisher release listing](https://aethonbooks.com/2026/06/12/july-2026-litrpg-progression-fantasy-releases/) identifies book 5 and 2026-07-22. | Listing alone does not identify a CA ebook/audio date pair. |
| Path to Ascendancy / Ian C. Esslemont | 1 -> 2, Deadhouse Landing | Penguin UK gives [ebook](https://www.penguin.co.uk/books/421794/deadhouse-landing-by-esslemont-ian-c/9781473510593) and [audio](https://www.penguin.co.uk/books/421794/deadhouse-landing-by-esslemont-ian-c/9781473542198) on 2017-11-16; [paperback](https://www.penguin.co.uk/books/421794/deadhouse-landing-by-esslemont-ian-c/9780857502841) is 2018-08-23. | Concrete earliest-edition regression case; CA remains separate. |

## Live catalog results

The [first probe](discovery-catalog-probes.json) queried an older known title for each series. Six requests succeeded; two returned HTTP 502. The [next-title probe](discovery-next-title-probes.json) queried the eight known targets above: all requests returned HTTP 200, four queries found records and four returned zero results. Deadhouse Landing returned multiple work records. All eight second-probe responses included Access-Control-Allow-Origin: * when sent the local app's Origin.

These counts measure this exact title/author query strategy. They do not prove that broader searches cannot locate additional records. They also do not test discovering an unknown next title: the query was supplied the expected title. Only basic identity fields were requested, so the probe cannot establish edition-date completeness or absence.

### Apple Canadian catalog follow-up

[Saved responses](discovery-apple-probes.json) contain 16 sequential public API requests, one ebook and one audiobook query per known next title, with country=ca and at least 3.1 seconds between requests. All returned HTTP 200. Manual title/author inspection found candidate matches in 11 of 16 format queries: five ebook and six audio queries, with at least one candidate for all eight series.

| Known target | CA ebook candidate date | CA audio candidate date |
| --- | --- | --- |
| Legacies of Betrayal | 2026-10-01 | No result in this query |
| The Strength of the Few | 2025-11-11; another same-title edition dated 2026-10-07 | 2025-11-11; another same-title edition dated 2026-01-29 |
| The Pilot | Unrelated results only | 2025-07-01 |
| A Trade of Blood | 2026-08-04 | 2026-08-04 |
| Of Empires and Dust | No result in this query | 2025-09-30 |
| The Heretics | 2027-05-11 | Unrelated results only |
| Ascension | No result in this query | 2026-08-19 |
| Deadhouse Landing | 2017-11-14 and 2017-11-16 editions | 2017-11-14 |

These are candidate edition dates, not verified earliest English availability claims. The selected response fields do not establish language, print precedence or complete regional publication history. Source storefront links and identifiers are saved in the JSON for further verification. Preserve the original API timestamp and explicitly derive the provider's intended calendar date; do not shift it by the user's browser timezone.

Several searches returned unrelated titles, study guides or translations. For example, The Pilot ebook query returned unrelated authors, and The Heretics audio query returned other authors. Match title, author, format, language and market before offering a date; do not count all nonempty replies as hits. The service even returned more than the requested five results in some cases, so local result and response-size bounds are needed.

This improves the case for free catalogs but does not solve next-title discovery: every request already supplied the expected title. Author/publisher sequence evidence and search for missing announcements are still needed. Apple's matching audio entries explicitly carried CAN, while ebooks carried Canadian storefront URLs with no country field in the saved selection. Keep that distinction in the evidence contract.

### Google Books follow-up, separately authorized

The [evaluation report](discovery-google-books-evaluation.md) and [sanitized metadata](discovery-google-books-probes.json) record 12 unique empty-title series queries and eight assisted known-title queries. One saved controller query was reused; 19 additional attempts ran once with no retries. All 20 returned HTTP 200. Additional requests explicitly included preorders; the reused Hierarchy request omitted that option and had a narrower metadata selection. No Apple/Open Library, Tavily or DeepSeek calls were made in this batch.

Eleven of 12 series queries returned English exact-author candidates, but editions and unrelated series were mixed together. Some subtitles provide explicit ordinal leads, including Witness, Path to Ascendancy and Mistborn; the probe did not run production identity/order validation. Five of eight known-title queries returned English exact-title/author matches, with seven of eight targets represented across both arms. That union relies on known-title evaluation and is not autonomous identity coverage. Ascension was absent; The Pilot had only partial publication months. Individual language checks excluded 35 non-English volume occurrences despite `langRestrict=en`.

The strongest incremental result is a decorated Legacies of Betrayal English ebook preorder with independently supplied CA `onSaleDate=2026-10-01T04:00:00.000Z`. The controller checked its exact full title and ISBN `9781409032786` against the public Google volume and Penguin edition pages, which explicitly identify the third Witness novel and ebook. This is separate manually assisted positive evidence, not a publication-date/sales-country join, fuzzy title merge or proof of earliest availability across all formats. Its CA attribution comes from the API sale record, not the UK publisher page. Most returned records lacked an independent sale date. `isEbook=false` and `printType=BOOK` cannot alone identify physical format, and bibliographic publication dates remain country-unspecified.

The [Google integration amendment](superpowers/specs/2026-09-30-google-books-integration.md) is now implemented. Missing or blank keys normally disable Google; a configured key enables at most two list requests/check, each capped at 20 records with preorders requested and literal record-level `en` required. Subtitle-only exact-series ordinal grammar can establish identity without AI; conflicting identities remain unresolved. Titles keep punctuation and subtitles. Google ebook evidence requires `isEbook === true`; false and `printType=BOOK` never establish print or audio.

A scheduled Google date requires an explicit permitted saleability, valid sale country, complete valid sale datetime, and an equal exact publication day as a conservative correlation guard. The day is taken from the explicit sale timestamp without timezone shifting. Publication metadata alone never supplies availability. Rejected date fields and unqualified countries are absent from synthetic evidence sent to extraction. Eligible undated ebooks can remain announcements; they are not exact-day coverage. Source IDs, every citation and true edition conflicts survive merges, while repeated collision aliases coalesce without spending the evidence budget twice.

Final verification at `52641b7`: 832/832 tests across20 files, typecheck exit0 and build exit0 with47 modules. All three tasks passed independent review. An independent medium-effort CLI whole-integration review used the supplied diff after agent-capacity and file-read restrictions blocked initial attempts. Its plural companion finding was fixed and independently re-reviewed with no new blocking issue. The reviewer did not independently run tests or inspect unchanged files outside the supplied package. The supplied Google key remained in its ignored server-only file. The separately approved four-case live check is now complete; see the report below. Historical research and the original failed pilot remain unchanged. Storage/UI stay gated by absent date coverage.

## Gemini credential and extraction check

The [sanitized trial record](discovery-gemini-check.json) contains four requests made on 2026-09-29 to the configured `gemini-3.8-flash` generateContent endpoint. The API key stayed in `.env.gemini.local` and was sent only in the authentication header, not in the URL or saved report. No model switch or search tool was used.

| Attempt | Result | Interpretation |
| --- | --- | --- |
| Text connectivity, 32 output-token cap | HTTP 503, 538 ms | Provider reported temporary high demand. |
| One connectivity retry, same cap | HTTP 200, 3,079 ms; MAX_TOKENS; no answer text | Authentication and endpoint access worked for this request. The cap was too small for a thinking model, so this is not a usable generation success. |
| Synthetic evidence extraction, 2,048 output-token cap | HTTP 503, 2,059 ms | No extraction to evaluate. |
| One extraction retry, same cap | HTTP 503, 828 ms | High demand persisted; stopped retries. |

This historical test used a strict-market rule before the user authorized any-market fallback. The extraction fixture supplied a CA English ebook date, a later CA paperback date, and a UK-only audiobook date for a fictional title. Expected output selected the earlier ebook with its supplied source ID and left CA audio fields null. It tested interpretation of supplied evidence, not current publication knowledge or retrieval. Neither extraction attempt returned an answer, so there is no pass/fail evidence about the model's ability to follow these rules. The eight-series grounded discovery evaluation was not run.

Google's [pricing](https://ai.google.dev/gemini-api/docs/pricing) lists free text generation for this model, but not free Google Search grounding. Account billing status and actual charges were not verified; an HTTP 200 response does not establish free-tier enrollment. No billing changes or paid search tools were requested. Other models list free grounding, including Gemini 2.5 Flash-Lite, but they were not tested and the grounding retention constraints above still apply.

**Current decision:** keep free catalogs first and evaluate DeepSeek as the AI alternative. Gemini results in this section remain historical evidence. A Gemini-only model without live retrieval cannot establish current announcements or earliest market-specific availability. Do not rely on model memory for release dates. Handle temporary service errors separately from publication facts, and never let an AI outage interrupt core tracking. The [troubleshooting guide](https://ai.google.dev/gemini-api/docs/troubleshooting) identifies HTTP 503 as temporary service unavailability; this small sample is not a general reliability benchmark.

## DeepSeek API assessment

Documentation was assessed on 2026-09-29. The user supplied a key and authorized a synthetic extraction test, then a real-evidence test; one synthetic and two real-evidence requests were made. The test ran on 2026-09-29 at 20:37 Toronto time (2026-09-30T00:37:40.308Z). Account balance and billing deductions were not inspected. The current documented Flash model is `deepseek-flash` (DeepSeek-V4.1-Flash); use current documentation rather than older DeepSeek-V3/R1 prices or retired aliases. The [API introduction](https://api-docs.deepseek.com/) documents OpenAI-compatible access.

### Fit for this discovery workflow

DeepSeek can be evaluated as a single-call parser after catalogs and search have supplied evidence. Its [JSON Output guide](https://api-docs.deepseek.com/guides/json_mode) documents structured JSON output, while noting that empty responses and truncation can occur. Schema validation, supplied-source-ID checks and unsupported-field abstention would still be required. JSON validity alone does not verify a publication fact.

It does not supply the missing live retrieval layer. The [Responses API guide](https://api-docs.deepseek.com/guides/responses_api) explicitly marks built-in web search as ignored. [Function calling](https://api-docs.deepseek.com/guides/tool_calls/) asks the application to execute an external tool and return its results; it does not make DeepSeek perform a search itself. For this project, retrieve evidence deterministically first and then make at most one extraction call, rather than adding a model-directed search loop. A DeepSeek-only answer based on model memory cannot establish current release announcements or earliest market-specific availability.

### Cost and free-tier fit

The [official price table](https://api-docs.deepseek.com/quick_start/pricing), refreshed directly by the controller on 2026-09-30, lists the following USD rates per million tokens for `deepseek-flash` (DeepSeek-V4.1-Flash):

| Token class | Off-peak | Peak |
| --- | --- | --- |
| Input, cache miss | 0.15 | 0.30 |
| Input, cache hit | 0.003 | 0.006 |
| Output | 0.60 | 1.20 |

Peak windows: 01:00-04:00 and 06:00-10:00 UTC on weekdays, excluding Chinese public holidays. Recheck rates before adoption; do not assume cache hits.

Estimate: 5,000 uncached input tokens plus 1,000 billed output tokens cost USD 0.00135-0.0027 per call, or USD 1.35-2.70 per thousand calls, excluding search and taxes. Usage is unmeasured. Thinking defaults on; test non-thinking extraction with bounded output.

Granted credit is not a promised recurring free allowance. The user has now authorized a small DeepSeek trial despite its token pricing; that does not authorize unlimited or ongoing paid usage.

### Historical supplied-evidence trial results

[Sanitized report](discovery-deepseek-check.json): one request to `deepseek-flash`, thinking disabled, output capped at 2,048 tokens, no retrieval tools or retries. HTTP 200, normal completion, latency 1,261 ms. Usage: 468 uncached input tokens and 160 output tokens, 628 total.

| Fixture | Result |
| --- | --- |
| Earlier CA English ebook versus later paperback | Passed: selected the ebook date and supplied source ID |
| Wrong market or language | Passed: left unsupported date/source pairs null |
| Month-only book announcement with exact audio date | Passed: kept book date unknown and accepted supported audio date |
| Conflicting equally authoritative dates for the same edition | Passed: abstained from selecting a book date |
| Instruction embedded in source text | Passed: extracted the supported book date and ignored invented audio/source instructions |

All five exact expected outputs passed validation under the original strict-market policy. The later real-source test applies the user's updated any-market fallback rule. These are fictional records, not claims about actual releases. This is one small sample; it does not prove general accuracy, resistance to all source instructions, reliability or live next-title coverage. Raw response text was discarded; the report records per-case validation rather than archiving provider output.

Using the researched off-peak rates and observed token counts, estimated inference cost is USD 0.0001662 (468 × 0.15 / 1,000,000 + 160 × 0.60 / 1,000,000). At peak rates the same usage would cost USD 0.0003324. These are calculated estimates, not verified account deductions; search costs are excluded.

**Status after the synthetic trial:** evidence extraction passed this small fixture set. The user requested a real-source test before deciding on DeepSeek. The following results supersede the earlier suggestion to select it immediately.

### Assisted real-source discovery test

Date: 2026-09-29, Toronto time. [Evidence bundle](discovery-deepseek-real-evidence.json), [live catalog page checks](discovery-deepseek-live-catalog.json), [both sanitized API reports](discovery-deepseek-real-check.json). Requests supplied series, author, synthetic last-finished position and preferred market. Expected answers were kept outside the request. Sources included publisher/author ordering evidence, English storefront dates, same-title French/German editions and later paperback editions.

**Retrieval scope:** the assistant searched primary sources and read pages, then supplied compact factual research summaries plus catalog metadata to DeepSeek. Fourteen known Canadian catalog URLs were revisited live, retaining earlier catalog API timestamps separately; all returned HTTP 200. This was assisted research over known acceptance targets, not autonomous end-to-end discovery from an arbitrary series and not a Tavily API test. The controlled fallback case deliberately withheld Canadian sources. Page retrieval was uneven: for example, the Canadian publisher page was readable through web browsing but returned HTTP 403 to direct Node fetch. A production retrieval strategy still needs validation.

Two non-thinking API calls used the same evidence and independent expectations, with at most 2,048 output tokens each and no automatic retries:

| Run | Complete cases passed | Findings | Latency / tokens |
| --- | --- | --- | --- |
| Initial prompt | 5/10 | All title/position values were correct, but three order citations were insufficient. Missed UK audio, an unspecified-market book launch, and both US fallback dates. No unsupported date was produced. | 2,499 ms / 4,491 tokens |
| Explicit fallback and citation instructions | 10/10 | Correct order citations, independent format fallback, language exclusion, earliest supported editions and honest abstention. | 2,588 ms / 4,718 tokens |

The second prompt stated that each format must first use preferred-market dated evidence, then use other-market evidence when that list is empty. It explicitly recognized multi-format source records and required a source that establishes sequence position or the direct sequel relationship. It contained no expected titles, dates or source IDs. Both attempts remain in the report; do not report this as two first-try successes.

| Series | Next unread in test | Book date / source market | Audio date / source market |
| --- | --- | --- | --- |
| Witness | 3, Legacies of Betrayal | 2026-10-01 / CA | 2026-10-01 / GB fallback |
| Hierarchy | 2, The Strength of the Few | 2025-11-11 / CA | 2025-11-11 / CA |
| Last Horizon | 4, The Pilot | 2025-07-01 / country unspecified fallback | 2025-07-01 / CA |
| Ana and Din | 3, A Trade of Blood | 2026-08-04 / CA | 2026-08-04 / CA |
| Bound and the Broken | 4, Of Empires and Dust | Unknown in this evidence set | 2025-09-30 / CA |
| Devils | 2, The Heretics | 2027-05-11 / CA | Unknown in this evidence set |
| Book of the Dead | 5, Ascension | Unknown in this evidence set | 2026-08-19 / CA |
| Path to Ascendancy | 2, Deadhouse Landing | 2017-11-14 / CA | 2017-11-14 / CA |

The refined model response returned 13 supported format dates across the eight series: six book dates and seven audio dates. Three unknowns matched evidence gaps, not claims that announcements do not exist. The publisher's general Ascension launch listing did not establish a country/edition-format date pair, and the supplied Cahill title page established sequence without a dated ebook/print edition. Dates represent the earliest qualifying records in this bundle, not an exhaustive proof of earliest availability.

Additional market checks passed: with CA evidence withheld, A Trade of Blood used US book/audio dates and retained US attribution. With GB preferred, Deadhouse Landing used 2017-11-16 for both formats despite earlier CA dates; it also ignored the later GB paperback date. French and German Hierarchy records were excluded.

Estimated cost from observed cache-miss/cache-hit and output usage: USD 0.0009387 for the first request plus USD 0.000987684 for the comparison, approximately USD 0.00193 total at the researched off-peak rates. Actual balance deductions were not checked. Single-batch latency is not a per-series production benchmark.

**Historical decision support:** this assisted result supported trying DeepSeek for bounded extraction with deterministic validation. The user subsequently selected that candidate for the production pilot. That pilot's three identities and zero releases are the current coverage evidence. Retain source links and reviewable unknowns when extraction or retrieval fails. No additional automatic repair call belongs in a normal check.

### Effect on the recommendation and implementation plan

Keep Apple/Open Library first and Tavily free search for gaps. DeepSeek is the user-selected candidate for the AI extraction slot. The assisted real-source test supported the subsequent pilot; that production batch did not meet the retrieval coverage gate. The Gemini high-demand errors do not establish that DeepSeek is more reliable or more accurate.

The plan should define one narrow evidence-extraction interface so provider logic stays isolated. The prepared research script uses native Node fetch and needs no SDK or product integration. Its trial covers earliest editions, market/language mismatch, partial dates, conflicting dates and instructions embedded in source text. The refined real-source test passed the fixed eight-series set. Unfamiliar-series retrieval and extraction coverage remain required before claiming general discovery support. Use at most one AI call per check and agree an ongoing budget before production operation.

Trial setup: [instructions](discovery-deepseek-trial.md), [harness](../scripts/discovery-deepseek-check.mjs). The key is loaded only from `.env.deepseek.local`, sent in the authorization header to a fixed HTTPS endpoint, and excluded from the sanitized report. Dry run makes no requests; explicit `--run` permits one capped call with no automatic retries.

## Proposed flow and implementation boundaries

The user checks one series. Deterministic adapters retrieve candidates and normalize available evidence. Search is used for missing identity, sequence or format/market facts. If evidence remains ambiguous, show it for review; optionally invoke one extraction request with only that bounded evidence set. The extractor may select supplied source IDs, never invent URLs or fill unsupported dates.

The review shows current and proposed values, preferred market, actual source market and fallback label, edition/format, source links, checked time and any conflict. Date and state form a validated unit: selecting a scheduled state requires an exact calendar date. Month-only announcements retain an unknown exact date. Changes tied to a proposed next title cannot be accepted while rejecting that title and retaining a different book.

Checks must record attempt status separately from accepted release facts. An empty catalog result means no match in that catalog. A failed or quota-limited search means an incomplete check. Neither overwrites an accepted announcement with no announcement. Honest completed no-result checks can update check history without erasing manual facts.

The existing updateSeries command resets releases when next identity changes. Add a dedicated, atomic accept-discovery command rather than applying a title change and release changes through separate edits. It must validate selected fields, reset old-book metadata where appropriate, and then apply evidence for the newly accepted identity in one operation.

Guard proposals with request generation and a snapshot/revision of relevant series state. Progress, identity, market, selected-field edits, deletion, import/reset and finish/undo must prevent stale proposals from overwriting newer state. Abort is useful for efficiency but is not the correctness guard. Unaccepted proposals stay session-local initially.

Use versioned storage migration for accepted provenance and independent check status; v1 backups must remain importable. Keep provider secrets in the local service environment, outside Vite client variables, browser storage, logs and backups. Bind the service to loopback and validate origins. Reuse the existing dialogs and bookshelf layout after the visual proposal is reviewed.

## Free usage budget and minimal AI policy

Use at most three basic search requests per user check: identity/order if needed, earliest book evidence, and audio evidence. Coalesce duplicate queries within the check and skip supported fields; do not add a persistent cache. At a planned three credits/check, 1,000 monthly search credits cover approximately 333 checks before other usage. This is a planning estimate, not a measured workload or charge count. The completed batch's 42 search attempts, original post-batch account usage of 12 and later dated account usage of 42 are recorded separately in the pilot report.

AI budget: zero calls for complete structured evidence, at most one extraction request for an ambiguous check, and no recursive agent loop or automatic repair calls. If extraction fails schema or evidence validation, return reviewable sources and unknown fields. Model quotas may impose a lower limit than search credits.

## Frozen follow-up, completed under separate consent

The user approved one run per existing input case below. It completed on `52641b7`; see the [report](discovery-four-case-pilot-report.md) and [sanitized results](discovery-four-case-pilot-results.json). Every input title was empty and both book and audio were requested. Inputs came from `pilot-cases.json`; expected assertions never entered queries or extraction input.

| Input case ID | Series | Author | Position | Preferred market | Input title | Formats |
| --- | --- | --- | ---: | --- | --- | --- |
| `hierarchy` | Hierarchy | James Islington | 2 | CA | empty | book, audio |
| `ana-and-din` | Ana and Din | Robert Jackson Bennett | 3 | CA | empty | book, audio |
| `scholomance` | Scholomance | Naomi Novik | 2 | CA | empty | book, audio |
| `path-to-ascendancy-gb` | Path to Ascendancy | Ian C. Esslemont | 2 | GB | empty | book, audio |

The revised proposal includes Google and requires a separate new allowance of at most **eight Google Books requests, 48 Apple requests, 12 Open Library requests, 12 free Tavily basic search attempts and four DeepSeek calls total, with no retries**. Catalogs and free search run before any AI; a check uses at most one optional extraction when gaps remain. The user explicitly approved this revised batch, and it ran after independent integration review and scoped fix re-review. The allowance is now closed; no unused ceiling permits another run. This is not a rerun under the exhausted 14-case authorization or the completed 20-call Google research. Refreshed peak rates give an estimate of USD 0.0084576 per capped AI call and **USD 0.0338304 for four calls, approximately USD 0.04**: 20,000 input tokens as a conservative proxy for the 20,000 UTF-8-byte cap, plus 2,048 output tokens. The estimate is not a guaranteed bill, assumes no cache discount and does not require an off-peak schedule or automation. Google quota remaining and billing have not been verified.

The controller's read-only [Tavily usage refresh](https://docs.tavily.com/documentation/api-reference/endpoint/usage) at 2026-09-30T20:44:46.161Z reported HTTP 200, key usage 42/key limit null, plan usage 42/1000, pay-as-you-go usage 0/pay-as-you-go limit null, leaving 958 plan credits at that time. The user's existing pay-as-you-go-disabled confirmation remains applicable; null metadata alone cannot establish that setting. The [pilot report](discovery-pilot-report.md) records both the immutable earlier observations and refreshed pricing/account details. Keys and available credits do not authorize a run.

These cases diagnose identity rejection, ambiguity, quotations and edition-title mismatch. They do not replace the original eight-case release acceptance criterion. After fresh consent, audit each proposed identity and every edition's title relationship, English language, format, exact day and actual market or explicitly unspecified country. Select supported preferred-market days, then supported fallback days independently by format; retain unknowns and conflicts. Consent and live execution are complete for this four-case batch; the original release-date gate remains failed.

## Pilot acceptance before product implementation

The same eight examples, four additional frozen series and two controls ran through the original production providers at `0f80cea`. The live gate did not pass: identity coverage was 2/8, 1/4 and 0/2 respectively, and no release proposal was offered. Six known identities are explicitly unresolved above. The 2026-09-30 offline repairs and frozen four-case proposal do not change those live results or authorize a title-only feature. Migrations and UI wiring stay gated unless the tested release scope passes or the user explicitly chooses a narrower source-review feature. CA remains an evaluation market; the user's saved default is unchanged.

Required regression cases: novella versus main novel; paperback later than ebook; country mismatch; two works with identical names; stale announcement; year/month-only date; conflicting dates for the same edition/market; provider 429/502; changed progress during a request; rejecting title while accepting dependent dates; import/reset and finish/undo during review; a malicious instruction in source text; and a made-up source ID from the extractor. Require zero unsupported date/market assertions in this fixture set. Broader coverage cannot be inferred from eight examples.

The [original implementation plan](superpowers/plans/2026-09-29-release-discovery.md) includes the user's independent any-market fallback rule. Research on BookWyrm, Book Notification, Readarr and publisher edition ordering reinforces separate work/edition evidence and preserving manual tracking when metadata providers fail. The [pilot report](discovery-pilot-report.md) records tested free search access and limited additional-series coverage, separately from historical assisted research. The [remediation plan](superpowers/plans/2026-09-30-discovery-pilot-remediation.md) revises the retrieval checkpoint before app storage/UI changes. Ongoing billed extraction requires a visible per-check choice; another live evaluation requires new consent; visual changes require the existing mockup review. No credentials should be pasted into chat.
