# Release discovery usage

Updated 2026-10-02. Phase 2 implementation and verification are complete with the documented coverage limits. Discovery is an optional local service. Test counts here are historical to the 2026-10-01 verification (1133 tests across 33 files, typecheck, build and 24 browser tests); the current pipeline-repair verification is in the phase 2 report section 19. Actual wired views at 1440 and 390 pixels were readable without horizontal overflow. Independent scoped re-review approved the custom-order repair after 82 focused tests with no new material findings. Local frontend and proxied capabilities checks passed without provider calls. All continuation changes remain uncommitted and unmerged.

## Current behavior and measured limitations (2026-10-02)

This section records the release and cover pipeline repair. Measured behavior comes from replaying recorded provider responses offline (`tests/discovery/pipeline-repair.test.ts`); no live provider was called to produce it. The replay set holds the user's 11 failing library entries plus two clean-receipt controls, Sun Eater and The Band. Each fixture is described in `tests/discovery/data/pipeline-repair/manifest.json` as captured, captured with a re-keyed request, or synthetic.

**Two different checks.** A saved-title recheck keeps the title already saved in the library, verifies it and looks up its dates. A blank-title autonomous discovery clears the title so the pipeline has to find the next work itself. They answer different questions. Witness (Legacies of Betrayal), The Devils (The Heretics) and Book of the Dead (Ascension) are saved-title rechecks, so they do not show identity coverage. Blacktongue, Last Horizon, Dark Profit, Ana and Din, Malazan and Path to Ascendancy are blank-title discovery. A blank result is a valid outcome of discovery, not a defect.

**Identity and order.**
- A numbered identity needs an integer position backed by the provider. A prequel, continuation or search mention never supplies one. Blacktongue position 2 and Dark Profit position 4 correctly propose no identity.
- Hardcover `featured: false` no longer blocks a primary entry. Malazan position 5 now resolves to Blood and Bone from the exact series, author role, position, compilation and English edition guards. Apple, Google Books, Open Library and Tavily enrichment is not demonstrated by the Malazan replay, whose enrichment rows are synthetic and empty. Ambiguous duplicate works stay unresolved.
- While identity is unresolved, the primary-source search query outranks the audio query inside the three-search ceiling. Publisher and author pages (Macmillan numbered volumes and prequels, Aethon numbered books, author-site announcements) are parsed with exact quotes.
- Related works are review-only. The Daughters' War (prequel) and Crypt Currency (continuation) appear with their relationship and sources, are never given a position and are never saved as the next book without a separate user choice.

**Lifecycle.** Three states are kept apart. Catalogued means a provider lists the edition, with or without a date. Announced means a source says it is coming. Published means a source shows it was released. A catalogued edition with no date is not announced. A date for one format is never copied to another: the Ascension audiobook keeps its Apple date of 2026-08-19 while the ebook stays catalogued and undated, and the publisher's general July date is not borrowed.

**Apple limits.** Apple Search is asked for 20 records but may return more. When more than 20 come back for a format and completeness cannot be proven, the affected fact is suppressed (the check reports a budget reason) instead of guessing from a partial set. Product-page binding accepts only the exact decorated title grammar the code recognizes.

**Covers.** The cover service is user-triggered (Find cover) and local; a release check never calls it. Per request the ceilings are Hardcover 1, Google Books 2, Apple 2 and Open Library 2 starts, a 90 second deadline and at most nine candidates. A candidate must match the exact work and author, and is labelled next or previous with its format. Print art ranks before audio art. Provider-reported dimensions are kept (Hardcover reported 1617 by 2560 in the replay); Apple candidates carry none, so their portrait or square shape is not asserted by the replay. The Apple cover budget (2 starts: ebook and audiobook searches for one country) is separate from the release-check Apple budget (12 starts, of which at most 6 are HTML product pages across markets, catalog searches and lookups). Open Library no-match, Google Books quota and provider failure are reported separately. A suggested author spelling (Ana and Din: Benett to Bennett) is only a suggestion for review, never an automatic change, and unrelated works such as Foundryside are rejected. When nothing matches (Last Horizon, Dark Profit) the result is an honest empty list, not the wrong book.

**Clean versus partial receipts.** Complete describes operational coverage. Unknown identity alone does not make a check partial; quota, timeout, provider error, invalid evidence and budget do. A partial check can still carry valid dates, and a complete check can leave a fact unknown. Sun Eater and The Band replay as complete with no reasons.

**Bounded pilot.** `scripts/discovery-pipeline-repair-pilot.ts` is dry-run by default and prints the case, the exact title mode and the ceilings with zero requests. `--run --case <id> --mode saved-title|blank-title --output <new-name>` runs exactly one case with AI disabled and an exclusive output reservation under `.superpowers/sdd/`. A repeated output name fails before any request. Ceilings are Hardcover 1, Google Books 2, Apple 12, Open Library 3 and Tavily 3 starts. It exports sanitized status, decisions, measured starts, rejected-rule counts, provider quota separate from no-match, supported source count, candidate roles and remaining unknowns, never credentials. It never reruns a case or enables AI when coverage is sparse. The pilot runs only the release path, so the cover service budgets (Hardcover 1, Google Books 2, Apple 2, Open Library 2) are never live-checked by it. Live runs are manual and were not performed for this report.

**Known unverified items.**
- The Hardcover `series.author` provider filter has not been measured against a live response for every author spelling.
- The Apple badge markup (RELEASED, PREORDER, LANGUAGE) is parsed from captured pages; Apple may change it.
- The Pike author-site grammar (heading plus linked next-book sentence) and the Macmillan numbered-volume grammar come from synthetic samples: the saved Macmillan responses were HTTP 403 and the Pike response was HTTP 429, so neither is a captured publisher body.
- The Hardcover `cached_image` shape used for covers is taken from one captured control, and its series wrapper in the replay fixture is synthetic.
- The Google Books fuzzy match that returns Bennett for a Benett query is inferred from the Bennett control, not captured for Benett.
- Devils: while the next title is known, the previous-title Open Library search is not made, so the stored square asset is not queried. The replay shows every recorded candidate is The Heretics and none carries the old asset id; it does not assert portrait shape.
- Google Books for Dark Profit and Last Horizon was captured as HTTP 429 without a key. Keyed controls in the investigation returned zero items, so those two gaps are a provider data gap as well as a quota fact.

## Start the app

```sh
npm install
npm run dev
```

This starts the frontend at `http://127.0.0.1:3000`. Manual tracking remains available without the discovery service, and works offline after the app has loaded. Remote covers need connectivity. To run the optional service and frontend together:

```sh
npm run dev:all
```

The frontend stays on loopback port 3000 and proxies discovery to the loopback service on port 3001. `npm run dev:discovery` starts just that service. Keep the same frontend origin so the existing browser library remains accessible.

## Check and review a series

The intended flow is an explicit check for one series after its last finished position. It looks for the next numbered primary-series entry, with independently supported English book and audio information. This includes a publisher-numbered primary novella such as Murderbot Volume 2, Artificial Condition. Companions and fractional entries must not be promoted to the next integer position. This is not a promise of the next full-length novel in every series.

Automatic proposals are unsupported for nonblank custom-order notes because the current evidence schema cannot verify their meaning. These checks retain source links and unknowns for manual review. Fractional positions still require a cited matching identity. The latest 13-case live batch used blank order notes.

Use the series' preferred release market, or the default market. For book, choose the earliest eligible English ebook or print date in that market, then the earliest eligible fallback if no preferred-market day is supported. Apply this independently to audio. Keep the actual source market, including null when the source does not specify one. A supported date describes the retrieved edition, not stock or exhaustive worldwide availability.

Review identity, book and audio proposals with their individual sources. Accept only selected changes. An undated announcement remains undated; unknown means insufficient supported evidence, not proof that no release exists. Conflicts require review. Changed reading progress invalidates old proposals. Provider errors or unsupported results must leave accepted facts and manual values intact. There are no automatic checks on startup, background checks or automatic AI calls.

The 13-case [free-pages pilot report](discovery-free-pages-pilot-report.md) documents the supported cases and gaps. Witness, The Devils and the CA Path to Ascendancy case were unsupported in that batch. Partial operational status can coexist with valid proposals; complete operational status does not mean every format is known.

## Providers and bounded evidence

Free retrieval runs first. Hardcover supplies strictly qualified series identity, order and English edition-format/ISBN facts. It NEVER supplies accepted release dates. Exact series aliases/positions, author roles and compilation guards qualify an identity; the Hardcover `featured` flag is diagnostic only, because a series need not be the book's featured series. `primary_books_count` alone cannot prove membership or exclude companions.

Google Books supplies qualified identity/English ebook evidence and ebook ISBNs. Apple ISBN lookup is ebook-only; the documented path does not accept ASINs or establish audiobook support. Audio uses separate Apple catalog/product evidence. Open Library and Tavily provide supporting sources. Tavily uses bounded free search without generated answers, crawling or pay-as-you-go; the user's pay-as-you-go setting is disabled.

Apple product pages can supply a day only when the exact edition, title, author, format, explicit English language and date are bound to the same product through JSON-LD or a scoped product badge. Requests use fixed HTTPS `books.apple.com` product URLs, allowed HTML MIME, a 1 MiB body cap and 20-second timeout, without redirects or cookies. Catalog and HTML starts share the global 3100 ms Apple queue and a 12-start per-check ceiling; HTML additionally has a six-start ceiling. Missing or ambiguous evidence stays unknown.

DeepSeek is the sole optional AI provider (`deepseek-flash`). It is off by default, token-billed and requires a visible per-check choice. It interprets bounded supplied public evidence, never supplies dates from memory and never runs automatically. The latest live pilot made zero AI calls. Runtime attempt counts are not invoices or account quota balances. No automatic paid retries or provider switching occur.

## Service-only credentials

The user already supplied the provider keys. Keep them in these Git-ignored local service files:

| File | Service variable |
| --- | --- |
| `.env.discovery.local` | `TAVILY_API_KEY` |
| `.env.deepseek.local` | `DEEPSEEK_API_KEY` |
| `.env.google-books.local` | `GOOGLE_BOOKS_API_KEY` |
| `.env.hardcover.local` | `HARDCOVER_API_TOKEN` |

Never put credentials in `VITE_*`, frontend code, browser storage, backups, logs or chat. The runtime exposes factual fields and source id/title/URL, without raw HTML, raw provider responses, prompts or secrets. Unaccepted proposals are transient and must not enter persisted library records or backups.

## Storage, backups and recovery

The v1-to-v2 migration retains the `seriestrackr:v1` storage key and the existing frontend origin. Loading migrates in memory without rewriting storage. Existing manual records remain usable; accepted discovery facts receive provenance. A later saved edit/export uses the current schema. Migration/recovery and guarded acceptance have independent approval; unit and browser regressions pass.

Imports are capped at 5 MiB and require preview and confirmation before replacement. Unreadable saved data remains available for raw recovery download. If saving fails, retain the unsaved library in memory and offer immediate export rather than discard it. Back up before changing browser profiles or clearing site data. No server library copy is required.

## Verification status

Release and cover pipeline repair (2026-10-02): `npm test` passed 1449 of 1451 tests across 46 files. The two failures are the known baseline `tests/library-ui.test.tsx` compact poster test and a `tests/discovery/launcher.test.ts` timeout under load, which passes alone (7 of 7). `npx tsc --noEmit -p .` is clean. The replay suite (13 tests) and the pilot suite (14 tests) make no network call. The figures after this paragraph are historical.

Fresh final checks passed `npm test` (1133 tests across 33 files), `npm run typecheck`, `npm run build` (55 modules) and `npm run test:e2e` (24 tests: 14 discovery and 10 existing workflows, 10.7 seconds). Deterministic controls verify preferred-market precedence and withheld-preferred fallback independently by format. Browser checks cover service absence/offline manual tracking, acceptance persistence, recovery, stale checks and keyboard review. Rebuilt frontend assets were scanned against the four actual service credential values with no leak across three assets, and contain no frontend imports of server modules. Independent scoped re-review passed after 82 focused tests. `npm run dev:all` started the frontend at `127.0.0.1:3000` and service at `127.0.0.1:3001`; frontend HTTP 200 and proxied capabilities succeeded without provider calls. These checks do not authorize repeating live provider pilots.
