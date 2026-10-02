# Release pipeline repair specification

Date: October 1, 2026, America/Toronto. Status: proposed for review, implementation not started.

Evidence: [fresh investigation](../../investigations/2026-10-01-release-pipeline/REPORT.md). This amends the current [release discovery design](2026-09-29-release-discovery-design.md), specifically the misuse of Hardcover featured flags, undated lifecycle inference, loss of artwork metadata and inability to review related works. Other evidence and acceptance guards remain in effect.

## Goal

Resolve the verified identity, cover, title-binding and lifecycle defects without turning sparse provider data into false facts. Each failed check must explain whether retrieval, normalization, identity, language, source allocation, image geometry or publication evidence was missing. Unknown numbered sequels must stay unknown, while supported prequels and unnumbered continuations remain visible for review.

## Global constraints

- Personal use on Windows with Node.js 22.13.1 or later and a desktop browser; support one active library tab.
- Keep React 19, TypeScript 5.8 and Vite 6; use npm and one committed package-lock.json.
- No new runtime dependencies, provider SDKs or server framework.
- Core tracking must work without network access once the local app is loaded.
- English only; book means the earliest supported ebook or print edition, and audio is independent.
- Prefer a supported date in the selected market; otherwise allow any supported market, independently for book and audio, and retain the actual source market.
- Discovery and cover retrieval are user-triggered; no requests on render, startup, page load or a scheduler.
- Keep per-release-check ceilings: Hardcover 1, Google Books 2, Apple combined API/page 12 including at most 6 HTML, Open Library 3, Tavily basic search 3, DeepSeek 1, overall deadline 180 seconds.
- Keep each metadata request bounded to 20 seconds and 1 MiB; keep AI at 45 seconds, 20,000 input bytes and 2,048 output tokens.
- No automatic retries, model repair, paid search, Extract, Crawl or Research calls.
- AI is disabled by default for every check; enabling it requires a visible token-billing notice and an explicit choice for that check.
- Keep secrets in Git-ignored service-only files; never put keys in VITE variables, browser storage, browser requests, logs, reports or backups.
- Bind discovery to 127.0.0.1:3001 and access it through the app's 127.0.0.1:3000 proxy; do not expose a LAN listener or wildcard CORS.
- Keep 30 source, 30 identity and 100 edition evidence caps; truncation must not erase identity ambiguity, conflicting dates or an earlier qualifying date.
- Persist accepted factual fields, citation links and check summaries only in the library; no raw provider bodies, prompts, unaccepted candidates or diagnostic traces in backups.
- Review each proposed field; never overwrite accepted facts merely because a provider fails or finds no match.
- Show mockups and obtain visual approval before changing the interface; backend work can proceed independently after plan approval.
- Do not use em dashes in source copy or documentation.
- Do not select Astra for a subagent unless the user specifically requests Astra.
- Use high reasoning effort only for implementation plans or specifications; use medium or lower for implementation, research, review and tests.

## Requirements

### R1. Traceable failure decisions

Emit bounded, fixed-schema diagnostic events per request. Include provider, stage, sanitized record reference, stable rejection code and HTTP status where applicable. Required codes cover HTTP quota/failure, no matches, author mismatch, series/position mismatch, compilation, placeholder title, ambiguous work, edition format/language, unsupported decorated title, lost citation closure, evidence/request bounds and wrong image geometry. Trace collection is optional and observer failure cannot change results. Keep traces in memory; a dedicated explicitly invoked research command may export sanitized debug artifacts locally. Historical check summaries remain readable.

### R2. Correct work and series evidence

Remove Hardcover `featured` as a primary-membership requirement. Verify exact request-derived series alias, author contribution role, numeric position, noncompilation, nonpartial work and a qualifying English edition. Reject generic placeholder titles such as Untitled, TBA, TBD and To Be Announced. Preserve alternative work identities and reject ambiguous duplicates. Missing physical format with explicit Read can identify print; an explicit conflicting format cannot. Fractional companion positions must never become an integer sequel.

### R3. One strict title-binding policy

Share provider title interpretation between release and cover retrieval. Accept exact normalized titles, previously supported ordinal forms, and the anchored grammar `Canonical: A LitRPG Adventure (Exact Series N) (Unabridged)` when canonical title, exact author, series alias and requested position all agree. The genre subtitle is decoration, not proof of series membership. Titles from unrelated works, another number, translations or ordinary subtitle similarities fail. Prefer exact edition identifiers whenever available.

### R4. Deterministic primary-source and related-work review

Interpret supported primary-source page shapes from already retrieved search sources, before allocation. Initial hosts are `us.macmillan.com`, `aethonbooks.com` and `jzacharypike.com`. Only structured facts within the same product/article block can establish identity, author, series or numbering. Search-result headings and mentions alone cannot establish position. Literal quotes and actual retrieved source IDs remain mandatory.

Expose at most six related-work candidates with title, author, relationship and source quotes. Daughters' War is a prequel candidate; Crypt Currency is an unnumbered continuation candidate. Neither becomes position 2/4 automatically. Related candidates can open a source for manual review; they cannot be accepted as numbered facts through the normal discovery acceptance action. Arbitrary custom order notes remain manual-only.

When primary evidence establishes a previously unknown numbered title, perform remaining title-specific catalog work with the same check budget, deadline, queues and request cache. Do not reset provider counters or discard prior alternatives.

### R5. Publication state means what its source says

Add edition lifecycle evidence: `catalogued`, `announced`, `published`. Catalogue presence alone supplies catalogued status. Announced requires a format-specific announcement or existing supported month/year announcement evidence; published requires explicit same-edition release/publication evidence. Hardcover does not provide an accepted publication date or lifecycle assertion merely by listing an edition.

Select supported exact-day dates as today: persist scheduled, display Available on or after the calendar day. An undated explicit publication can persist released with null date. A catalogued edition can be offered as `catalogued` with display copy `Edition found; release unverified`. A verified undated future announcement remains announced. Do not derive English, market, format or availability from a lifecycle label alone. Ascension's US Apple audio day is 2026-08-19 after exact product binding and English hydration; its unrelated general book publication day cannot supply audio evidence.

### R6. Covers belong to a named work

Return structured candidates containing canonical title, author, work/edition references, provider, source URL, image URL, format, dimensions and target role. Reuse artwork attached to already retrieved release records. Retrieve missing covers through the local service, using the configured Google key, Apple ebook artwork, Hardcover cached/default edition images and Open Library metadata.

For explicit Find cover, use a separate visible request with ceilings Hardcover 1, Google 2, Apple 2 and Open Library 2; no Tavily, AI or automatic retry. Validate at most nine images client-side under an abortable 10-second deadline per image. Do not add image downloads or change release-check budgets. Browser image decoding avoids introducing a general-purpose image proxy.

Bind work before ranking. When next title is unknown, show no claimed next-book cover; last-read images appear only as explicitly labelled optional alternatives. Never silently mix series, next-title and last-read arrays. Book/print/ebook art takes precedence for the book card. A square audiobook image is a separately labelled audio option and cannot occupy the portrait book slot. Accept portrait images only when decoded width/height is between 0.45 and 0.85 inclusive. Never infer geometry from URL dimensions, never crop to conceal a mismatch, and never use a landscape social-sharing composite. Prefer decoded portrait images of at least 200 by 300; smaller valid portraits may be shown as low-resolution options when no larger verified asset is available.

Legacy manually selected URLs remain usable and are labelled unverified until replaced; do not delete a user's chosen image during migration. New selections retain target attribution. Title/author/progress changes invalidate pending cover responses and associated automatic covers. A correction suggestion must never make an unrelated image eligible.

### R7. Author corrections require review

When exact-author cover retrieval fails for a known title, allow one title-only fallback within the same provider's existing cover budget. A returned author mismatch becomes a suggestion, not a verified cover. Show the actual retrieved book title and author so Benett can be corrected to Bennett. Never hardcode author corrections, silently change library data or accept a fuzzy author match. Applying the reviewed author edit uses the existing series edit/invalidation path and requires a fresh check.

### R8. Compatibility and review

Use a version-3 library document for the added catalogued state and optional cover attribution. Read version-1 and version-2 backups without changing their accepted facts, selected cover URLs or check history. Manual release states retain their semantics. Do not silently downgrade older accepted Hardcover announcements; show that their underlying evidence is old and offer a new reviewed check. Keep guarded acceptance, stale-result rejection, undo and recovery behavior.

Produce two static UI mockup directions covering related work review, author suggestions, named cover choices, square audio options and publication-state copy. Obtain visual selection before wiring UI. No automatic updates or repair action runs as part of this planning task.

### R9. Separate check coverage from missing facts

Keep operational receipt states complete, partial, failed and cancelled. Unknown identity or an absent date alone does not imply an operational failure. A provider quota, timeout, invalid response, required missing capability or exhausted bound remains visible even when other sources supplied usable facts. Explain missing bibliographic facts separately from incomplete source coverage. Sun Eater and The Band must retain complete receipts when their clean captured responses provide both formats with no operational reasons. Catalogue-only Ascension must not imply confirmed publication merely because its receipt is complete.

## Acceptance matrix

| Case | Required result after repair |
| --- | --- |
| Blacktongue | Prequel visible for source review; no manufactured position-2 identity. |
| Witness | Exact Legacies ebook artwork available when supplied by fresh release evidence; Google quota remains visible. |
| Last Horizon | No unsupported book-5 image; previous Pilot option explicitly labelled, or a clear no-match/incomplete outcome. |
| Dark Profit cover | Identity-bound target or clearly labelled Dragonfired option; failed providers visible. |
| Crypt Currency | Related continuation visible, position remains unverified unless a primary source explicitly numbers it. |
| Ana and Din | Benett/Bennett correction suggestion from A Trade of Blood; no silent author edit or Foundryside selection. |
| Devils | Heretics portrait eligible, older Devils square excluded from the next-book portrait slot. |
| Book of the Dead cover | Validated Ascension Hardcover portrait available with source attribution. |
| Ascension release | US English audio 2026-08-19 from bound Apple product evidence; catalogue-only book evidence never labelled announced. |
| Malazan | Blood and Bone position-5 identity survives featured=false with full safeguards. |
| Path to Ascendancy | Kellanved's Reach book-3 image is not offered as next book 5; Untitled is not accepted. |
| Sun Eater and The Band | Clean responses show complete checks; partial warnings appear only when an operational reason exists. |

Offline fixture replay is the hard regression gate. Live replay measures current providers and may record legitimate sparse-data/quota outcomes; it cannot become a guarantee of external catalogue completeness. No live gate may pass by seeding expected titles into blank-title production requests.
