# Changelog

All notable changes to SeriesTrackr are documented here, newest first.
Entries use development dates because no versioned releases have been tagged.

## Unreleased

## 2026-10-01

### Added

- A global **Check visible releases** button for active series matching the current search and filters. Checks run sequentially with progress, cancellation, AI disabled, and individual review before saving.
- Evidence-based release discovery with an optional local service, source review, selected proposal acceptance, and separate book and audiobook evidence.
- Provider integrations for Hardcover, Google Books, Apple, Open Library, and Tavily, plus optional per-check DeepSeek interpretation.
- The Next volume brand mark, Ink & Signal dark theme, and locally bundled Newsreader and Manrope fonts.

### Changed

- Organized library controls, series cards, compact rows, release sections, and source labels.
- Organized backup controls and removed outdated README content.

### Fixed

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
