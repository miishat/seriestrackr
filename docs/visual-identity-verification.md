# Visual identity verification

Verified on 2026-10-01 in the isolated `visual-identity-implementation/seriestrackr` worktree. Selected D / Ink & Signal, L2 / Next volume and T2 / Newsreader + Manrope. The original light core palette, workflow labels, manual tracking, discovery consent and storage contract are retained.

## Implementation range

The implementation range is `0c934c1..HEAD` at the Task 4 verification commit (`test: verify selected identity across library and discovery`):

| Commit | Change |
| --- | --- |
| `190ba11` | Locally bundled selected fonts and licenses; typography roles |
| `cefe9a8` | Exact dark palette, light contract, functional focus/control contrast |
| `ff2b84e` | Decorative Next volume SVG and brand layout |
| Task 4 verification commit | Combined browser checks, wrapping fix and this record |

Task 4 changes only tests, documentation and demonstrated wrapping rules. An unbroken 160-character series name initially caused page-wide scrolling at 390 CSS px. The specified `min-width: 0`, `overflow-wrap: anywhere` and first-table-cell maximum width fix it. Normal wrapping is restored on table buttons and badges so the new inherited wrapping does not split action words. No overflow is hidden to pass checks.

The controller also authorized a small portability fix in `library.spec.ts`: its existing remote-blocking check now allows only the configured baseURL origin instead of hardcoding port 3000. The first full isolated run exposed that test-only issue (48 passed, one navigation aborted); product behavior was unchanged.

## Commands and results

Commands run from the worktree root with PowerShell environment normalization:

```powershell
$env:NO_COLOR=$null
$env:FORCE_COLOR='0'
npm run typecheck
npm test
npm run build
node node_modules/@playwright/test/cli.js test --config=.superpowers/sdd/2026-10-01-visual-identity/identity.playwright.config.ts
```

| Final check | Result |
| --- | --- |
| Typecheck | Exit 0, `tsc --noEmit` |
| Unit/regression suite | Exit 0, 33 files, 1164 tests passed, 10.55 seconds |
| Production build | Exit 0, 56 modules, 2.18 seconds |
| Full Chromium suite after portability correction | Exit 0, 49 passed, 17.6 seconds |

The full browser command is the direct Node equivalent of `npm run test:e2e`, using an ignored config to launch only the frontend on 3011. The user's existing frontend on 3000 was left untouched. Unit, typecheck and build commands ran concurrently with independent browser checks. No discovery service was started. Browser tests use fake same-origin API responses or aborts.

Initial targeted command was the same browser command with `tests/e2e/identity.spec.ts tests/e2e/identity-discovery.spec.ts tests/e2e/visual.spec.ts`. The mixed-script baseline first failed page overflow before wrapping correction. Intermediate 26-test runs had 22 passes and four test-helper failures: Settings is opened by `Market: CA`, and the metadata-reset confirmation overlays the still-open editor. These fixtures were corrected without changing product behavior. The final full suite contains all 26 combined checks. After final inspection, explicit conflict-warning screenshots were added because the warning lies between the top and footer at phone width. The affected command with `tests/e2e/identity-discovery.spec.ts -g 'discovery inventory'` passed all four tests, exit 0, 7.1 seconds. No unrelated suite was repeated after that screenshot-only edit.

## Production preview and external independence

```powershell
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 3012 --strictPort
node node_modules/.cache/playwright-visual/verify-preview.mjs
```

The ignored verification script used Chromium against built assets, blocked every external origin and aborted all `/api/` requests to simulate an unavailable optional service. It performed setup, manual add, manual search, edit with the existing metadata-reset confirmation, dark/light switching, missing-service error inspection and search after the error. Final exit 0; no external requests were observed. Newsreader 400, Manrope 400 and Manrope 600 each loaded one face. Both built assets returned HTTP 200:

- `dist/assets/newsreader-latin-BFBkh4jY.woff2`, 22.48 kB
- `dist/assets/manrope-latin-DHIcAJRg.woff2`, 24.84 kB

Evidence is in `node_modules/.cache/playwright-visual/preview-evidence.json`, with the exact local font response URLs, statuses and loaded faces. Preview was stopped after inspection. A preliminary attempt using `npm run preview -- --host ...` had Windows npm argument forwarding stripped flags and failed before serving. Direct Node fixed it. Another preliminary preview attempt inherited Vite's existing same-origin discovery proxy and reached its capabilities endpoint; no check POST or provider call occurred. The final run explicitly blocked API routes and verified the required unavailable-service behavior.

This proves independence from external font/provider network access once the app is loaded locally. It does not claim offline navigation, service-worker support or installability.

## Browser and visual evidence

Screenshots remain ignored under `node_modules/.cache/playwright-visual/`. Screenshot taglines use test-local deterministic randomness; production rotation is retained. Font-ready waits precede layout/screenshots. Generated inventory:

| Filename pattern | Coverage |
| --- | --- |
| `cards-{1440,1024,390}-{light,dark}.png` | Actual combined header/cards, valid mock cover, broken cover and no cover |
| `cards-{1440,1024}-{light,dark}-zoom-200.png` | Effective 200% zoom at 720/512 CSS px |
| `mixed-{390,1024}-{light,dark}-{Grid,Compact,Table}.png` | Unbroken 160-character name, 120-character next title, diacritics and CJK fallback |
| `library-{light,dark}-{390,1024}-{Grid,Compact,Table}.png` | Ordinary library records in every view and theme |
| `empty-library-{light,dark}-{390,1024}.png` | Fresh contexts with deliberately empty library |
| `empty-search-{light,dark}-{390,1024}.png` | Search with no matches |
| `{settings,backups,editor-validation,reset-confirmation}-{light,dark}-{390,1024}.png` | Manual dialog inventory, editor validation and metadata reset confirmation |
| `discovery-{ready,checking,review,conflict,error}-{light,dark}-{390,1024}.png` | Fake capabilities, deferred checking promise, supported/unknown review, conflict and aborted capabilities |
| `discovery-conflict-{light,dark}-{390,1024}-warning.png` | Conflict reason and disabled Book selection together |
| `identity-discovery-dark-390.png` | Keyboard-opened partial review with GB source-country fallback |
| `discovery-stale-dark-390.png` | Fake deferred response after library mutation, explicit stale warning and no save action |
| `identity-{error,summaries,warning,review,review-disabled}-{light,dark}.png` | Validation, partial/failed summaries, storage warning and disabled discovery choices |
| `preview-dark-1024.png`, `preview-missing-service.png` | Built local app after manual edit and optional-service failure |

Dialog inventory also includes matching `-footer.png` images to expose scrolling content, billing notices, source links, inactive controls and save/close actions. Header mark size/negative-space evidence from Task 3 remains `brand-mark-{light,dark}-{16,24,28}.png` and `brand-header-final.png`.

Representative images from every inventory family were opened with `view_image`, including both light/dark and phone/desktop examples, all three shelf views, valid/broken/no covers, checking, partial/review, conflict warning, stale/error, settings/backups, editor validation/reset, empty states and built preview. Text is readable, focused controls visible and source/billing explanations retained. Phone tables keep their existing internal horizontal scroll region; no page-wide scroll occurs. Extreme synthetic tokens can create tall rows/cards but remain readable with reachable actions. System fallback renders mixed-script glyphs outside the archived Latin font subset.

The keyboard check opens discovery with Enter, keeps AI unchecked, selects Book with Space, exposes the Save focus outline, and returns focus to the opener on Escape. It verifies zero check requests before explicit action and exactly one fake request afterward. The checking capture awaits a test-controlled promise rather than a sleep. Full regressions also cover migration, backup/recovery, facts/provenance persistence, consent, unknown results, conflicts and stale-response rejection.

## Rendered contrast

Ratios below come from the actual Chromium computed colors. The helper composites transparent/rgba backgrounds and disabled element opacity. Active text exceeds 4.5:1; sampled input boundaries and focus exceed 3:1. Rounded values are reported for readability; exact values are printed and attached by `identity.spec.ts`.

| Actual UI pair | Light | Dark |
| --- | ---: | ---: |
| Released badge | 6.644 | 6.148 |
| Scheduled badge | 5.600 | 7.267 |
| Announced badge | 5.009 | 7.605 |
| Not checked / not found badge | 4.786 | 8.903 |
| Primary button text | 7.001 | 9.867 |
| Input border / panel | 5.222 | 3.567 |
| Focus / panel | 7.638 | 8.327 |
| Focus / canvas | 7.001 | 9.867 |
| Validation error / dialog | 7.069 | 8.397 |
| Partial/failed heading and reason list | 13.378 | 10.483 |
| Partial/failed timestamp | 5.009 | 7.605 |
| Partial/failed explanatory paragraph | 4.666 | 6.376 |
| Storage warning and strong text | 5.009 | 7.605 |
| Partial review timestamp/explanation | 5.009 | 7.605 |
| Disabled primary text / composed button | 2.511 | 3.976 |

Disabled opacity remains the specified existing 0.55. Inactive controls are exempt from text contrast requirements and were visually inspected. This is focused identity verification, not a complete accessibility audit. The helper models current solid RGB/rgba surfaces and element opacity; newly introduced complex backgrounds or ancestor group opacity would need expanded measurement.

No real discovery provider was called, no AI billing occurred, and no production fixture or startup/storage/service configuration was changed. Independent Task 4 and whole-branch reviews are coordinated separately by the execution controller.
