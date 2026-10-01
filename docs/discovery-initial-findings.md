# Phase 2: initial discovery findings

Research date: 2026-09-29. Status: initial source reconnaissance, supplemented by [the recommendation](discovery-recommendation.md). This is not an approved implementation design.

## Intended outcome

On explicit request, discover the next unread main-series book and separate book/audio release information for the selected market. Present cited field-level proposals for acceptance. Preserve manual values, distinguish failures from no results, and invalidate proposals when progress or identity changes. Core manual tracking remains usable without AI or network access after loading.

## Identity and source evidence

These are acceptance examples, never production seed data. Queries used the series name and author or publisher qualifiers. No user reading positions were supplied, so the entries below are evidence examples, not personalized next-book determinations. Market-specific dates and complete API coverage remain unverified for all eight.

| Input | Primary source evidence | Design implication |
| --- | --- | --- |
| The Witness Trilogy | [Penguin UK](https://www.penguin.co.uk/books/405106/legacies-of-betrayal-the-third-tale-of-witness/9781529991000) identifies Steven Erikson and Legacies of Betrayal as the third Tale of Witness. | Allow source aliases without silently renaming the user's series. |
| The Hierarchy | [Simon & Schuster](https://www.simonandschuster.com/books/The-Strength-of-the-Few/James-Islington/Hierarchy/9781982141233) identifies James Islington and The Strength of the Few as book 2. | Keep edition identifiers and format evidence; one edition date cannot establish both formats in every market. |
| The Last Horizon | [Will Wight](https://www.willwight.com/the-last-horizon.html) identifies an ongoing, planned seven-book series. | Planned length is not evidence of publication completion or exact dates. |
| Ana and Din Mysteries | [Penguin Random House](https://www.penguinrandomhouse.com/series/LVI/ana-and-din-mysteries/) identifies Robert Jackson Bennett, A Trade of Blood as book 3, and separate format links. | Follow format evidence before proposing a date. |
| The Bound and the Broken | [Ryan Cahill](https://www.ryancahillauthor.com/books) distinguishes novels from novellas and identifies Of Empires and Dust as main book 4. His [Of Blood and Fire page](https://www.ryancahillauthor.com/of-blood-and-fire) describes a later print rerelease. | Do not count novellas as main positions or treat rereleases as new installments. |
| The Devils | [Joe Abercrombie's books page](https://joeabercrombie.com/books/) establishes identity. His [2025 retrospective](https://joeabercrombie.com/2025-in-review/) describes a sequel in progress. | Historical announcement evidence needs a freshness check; it does not establish the current title or release date. |
| Book of the Dead by RinoZ | [Aethon Books](https://aethonbooks.com/book/awakening-2/) identifies Awakening as book 1, lists subsequent numbered books through Ascension at 5, and links audio separately. | Require author matching for the ambiguous series name; a shared publication field does not prove separate audio dates. |
| Path to Ascendancy | [Ian C. Esslemont](https://ian-esslemont.com/path-to-ascendancy/) establishes the author's series identity. | Reconcile author and publisher listings before asserting current length, order, or next release. |

## Provider constraints checked

| Candidate | Verified documentation | Remaining work |
| --- | --- | --- |
| Open Library | [API guidelines](https://openlibrary.org/developers/api) support low-volume, human-facing lookups, request caching, and prohibit HTML scraping. Documented limits: 1 request/second unidentified, 3 identified. | Query all eight examples through documented endpoints, inspect editions and series order, verify browser access and licensing/attribution. No evidence yet that this supplies complete forthcoming audio dates by market. |
| Google Books | [Usage documentation](https://developers.google.com/books/docs/v1/using) requires an API key or token for public requests. The [Volume schema](https://developers.google.com/books/docs/v1/reference/volumes) includes publication and country-related sales/access fields. | Validate credentials, quotas, terms and actual example responses. A publication date and sales country must not be treated as a verified country-specific audiobook date. Existing keyless cover calls are not proof of a supported discovery contract. |
| Author and publisher pages | Primary pages provide useful identity, sequence and announcement evidence above. | Reading public pages for research does not establish permission or a stable API for app automation. Evaluate documented feeds/APIs and access terms before integration. |

## Architecture options to evaluate

1. Browser-only catalog lookup: simplest deployment, but coverage of future announcements and market-specific audio dates is unproven. Do not present this as meeting the full discovery goal yet.
2. Local discovery service: keep the library local while allowing approved API credentials and multiple evidence sources. This introduces a service to run and requires evaluation of any search or AI provider, cost, and access terms.
3. External research with reviewed import: a possible interim workflow, but not equivalent to in-app automated discovery and not a substitute for the eventual product goal without an explicit scope decision.

The user approved evaluating both browser-only and local-service approaches, with core tracking independent of AI. Credentials and costs must be presented before adoption. No provider has been adopted.

## Live catalog probe

[Recorded results](discovery-catalog-probes.json) contain exact request URLs, timestamps, selected response fields and errors for one known-title lookup per acceptance series. Calls were sequential and spaced by at least 1.1 seconds. These are metadata probes, not app implementation or proof of next-book discovery.

- Six queries returned HTTP 200 and matching title/author records.
- The Tainted Cup returned two work identifiers for the same title/author. Selecting the first record silently would conceal ambiguity.
- Awakening and Dancer's Lament requests returned HTTP 502. Coverage is inconclusive for these two; neither is an empty result or evidence of no announcement.
- The query intentionally requested only identity and basic publication fields. It did not evaluate edition dates or prove their absence from the API.
- No Access-Control-Allow-Origin header was captured, but the shell requests did not send an Origin header. Browser CORS compatibility remains untested.

## Search-backed service candidate

Brave is a candidate for further evaluation, not a selected provider. Its [official search documentation](https://api-dashboard.search.brave.com/app/documentation/web-search) supports country/language targeting and freshness filters. Country targeting improves retrieval; it is not evidence of territorial availability.

The [official pricing page](https://brave.com/search/api/) lists Search at USD 5 per 1,000 requests with USD 5 monthly credits. It lists Answers at USD 4 per 1,000 requests plus USD 5 per million input/output tokens, also with monthly credits. Research mode can perform multiple searches, so a user check is not necessarily one billable query. An API key is required. No account was created and no paid API calls were made.

The same page says storing API results requires a plan explicitly granting storage rights. Confirm what may be persisted as accepted facts and citations before adopting it; do not assume the base price covers this use. Search access does not grant rights to automate retrieval of destination websites.

The [Answers documentation](https://api-dashboard.search.brave.com/documentation/services/answers) supports generated answers with citations. Extraction quality on these eight series has not been tested. Both generated output and catalog matches would require validation before becoming proposals.

Preliminary architectural preference: a local service with replaceable providers is the stronger candidate for full discovery, while catalog-only lookup remains a useful comparison. This is an inference from the source types and access constraints, not verified coverage. Keep secrets outside the browser and backups, submit only the selected series details and market, and leave all library mutations in the existing reviewed command flow. Provider selection awaits coverage and retention checks.

## Concrete format evidence

Penguin Random House's [A Trade of Blood audio page](https://www.penguinrandomhouse.com/books/735560/a-trade-of-blood-by-robert-jackson-bennett/audio/) separately labels audiobook download and hardcover publication as August 4, 2026. This demonstrates that format-specific evidence can be exposed by a publisher page. It does not verify Canadian or UK availability, stock, or an automated access contract.

User clarification: book availability means the earliest qualifying English ebook or print release in the selected market. Audiobook availability remains separate. Prefer free services; use only minimal optional AI through a free API if necessary. These constraints supersede the preliminary paid-provider comparison above.

## Next evidence needed

- Record reproducible provider queries and per-field results for each example, with sample last-finished positions clearly marked as test inputs.
- Verify book/audio format and market evidence independently, including missing results and conflicting dates.
- Check API access, rate limits, attribution, storage terms, credentials and costs before selection.
- Design proposal persistence and request invalidation around the existing Series and Release contracts, including import and undo boundaries.
- Present the source-backed architecture and visual proposal, then complete the written design and implementation plan review before product changes.

No production code changed during this research. Live catalog probe results were recorded; no end-to-end discovery checks have been run.
