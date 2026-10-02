# Task 9a report (non-visual half)

Status: DONE_WITH_CONCERNS

## Built
- Model v3: `CoverAttribution`, `Series.coverAttribution`, `ReleaseState` gains `catalogued`, `LibraryDocument.version: 3`.
- validation.ts: `parseDocument` accepts 1/2/3, emits 3; v1/v2 attribution defaults to null; v3 requires the field; attribution requires coverUrl; catalogued allowed with provenance and must be undated; undated `released` with provenance requires a verified `sourceMarket` (same-edition publication proof); exact-day precision unchanged.
- releases.ts: canonical `releaseLabels` (exact strings), re-exported from SeriesCard; LibraryView filter and DiscoveryDialog label map use them (label only).
- progress.ts finishNext clears coverUrl and coverAttribution together.
- useLibrary.updateSeries: title/author/progress change clears an unchanged automatic cover (coverAttribution set); legacy manual coverUrl is preserved (old behaviour of clearing it was changed, two library-commands tests updated).
- acceptDiscovery: `proposal.state` is now a valid library state (catalogued/announced/scheduled/released), `as 'scheduled'` casts removed in tests/discovery/migration.test.ts and tests/e2e/identity.spec.ts. `Selection.coverId?` (shared/discovery.ts): requires candidate in the response, next-role title equals the saved or selected title (independent of date checkboxes), previous-role matches lastFinished, not audio, http(s), portrait when dimensions known; copies only imageUrl + attribution. Accepted title change clears an automatic cover.
- backup.ts: encodeBackup serializes the parsed shape only (extra candidate/related/diagnostic keys dropped). Storage load of v1/v2 stays in-memory, no write; replaceLibrary failure keeps recoveryRaw (tested).
- services/covers.ts now only re-exports the local-service client; legacy fetchCoverImageUrls and its tests removed.
- New `src/components/useCoverSearch.ts` (generation counter + AbortController; invalidated by title, author, name, progress, market change and unmount; decode aborts too). CoverPicker rewritten minimally on it (named buttons, provider outcomes, incomplete message) and SeriesForm passes market, stores attribution, clears attribution on manual URL edit and drops an automatic cover on title/author edit.
- useDiscovery: accept refuses mismatched requestId/seriesId/session; title/author/name/progress/market change aborts and invalidates an in-flight check (not during batch).

## Evidence
Red (before implementation): `npx vitest run tests/cover-picker.test.tsx tests/discovery/acceptance.test.ts tests/domain.test.ts tests/backups.test.tsx tests/storage.test.ts tests/release-display.test.tsx tests/library-commands.test.tsx` -> 26 failed, 70 passed.
Green: `npm.cmd test` -> 1381 passed, 2 failed (tests/library-ui.test.tsx compact poster, baseline; launcher.test.ts timed out under load, passes alone: 7/7). `npx tsc --noEmit -p .` clean.

## Concerns
- Existing UI tests in library-ui/dialog were updated for new label text ('Announced; date unknown') and service-based cover lookup; SeriesCard no longer shows a repeated "Date Unknown" sub-line for announced/catalogued.
- Progress edits in the form after picking a cover do not clear it until save (useLibrary clears only when attribution unchanged; a freshly picked one is kept).
- Dialog does not yet send coverId.

## 9b must do
- Direction D visual layout, new components, CSS.
- DiscoveryDialog: cover choices from `response.coverCandidates` (decode with `decodeCover`, only `selectableCover` selectable, audio square review-only), send `coverId` in Selection, related works section (Prequel/Unnumbered continuation, no numbered checkbox), author suggestion editing the form draft, partial vs complete coverage copy.
- Status receipt: partial badge logic lives in server-produced `summary.status` plus DiscoverySummary text (not changed); needs assertions that Sun Eater/The Band clean receipts show no partial badge while budget-affected runs do, with incomplete facts as a separate message.
- CoverPicker visual design (it currently has minimal markup), focus restoration, 390px layout, e2e checks, undo-accepted-cover interaction test.

## Fix report (review findings)

- Stale cover: SeriesForm `effective` now uses draft lastFinished and position override (search key changes, pending search aborted, ready result unselectable); progress/override edits drop a picked automatic cover; useLibrary clears an attributed cover on identity change when unchanged or when it no longer names the saved target (title/author, role aware). Manual URLs preserved.
- encodeBackup throws on validation failure; BackupDialog catches via lazy download.
- ReleaseFields: catalogued option and exact labels. Other-market code passed to CoverPicker. applyDiscovery rejects undated released with null sourceMarket (existing acceptance test updated to the new up-front rejection).
- Tests added: tests/series-form-covers.test.tsx, tests/release-fields.test.tsx, plus cases in backups, library-commands, acceptance.
- Commands: `npx tsc --noEmit -p .` clean; `npm.cmd test`: 1395 passed, 2 failed (library-ui compact poster, baseline; launcher timeout under load, passes alone on rerun).
