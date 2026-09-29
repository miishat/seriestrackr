# SeriesTrackr Personal Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a reliable personal desktop tracker without Gemini, with manual next-book/audio metadata and recoverable local data.

**Architecture:** Keep the existing React/Vite application and replace coupled responsibilities incrementally. Pure library rules feed both views and filters; a single command hook owns storage, undo and mutation boundaries. Discovery is a separately planned second phase.

**Tech Stack:** Existing React 19, TypeScript 5.8 and Vite 6 baseline; npm; locally built Tailwind 3 for compatibility with current utility classes; Vitest, Testing Library and Playwright for focused tests. Resolve compatible tool versions during execution and commit the resulting lockfile; do not perform unrelated major upgrades.

**Spec:** [Personal tracker design](../specs/2026-09-28-personal-tracker-design.md)

**Status:** Approved for subagent-driven execution. The user selected Direction B as the default and required proper book covers when available. The spec has been updated before implementation.

## Global Constraints

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

## Review Focus

1. Malformed JSON, unsupported versions and duplicate IDs must not destroy the existing library. Tests: tasks 2 and 5.
2. Storage denied/full must preserve in-memory edits and expose export, without claiming a successful save. Tests: tasks 2 and 3.
3. An unknown next title, fractional override or stale undo must not fabricate progress or overwrite later edits. Tests: tasks 2 and 3.
4. Invalid calendar dates, date-only boundaries and disabled formats must agree across cards and filters. Tests: tasks 2 and 4.
5. Market or reading-position changes must not leave dates attached to a different book/market. Tests: tasks 3 and 4.

## Execution boundaries

Read the spec and this plan together. Review the mockup before UI changes. Use a feature branch from the initial baseline after review; a separate worktree is optional, not required for this single checkout. Do not publish, deploy or create a remote repository as part of this plan. Commit each passing task with only that task's files.

Run the test specified in each task before implementation, observe a relevant assertion failure, implement, rerun, then commit. A missing test dependency is setup failure, not a red behavior test. Do not write tests that merely assert markup class names.

## File map

| Area | Files | Responsibility |
| --- | --- | --- |
| Runtime cleanup | package.json, package-lock.json, vite.config.ts, index.html, tailwind.config.cjs, postcss.config.cjs, src/styles/app.css | Independent boot and local styles |
| Domain | src/features/library/{model,validation,progress,releases}.ts | Data contracts and pure behavior |
| Storage | src/storage/{libraryStorage,backup}.ts | Safe JSON I/O and backups |
| Commands | src/features/library/useLibrary.ts | Mutation, save state and undo |
| Library UI | src/features/library/{LibraryView,SeriesCard,SeriesTable,SeriesForm,ReleaseFields}.tsx | Approved layout, editing and filters |
| Shared UI | src/components/{Dialog,CoverPicker,Icons}.tsx | Dialogs, explicit cover lookup and icons |
| Settings/backups | src/features/settings/SettingsDialog.tsx, src/features/backups/BackupDialog.tsx | Setup, preferences and recovery |
| Composition | src/main.tsx, src/app/App.tsx | App wiring |
| Verification | vitest.config.ts, playwright.config.ts, tests/ | Behavior checks |

Delete services/geminiService.ts after extracting cover functions. Remove metadata.json and empty bun.lock. Remove old root App.tsx/index.tsx/types.ts/components only after corresponding new files are wired and checked.

### Task 1: Boot independently without Gemini

**Files:** Modify package.json, vite.config.ts, index.html, App.tsx, components/Header.tsx, components/BookSeriesCard.tsx, components/EditSeriesModal.tsx, types.ts, README.md. Create src/services/covers.ts, src/styles/app.css, tailwind.config.cjs, postcss.config.cjs, package-lock.json, vitest.config.ts, tests/setup.ts, tests/no-ai.test.tsx. Delete services/geminiService.ts, metadata.json and bun.lock.

**Interfaces:** Extract and retain `fetchCoverImageUrls(seriesName: string, author: string, lastReadBookTitle: string, nextBookTitle?: string): Promise<string[]>`. UI consumes this from the new cover service. No next-book fetch API remains in phase one.

- [ ] Install existing dependencies, then remove @google/genai. Install compatible test tooling and React type packages. Pin Tailwind to major 3 to preserve existing class semantics. Add scripts `typecheck: tsc --noEmit`, `test: vitest run`, `test:watch: vitest`, `test:e2e: playwright test`; build remains Vite. Use npm exclusively and commit resolved versions.
- [ ] Configure Vitest with jsdom, React plugin and tests/setup.ts importing `@testing-library/jest-dom/vitest`. Add the following behavior test before removing startup dependence:

```tsx
import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

test('boots with no AI credentials or discovery requests', async () => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const request = vi.fn(() => Promise.reject(new Error('offline')));
  vi.stubGlobal('fetch', request);
  const { default: App } = await import('../App');
  render(<App />);
  expect(await screen.findByRole('heading', { name: /bookshelf is empty/i })).toBeVisible();
  expect(request).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
```

- [ ] Run `npm test -- tests/no-ai.test.tsx`; expect failure from startup/API dependence or demo initialization. Ensure the eventual empty-state text matches the behavior selector.
- [ ] Extract only cover-provider code. Remove AI imports/calls, refresh-all and per-card refresh controls, discovery loading/error state and mount effects. Keep cover search loading separate. Initialize the existing library to empty if storage is absent. This transitional task must not pretend to discover metadata.
- [ ] Make manual next-book fields available when no result exists. Initialize the existing temporary NextBookInfo shape with empty title, TBA dates, Unknown status and empty summary. Add a status selector. This temporary shape is replaced by task 2; keep this task independently usable.
- [ ] Replace Vite config with a localhost-only configuration and remove loadEnv/define. Preserve the current root alias until task 4 moves source:

```ts
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 3000, strictPort: true },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
});
```

- [ ] Move the exact existing Tailwind theme object from index.html into tailwind.config.cjs, with content globs for root/components/src TSX files and darkMode class. Use PostCSS tailwindcss/autoprefixer plugins. CSS starts with `@tailwind base; @tailwind components; @tailwind utilities;`. Import it from index.tsx. Fix charset to UTF-8; remove CDN scripts/import map and missing favicon/CSS references. Use system fonts so startup does not require Google Fonts. Preserve the existing appearance in this cleanup task.
- [ ] Rename package to seriestrackr and replace README setup with npm install/dev/build instructions and a truthful manual-only capability list. Add `.env` and `.env.*` to .gitignore with an exception for `.env.example` if one is ever introduced.
- [ ] Run the focused test, `npm run typecheck` and `npm run build`. Search production source/config and package-lock.json for Gemini/genai/aistudiocdn/API_KEY; expect no runtime references. Historical documentation may mention removal.
- [ ] Commit: `chore: remove Gemini and AI Studio runtime dependencies`.

### Task 2: Define validated library, progress and persistence contracts

**Files:** Create src/features/library/model.ts, validation.ts, progress.ts, releases.ts; src/storage/libraryStorage.ts; tests/fixtures.ts, tests/domain.test.ts, tests/storage.test.ts.

**Interfaces:** Use these exact domain types throughout later tasks:

```ts
export type ReadingStatus = 'active' | 'paused' | 'dropped' | 'completed';
export type ReleaseState = 'not-checked' | 'not-found' | 'announced' | 'scheduled' | 'released';
export type Format = 'book' | 'audio';
export interface BookRef { position: number; title: string }
export interface Release {
  state: ReleaseState;
  date: string | null;
  source: { title: string; url: string } | null;
  origin: 'manual' | 'discovery';
  lastCheckedAt: string | null;
}
export interface Series {
  id: string;
  name: string;
  author: string;
  readingStatus: ReadingStatus;
  lastFinished: BookRef | null;
  currentBook: BookRef | null;
  next: { positionOverride: number | null; title: string; orderNote: string };
  publicationRunComplete: boolean;
  latestPublishedPosition: number | null;
  formats: Record<Format, boolean>;
  marketOverride: string | null;
  coverUrl: string | null; // Next-unread book cover, cleared when its identity changes
  releases: Record<Format, Release>;
}
export interface LibraryDocument {
  version: 1;
  settings: {
    market: string | null;
    language: 'en';
    theme: 'light' | 'dark';
    view: 'grid' | 'compact' | 'list';
    showCovers: boolean;
  };
  series: Series[];
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
```

Produces `emptyRelease(): Release`, `emptyDocument(): LibraryDocument`, `parseDocument(input: unknown): Result<LibraryDocument>`, `nextPosition(s: Series): number`, `finishNext(s: Series): Result<Series>`, `isCaughtUp(s: Series): boolean`, `displayRelease(r: Release, today: string): ReleaseState`, `localToday(now?: Date): string` and `isCalendarDate(value: string): boolean`.

Storage produces `loadLibrary(storage: Storage): LoadResult` and `saveLibrary(storage: Storage, doc: LibraryDocument): Result<void>`; `LoadResult` is `{kind:'ready';doc:LibraryDocument} | {kind:'recovery';raw:string;error:string} | {kind:'unavailable';error:string}`. Also export `loadBrowserLibrary(): LoadResult` that catches access to window.localStorage itself.

- [ ] Create tests/fixtures.ts with valid `seriesFixture(overrides: Partial<Series> = {}): Series`: id s1, name Example, author Example Author, active, lastFinished book 1 titled First, currentBook null, next title Second/no override/empty note, publicationRunComplete false, latestPublishedPosition null, both formats true, marketOverride null, coverUrl null, both emptyRelease(). This fixture is test-only.
- [ ] Add and run failing domain tests, including these concrete assertions:

```ts
test('finishing advances both-format progress and clears next metadata', () => {
  const before = seriesFixture();
  const result = finishNext(before);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  expect(result.value.lastFinished).toEqual({ position: 2, title: 'Second' });
  expect(nextPosition(result.value)).toBe(3);
  expect(result.value.releases.audio.state).toBe('not-checked');
  expect(before.lastFinished?.position).toBe(1);
});
test('unknown title cannot fabricate a finished book', () => {
  const s = seriesFixture({ next: { title: '', positionOverride: null, orderNote: '' } });
  expect(finishNext(s).ok).toBe(false);
});
test('calendar dates reject rollover and release on the calendar day', () => {
  expect(isCalendarDate('2027-02-29')).toBe(false);
  expect(isCalendarDate('2028-02-29')).toBe(true);
  const r = { ...emptyRelease(), state: 'scheduled' as const, date: '2027-03-01' };
  expect(displayRelease(r, '2027-02-28')).toBe('scheduled');
  expect(displayRelease(r, '2027-03-01')).toBe('released');
});
```

- [ ] Add cases for null progress -> next 1; override 2.5 -> finished 2.5 -> default next 3; unknown latest position -> not caught up; known latest equal to progress -> caught up without changing active status; completed record validation requires publicationRunComplete. Persisted BookRef positions accept positive decimals to preserve override outcomes; default next-position arithmetic still follows the integer main sequence. Run `npm test -- tests/domain.test.ts` and observe assertion failures.
- [ ] Implement domain functions. Date validation checks YYYY-MM-DD plus actual year/month/day ranges; do not accept Date rollover. Compare validated ISO calendar strings lexically. nextPosition uses override ?? floor(lastFinished?.position ?? 0) + 1. finishNext rejects blank title/completed series, returns a new object and creates fresh releases, preserving unrelated current-book data.
- [ ] Write parser cases rejecting wrong version/types, duplicate IDs, invalid URL schemes, blank identity/title for a BookRef, nonfinite/zero/negative positions, invalid countries (not two uppercase letters), no enabled formats, scheduled without date and nonscheduled/nonreleased with date. Parse into a fresh object selecting only defined properties; never spread arbitrary imported objects into application state.
- [ ] Add storage tests with an in-memory Storage implementation and throwing mocks:

```ts
test('empty library survives reload', () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value); },
  } as Storage;
  expect(saveLibrary(storage, emptyDocument()).ok).toBe(true);
  expect(loadLibrary(storage)).toEqual({ kind: 'ready', doc: emptyDocument() });
});
test('invalid stored JSON is exposed without a write', () => {
  const storage = { getItem: () => '{broken', setItem: vi.fn() } as unknown as Storage;
  expect(loadLibrary(storage).kind).toBe('recovery');
  expect(storage.setItem).not.toHaveBeenCalled();
});
```

- [ ] Implement key seriestrackr:v1 only. Missing returns emptyDocument; parse errors return recovery/raw; denied getter returns unavailable. save catches serialization/setItem failures into Result. Never remove the key for an empty array, touch legacy keys or auto-save a recovery default. Test a throwing localStorage getter and quota failure explicitly.
- [ ] Run both suites and typecheck, then commit `feat: define validated library and safe local persistence`.

### Task 3: Centralize library commands, reset boundaries and undo

**Files:** Create src/features/library/useLibrary.ts and tests/library-commands.test.tsx. Consume task 2 contracts.

**Interfaces:** `useLibrary()` returns `{doc, mode, error, canUndo, addSeries, updateSeries, deleteSeries, markFinished, undo, updateSettings, replaceLibrary, resetLibrary}`. mode is ready/recovery/unsaved. Each mutating method returns Result<void>. addSeries accepts Omit<Series,'id'> and assigns crypto.randomUUID(); updateSeries accepts a complete Series and `confirmReset: boolean`; deleteSeries accepts id; markFinished accepts id; updateSettings accepts complete settings plus confirmReset; replaceLibrary accepts validated LibraryDocument; resetLibrary takes no arguments (UI owns confirmation). Expose original recovery raw text as `recoveryRaw: string | null` for download.

- [ ] Write interaction tests using renderHook/act. Save a valid document before render; finish s1; undo restores byte-equivalent series state. Finish then edit/add/delete/import/reset/settings change must disable undo. A failed domain validation must leave undo and data intact. A failed storage write must retain the changed in-memory state and expose unsaved mode. Run `npm test -- tests/library-commands.test.tsx` for the failing behavior.
- [ ] Implement with synchronous initialization, a current-document ref for consecutive commands, React state for rendering and a single commit helper. Recovery blocks mutation until reset/import; unavailable storage starts an in-memory document in unsaved mode. Avoid localStorage side effects inside React state updater callbacks.

```ts
// Core shape inside the hook; implement once and call from each command.
const commit = (next: LibraryDocument): void => {
  current.current = next;
  setDoc(next);
  const saved = writeBrowserDocument(next); // local helper catches localStorage access and calls saveLibrary
  setMode(saved.ok ? 'ready' : 'unsaved');
  setError(saved.ok ? null : saved.error);
};
```

- [ ] Keep one undo snapshot only for a successful markFinished domain operation; a storage failure still permits undo in memory. Undo commits the snapshot and clears itself. Ordinary successful library/settings mutation clears undo. Never use a timer that silently expires an available undo action. Marking finished clears the cover with the previous next-book metadata.
- [ ] Implement metadata reset based on identity and effective-market comparison. For changed name/author, Last finished, next position/title/order note or effective market, reject with a readable confirmation-required error unless confirmReset is true; then clear both releases. Clear coverUrl for changed name/author, Last finished, next position/title/order note, but preserve it for market-only changes. Preserve override fields when deliberately edited, rather than replacing the entire form. Default-market changes reset only inherited-market records. Format toggles retain hidden values.
- [ ] Add assertions that an override-market record retains dates when the default changes, an inheriting record resets, a cover-only edit retains dates, and Last finished change cannot leave old releases. Setting completed requires publicationRunComplete; it clears currentBook. Add two synchronous command calls in one act to ensure the second does not overwrite the first.
- [ ] Run focused tests and typecheck. Commit `feat: add library commands and safe progress undo`.

### Task 4: Implement the approved desktop interface

**Files:** Create src/main.tsx, src/app/App.tsx, src/features/library/LibraryView.tsx, SeriesCard.tsx, SeriesTable.tsx, SeriesForm.tsx, ReleaseFields.tsx, src/features/settings/SettingsDialog.tsx, src/components/Dialog.tsx, CoverPicker.tsx, Icons.tsx, tests/library-ui.test.tsx. Modify src/styles/app.css, index.html, tsconfig.json, vite.config.ts and tests/no-ai.test.tsx. Delete superseded root TSX/types/components after rewiring.

**Interfaces:** `SeriesForm({series, onSubmit, onCancel})` edits Series or creates Omit<Series,'id'> through separate typed callbacks/props; `ReleaseFields({value,onChange})` edits one Release; `LibraryView({doc,onEdit,onDelete,onFinish})` receives the domain document and command callbacks; `Dialog({open,title,onClose,children})` manages native dialog focus. UI errors display the Result error without closing the form. Existing cover service retains task 1 signature.

- [ ] Implement approved Direction B as the default card view. User approval was given after the first mockup: show proper next-book covers when available. Update the mockup and inspect it before product UI changes; preserve cards as default and table/compact as alternate views.
- [ ] Add failing user-event tests for setup country selection, add series with no finished book, whitespace validation, Last finished entry, book/audio status and dates, manual next title, optional override, reading-status changes, cover URL, search/filter and mark-finished/undo. Example:

```tsx
test('adding a series starts with unchecked releases and survives reload', async () => {
  const user = userEvent.setup();
  localStorage.setItem('seriestrackr:v1', JSON.stringify({
    ...emptyDocument(), settings: { ...emptyDocument().settings, market: 'CA' },
  }));
  const first = render(<App />);
  await user.click(screen.getByRole('button', { name: 'Add series' }));
  await user.type(screen.getByLabelText('Series name'), 'Example series');
  await user.type(screen.getByLabelText('Author'), 'Example author');
  await user.click(screen.getByRole('button', { name: 'Save series' }));
  expect(screen.getAllByText('Not checked')).toHaveLength(2);
  first.unmount();
  render(<App />);
  expect(screen.getByText('Example series')).toBeVisible();
});
```

- [ ] Run `npm test -- tests/library-ui.test.tsx` to observe failures. In jsdom provide minimal native dialog method shims; real focus behavior is verified in browser tests, not assumed from shims.
- [ ] Wire useLibrary into App with recovery/unsaved banners. Setup requires CA/US/GB or user-entered two-letter code; settings allow theme/view/showCovers and default market. Forms use a shared editor for add/edit, expose optional current book in secondary details, and keep Last finished prominent. Validate on submit using task 2 rules, with inline labeled errors.
- [ ] Render table and card variants from the same data, with grid/compact/list preference and covers shown by default. In the default card give the next-unread book jacket a recognizable 2:3 region, use object-fit: contain, preserve the source aspect ratio, and keep the rest of the card readable. A missing or failed image renders a neutral placeholder without changing the saved URL. Filter by reading status and enabled-format displayRelease results; multiple statuses are OR within one filter group, groups combine with AND. Search trims/case-folds name and author. Completed entries display completion instead of a fabricated next book.
- [ ] Show localToday-driven status; refresh today on tab focus and at the next local midnight so a page left open does not display yesterday's status. Tear down listeners/timer. Neither callback triggers discovery. Add a test advancing fake time across local midnight and verify cards and filters agree.
- [ ] Dialog uses showModal on open, close on state change, onCancel -> onClose, initial focus on first editable field and focus return to opener. Add labeled delete and metadata-reset confirmations, with cancel preserving state. Use required text/date/select controls and safe source links. Unknown title when finishing opens a title prompt before markFinished.
- [ ] Split cover picker, search by next-unread book title first, call the provider only after a click, and distinguish network failure from no results. Return provider success results even if another provider fails; if all requested providers fail, throw an error to show retry. Tests stub fetch for success/empty/failure and verify core library actions remain enabled. Test a valid cover, missing cover, broken cover URL and book advancement. Cover selection must be explicit and must not overwrite a chosen URL. No artwork is required for a usable series.
- [ ] Move source entry to src/main.tsx, alias @ to src, update tsconfig paths and Tailwind content globs. Update no-ai test import and visible-empty-state selector to the approved UI. Remove the old types/components only when unused. Run UI/domain/command tests, typecheck and build.
- [ ] Commit `feat: build personal series tracking interface`.

### Task 5: Backups, import preview and data recovery

**Files:** Create src/storage/backup.ts, src/features/backups/BackupDialog.tsx, tests/backups.test.tsx; modify src/app/App.tsx.

**Interfaces:** `encodeBackup(doc: LibraryDocument): string` returns pretty JSON; `decodeBackup(text: string): Result<LibraryDocument>` checks UTF-8 byte size <= 5 * 1024 * 1024 then JSON/schema; `downloadJson(text: string, name: string): void` creates/revokes a Blob URL. UI calls replaceLibrary only after successful preview and explicit confirmation. recoveryRaw downloads through the same helper, without parsing away corrupt content.

- [ ] Write failing cases for export/import equality, duplicates, unsupported version, invalid source scheme, input >5 MiB, canceled replacement and malformed input preserving current state. Include one import replacing settings and library together. Run `npm test -- tests/backups.test.tsx`.

```ts
test('backup round trip preserves library and preferences', () => {
  const doc = emptyDocument();
  doc.settings.market = 'GB';
  doc.series = [seriesFixture()];
  expect(decodeBackup(encodeBackup(doc))).toEqual({ ok: true, value: doc });
});
test('unsupported imports are rejected', () => {
  expect(decodeBackup('{"version":99,"series":[]}').ok).toBe(false);
});
```

- [ ] Implement decodeBackup through parseDocument and encodeBackup through JSON.stringify(doc,null,2). Check file.size before reading as well as byte size in decoder. Display preview count and market, explain replacement, and provide Download current backup before Confirm replacement. Imported strings are React text, never HTML.
- [ ] Add export action available in ready/unsaved/recovery modes; recovery also offers Download stored data and confirmed Reset. In recovery, current-library export is disabled because no valid library has loaded; raw download remains available. Reset writes a fresh empty document only after confirmation. Display write errors without losing the imported in-memory document.
- [ ] Run backups and command suites, typecheck and build. Commit `feat: add validated backups and recovery controls`.

### Task 6: Verify the complete desktop workflow and document use

**Files:** Create playwright.config.ts, tests/e2e/library.spec.ts, docs/discovery-evaluation.md; update README.md and docs/project-audit.md with a dated follow-up, preserving historical findings.

**Interfaces:** Browser tests exercise public UI at http://127.0.0.1:3000. No real provider calls or paid services in tests. Run Playwright on Chromium for the supported first version.

- [ ] Configure a local webServer (`npm run dev`, url above, reuseExistingServer false) and testDir tests/e2e; exclude this directory from Vitest. Install the compatible Chromium test runtime if missing.
- [ ] Add this full-flow test and complementary recovery/keyboard cases:

```ts
test('an intentionally empty library stays empty', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Default market').selectOption('CA');
  await page.getByRole('button', { name: 'Start tracking' }).click();
  await page.getByRole('button', { name: 'Add series' }).click();
  await page.getByLabel('Series name', { exact: true }).fill('Example series');
  await page.getByLabel('Author', { exact: true }).fill('Example author');
  await page.getByRole('button', { name: 'Save series' }).click();
  await page.getByRole('button', { name: 'Delete Example series' }).click();
  await page.getByRole('button', { name: 'Confirm deletion' }).click();
  await page.reload();
  await expect(page.getByText('Your bookshelf is empty', { exact: true })).toBeVisible();
});
```

- [ ] Verify a populated record with independent audio/book states, finish/undo, reload, disabled-format filter exclusion, export/import preview/cancel/confirm, and corrupted-storage recovery. Block remote requests and repeat manual tracking. Verify Escape closes the editor without saving, focus returns to opener and keyboard can reach every consequential action.
- [ ] Inspect the approved card layout at 1440 and 1024 px, light/dark, and 200% browser zoom. Check a real proportioned cover image, a missing/broken cover, long titles, both formats, one format, empty search results and unsaved banner. Fix defects without unapproved redesign.
- [ ] Run `npm test`, `npm run typecheck`, `npm run build`, `npm run test:e2e`. Record actual outcomes in README verification notes or a task completion note. A failed command must be fixed or explicitly reported; do not label it passing from source inspection.
- [ ] Document supported single-tab localhost usage, npm setup, data location, backups, no automatic discovery and no existing-data migration. Write docs/discovery-evaluation.md with the eight named acceptance series and a blank-results-free research brief: questions to answer, evidence required, and the fact that no providers are evaluated yet. Do not present unresearched provider coverage as fact.
- [ ] Update audit status with the new implementation state and remaining discovery work. Commit `test: verify personal tracker workflows and document use`.

## Requirement coverage and self-review

| Requirement | Owner |
| --- | --- |
| No AI runtime, bundled assets, localhost, npm | Task 1 |
| Empty start, validation, dates, reading progress and caught up | Task 2 |
| Single completion record, undo, metadata reset, safe saves | Task 3 |
| Approved mockups, desktop views, forms, markets, filters and covers | Task 4 |
| Export/import/recovery and replacement safeguards | Task 5 |
| End-to-end verification, accessibility and discovery handoff | Task 6 |

Self-review: interfaces use one Series/Release/LibraryDocument contract; transitional old model exists only during task 1; all five Review Focus conditions have assigned tests. No provider-dependent discovery implementation is hidden inside phase one. Direction B and next-book covers were explicitly approved before task 4.

## Review and execution choice

The user chose subagent-driven development. Execute tasks sequentially with a fresh implementer and task review, then a broad final review. Respect the no-Astra instruction for every subagent.
