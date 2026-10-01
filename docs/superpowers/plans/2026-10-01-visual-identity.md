# SeriesTrackr Visual Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the user's selected D / Ink & Signal dark palette, L2 / Next volume mark, and T2 / Newsreader + Manrope typography to the merged SeriesTrackr app, including its discovery UI.

**Architecture:** Keep the current React components, library commands and discovery workflow. Introduce local font assets with a small font stylesheet and move the existing theme variables into a dedicated theme stylesheet; retain component styling in app.css. Replace the header's generic book icon with one decorative React SVG component and verify the result in real browser layouts.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, existing Tailwind/PostCSS, Vitest and Playwright; local WOFF2 fonts and inline SVG. No new npm dependency.

**Spec:** [Final identity selection](../../mockups/2026-09-30-final-identity-selection.md), plus `sketches/001-visual-identity/FINAL-SELECTION.md` inside [the preserved archive](../../mockups/2026-09-30-identity-snapshot.zip). Preserve the manual-tracking and discovery contracts in [phase one](../specs/2026-09-28-personal-tracker-design.md) and [phase two](../specs/2026-09-29-release-discovery-design.md).

## Global Constraints

- Final selection: D / Ink & Signal, L2 / Next volume, T2 / Newsreader + Manrope. Other archived directions are references only.
- This document is planning only. The user's request to write the plan does not start implementation.
- Plan inspected against `main` at `53c382c`, the phase 2 merge. Execution starts from the latest merged `main`, not the old `codex/visual-identity` worktree, which predates discovery.
- Keep React 19, TypeScript 5.8 and Vite 6; use npm and one committed package-lock.json.
- Core tracking must work without network access once the local app is loaded.
- Preserve the empty initial library, market setup and existing per-series market overrides; never seed research examples or hardcode Canada as the default.
- Discovery is user-triggered for one series at a time, with no requests on render, startup, page load or a scheduler.
- AI is disabled by default for every check; enabling it requires a visible token-billing notice and an explicit choice for that check.
- Persist accepted factual fields, citation links and check summaries only; do not persist retrieved page bodies, AI prompts, AI responses or unaccepted proposals.
- No changes to document version 2, `seriestrackr:v1`, storage/migration logic, provider contracts, discovery acceptance, startup scripts or service configuration.
- Self-host only the selected fonts and their existing OFL licenses. No Google Fonts stylesheet, remote font fetch, font package or runtime dependency.
- Keep the current light color palette. Apply the selected logo and fonts in both themes; adapt focus and functional control borders for visibility without redesigning the light palette.
- Preserve grid/compact/table, covers, settings, backups, rotating `BrandTagline`, all user-facing action names and dialog keyboard behavior.
- Keep the archived mockup and its alternatives intact. Its palette view uses Newsreader + DM Sans, whereas the selected production pairing is Newsreader + Manrope.
- Do not use em dashes.
- Do not select the Astra model for a subagent unless the user specifically requests Astra.
- Use high reasoning effort only when writing an implementation plan or specification. Use medium effort or lower for all other work, including implementation, reviews, debugging, research, and test execution. This rule applies globally to the main agent and all subagents.

## Review Focus

1. Missing font files or unsupported glyphs: the library and dialogs stay readable with system/Georgia fallback; typography creates no external dependency. Task 1 browser font-failure check and Task 4 mixed-script layout check.
2. Long titles, author names and rotating taglines at narrow widths: text wraps without obscuring actions; horizontal scrolling stays inside the labeled table region. Tasks 3 and 4 layout checks.
3. Warning, scheduled, announced, error and disabled discovery states in dark mode: labels and warnings remain readable, and color never replaces the existing state text. Tasks 2 and 4 contrast/state checks.
4. Theme/view changes and reloads with accepted discovery records: only the intended settings change; progress, release fields, provenance and sources survive unchanged. Task 2 persistence check and existing discovery browser tests in Task 4.
5. Keyboard focus in the redesigned review dialog: focused controls remain visible, Escape returns focus to the opener and selection/AI consent behavior remains intact. Task 4 browser check plus existing dialog tests.

## Scope and visual contract

This is an identity pass on the merged UI, not a replacement of it with the simpler three-card mockup. Keep current card information, discovery explanations, source-country/provenance text, filters and all three views. Preserve current panel radii and layout unless a focused wrapping fix is required by the new fonts. Do not transplant the mockup's fictional book jackets, sample data, sample market buttons or preview-only behavior.

### Selected colors and supporting semantic tokens

Move the two current `:root` theme blocks from app.css to `src/styles/theme.css`. The light values for existing core tokens remain byte-for-byte equivalent. Add the following tokens and dark values; the supporting semantic colors are adaptations for states not represented in the original palette specimen, not new palette alternatives.

| Token | Light | Dark | Purpose |
| --- | --- | --- | --- |
| --bg | #f6f5f1 | #171d2b | Canvas |
| --panel | #ffffff | #212b3d | Cards and dialogs |
| --ink | #202923 | #eef0e7 | Primary text |
| --muted | #617067 | #b2bdd2 | Secondary text |
| --line | #dfe4dc | #485773 | Decorative separators |
| --accent | #285d48 | #b5c4ff | Primary actions, logo, links |
| --accent-ink | #f6f5f1 | #171d2b | Text on primary actions |
| --soft | #eaf1ea | #343f59 | Available badges and notes |
| --signal | #285d48 | #f5a77e | Intro eyebrow only |
| --purple | #645687 | #c5c7ff | Scheduled text |
| --purplebg | #f0ecf7 | #333651 | Scheduled badge background |
| --amber | #826318 | #f5c58b | Announced text and warning text |
| --amberbg | #faf2d9 | #403429 | Announced and warning backgrounds |
| --error | #a32d2d | #ffb4b0 | Validation and operational errors |
| --danger | #9d3434 | #9d3434 | Destructive button background |
| --danger-ink | #ffffff | #ffffff | Destructive button text |
| --focus | #285d48 | #b5c4ff | Visible keyboard focus |
| --control-line | #617067 | #71809c | Functional control boundary |

Retain the current light shadow `0 18px 70px #1f302529` and dark shadow `0 18px 70px #0007`. Add `--backdrop: #111b16aa` in light and `#101522b3` in dark, and consume it in `dialog::backdrop`. Dark decorative `--line` is deliberately quieter than `--control-line`; do not use the former as the only visible boundary for inputs/buttons/filters.

Text pairs must meet 4.5:1. Functional borders and focus indicators must meet 3:1 against their adjacent surface. The proposed dark control border measures 3.57:1 against the panel; scheduled, warning and error text measure 7.27:1, 7.60:1 and 8.40:1 against their intended backgrounds. These calculated token ratios are planning evidence, not a full rendered accessibility audit.

### Typography and mark

- Newsreader 400: h1, h2, card series heading, next-book title, table series name and dialog heading. Keep h1 at the current 40 px desktop / 32 px small-screen scale; set card series headings to 20 px / 1.15, compact headings to 18 px and table series names to 18 px / 1.2. Keep next-book titles at 19 px.
- Manrope 400: 14 px / 1.5 body, inputs, metadata and source excerpts. Manrope 600: buttons, labels, badges, section h3, summary numbers and wordmark. Replace legacy 650/700/750 UI weights with 600; do not synthesize a bold Newsreader face.
- Wordmark remains `SeriesTrackr`, at 22 px with the current accent span. The mark is a 28 px square inline SVG, in currentColor, with transparent even-odd cutouts. Keep the adjacent tagline and header controls.
- Font fallbacks: `'Manrope', system-ui, sans-serif` and `'Newsreader', Georgia, serif`. Latin font subsets intentionally fall back for characters outside their coverage.
- Native checkbox/radio accents, focus outlines, placeholder text and dialog backdrop should consume the appropriate theme tokens. Do not rely on browser-default low-contrast placeholder color.
- Favicon, new illustrations, motion, new navigation and light-theme palette exploration are outside this plan.

## File map and task order

| Task | Files | Responsibility |
| --- | --- | --- |
| 1 | Create `src/assets/fonts/newsreader-latin.woff2`, `manrope-latin.woff2`, `Newsreader-OFL.txt`, `Manrope-OFL.txt`, `README.md`; create `src/styles/fonts.css`; modify `src/styles/app.css`; create `tests/e2e/identity-fixtures.ts`, `tests/e2e/identity.spec.ts` | Local fonts, type roles and font-loading/fallback checks |
| 2 | Create `src/styles/theme.css`; modify `src/styles/app.css`, `tests/e2e/identity.spec.ts` | D palette, readable semantic states, focus/control borders and theme persistence |
| 3 | Create `src/components/BrandMark.tsx`; modify `src/app/App.tsx`, `src/styles/app.css`, `tests/e2e/identity.spec.ts` | L2 header mark and wordmark sizing |
| 4 | Modify `src/styles/app.css` only for demonstrated wrapping issues; modify `tests/e2e/visual.spec.ts`, `tests/e2e/identity.spec.ts`; create `tests/e2e/identity-discovery.spec.ts`, `docs/visual-identity-verification.md`; append a focused identity note to `README.md` | Combined visual, discovery, keyboard and regression verification |

Order: 1 -> 2 -> 3 -> 4. Tasks share app.css and browser fixtures, so native sequential execution is recommended. Do not start parallel tasks that edit this stylesheet. A fresh final reviewer can inspect the complete change after verification, using medium effort or lower and without selecting Astra.

## Execution preparation

- [ ] After the user reviews this plan and chooses an execution method, use the worktree skill to create/reuse an isolated work area from merged main. Do not use the old identity checkout as the implementation base. Do not merge its old product tree wholesale.
- [ ] Ensure the saved selection note and archive are available in the execution worktree. They are currently untracked in the primary checkout, so a new worktree will not inherit them automatically. Copy those two exact files from the primary checkout if absent, preserving the originals, and include them as documentation in the Task 1 commit.
- [ ] Use the existing locked dependencies with `npm ci` if the worktree has no node_modules. Record a baseline with `npm run typecheck` and `npm test`; investigate any failure before attributing it to this redesign. No provider/service startup or billed calls are required.
- [ ] Run browser commands with port 3000 free. Playwright owns its frontend-only server and has `reuseExistingServer: false`; stop only a known task-owned server or arrange the browser run without changing this shared configuration. Do not kill unrelated processes.

### Task 1: Self-host T2 and apply the typography roles

**Files:** Create the five font assets/source files and fonts.css from the map; modify app.css; create identity-fixtures.ts and identity.spec.ts. Preserve the two original mockup documentation files if they are not yet tracked.

**Interfaces:**
- Consumes the saved archive entries under `sketches/001-visual-identity/assets/`.
- Produces `--font-body` and `--font-display` CSS variables, local Newsreader 400 and Manrope 400/600 faces.
- Produces browser helpers `identitySeries(): Series[]` and `seedIdentity(page: Page, theme?: 'light' | 'dark', series?: Series[]): Promise<void>` for later checks. Browser-test data never enters production.

- [ ] Add the exact browser fixture helpers below. They use the merged v2 constructors and seed once per browser context so reload does not reset preferences.

```ts
// tests/e2e/identity-fixtures.ts
import type { Page } from '@playwright/test';
import { emptyDocument, emptyRelease } from '../../src/features/library/model';
import type { Series } from '../../src/features/library/model';
import { seriesFixture } from '../fixtures';

export function identitySeries(): Series[] {
  return [
    seriesFixture({ id: 'identity-1', name: 'The Glass Meridian',
      releases: {
        book: { ...emptyRelease(), state: 'released' },
        audio: { ...emptyRelease(), state: 'scheduled', date: '2099-11-18' },
      } }),
    seriesFixture({ id: 'identity-2', name: 'The Tidemark Cycle',
      releases: {
        book: { ...emptyRelease(), state: 'announced' }, audio: emptyRelease(),
      } }),
    seriesFixture({ id: 'identity-3', name: 'Letters from the Orchard',
      releases: {
        book: { ...emptyRelease(), state: 'not-found' }, audio: emptyRelease(),
      } }),
  ];
}

export async function seedIdentity(page: Page, theme: 'light' | 'dark' = 'dark',
  series: Series[] = identitySeries()): Promise<void> {
  const doc = emptyDocument();
  doc.settings.market = 'CA'; doc.settings.theme = theme; doc.series = series;
  await page.addInitScript(input => {
    if (!localStorage.getItem('seriestrackr:v1')) {
      localStorage.setItem('seriestrackr:v1', JSON.stringify(input));
    }
    // Choose the longest tagline consistently in screenshots.
    Math.random = () => 0;
  }, doc);
}
```

- [ ] Write the font-loading browser check in identity.spec.ts. These are browser checks because jsdom cannot verify actual font loading or layout. Do not add unit tests that just repeat CSS or SVG markup.

```ts
import { expect, test } from '@playwright/test';
import { seedIdentity } from './identity-fixtures';

test('T2 fonts load locally and style the actual library', async ({ page }) => {
  const external: string[] = [];
  page.on('request', req => {
    if (new URL(req.url()).hostname !== '127.0.0.1') external.push(req.url());
  });
  await seedIdentity(page); await page.goto('/');
  const faces = await page.evaluate(async () => {
    const results = await Promise.all([
      document.fonts.load('400 40px "Newsreader"'),
      document.fonts.load('400 14px "Manrope"'),
      document.fonts.load('600 14px "Manrope"'),
    ]);
    return results.map(result => result.length);
  });
  expect(faces.every(count => count > 0)).toBe(true);
  await expect(page.locator('h1')).toHaveCSS('font-family', /Newsreader/);
  await expect(page.locator('.series-card h2').first()).toHaveCSS('font-family', /Newsreader/);
  await expect(page.getByLabel('Search series or author')).toHaveCSS('font-family', /Manrope/);
  expect(external).toEqual([]);
});

test('font failure preserves usable controls and fallback text', async ({ page }) => {
  await page.route('**/*.woff2', route => route.abort());
  await seedIdentity(page); await page.goto('/');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect(page.getByRole('heading', { name: 'What comes next?' })).toBeVisible();
  await page.getByLabel('Search series or author').fill('Tidemark');
  await expect(page.locator('.series-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Add series', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add series' })).toBeVisible();
  await expect(page.getByLabel('Series name', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Add series', exact: true })).toBeFocused();
});
```

- [ ] Run `npm run test:e2e -- tests/e2e/identity.spec.ts`. Expect the T2 font check to fail because the app has no registered custom faces; the fallback behavior check may already pass. Record the actual failure.
- [ ] Extract only `newsreader-1.woff2`, `manrope-1.woff2`, `newsreader-OFL.txt` and `manrope-OFL.txt` from the archive into the mapped filenames. Use this PowerShell-safe extraction command in the worktree; inspect before overwriting an existing asset.

```powershell
@'
from pathlib import Path
from zipfile import ZipFile
dest = Path('src/assets/fonts')
dest.mkdir(parents=True, exist_ok=True)
names = {
    'newsreader-1.woff2': 'newsreader-latin.woff2',
    'manrope-1.woff2': 'manrope-latin.woff2',
    'newsreader-OFL.txt': 'Newsreader-OFL.txt',
    'manrope-OFL.txt': 'Manrope-OFL.txt',
}
with ZipFile('docs/mockups/2026-09-30-identity-snapshot.zip') as archive:
    for source, target in names.items():
        out = dest / target
        if out.exists():
            raise RuntimeError(f'Inspect existing asset before replacing: {out}')
        out.write_bytes(archive.read('sketches/001-visual-identity/assets/' + source))
'@ | python -
```

- [ ] Create src/assets/fonts/README.md with the following provenance text. Retain license text exactly, including its upstream whitespace.

```markdown
# SeriesTrackr typography assets

Newsreader regular and Manrope regular/semibold Latin WOFF2 specimens were downloaded from Google Fonts on 2026-09-30 and preserved in docs/mockups/2026-09-30-identity-snapshot.zip. They are the T2 pairing selected by the user. Font sources and their original request URLs are recorded in the archive's assets/FONT-SOURCES.md.

Newsreader-OFL.txt and Manrope-OFL.txt accompany the font files. Fonts are bundled locally by Vite. Characters outside these Latin subsets use the CSS fallback stack; no browser font request is made to Google.
```

- [ ] Create fonts.css and import it as the first line of app.css, before the Tailwind directives.

```css
@font-face {
  font-family: 'Newsreader'; font-style: normal; font-weight: 400;
  font-display: swap; src: url('../assets/fonts/newsreader-latin.woff2') format('woff2');
}
@font-face {
  font-family: 'Manrope'; font-style: normal; font-weight: 400;
  font-display: swap; src: url('../assets/fonts/manrope-latin.woff2') format('woff2');
}
@font-face {
  font-family: 'Manrope'; font-style: normal; font-weight: 600;
  font-display: swap; src: url('../assets/fonts/manrope-latin.woff2') format('woff2');
}
:root {
  --font-body: 'Manrope', system-ui, sans-serif;
  --font-display: 'Newsreader', Georgia, serif;
}
```

Copy the existing `unicode-range` from the archived matching faces to each declaration so mixed-script characters can fall back without misleadingly claiming font coverage. Manrope's archived 400 and 600 declarations reference the same font bytes; keep two explicit faces rather than assuming additional weight ranges.

- [ ] Replace the current font declarations in place using the following rules. Keep existing margins and responsive h1 sizes. Replace conflicting selectors rather than appending duplicate declarations at the end of the file.

```css
body { font: 14px/1.5 var(--font-body); }
button, input, select, textarea { font: inherit; }
h1, h2 { font-family: var(--font-display); font-weight: 400; }
h3, b, strong { font-weight: 600; }
.brand strong { font-family: var(--font-body); font-weight: 600; }
.card-header h2 {
  font-family: var(--font-display); font-size: 20px;
  font-weight: 400; line-height: 1.15;
}
.compact .card-header h2 { font-size: 18px; }
.card-next strong { font-family: var(--font-display); font-weight: 400; }
.table-wrap td:first-child > strong {
  font-family: var(--font-display); font-weight: 400;
  font-size: 18px; line-height: 1.2;
}
.eyebrow, .badge, .position, .table-wrap th, legend { font-weight: 600; }
```

- [ ] Run the focused browser file and `npm run typecheck`. Expect fonts loaded, no external requests in the no-cover fixture, fallback interactions passing, and no TypeScript errors. Check the actual font-file HTTP responses as part of browser diagnostics if loading fails.
- [ ] Commit the Task 1 deliverable and its mockup source documentation with `git commit -m "style: self-host Newsreader and Manrope typography"`, staging only the Task 1 files listed above.

### Task 2: Apply D and retain readable UI states

**Files:** Create theme.css; modify app.css and identity.spec.ts.

**Interfaces:** Consumes the existing `html[data-theme="dark"]` attribute and Task 1 type variables. Produces the token contract in the table above for existing cards, dialogs, release badges and discovery summaries. No React state or data contract changes.

- [ ] Add a dark-theme assertion and a theme-persistence check to identity.spec.ts.

```ts
test('D colors are applied and switching themes preserves series records', async ({ page }) => {
  await seedIdentity(page); await page.goto('/');
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem('seriestrackr:v1')!).series);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(23, 29, 43)');
  await expect(page.locator('.series-card').first()).toHaveCSS('background-color', 'rgb(33, 43, 61)');
  await expect(page.getByRole('button', { name: 'Add series', exact: true })).toHaveCSS('background-color', 'rgb(181, 196, 255)');
  await page.getByRole('button', { name: 'Light theme', exact: true }).click();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(246, 245, 241)');
  await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('seriestrackr:v1')!));
  expect(saved.series).toEqual(records);
});
```

- [ ] Add an actual rendered contrast check. This tests readability on the final UI rather than merely repeating expected token values.

```ts
function contrastRatio(a: string, b: string): number {
  const luminance = (color: string) => {
    const values = color.match(/[\d.]+/g)!.slice(0, 3).map(Number)
      .map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} badges, errors, focus and input edges retain contrast`, async ({ page }) => {
    await seedIdentity(page, theme); await page.goto('/');
    for (const selector of ['.badge.released', '.badge.scheduled', '.badge.announced',
      '.badge.not-checked', '.badge.not-found', '.library-tools .primary']) {
      const colors = await page.locator(selector).first().evaluate(el => {
        const style = getComputedStyle(el);
        return { text: style.color, background: style.backgroundColor };
      });
      expect(contrastRatio(colors.text, colors.background), selector).toBeGreaterThanOrEqual(4.5);
    }
    const search = page.getByLabel('Search series or author');
    await search.focus();
    await expect(search).toHaveCSS('outline-style', 'solid');
    await expect(search).toHaveCSS('outline-width', '3px');
    const colors = await search.evaluate(el => {
      const style = getComputedStyle(el);
      return { border: style.borderTopColor, outline: style.outlineColor,
        panel: style.backgroundColor, canvas: getComputedStyle(document.body).backgroundColor };
    });
    expect(contrastRatio(colors.border, colors.panel)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(colors.outline, colors.canvas)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(colors.outline, colors.panel)).toBeGreaterThanOrEqual(3);
    await page.getByRole('button', { name: 'Add series', exact: true }).click();
    await page.getByRole('button', { name: 'Save series', exact: true }).click();
    const error = page.locator('.form-error');
    await expect(error).toBeVisible();
    const errorColors = await error.evaluate(el => ({ text: getComputedStyle(el).color,
      background: getComputedStyle(el.closest('dialog')!).backgroundColor }));
    expect(contrastRatio(errorColors.text, errorColors.background)).toBeGreaterThanOrEqual(4.5);
  });
}
```

The sampled computed colors are opaque RGB values. For error text the test uses the enclosing dialog's background rather than a transparent paragraph background. If a future style introduces an alpha channel in a sampled foreground/background, composite it against its actual ancestor before calculating contrast rather than ignoring its alpha.

- [ ] Run `npm run test:e2e -- tests/e2e/identity.spec.ts`. Expect the D color check to fail against current green-dark CSS. Record any contrast failure independently.
- [ ] Move the existing root theme blocks to theme.css, add the exact token table, and add `@import './theme.css';` after the font import and before Tailwind directives in app.css. Both imports are resolved/bundled by Vite; do not add HTML CDN links.

```css
/* src/styles/theme.css */
:root {
  color-scheme: light;
  --bg: #f6f5f1; --panel: #fff; --ink: #202923; --muted: #617067;
  --line: #dfe4dc; --accent: #285d48; --accent-ink: #f6f5f1; --soft: #eaf1ea;
  --signal: #285d48; --purple: #645687; --purplebg: #f0ecf7;
  --amber: #826318; --amberbg: #faf2d9; --error: #a32d2d;
  --danger: #9d3434; --danger-ink: #fff; --focus: #285d48; --control-line: #617067;
  --shadow: 0 18px 70px #1f302529; --backdrop: #111b16aa;
}
:root[data-theme=dark] {
  color-scheme: dark;
  --bg: #171d2b; --panel: #212b3d; --ink: #eef0e7; --muted: #b2bdd2;
  --line: #485773; --accent: #b5c4ff; --accent-ink: #171d2b; --soft: #343f59;
  --signal: #f5a77e; --purple: #c5c7ff; --purplebg: #333651;
  --amber: #f5c58b; --amberbg: #403429; --error: #ffb4b0;
  --danger: #9d3434; --danger-ink: #fff; --focus: #b5c4ff; --control-line: #71809c;
  --shadow: 0 18px 70px #0007; --backdrop: #101522b3;
}
```
- [ ] Update the consuming rules in place:

```css
.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.intro .eyebrow { color: var(--signal); }
.danger { background: var(--danger); color: var(--danger-ink); }
.danger-link, .form-error { color: var(--error); }
button, input, select, textarea { border-color: var(--control-line); }
.filter-menu summary { border-color: var(--control-line); }
input::placeholder, textarea::placeholder { color: var(--muted); opacity: 1; }
input[type='checkbox'], input[type='radio'] { accent-color: var(--accent); }
button:focus-visible, input:focus-visible, select:focus-visible,
textarea:focus-visible, summary:focus-visible, a:focus-visible,
.table-wrap:focus-visible {
  outline: 3px solid var(--focus); outline-offset: 3px;
}
dialog::backdrop { background: var(--backdrop); }
.warning { color: var(--amber); }
.warning p, .discovery-content .warn p,
.discovery-summary.warn .small { color: var(--amber); }
```

Keep disabled native controls/selection behavior and hover behavior; disabled status text must still be understandable at the current opacity. Remove the old hardcoded focus/error/backdrop colors only from rules now governed by tokens. Do not change source country, release-state or billing text. Existing badge/summary rules consume their existing semantic tokens automatically.

- [ ] Run the focused browser file and the existing `tests/e2e/visual.spec.ts`, plus `npm test -- tests/library-ui.test.tsx tests/discovery/dialog.test.tsx`. Expect theme records, warning/error rendering, control behavior and existing card layouts to pass. Inspect a warning and partial/failed summary visually, since their foregrounds can be inherited through nested paragraphs.
- [ ] Commit only Task 2 files with `git commit -m "style: apply Ink and Signal dark theme"`.

### Task 3: Replace the generic header icon with L2

**Files:** Create BrandMark.tsx; modify App.tsx, app.css and identity.spec.ts. Leave Icons.tsx unchanged unless a later separately scoped cleanup is requested.

**Interfaces:** `BrandMark(): React.JSX.Element` renders a decorative SVG with class `brand-mark`, `aria-hidden="true"`, `focusable="false"`, viewBox `0 0 64 64`, and currentColor fill. App's adjacent visible wordmark remains the accessible brand text.

- [ ] Add the browser check below and run the focused file. Expect the mark selector to be absent before implementation.

```ts
test('L2 has a stable decorative mark and readable wordmark', async ({ page }) => {
  await seedIdentity(page); await page.goto('/');
  const mark = page.locator('.brand .brand-mark');
  await expect(mark).toBeVisible();
  await expect(mark).toHaveAttribute('aria-hidden', 'true');
  await expect(mark).toHaveAttribute('focusable', 'false');
  await expect(mark).toHaveCSS('width', '28px');
  await expect(mark).toHaveCSS('color', 'rgb(181, 196, 255)');
  await expect(page.locator('.brand strong')).toHaveText('SeriesTrackr');
  await expect(page.locator('.brand .small')).toHaveText('You don’t have a reading problem. You have a tracking problem.');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
```

- [ ] Create the exact selected mark, using JSX even-odd attributes and true cutouts rather than painting background-colored squares over the shape:

```tsx
export function BrandMark(): React.JSX.Element {
  return <svg className="brand-mark" aria-hidden="true" focusable="false"
    viewBox="0 0 64 64" width="28" height="28" fill="none">
    <path d="M7 13h11v40H7zM11 20h3v3h-3zM24 13h11v40H24zM28 20h3v3h-3z"
      fill="currentColor" fillRule="evenodd" />
    <path d="m39 14 11-3 10 39-11 3z m8 6 3-.8.8 3-3 .8z"
      fill="currentColor" fillRule="evenodd" />
  </svg>;
}
```

- [ ] Replace App.tsx's BookIcon import/header use with BrandMark. Leave the BrandTagline component and all nav actions exactly as they are. Add these rules in the existing brand section:

```css
.brand .brand-mark { color: var(--accent); width: 28px; height: 28px; flex: none; }
.brand strong { font-family: var(--font-body); font-weight: 600; }
.brand .small { overflow-wrap: anywhere; }
```

- [ ] Run the focused browser check and typecheck; inspect the mark on both themes and at 16, 24 and 28 px using temporary browser style overrides, not extra production props. Confirm the holes remain transparent and the leaned spine is legible. Save the final header screenshot as verification evidence.
- [ ] Commit only Task 3 files with `git commit -m "style: add the selected next volume brand mark"`.

### Task 4: Verify the combined identity on the merged workflows

**Files:** Modify visual.spec.ts and identity.spec.ts; create identity-discovery.spec.ts and docs/visual-identity-verification.md; append an identity note to README.md. Modify app.css only to resolve demonstrated text wrapping or focus visibility problems.

**Interfaces:** Consumes the completed identity and `seedIdentity` fixture. Uses existing `CheckRequest`/`CheckResponse` types and `response()` test fixture to mock same-origin discovery APIs. Produces browser evidence and a final verification record, not a new product API.

- [ ] Update visual.spec.ts to await `document.fonts.ready` before checking layout/screenshots and include 390 px in its existing desktop/theme matrix. Keep its effective 200% zoom checks (720 and 512 CSS px). Stabilize screenshot taglines with test-local `Math.random = () => 0`; do not replace BrandTagline in production.
- [ ] Add a mixed-script/unbroken-name test to identity.spec.ts, using `identitySeries` imported from identity-fixtures. Test all views at 390 px and 1024 px, in both themes. Page-wide scrolling must not occur; the table's existing region may scroll internally.

```ts
test('long and mixed-script text fits all views and themes', async ({ page }) => {
  const series = identitySeries();
  series[0].name = 'X'.repeat(160) + ' L’Été 世界';
  series[0].author = 'A very long author name with several words and diacritics Éléonore';
  series[0].next.title = 'Y'.repeat(120) + ' & the next chapter';
  await seedIdentity(page, 'dark', series); await page.goto('/');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark'] as const) {
      const toggle = page.getByRole('button', { name: theme === 'light' ? 'Light theme' : 'Dark theme', exact: true });
      if (await toggle.count()) await toggle.click();
      for (const view of ['Grid', 'Compact', 'Table']) {
        await page.getByRole('button', { name: view, exact: true }).click();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (view === 'Table') await expect(page.getByRole('region', { name: 'Release table' })).toBeVisible();
        else {
          const clipped = await page.locator('.card-header h2, .card-next strong').evaluateAll(elements =>
            elements.filter(el => el.getBoundingClientRect().width > 0 && el.scrollWidth > el.getBoundingClientRect().width + 1).length);
          expect(clipped).toBe(0);
        }
      }
    }
  }
});
```

- [ ] If that new edge-case check fails, fix wrapping at the affected nodes. Use the following focused rules as needed; do not hide overflow to make the assertion pass:

```css
.card-header > div:not(.cover-frame) { min-width: 0; }
.card-header h2, .card-next strong, .table-wrap td { overflow-wrap: anywhere; }
.table-wrap td:first-child { max-width: 280px; }
```

- [ ] Create identity-discovery.spec.ts with a mock API browser check. Add `import { expect, test } from '@playwright/test';`, `import type { CheckRequest } from '../../shared/discovery';`, `import { response } from '../discovery/fixtures';`, `import { seriesFixture } from '../fixtures';`, `import { seedIdentity } from './identity-fixtures';` and `import { mkdir } from 'node:fs/promises';`. Use the exact capability shape below; never run the live service for visual verification.

```ts
const capabilities = {
  search: false, ai: false, googleBooks: false, hardcover: false, model: 'deepseek-flash',
  limits: { search: 3, ai: 1, googleBooks: 2, hardcover: 1, outputTokens: 2048, inputBytes: 20000 },
  pricingAsOf: '2026-09-29', estimatedMaxAiUsd: 0.02,
};

test('D and T2 keep discovery review usable at narrow widths', async ({ page }) => {
  let checkCount = 0;
  await seedIdentity(page, 'dark', [seriesFixture()]);
  await page.route('**/api/discovery/capabilities', route => route.fulfill({ json: capabilities }));
  await page.route('**/api/discovery/check', route => {
    checkCount++;
    const sent = route.request().postDataJSON() as CheckRequest;
    const result = response();
    result.requestId = sent.requestId; result.seriesId = sent.seriesId;
    result.summary.requestId = sent.requestId;
    result.summary.status = 'partial'; result.summary.reasons = ['quota'];
    result.proposals.releases.book!.provenance.sourceMarket = 'GB';
    return route.fulfill({ json: result });
  });
  await page.goto('/'); expect(checkCount).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  const opener = page.getByRole('button', { name: 'Check releases', exact: true });
  await opener.focus(); await page.keyboard.press('Enter');
  const ready = page.getByRole('dialog', { name: 'Check next release' });
  await expect(ready).toBeVisible();
  await expect(ready.getByLabel('Use DeepSeek for this check')).not.toBeChecked();
  await ready.getByRole('button', { name: 'Check release', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Review release details' });
  await expect(review).toBeVisible();
  await expect(review.getByRole('heading', { name: 'Review release details' })).toHaveCSS('font-family', /Newsreader/);
  await expect(review.getByText('Check partially completed', { exact: true })).toBeVisible();
  await expect(review.getByText('Date from GB; no supported CA date found in sources checked.')).toBeVisible();
  const save = review.getByRole('button', { name: 'Save selected changes', exact: true });
  await expect(save).toBeDisabled();
  const book = review.getByRole('checkbox', { name: 'Save Book', exact: true });
  await book.focus(); await page.keyboard.press('Space');
  await expect(save).toBeEnabled();
  await save.focus();
  await expect(save).toHaveCSS('outline-style', 'solid');
  await expect.poll(() => review.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await mkdir('node_modules/.cache/playwright-visual', { recursive: true });
  await page.screenshot({ path: 'node_modules/.cache/playwright-visual/identity-discovery-dark-390.png', fullPage: true });
  await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
  expect(checkCount).toBe(1);
});
```

- [ ] Run the new browser files and existing visual file first. Expected: all state/keyboard/overflow checks pass. Some preserved behavior tests may pass immediately; do not manufacture a failure or rewrite working behavior to satisfy a visual task.
- [ ] Inspect the combined D + L2 + T2 UI on desktop and phone. Capture both themes in grid/compact/table, no-cover/broken-cover, empty library/search, editor validation, settings, backups/reset confirmation and discovery ready/checking/review/partial/error states. Existing discovery unit/browser fixtures cover conflict/stale logic; run them and inspect their visual states using fake responses. Keep billing notices, unknown-state text, source links and disabled controls visible.
- [ ] For the visible checking state, defer the mocked `/api/discovery/check` route response with a test-controlled promise, capture the `Checking release details` dialog and then release the response. For service failure, abort the mocked capability request and inspect `Could not complete this check`. For empty library, call `seedIdentity(page, 'dark', [])` in a fresh test context. No arbitrary sleeps, automatic live calls or production fixture seeds.
- [ ] Run final checks once after final implementation edits: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`. Run independent non-server commands concurrently only when cleanly supported; browser tests own port 3000. Repeat checks only after a new change or failure justifies it.
- [ ] Inspect the built dist assets for the two bundled WOFF2 files and verify the production preview actually loads Newsreader 400 and Manrope 400/600. Block external network requests while serving the preview locally and verify manual search, edit and theme switching remain usable. Missing optional discovery service must retain existing error behavior. This checks external independence, not offline navigation support; this app has no new service worker or installability requirement.
- [ ] Write docs/visual-identity-verification.md with the selected options, implementation commit range, exact commands/results, screenshot paths, measured text/control/focus contrast, any remaining visual limitations and confirmation that no real discovery provider was called. Append to README.md: `Visual identity: Ink & Signal dark colors, the Next volume mark, and locally bundled Newsreader/Manrope typography. The light color palette and tracking/discovery workflows are retained.` Do not rewrite unrelated historical phase reports.
- [ ] Request the execution method's final independent review, enforcing medium reasoning effort or lower and no Astra. Fix actionable issues and repeat affected checks. Native execution uses one whole-change review; subagent-driven execution also follows its per-task gates.
- [ ] Commit the Task 4 files with `git commit -m "test: verify selected identity across library and discovery"`. Keep screenshots in the ignored browser output directory unless a reviewed deliverable specifically requires a small curated copy.

## Coverage and self-review

| Requirement | Implementation/check |
| --- | --- |
| D exact canvas/panel/ink/accent/signal values | Task 2 theme table, browser color assertion and combined screenshots |
| L2 exact mark and transparent notches | Task 3 component, keyboard-neutral semantics and size inspection |
| T2 uses Manrope rather than palette preview's DM Sans | Task 1 font assets, computed styles, loaded 400/600 faces |
| Typography consistent across cards/table/dialogs | Task 1 roles, Task 4 view/discovery screenshots |
| Original light palette retained | Task 2 token table, light canvas assertion and screenshots |
| Font failure and unsupported characters readable | Task 1 abort-font interaction check, Task 4 mixed-script/fallback visual review |
| Narrow widths, long text, 200% effective zoom | Task 4 long-token checks and expanded existing visual suite |
| Release statuses/warnings/errors remain readable | Task 2 rendered contrast and Task 4 discovery state checks |
| Theme persistence and accepted facts unchanged | Task 2 record equality; full existing migration/backup/discovery regressions in Task 4 |
| No automatic discovery or remote font calls | Task 1 external-request assertion; Task 4 checkCount and fake-provider-only verification |
| Keyboard consent, selection and focus return retained | Task 4 review checkbox/Space/Escape; existing dialog and library browser suites |
| Saved variants and licenses preserved | Archive copied intact; Task 1 exact font/license extraction |

Self-review on 2026-10-01: file ownership and dependency order mapped to the merged code; constructor and discovery capability shapes checked against current types; palette-preview font mismatch resolved explicitly; negative-space SVG retained; light-theme scope bounded; five review conditions have owning checks. No implementation, baseline test run or product verification is claimed by this planning self-review.

## Execution handoff

Review this plan and choose Native or Subagent-driven execution before product changes begin. Native is recommended: four sequential tasks share one stylesheet and a small set of browser fixtures, with one final independent review. In either mode, implementation/review/debug/test work uses medium effort or lower; high effort is reserved for writing plans/specifications.
