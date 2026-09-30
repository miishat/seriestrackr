# Google Books catalog evaluation

Evaluated 2026-09-30 against source HEAD `32b55a07159d4a05191517119a8420cb55168f8a`. The user supplied the Google Books credential and explicitly authorized this bounded catalog evaluation. This research does not change production providers, the failed phase 2 release gate, the original 14-case results or the pending four-case Tavily/DeepSeek proposal.

Google Books adds useful bibliographic candidates, occasional explicit sequence labels and one separately scoped ebook preorder sale date whose edition identity was independently reviewed. Recommend a reviewed plan amendment to add it as an optional secondary catalog before optional paid AI, then evaluate its contribution to the repaired retrieval flow. The metadata probe does not demonstrate complete next-title discovery or accepted release proposals. Keep Apple for separate book/audio storefront evidence, Open Library for work identity support, and optional bounded search/extraction for missing facts.

## Run and reproducibility

[Sanitized metadata](discovery-google-books-probes.json) and [probe](../scripts/discovery-google-books-probe.mjs) record one bounded run. The controller's initial Hierarchy query at `2026-09-30T21:28:34.484Z` is reused without another request. The remaining batch ran `2026-09-30T21:33:40.614Z` to `2026-09-30T21:34:10.144Z`.

- 20 Google Books GET attempts total: one reused controller attempt and 19 additional attempts. All 20 returned HTTP 200. No retries, skipped cases, pagination, detail calls or returned-URL fetches.
- Series arm: 12 unique series/author queries from the original empty-title pilot inputs. The two control aliases were deduplicated, including the GB Path to Ascendancy input. No API country filter was invented, and this is not a 14-case production rerun.
- Assisted arm: eight titles already named in the prior independent research table. Queries use `intitle` and `inauthor`. These title seeds establish no autonomous discovery coverage and contain no expected dates. No expected-oracle file was imported.
- Each additional request used `langRestrict=en`, `showPreorders=true`, 20 results maximum, a 20-second timeout and a 1 MiB streamed response limit. Calls were sequential, separated by at least 1.1 seconds after completion. The largest observed additional response was 89,358 bytes.
- The initial saved Hierarchy query omitted `showPreorders` and retained fewer metadata fields. Those differences limit comparisons with the later arm. It was not repeated to improve comparability.
- The fixed Google endpoint received the key through an in-memory query parameter. Native Node `parseEnv` read the main checkout's ignored local credential file. Credentials were not copied into the blank worktree file, printed or persisted. Reports contain selected metadata and canonical unkeyed volume links only, with no descriptions, snippets, headers, raw errors or request URLs.
- Default invocation and `--dry-run` make zero requests. `--run` exclusively reserves the report file before requesting; an existing or interrupted report prevents accidental replay. The global 401/403/429 stop branch was checked offline with a mocked response, not induced live.

HTTP 200 verifies access for this run. Project quota remaining, recurring allowance and actual billing remain unknown; no account or billing settings were changed. This run made zero Apple, Open Library, Tavily or DeepSeek calls. Any later live batch requires a separately agreed allowance. The exhausted prior search/AI allowance remains exhausted.

## Empty-title series arm

The retained rows total 156 volume occurrences, including 126 with explicit `language=en`. Eleven of 12 queries returned at least one English exact-author candidate. These are candidate counts, not correct-next-title counts. Repeated editions and cross-series books occur in the same response, and the 20-result cap prevents completeness claims.

| Input series | Retained / English / English exact-author volumes | Observed useful metadata or gap |
| --- | --- | --- |
| Hierarchy | 14 / 9 / 9 | The Strength of the Few and other author works appear, but saved metadata does not establish Hierarchy book 2. Five non-English volumes leaked through the language query. |
| Witness | 20 / 20 / 20 | Legacies of Betrayal has an explicit third-Tale-of-Witness subtitle; later editions and other Malazan series also appear. |
| Last Horizon | 0 / 0 / 0 | No candidate from this query; assisted title lookup later finds The Pilot. |
| Ana and Din | 10 / 10 / 10 | A Trade of Blood appears without a numbered series subtitle; several Divine Cities/Founders works also appear. |
| Bound and the Broken | 18 / 14 / 14 | Of Empires and Dust appears, but no ordinal for this target is retained. Novellas and numbered earlier books are mixed in. |
| Devils | 18 / 4 / 3 | The Devils and an untitled author volume appear. The Heretics is found only in the assisted arm. |
| Book of the Dead | 3 / 3 / 3 | Earlier numbered volumes appear; Ascension does not. Author spelling differs by case only and passes the defined normalization. |
| Path to Ascendancy | 9 / 9 / 6 | Deadhouse Landing has two explicit series/book-2 subtitles, with ebook and other volume metadata. |
| Mistborn | 20 / 20 / 20 | The Well of Ascension has a book-two-of-Mistborn subtitle; omnibus, game, short fiction and other series also appear. |
| Murderbot Diaries | 20 / 20 / 20 | Artificial Condition appears alongside omnibus/comic volumes and other series; omnibus order is not independently validated main-series order. |
| Scholomance | 20 / 13 / 13 | The Last Graduate subtitle describes a sequel to A Deadly Education. Establishing that starting work's series position still requires review. Seven non-English volumes are excluded. |
| The Masquerade | 4 / 4 / 4 | The Monster Baru Cormorant and a decorated Masquerade-book-2 title appear. No silent canonical-title join is made. |

Explicit ordinal subtitles for Witness, Path to Ascendancy and Mistborn are concrete identity/order leads, not search-rank inference. They warrant source review in a future adapter design. The probe does not implement the existing citation/identity acceptance contract, distinguish all main novels from companions, or validate a full work graph. Proposal validation is explicitly `not-performed`, rather than a fabricated success or failure count. No descriptions were retained or used to manufacture order proof. The saved Hierarchy metadata remains without order proof; the assisted arm does not retroactively supply it.

## Assisted known-title arm

Exact matching uses NFKC, case folding and collapsed whitespace for title and author. It does not remove punctuation, subtitles or edition decorations. The 14 retained occurrences include nine English volumes; five of eight seeded queries have English exact-title/exact-author matches. Four seeded queries have at least one such volume with a calendar-valid publication day. Three queries have zero returned volumes despite known targets appearing elsewhere in the series arm for two of them.

| Seeded title | English exact-title/author volumes | Observed volume publication metadata | Scope and limitation |
| --- | ---: | --- | --- |
| Legacies of Betrayal | 1 | `2026-10-06`, `isEbook=false` | Separate decorated English ebook row has `2026-10-01` and a real preorder sale datetime, discussed below. It does not pass the canonical exact-title comparison. |
| The Strength of the Few | 2 | Ebook `2025-11-11`; other volume `2026-06-30` | Ebook flag is explicit; false on the later row alone does not prove print format. Neither publication day gains CA scope from sales country. |
| The Pilot | 2 | `2025-07` and `2026-09` | Both have Last Horizon/book-four subtitles but partial dates. A day cannot be filled from prior knowledge. |
| A Trade of Blood | 1 | Ebook `2026-08-04` | This aided query finds an ebook identifier not returned by the series query. No separately supplied sale date. |
| Of Empires and Dust | 0 | None in this query | Series arm found an English exact-title/author row with `2025-06-04`, `isEbook=false`; strict title-query failure does not establish catalog absence. |
| The Heretics | 1 | `2027-05-04`, `isEbook=false` | Explicit Devils/book-two subtitle. This volume date differs from historical CA Apple candidate `2027-05-11`; edition and territorial evidence must be reviewed before calling it a conflict. |
| Ascension | 0 | None | No matching record in either arm. This is a query gap, not evidence that no release exists. |
| Deadhouse Landing | 0 | None in this query | Series arm has exact-title/author rows dated `2017-11-14` and `2019-03-26`; the earlier is marked ebook. |

The union of the two arms contains English exact-title/author candidates for seven of the eight researched titles. That union uses known-title evaluation after retrieval and must not be reported as seven autonomously discovered identities. No API results were turned into accepted product proposals or library facts.

### Separately scoped preorder evidence

[Volume `wc2nEQAAQBAJ`](https://books.google.com/books?id=wc2nEQAAQBAJ) carries title `Legacies of Betrayal: The Third Tale of Witness`, author Steven Erikson, language `en`, ISBN-13 `9781409032786`, publisher Random House, `isEbook=true`, saleability `FOR_PREORDER`, sale country `CA`, and `onSaleDate=2026-10-01T04:00:00.000Z`. Its bibliographic `publishedDate` is separately `2026-10-01`. The preorder datetime is calendar-valid and preserved as a datetime; no browser-timezone conversion is used to invent another date. This is the only retained occurrence with an independently supplied `onSaleDate`.

This is useful incremental country-scoped ebook sale evidence from a structured provider, rather than a publication-date/sales-country join. The controller subsequently reviewed the public [Google volume page](https://books.google.com/books?id=wc2nEQAAQBAJ) and the [Penguin edition page](https://www.penguin.co.uk/books/405106/legacies-of-betrayal-the-third-tale-of-witness-by-erikson-steven/9781409032786). Both identify the same full title, author and ISBN `9781409032786`, dated October 1, 2026; the publisher labels an ebook from Transworld Digital and describes the third Witness novel. Exact full-title and ISBN agreement supply an explicit edition relationship, without stripping the title. The publisher page alone has UK context, so CA sale attribution comes from the API's separate sales record, not that page. These controller web checks were separate manual known-title-assisted research and made no additional Google Books API requests.

This yields one manually audited positive English ebook/CA sale-date example. It remains outside the production validator and does not prove audio availability or the earliest qualifying date across all editions. The canonical exact-title row reports `2026-10-06` with a different ISBN; differing edition dates are not automatically a conflict. The API-only exact-match counts above remain unchanged, and no accepted product release assertion is made.

## Interpretation and comparison

The [official list reference](https://developers.google.com/books/docs/v1/reference/volumes/list) documents the preorder option and language/result bounds; it does not document a list country filter. The [usage guide](https://developers.google.com/books/docs/v1/using) documents application identification with a key or token and author/title query terms. Our explicit per-volume English check rejects the 35 non-English occurrences returned across the two arms despite the query restriction.

The [volume schema](https://developers.google.com/books/docs/v1/reference/volumes) separates publication metadata from country-scoped sale/access metadata and a separately supplied sale datetime. `isEbook=true` identifies ebook metadata; false does not identify hardcover or paperback. `printType=BOOK` separates books from magazines. Access country and text-to-speech fields cannot establish an independently published audiobook. Preserve year/month dates as partial and reject nonconforming day strings; two non-English publication values were datetimes outside the probe's strict publication-day grammar. Never infer a country release day merely by combining `publishedDate` and `saleCountry`.

Historical [Open Library probes](discovery-next-title-probes.json) on 2026-09-29 returned records for four of eight aided next-title queries. Historical [Apple probes](discovery-apple-probes.json) found manually inspected candidates for all eight across ebook/audio, including five ebook and six audio queries out of 16. Those metadata selections did not establish every language or earliest edition. Google's 5/8 exact aided title matches, or 7/8 union candidates, use different query strategies, result caps, metadata and a later time. These are not simultaneous comparative benchmarks and were not rerun. The immutable [production pilot](discovery-pilot-report.md) still has three supported identities and zero release proposals; the Google candidate research does not revise that measurement.

Google contributes explicit language, identifiers, ebook flags, some sequence labels and the rare separately scoped preorder sale date. It misses Ascension and is sensitive to query formulation. This supports optional supplemental retrieval, not replacement of the entire provider stack. A plan amendment should specify the adapter's key handling, quota/call bounds, preorder queries, language checks, canonical-title evidence, ordinal validation, separate bibliographic/sale-date contracts and book/audio separation. Keep it off by default until reviewed and evaluated against the existing strict contract; amend fixtures and measure incremental coverage before any migration/UI work. Do not loosen exact matching or seed production requests from this research to improve coverage.

The original pending allowance of up to 12 Tavily basic search attempts and four DeepSeek calls remains a proposal awaiting consent. Google authorization does not authorize it. AI remains optional, off by default and limited to one supplied-evidence extraction per normal check when later approved. No phase completion, production integration, storage or UI readiness is claimed.

## Verification

`node --check` passed before and after the run. Default and explicit dry-run checks made zero requests. Offline mocked checks covered invalid leap days, date precision, NFKC matching without punctuation removal, credential redaction, exclusion of descriptions/returned URLs, fixed-origin request options, preorder inclusion, 403 body cancellation and the 1 MiB stream limit. Post-run consistency checks verified 19 additional plus one reused attempt, 20 unique arm/case rows, HTTP statuses, per-case summaries, metadata allowlists and no credential/raw-text persistence. No production tests were required for these research-only files; no live replay was used for validation.
