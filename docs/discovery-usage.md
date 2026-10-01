# Release discovery usage

Updated 2026-10-01. Phase 2 implementation and verification are complete with the documented coverage limits. Discovery is an optional local service. Fresh checks passed 1133 tests across 33 files, typecheck, build and all 24 browser tests. Actual wired views at 1440 and 390 pixels were readable without horizontal overflow. Independent scoped re-review approved the custom-order repair after 82 focused tests with no new material findings. Local frontend and proxied capabilities checks passed without provider calls. All continuation changes remain uncommitted and unmerged.

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

Free retrieval runs first. Hardcover supplies strictly qualified series identity, order and English edition-format/ISBN facts. It NEVER supplies accepted release dates. Exact series aliases/positions, author roles, featured main membership and compilation guards qualify an identity. `primary_books_count` alone cannot prove membership or exclude companions.

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

Fresh final checks passed `npm test` (1133 tests across 33 files), `npm run typecheck`, `npm run build` (55 modules) and `npm run test:e2e` (24 tests: 14 discovery and 10 existing workflows, 10.7 seconds). Deterministic controls verify preferred-market precedence and withheld-preferred fallback independently by format. Browser checks cover service absence/offline manual tracking, acceptance persistence, recovery, stale checks and keyboard review. Rebuilt frontend assets were scanned against the four actual service credential values with no leak across three assets, and contain no frontend imports of server modules. Independent scoped re-review passed after 82 focused tests. `npm run dev:all` started the frontend at `127.0.0.1:3000` and service at `127.0.0.1:3001`; frontend HTTP 200 and proxied capabilities succeeded without provider calls. These checks do not authorize repeating live provider pilots.
