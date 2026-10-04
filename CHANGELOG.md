# Changelog

All notable changes to SeriesTrackr are documented here, newest first.
Entries use development dates because no versioned releases have been tagged.

## Unreleased

### Added

- **Your own Tavily and DeepSeek keys.** Settings now has fields for them. Keys stay in this browser, are left out of backups, and are sent only to the local discovery service on a check that turns that provider on. The service no longer uses Tavily or DeepSeek keys from its env files.
- **Web search is opt in per check**, like DeepSeek, and is off in every batch.
- **Other storefronts are opt in** for a check you start yourself (on by default there, with a box to turn them off). Automatic and batch checks look only at your preferred country.
- A short-lived service cache of successful catalog responses (30 minutes), so retries and series that share a query cost almost nothing.
- `scripts/discovery-timing.ts`, a live timing run over a library snapshot that prints no keys or bodies.
- **Named cover choices** from a local, user-triggered cover service (Hardcover, Google Books, Apple, Open Library). Each choice shows its title, author, provider, book or audiobook format, and next or previous role. Audiobook art is review-only and never selectable as a book cover.
- **Last-read covers.** When a series has no next book title, the cover picker now offers covers for the last book you read.
- **Author spelling suggestions** (for example Benett and Bennett) that only edit the open form and never change the saved author silently.
- **Related works review** for prequels and unnumbered continuations found on supported publisher and author pages. They are shown with citations for review and are never accepted into the library.
- **Catalogue lifecycle states.** A release can now read "Edition found; release unverified", "Announced", "Scheduled" or "Available". Catalogue evidence alone no longer implies an announcement or availability.
- **Discovery review layout** with an outline rail and detail pane that becomes tabs on narrow screens, plus separate coverage explanations for complete, partial, failed and cancelled checks.
- **Undo for an accepted cover**, from the review dialog and the cover picker.
- **Cover unverified** label for a manually entered cover URL, and an **Evidence is old** notice with a "Review again" button for old Hardcover-only announcements. Neither changes saved facts.
- A bounded replay of the recorded failure matrix, and a dry-run pilot script (`scripts/discovery-pipeline-repair-pilot.ts`) that runs one case at a time with AI disabled.

### Changed

- Compact cards have centered, theme-tinted series headers, reading progress beside the cover, consistent release-title sizing, and denser aligned sections.
- Add Series and Check Visible Releases share the top action row. Table check details appear beneath the next unread title and open in a themed popup without expanding the row.
- Check details use shorter source explanations and readable local timestamps. Listed has its own color, Not Checked uses consistent capitalization, and cover undo matches the active theme.
- Settings and automatic-check guidance are shorter and describe the seven-day schedule and retry behavior accurately.

- **Release checks are much faster.** A full automatic pass over 14 series dropped from about 249 s to about 70 s (median per series from about 20 s to about 4 s). Apple ebook and audiobook searches now share one call per country, and Apple, Open Library and Google Books waits overlap when the title is known.
- The library is saved as version 3 and records which title and author an automatic cover belongs to. Version 1 and 2 libraries and backups still import, keeping their covers, releases and sources.
- Hardcover series matching now uses the series relationship (position, author role and aliases) instead of the old "featured" flag, and bounds its results so a provider that ignores its limit cannot hide a conflict.
- Late-found primary-source identities are enriched within the original request budgets, and one shared budget now covers the initial and follow-up searches. The primary-source search now takes priority over the audiobook search when the series identity is unresolved.
- Apple results beyond the first 20 now suppress the affected format's date when completeness cannot be shown, instead of silently dropping a possibly earlier date.
- A model-asserted "published" status needs explicit release wording in its cited text. Pre-order or future wording yields "Announced", anything else "Edition found". Deterministic sources win ties over model-extracted ones.
- Release checks explain why a rejection happened with fixed rules and hashed record references, without keeping titles, queries, headers or keys.
- Announced releases show "Announced" with "Date Unknown" where the date would appear. The theme toggle reads "Dark" or "Light", and library table actions and the discovery footer were reorganized.

### Fixed

- Removed duplicate compact reading history, broken separator characters, and footer overlap. Release links display the saved book title without repeating a source's series subtitle.

- Hardcover position-5 entries that were not flagged as featured (such as Blood and Bone) are no longer skipped.
- Audiobook titles with decorations such as "(Unabridged)" bind to the right work, and the wrong work is no longer accepted.
- A bad cover record can no longer fail a whole release check or discard a verified identity.
- Editing last finished, the position override, the author or the title now cancels a pending cover search and drops a stale automatic cover instead of saving it against the wrong book.
- A failed check is no longer described as "Complete coverage".
- "Export now" in unsaved mode shows an error instead of throwing when the library cannot be encoded.
- Removed stray replacement characters from the batch results text.

## 2026-10-01

### Added

- A global **Check visible releases** button for active series matching the current search and filters. Checks run sequentially with progress, cancellation, AI disabled, and individual review before saving.
- Evidence-based release discovery with an optional local service, source review, selected proposal acceptance, and separate book and audiobook evidence.
- Provider integrations for Hardcover, Google Books, Apple, Open Library, and Tavily, plus optional per-check DeepSeek interpretation.
- The Next volume brand mark, Ink & Signal dark theme, and locally bundled Newsreader and Manrope fonts.

### Changed

- Moved global release checks beside the view controls and removed duplicate next-title text from compact card headers.
- Replaced the plain batch results list with an aligned review panel, result previews, clear statuses, and progress.
- Shortened missing-result text to "No supported result" and the backup download button to "Export".
- Organized library controls, series cards, compact rows, release sections, and source labels.
- Organized backup controls and removed outdated README content.

### Fixed

- Kept individual release-check buttons visible while a batch runs, disabling them until it finishes.
- Displayed "Not Found" for checked formats with no supported result, including matching availability filters, while preserving saved release facts and failed/cancelled attempt states.
- Recognized explicit ordinal series subtitles when matching Witness releases.
- Preserved existing covers when accepting discovery proposals for an unchanged next-book identity.
- Made filters dismiss outside their menu and allowed only one filter menu open at a time.
- Improved compact card alignment, series-title hierarchy, modal scrollbars, and checkbox styling.

## 2026-09-30

### Added

- A bounded discovery pipeline and optional single-call DeepSeek evidence extraction.
- A rotating brand tagline.

### Fixed

- Retained useful search evidence when pruning catalog records.

## 2026-09-29

### Added

- Validated library records, local persistence, library commands, shared reading progress, and finish undo.
- A personal tracking interface with search, filters, multiple views, and separate book and audiobook release records.
- Validated JSON backups, import preview, recovery controls, and storage-failure handling.
- Discovery evidence policy, bounded provider transport, free catalog normalization, and free search retrieval.
- Unit, browser, offline, recovery, keyboard, and zoom-layout verification.

### Fixed

- Preserved stored libraries during React Strict Mode startup.
- Cleared stale covers after identity changes and excluded completed series from release filters.
- Kept recovery accessible and ignored stale backup reads.
- Validated completed reading progress and clarified lookup states.
- Preserved provider queue spacing and explicit language ambiguity.

## 2026-09-28

### Added

- Preserved the initial SeriesTrackr prototype and project audit.
- Documented the personal tracker design, implementation plan, and approved bookshelf mockups.

### Removed

- Gemini and AI Studio runtime dependencies.
