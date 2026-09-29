# SeriesTrackr personal tracker design

Status: written design for review. Requirements were confirmed in conversation; visual direction and implementation plan await review. No product implementation is authorized by the mockup alone.

## Purpose and phases

Track ongoing book series and the availability of the next unread book and its audiobook. The primary progress concept is **Last finished**, not currently reading. Finishing either format advances a shared progress record.

Phase one delivers a useful manual tracker. Phase two adds mandatory discovery; a manual tracker alone does not fulfill the eventual product goal. AI is optional and must not be a prerequisite for core tracking.

### Global constraints

- Personal use, desktop browser, local data only in phase one.
- Start with an empty library; do not seed examples or migrate AI Studio storage.
- No Gemini SDK, AI credentials, AI Studio runtime imports or automatic discovery in phase one.
- English metadata; book and audiobook tracking enabled by default.
- Choose a default release market during setup; allow a per-series override.
- Show mockups and obtain visual approval before any interface refinement or redesign.
- Do not use em dashes in source copy or documentation.
- Do not select Astra for a subagent unless the user specifically requests Astra.
- Keep React, TypeScript and Vite; use npm and one committed package-lock.json.
- Core tracking must work without network access once the local app is loaded.

## Confirmed behavior

### Library and progress

Add, edit, remove, search and filter series. Store series name, author, optional cover URL, reading status (active, paused, dropped or completed), last finished book, optional current book, format preferences and market override.

New series may have no finished books. Last finished uses a positive integer for main sequence position and a nonblank title; absence means position zero. Main sequence order is the default. An optional explicit next-book override supports alternate orders and side stories without implementing a complete series catalog. Override positions may be positive decimals; a human label can describe an interlude. Returning from an override to the main sequence defaults to floor(lastFinished.position) + 1 and remains editable.

The next unread book defaults to lastFinished.position + 1 for integer main positions. Optional current-book information never advances Last finished and never changes which book is next unread. This resolves the earlier current-reading suggestion in favor of the user's emphasis on finished progress.

Changing series identity, last finished or next-book identity clears next-book release metadata on submit, after a visible warning in the form. Cancellation changes nothing. Cosmetic changes, reading status, cover and optional current-book changes do not clear metadata. Changing the effective market resets release metadata for the affected series after warning; do not carry dates into a different market silently.

Mark as finished moves the displayed next book into Last finished, clears current-book information if it refers to that book, removes the override and creates an unchecked next-book record. If the next title is unknown, request it before completing the action. Finishing one format is sufficient. Users can manually mark a book finished even if its availability is unchecked.

Offer one-step undo of the most recent mark-finished action during the current session. Store a full pre-change snapshot. Any subsequent library mutation, import or reset invalidates undo so it cannot overwrite newer edits. Reload clears undo. State this scope in the UI.

Removing a series requires a confirmation naming the series. Completed means the user has finished a series whose publication run is complete; store publication completion separately from the user's reading status. A completed series has no next-unread card until reopened.

### Caught up

Store publicationRunComplete and optional latestPublishedPosition as manual facts in phase one. Derive caught up only when latestPublishedPosition is known and lastFinished.position >= latestPublishedPosition. If it is unknown, show no caught-up claim. Caught up does not change an active series to completed. Completion requires an explicit user action and confirmation that the publication run is complete; clear current-book data when completing.

### Releases

Keep separate book and audiobook records. Each has one of:

| Internal value | Display | Meaning |
| --- | --- | --- |
| not-checked | Not checked | No check or manual assertion recorded |
| not-found | No announcement found | Search/manual research did not find an announcement; not proof none exists |
| announced | Announced, date unknown | Announcement exists, but no exact date |
| scheduled | Scheduled | Exact valid YYYY-MM-DD date is known |
| released | Available | Availability is known; exact date optional |

Unknown dates use null, never TBA stored as a date. Scheduled requires a valid calendar date. Other than released, nonscheduled states store no date. A scheduled date on or before the browser's local calendar date displays Available, with card and filters using the same function. Dates are calendar dates, not midnight UTC timestamps. This is a display inference, not a new source verification; do not alter lastCheckedAt. Phase one does not claim storefront inventory verification.

Each record includes optional source title and HTTP(S) URL, origin (manual or discovery), and nullable lastCheckedAt. Phase-one edits have manual origin; saving a date does not create a fictitious discovery check timestamp. Show manual attribution. Failed future discovery leaves the last accepted information intact and reports a check failure separately.

### Markets and formats

First launch asks for the default country market; no implicit default is saved. Initial choices: Canada, United States, United Kingdom and Other (two-letter country code). English is fixed in phase one. A per-series market override is optional. Format selection controls display/filter inclusion and retains hidden-format metadata. At least one format must remain enabled.

The setup and settings flows explain that release dates refer to the selected market. Changing the default market resets metadata only for series inheriting that default, after listing the affected count and confirming. Per-series overrides remain unaffected.

### Persistence and backups

Use a versioned JSON document at localStorage key seriestrackr:v1. Store library and settings together. Initialize synchronously through a safe loader before any save effects; prefer saving explicit mutations rather than mirroring every render with an effect.

Missing storage yields a valid empty document with setup incomplete. Existing malformed or unsupported-version storage is not overwritten: expose recovery download and explicit reset. If storage is denied or full, keep edits in memory, show an unsaved warning and offer export. Do not claim persistence succeeded. A successful later save clears the warning.

Export downloads the current in-memory state as UTF-8 JSON. Import accepts at most 5 MiB, validates the complete schema, rejects duplicate IDs and unsupported versions, and previews record count before explicit replacement confirmation. No partial import. Allow a backup download before replacement; cancel leaves data unchanged. Import replaces library and settings together and invalidates undo. Explicit reset also invalidates undo. Multiple simultaneous tabs are not synchronized in phase one; document one active tab as the supported workflow.

No legacy migration is needed. Do not touch unrelated or legacy storage keys. Old sample names appear only in mockups and tests, never initial production state.

## Architecture and contracts

```text
src/
  main.tsx
  app/App.tsx                      composition and dialogs
  features/library/model.ts        domain types
  features/library/validation.ts   storage and form validation
  features/library/progress.ts     next position, finish, caught-up rules
  features/library/releases.ts     format status and calendar dates
  features/library/useLibrary.ts   commands, undo, unsaved state
  features/library/LibraryView.tsx  search, filters and view choice
  features/library/SeriesCard.tsx
  features/library/SeriesTable.tsx
  features/library/SeriesForm.tsx
  features/library/ReleaseFields.tsx
  features/settings/SettingsDialog.tsx
  features/backups/BackupDialog.tsx
  storage/libraryStorage.ts        versioned JSON load/save
  storage/backup.ts                validated import/export
  services/covers.ts               optional existing cover providers
  components/Dialog.tsx           shared focus/keyboard behavior
  components/CoverPicker.tsx
  components/Icons.tsx
  styles/app.css
tests/                            unit, interaction and browser tests
```

Use React state and pure domain functions; no global-state framework or backend. Reuse icons and useful existing component content. Split BookSeriesCard's cover dialog out of its fetching/display logic. Remove obsolete root components after their replacements are wired, not as a separate speculative rewrite.

Use native dialog showModal/close with accessible name, initial focus, Escape and return-focus handling. Use text labels for consequential actions. External links accept HTTP(S) only; never render imported HTML. React handles text escaping. Date and position rules belong in domain functions shared by views and filters.

Preserve the existing cover API capability behind an explicit Find cover action; the library must remain usable if it fails. Cover lookup errors are different from an empty result. No silent retries or automatic requests on rendering. Keep a manual HTTP(S) image URL option. Any provider-key requirement discovered during implementation is not permission to introduce a browser secret.

## Visual proposal, awaiting selection

Mockup: docs/mockups/seriestrackr-directions.html. It is a standalone review artifact with fictional release data and no production persistence.

Direction A, recommended: compact table. Series and Last finished on the left, Next unread in the middle, separate book/audio availability to the right. This favors scanning many ongoing series.

Direction B: compact cards. More visual separation per series, less information on screen. Use modest artwork placeholders rather than full-height covers. Preserve a list option if cards are chosen as the default.

Both include search, reading-status filter, light/dark preview, an editor preview, setup preview, empty state and backup preview. The final app retains grid/compact/list and cover visibility preferences from the prototype, adapted to the approved direction. Desktop layouts should remain usable at 1024 px width and 200% zoom, with horizontal scrolling confined to a labeled table region when necessary.

## Phase-two discovery brief

Begin only after phase one is usable. Research sources using these acceptance examples:

- The Witness Trilogy
- The Hierarchy
- The Last Horizon
- Ana and Din Mysteries
- The Bound and the Broken
- The Devils
- Book of the Dead by RinoZ
- Path to Ascendancy

Do not seed these into the app automatically. Confirm authors/series identities from sources during provider evaluation rather than assuming title matches.

Evaluate coverage for next main-series position, title, announcement, market-specific book/audio dates, citations and data access terms. No provider has been selected or validated. Prefer free sources; present paid/API credential needs before adopting them. Automated scraping, a new AI provider and background scheduling are not authorized by this brief.

Future flow: user requests a check, sees proposed field-level changes and sources, accepts selected changes, and retains rejected/manual values. Record checked timestamps even for an honest no-result outcome. Conflicting dates stay unresolved proposals. Network failures do not become no-announcement results. Out-of-date responses must not overwrite changed reading progress. Implementation planning for discovery follows the source evaluation, not guessed API coverage.

## Verification and completion

Meaningful unit tests cover progress transitions and undo guards, date-only status computation, input/schema validation and storage failures. Interaction/browser tests cover setup, add/edit/delete/reload, manual releases, filters, backup replacement, keyboard dialogs and no-AI startup. Typecheck, build and the supported desktop browser checks must pass.

Phase one is complete when these workflows work without AI credentials, a deliberately empty library stays empty after reload, backups restore library/settings, storage failures are visible, and the approved visual direction is implemented. No claim of working automatic discovery is allowed at that point.

## Proposal details to review

The interview established product scope. The following concrete mechanics are design proposals: single-session undo invalidated by later mutations, replacement-only backup import, publication facts for conservative caught-up detection, market-change metadata reset, decimal override positions, and the initial country choices. They are explicit here so review can correct them before implementation.
