# SeriesTrackr

SeriesTrackr is a personal desktop tracker for book series and audiobooks. Add a series, record the last book you finished, enter the next title and its book and audiobook release information, and use search, filters, and grid, compact, or table views. Release information is entered manually. Cover search is an optional, explicit action that uses Open Library and Google Books; you can also paste an image URL.

## Run locally

Install Node.js, then run:

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:3000` in a desktop Chromium browser. The development server listens on localhost. This version is intended for one browser tab at a time because tabs do not synchronize edits. Once the app has loaded, manual tracking does not need a network connection. A network connection is needed only when you choose to search for a cover.

The first launch asks for a default release market. You can override it for a series. Book and audiobook availability are separate manual records. Marking a next book finished advances shared reading progress, and Undo is available until another library change or reload.

## Data and backups

The library and settings live in that browser's `localStorage` under `seriestrackr:v1` for the `http://127.0.0.1:3000` origin. Other browsers, profiles, ports, and devices have separate storage. Clearing site data or changing browser profiles can remove the library. Use **Backups** to export a JSON file regularly. Import shows a preview and requires confirmation before replacing the current library and settings. The app also offers a raw download if stored data cannot be parsed, and an immediate export if a write fails.

The app starts with an empty library and does not migrate existing AI Studio browser data. It does not discover forthcoming titles or release dates automatically. Source evaluation for that later phase is described in [docs/discovery-evaluation.md](docs/discovery-evaluation.md).

## Verification

Run `npm test` for unit and component tests, `npm run typecheck` for TypeScript, `npm run build` for the production bundle, and `npm run test:e2e` for the Chromium workflow, backup recovery, keyboard, offline, and visual checks. Playwright may ask you to install its Chromium runtime with `npx playwright install chromium` on a new machine. The production bundle can be previewed locally with `npm run preview`.

Task 6 verification on 2026-09-29 passed: `npm test` (77 tests), `npm run typecheck`, `npm run build`, and `npm run test:e2e` (10 Chromium tests). Visual checks covered 1440 and 1024 pixel layouts in both themes, plus effective 200% zoom viewports.
