# Phase 2 release discovery design

Date: 2026-09-29. This is the original design specification. Execution status updated 2026-10-01: Phase 2 implementation and verification are complete with the documented coverage and custom-order limits. The live scope gate passed with named unsupported cases, human visual approval preceded app wiring, and independent final scoped re-review approved the only P2 repair after 82 focused tests. Fresh verification passed 1133 tests across 33 files, typecheck, build and all 24 browser tests. Wired desktop/mobile visual inspection and local startup checks passed. Changes remain uncommitted and unmerged. Ongoing AI use still requires the explicit per-check choice described below.

The current bounded feature claim is the next numbered primary-series entry, including a publisher-numbered primary novella such as Murderbot Volume 2, Artificial Condition. Companions and fractional entries must not be promoted to an integer position. The [independently audited free-pages batch](../../discovery-free-pages-pilot-report.md) returned 10 identities, seven book dates and seven audio dates across 13 cases; all 14 dates were independently corroborated, with zero AI calls. Witness, The Devils and the CA Path to Ascendancy case are named unsupported. Hardcover supplies qualified identity/order/English edition/format/ISBN evidence, never accepted dates. The original failed pilots retain their historical results. See the [original plan's current execution status](../plans/2026-09-29-release-discovery.md) and [usage](../../discovery-usage.md).

Evidence: [recommendation](../../discovery-recommendation.md), [existing-app research](../../discovery-existing-apps.md), [real-source trial](../../discovery-deepseek-real-check.json), and [phase-one design](2026-09-28-personal-tracker-design.md).

## Goal and scope

Add an explicit check of one series' next unread book, review supported next-title/book/audio proposals, and accept selected changes without damaging manual tracking. Discover an unknown next title when source evidence supports its author and intended position. A missing title or date remains unknown; no provider can guarantee an exhaustive worldwide search.

The proposed stack is Apple ebook/audio catalogs, Open Library for identity and edition-language support, Tavily basic free search for missing evidence, and DeepSeek Flash for one bounded interpretation request when explicitly enabled for that check. Gemini is historical research only. No downloading, notifications, background scheduling, user accounts, hosted backend or complete series database is included.

## Global constraints

- Personal use on Windows with Node.js 22.13.1 or later and a desktop browser; support one active library tab.
- Keep React 19, TypeScript 5.8 and Vite 6; use npm and one committed package-lock.json.
- Add only tsx as a development dependency; use native Node HTTP, fetch and environment loading, without provider SDKs or a server framework.
- Core tracking must work without network access once the local app is loaded.
- Preserve the empty initial library, market setup and existing per-series market overrides; never seed research examples or hardcode Canada as the default.
- English only; book means the earliest supported ebook or print edition, and audio is independent.
- Prefer a supported date in the selected market; otherwise allow any supported market, independently for book and audio, and retain the actual source market.
- Discovery is user-triggered for one series at a time, with no requests on render, startup, page load or a scheduler.
- Use at most three Tavily basic searches and one DeepSeek extraction request per check; no automatic retries, model repair, paid search, Extract, Crawl or Research calls.
- AI is disabled by default for every check; enabling it requires a visible token-billing notice and an explicit choice for that check.
- Keep secrets in Git-ignored service-only files; never put keys in VITE variables, browser storage, browser requests, logs, reports or backups.
- Bind discovery to 127.0.0.1:3001 and access it through the app's 127.0.0.1:3000 proxy; do not expose a LAN listener or wildcard CORS.
- Persist accepted factual fields, citation links and check summaries only; do not persist retrieved page bodies, AI prompts, AI responses or unaccepted proposals.
- Review each proposed field; never overwrite accepted facts merely because a provider fails or finds no match.
- Show mockups and obtain visual approval before changing the interface; backend work can proceed independently.
- Do not use em dashes in source copy or documentation.
- Do not select Astra for a subagent unless the user specifically requests Astra.

## Evidence and selection rules

Current custom-order limitation, 2026-10-01: the evidence schema cannot attest arbitrary custom-order note semantics. Nonblank custom-order notes therefore receive source links and unknowns for manual review, without automatic identity/book/audio proposals. Fractional positions still require cited identity. All 13 latest pilot inputs had blank notes, so this restriction does not alter their measured outcomes.

Separate a work identity (title, author, intended position, order citations) from edition evidence (edition identifier, format, language, country, calendar date and citations). User-entered next title can supply target identity for catalog matching; an automatically discovered title requires explicit order evidence. Do not promote a novella into the next main integer position. Fractional overrides and order notes need explicit matching evidence; otherwise show links and unknowns.

Match title and author after Unicode normalization, case folding and whitespace normalization. Do not use substring-only or fuzzy matches to accept a candidate. Aliases and localized spellings remain manual review when exact matching cannot establish identity. Catalog metadata without language is insufficient to assert English. An exact edition identifier can join explicit language evidence from another source; a shared title alone cannot.

Filter to the target identity, English and requested format before comparing dates. Within a format, use exact-day candidates from the preferred market if any are supported. Otherwise compare supported exact-day candidates from all retrieved markets, including a publisher release whose market is explicitly unspecified. Select the minimum date in that pool. Do not claim an exhaustive earliest-ever result; use “Earliest supported date in sources checked.” Retain the provider timestamp but derive its calendar date from the provider representation, never the viewer's timezone.

When only a month/year or a format-specific undated announcement is supported, offer Announced, date unknown with a null release date. A broad sequel announcement may support the title while leaving both format dates unknown. An exact future or past date is stored as scheduled; the existing calendar-based display can show Available. This does not verify stock or update a source check timestamp.

Disagreeing dates for the same edition identifier, market and format are a conflict and cannot be auto-selected. Different edition dates are compared for earliest release, and different markets are separate pools. Without an edition identifier, conflicting same-work/format/market dates remain ambiguous until the user resolves their edition identity; do not hide ambiguity by choosing the smaller date. Old publication timestamps are not proof that an announcement was superseded. No automatic source-age tie breaker.

Only supplied source IDs and literal excerpts can be referenced by AI output. Validate schema, IDs, quote containment, exact-date syntax, target position and bounded values. These checks prove traceability, not logical entailment of arbitrary prose. Label interpreted proposals and require human review of the linked source. Reject unsupported candidates, fabricated URLs, translations, wrong-format dates, merged-country facts and instructions embedded in source content. An invalid response ends extraction; sources remain reviewable without a repair call.

## Retrieval and budgets

The service receives only public series name, author, intended position, optional next title/order label, enabled formats, preferred country, request ID and the per-check AI choice. It receives no reading notes, backup, current book or full library.

For an unknown title, search series + author + target position first. Collect up to five results, with raw text when supplied. A deterministic full bibliographic record or explicit catalog series-number field can resolve identity; otherwise leave identity interpretation until the one final AI call. Broad catalog queries can also retrieve candidates without injecting expected fixture titles. Remaining searches cover missing book and audio evidence. Do not use an AI call to find a title and then call it again for dates.

For a known title, query Apple ebook/audio in the selected market and Open Library. Search missing language/order/print/date evidence. If no supported preferred-market date is available, query a bounded fallback country set, ordered US, GB, CA with duplicates removed; external search can supply other countries. This is a retrieval budget, not a restriction on acceptable fallback evidence. The pilot measures whether it is sufficient. Maximum 12 Apple searches, three Open Library requests and three Tavily searches per check; query plans stop at these limits and report skipped work.

Apple calls are serialized globally at least 3.1 seconds apart. Open Library calls are serialized at least 1.1 seconds apart without assuming an identified rate allowance. Each provider HTTP response is limited to 1 MiB, each HTTP request to 20 seconds, and the whole check to 180 seconds. DeepSeek has a 45-second timeout, at most 20,000 UTF-8 bytes of complete input including instructions, and at most 2,048 output tokens. Disable thinking, use the existing configured deepseek-flash model, and allow no tools. Surface missing keys, 429, 5xx, timeouts, blocked content and budget limits separately. Abort propagates through pending fetches and queues; accepted facts do not change.

Search must stay on a free account with pay-as-you-go disabled. Local request counters cannot prove the account's remaining quota or enforce its billing settings. No live search test runs without its service-only key. AI cost is shown as an estimate using a dated rate table, never a guaranteed dollar cap. A bounded test or presence of a key does not silently enable ongoing paid requests.

Do not implement a persistent cache initially. Keep evidence only for the current check. Coalesce duplicate provider queries within that check. Do not fetch arbitrary returned page URLs, scrape publisher websites, or use another paid retrieval endpoint when Tavily raw text is absent; return snippets, links and unknowns. Verify provider retention terms for accepted bibliographic facts and links before the live pilot.

## Checks, proposals and acceptance

Return separate attempt status (complete, partial, failed or cancelled), provider counters, reasons, requested-format outcomes, source links and proposals. Complete means the planned operations finished, not that all announcements worldwide were searched. Unknown means no supported field in sources checked. An empty catalog response never creates a not-found release automatically. Partial/failed checks preserve all accepted values.

Review displays current/proposed title and each requested format independently, preferred and actual country, fallback reason, edition format/identifier, exact or unknown date, linked evidence and checked time. Nothing is selected by default. Date, state and provenance are one selectable format bundle. Title acceptance never alters progress, completion, current reading, market or latestPublishedPosition. Dependent date bundles cannot be accepted for a newly proposed title while retaining another title. Conflicted bundles remain disabled; linked manual editing resolves them without requiring AI.

If title identity changes, accepting the title clears old-title cover and both old-title releases, then applies selected new-title bundles in the same commit. Warn about this consequence in review. If identity is unchanged, rejected bundles and manual values remain byte-for-byte unchanged. Manual edits clear discovery provenance only on the edited fields. Effective-market changes retain phase-one confirmation/reset behavior and also clear related check history. Format preferences retain hidden accepted data.

Unaccepted proposals are session-local. Closing review changes no accepted fact. Completing a current check may persist its summary and lastCheckedAt in that summary; it does not pretend that a rejected fact was verified. A persisted summary is a library mutation and invalidates finish undo, but does not increment the proposal's content revision.

Use synchronous refs for an epoch and per-series content revision. Every successful series mutation, finish and undo increments the relevant revision, even if data returns to its earlier value. Import and reset increment the epoch even when the replacement is identical. Default-market changes increment affected inherited-series revisions. Other settings changes do not invalidate unrelated proposals. New checks supersede the old request generation. Acceptance revalidates epoch, revision, latest request ID, current target, selected bundles and document schema before one commit. Cancellation is useful but cannot replace these guards.

## Persistence and local service

Upgrade the document payload to version 2 while retaining the storage key seriestrackr:v1. Load valid version-1 documents/backups into version-2 memory with null provenance and null check summary. Do not save on load, so old raw data remains until an explicit mutation. Export version 2; import versions 1 and 2 through one complete parser. Keep the 5 MiB import bound, recovery behavior, duplicate-ID checks and in-memory unsaved/export path. Unknown versions or malformed provenance remain recovery cases, not reset candidates.

Add release provenance, title attribution and a per-series last-check summary. Keep existing release source/origin/lastCheckedAt compatible. Persist sources as titles and HTTP(S) links only; reject unsafe URLs and inconsistent market/format/date provenance. No API key or raw retrieved text belongs in the document schema.

Use Node's native HTTP server with JSON-only endpoints GET /api/discovery/capabilities and POST /api/discovery/check. Reject unexpected Host/Origin, unsupported methods/content types, more than 16 KiB of request input, invalid fields, multiple active checks and arbitrary destination URLs. Do not trust Vite's proxy alone. Fixed upstream endpoints only, no redirects for credential-bearing requests, sanitized error codes rather than raw provider bodies. Disconnecting a client aborts work. Capabilities expose booleans and limits, never key values.

Keep npm run dev as the frontend-only offline-capable command. Add npm run dev:discovery for the service and npm run dev:all for a cross-platform child-process launcher with shared shutdown and no visible helper windows. Vite dev and preview proxy only /api/discovery to loopback. A static build remains usable for manual tracking without the service.

## Pilot and completion criteria

Build and validate the CLI retrieval path before library/schema/UI changes. Test the fixed eight examples without injecting known next titles, two country-policy controls, and four unfamiliar series frozen before running. Preserve their expected answers in evaluation files excluded from provider input. One explicitly authorized run per case, at most one model call per case, no trial-and-repair loop. Report coverage by identity, book and audio rather than one opaque accuracy score.

Release criteria: zero unsupported accepted-ready assertions in offline fixtures and manually audited live proposals; correct traceable identity/position for the eight known cases or a named unsupported case that narrows the feature claim; truthful unknowns; all format and market regressions pass; no automatic paid calls; existing manual workflows remain usable with the service absent. If retrieval cannot meet the agreed scope, stop at the pilot report and revise this plan before migrations/UI. Missing live credentials leaves the live gate pending, not passed.

Create a standalone visual proposal using the existing shelf styles with loading, partial, fallback, conflicting and stale review states. Obtain visual approval before wiring the new UI. Tests use deterministic fake providers, never real credentials or billed calls. Preserve all existing unit/browser checks, add request-race, backup-migration, keyboard and offline-discovery tests, and review the built frontend for secrets/provider endpoints.
