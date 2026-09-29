# SeriesTrackr project audit

Date: 2026-09-28

Status: source inspection complete. Proposed scope below is for discussion, not an approved implementation specification. No product code changed and no runtime/build checks performed. Dependencies are not installed in this workspace. This directory is not currently a Git repository.

## Intended outcome

Move the AI Studio prototype into an independently maintained personal book-series tracker. Remove Gemini and unnecessary export scaffolding, retain useful tracking behavior, and establish a practical path to a reliable app.

Still to decide: whether the first version needs synchronized data across devices, and whether automatic release discovery is essential to the first usable version.

## What exists

- React, TypeScript and Vite single-page app.
- Add, edit and delete series; record the last-read book; search and status filters.
- Grid, compact and list presentations, themes and optional covers.
- Browser localStorage persistence for the library and preferences.
- Gemini web-grounded next-book discovery, including physical/ebook and audiobook dates.
- Cover lookup using Open Library and Google Books. These calls do not use Gemini, despite being in the same service file.
- No backend, authentication, synchronization, import/export or notification implementation found.

## Findings grounded in the code

| Finding | Evidence | Consequence |
| --- | --- | --- |
| Gemini is a startup dependency | services/geminiService.ts throws at module load without API_KEY; App.tsx imports it | The app cannot initialize normally without that configuration |
| API key is embedded into browser code | vite.config.ts defines process.env.API_KEY using GEMINI_API_KEY | Remove both SDK usage and build-time key injection |
| Automatic discovery has several entry points | App.tsx bulk refresh; BookSeriesCard.tsx mount effect and individual refresh | Removing only the service leaves broken imports and controls |
| Manual next-book entry depends on an existing result | EditSeriesModal.tsx renders its next-book section only when nextBookInfo exists | New series need a manual entry path when Gemini is removed |
| Empty library is not persisted | App.tsx removes bookSeries storage when the array is empty and seeds examples when the key is absent | Deleting the final series restores examples after reload |
| Load and save effects conflict | App.tsx starts with an empty array, reads storage in one effect, then removes it in another | Initialization is vulnerable to effect replay; initialize before saving |
| Stored data has no runtime validation | App.tsx parses/casts values directly, including showCovers outside a try/catch | Malformed or older data can break rendering |
| Status logic is duplicated | App.tsx and BookSeriesCard.tsx both derive status | Behavior can drift; TBA currently takes precedence over Series Complete |
| Release dates use timestamp parsing | Both status implementations parse YYYY-MM-DD with new Date | Define date-only semantics and test time-zone boundaries |
| Reading edits do not invalidate next-book information | EditSeriesModal.tsx saves a changed book number with previous nextBookInfo | The displayed next book can refer to the old reading position |
| Export scaffolding remains | README.md, metadata.json, index.html import map, package name | Replace AI Studio instructions and remove obsolete runtime setup |
| HTML references missing files and has a charset typo | index.html references /index.css and /vite.svg; charset is UTF--8 | Clean up missing assets and correct charset |
| Styling is supplied at runtime | index.html loads Tailwind CDN and inline config | Move styling into the build for a self-contained deployment |
| No test or typecheck scripts | package.json has only dev/build/preview | Establish meaningful verification before restructuring |
| Notifications are described but absent | metadata.json claims notifications; no corresponding implementation found | Describe actual capabilities and scope notification work separately |

## Possible directions

1. Incremental rehabilitation: keep React/Vite and the current useful interface, remove Gemini, fix persistence and manual editing, then split responsibilities. Smallest migration surface and the recommended starting point based on this source inspection.
2. Synchronized personal app: retain the frontend, introduce authenticated persistence and a backend. Appropriate if phone/computer continuity is required immediately, but adds deployment and data migration work.
3. Full rewrite: rebuild UI and data model together. Largest regression risk; the current source does not establish a need to discard all existing work.

## Proposed cleanup sequence

### 1. Independent, usable baseline

- Preserve the source before edits and establish version control.
- Remove @google/genai, next-book generation, API-key injection, AI Studio import maps and branding.
- Remove discovery refresh controls and loading/error states that no longer have a provider.
- Extract existing cover lookup into a separate service. Retain Google Books unless removing all Google services is a separate requirement.
- Allow manual next-book title, status, physical/ebook date and audiobook date entry for every series.
- Preserve existing library records and source links. Identify historical generated information as unverified rather than silently declaring it accurate.
- Correct the HTML and bundle styles locally; choose one package manager and regenerate its lockfile.
- Replace README with actual setup and capability documentation.

Acceptance: starts with no AI key; tracking and manual release edits work; no Gemini requests or SDK remain; production assets build.

### 2. Reliable personal data

- Separate library initialization, validation and persistence from rendering.
- Persist an intentionally empty library and handle unavailable storage without claiming data was saved.
- Add a versioned data format, migration from the existing bookSeries key, and backup import/export.
- Do not overwrite unreadable existing storage with demo data; provide a recovery path.
- Centralize status derivation, date-only comparisons and form validation.
- Decide how changing reading position clears or updates next-book information.

Acceptance: add/edit/delete survive reload; an empty library stays empty; malformed storage is recoverable; import/export round-trips; previous-format data migrates without loss.

### 3. Focused organization

Proposed boundaries, subject to storage requirements:

```text
src/
  app/                 application composition
  features/series/     forms, cards, library interactions and hooks
  domain/              series types, validation and status/date rules
  services/            optional external cover/catalog lookups
  storage/             persistence, migrations and backups
  components/          shared dialogs and presentation controls
  styles/              bundled theme and styling
```

Keep business rules independent of React and network services. Split the cover picker out of BookSeriesCard. Use shared dialog behavior for keyboard focus, Escape and accessible names. Preserve current useful views until a separate design decision changes them.

Acceptance: rendering does not own persistence or external-provider implementation; card status and filters share the same rules; keyboard and narrow-screen workflows remain usable.

### 4. Release discovery and deployment

- Decide whether discovery is manual, catalog-assisted or automated research without Gemini.
- Evaluate actual provider coverage for series order, forthcoming books and audiobook dates before choosing a replacement. No provider coverage has been verified in this audit.
- Track source, checked date and manual overrides for externally supplied metadata.
- Add device synchronization, background checks or notifications only according to the intended personal workflow.
- Select hosting after the persistence and background-work requirements are known.

Acceptance: chosen features have explicit failure/unknown states and verified data sources; deployment instructions match the app that exists.

## Verification to include in implementation

- Typecheck and production build.
- Focused tests for storage initialization, empty state, migration, invalid input and status/date rules.
- Browser checks for add/edit/delete/reload, manual release entry, search/filter consistency and backup recovery.
- Keyboard dialog and mobile layout checks.
- Assert core tracking works when cover services fail and without any AI credentials.

## Migration boundary

Existing localStorage belongs to its browser origin. Moving source files out of AI Studio does not transfer the old browser's saved library. A backup/export from the old app, if it contains real reading data, will need an explicit import path.
