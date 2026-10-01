# SeriesTrackr

SeriesTrackr is a personal desktop tracker for book series and audiobooks. Add a series, record the last book you finished, enter the next title and its book and audiobook release information, and use search, filters, and grid, compact, or table views. Release information is entered manually. Cover search is an optional, explicit action that uses Open Library and Google Books; you can also paste an image URL.

## Run locally

Install Node.js, then run:

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:3000` in a desktop Chromium browser. The development server listens on localhost. This version is intended for one browser tab at a time because tabs do not synchronize edits. Once the app has loaded, manual tracking works without external network access. Cover search and display of saved or manually pasted remote cover images need connectivity.

The first launch asks for a default release market. You can override it for a series. Book and audiobook availability are separate manual records. Marking a next book finished advances shared reading progress, and Undo is available until another library change or reload.

## Data and backups

The library and settings live in that browser's `localStorage` under `seriestrackr:v1` for the `http://127.0.0.1:3000` origin. Other browsers, profiles, ports, and devices have separate storage. Clearing site data or changing browser profiles can remove the library. Use **Backups** to export a JSON file regularly. Import shows a preview and requires confirmation before replacing the current library and settings. The app also offers a raw download if stored data cannot be parsed, and an immediate export if a write fails.

The app starts with an empty library and does not migrate existing AI Studio browser data. It does not discover forthcoming titles or release dates automatically. Source evaluation for that later phase is described in [docs/discovery-evaluation.md](docs/discovery-evaluation.md).

## Verification

Run `npm test` for unit and component tests, `npm run typecheck` for TypeScript, `npm run build` for the production bundle, and `npm run test:e2e` for the Chromium workflow, backup recovery, keyboard, offline, and visual checks. Playwright may ask you to install its Chromium runtime with `npx playwright install chromium` on a new machine. The production bundle can be previewed locally with `npm run preview`.

Task 6 verification on 2026-09-29 passed: `npm test` (77 tests), `npm run typecheck`, `npm run build`, and `npm run test:e2e` (10 Chromium tests). Visual checks covered 1440 and 1024 pixel layouts in both themes, plus effective 200% zoom viewports.

## Optional release discovery

For frontend-only manual tracking, keep using `npm run dev`. `npm run dev:all` starts the frontend on `127.0.0.1:3000` with its optional loopback discovery service on port 3001. Checks are explicit, one series at a time, with free retrieval first, individual source review and optional per-check DeepSeek off by default. Provider failure must preserve accepted manual/discovery facts.

Phase 2 implementation and verification are complete with documented limits: 1133 tests across 33 files, typecheck, build and all 24 browser tests passed, including migration/recovery, offline and visual checks. The [independently audited free-pages pilot](docs/discovery-free-pages-pilot-report.md) records 10 identities and seven book/seven audio dates in 13 cases with zero AI calls; Witness, The Devils and the CA Path to Ascendancy case remain named unsupported. Nonblank custom-order notes remain source-only/manual, without automatic proposals. See [discovery usage](docs/discovery-usage.md) for startup, service-only keys, market policy, verified recovery and coverage limits. Earlier manual-version statements above describe the initial version; continuation changes remain uncommitted and unmerged.
