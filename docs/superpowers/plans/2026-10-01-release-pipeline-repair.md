# Release and Cover Pipeline Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the verified identity, cover and publication-state failures while retaining honest unknowns and actionable source diagnostics.

**Architecture:** Keep a single verified work identity throughout retrieval, edition binding and cover selection. Add bounded primary-source interpretation and related-work review, reuse identity-bound image metadata, and share a request-scoped budget across discovery and later enrichment. Separate catalogue existence from publication evidence and preserve guarded manual acceptance.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Node.js native HTTP/fetch, tsx, Vitest and Playwright; no new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-01-release-pipeline-repair.md`

## Global Constraints

- Personal use on Windows with Node.js 22.13.1 or later and a desktop browser; support one active library tab.
- Keep React 19, TypeScript 5.8 and Vite 6; use npm and one committed package-lock.json.
- No new runtime dependencies, provider SDKs or server framework.
- Core tracking must work without network access once the local app is loaded.
- English only; book means the earliest supported ebook or print edition, and audio is independent.
- Prefer a supported date in the selected market; otherwise allow any supported market, independently for book and audio, and retain the actual source market.
- Discovery and cover retrieval are user-triggered; no requests on render, startup, page load or a scheduler.
- Keep per-release-check ceilings: Hardcover 1, Google Books 2, Apple combined API/page 12 including at most 6 HTML, Open Library 3, Tavily basic search 3, DeepSeek 1, overall deadline 180 seconds.
- Keep each metadata request bounded to 20 seconds and 1 MiB; keep AI at 45 seconds, 20,000 input bytes and 2,048 output tokens.
- No automatic retries, model repair, paid search, Extract, Crawl or Research calls.
- AI is disabled by default for every check; enabling it requires a visible token-billing notice and an explicit choice for that check.
- Keep secrets in Git-ignored service-only files; never put keys in VITE variables, browser storage, browser requests, logs, reports or backups.
- Bind discovery to 127.0.0.1:3001 and access it through the app's 127.0.0.1:3000 proxy; do not expose a LAN listener or wildcard CORS.
- Keep 30 source, 30 identity and 100 edition evidence caps; truncation must not erase identity ambiguity, conflicting dates or an earlier qualifying date.
- Persist accepted factual fields, citation links and check summaries only in the library; no raw provider bodies, prompts, unaccepted candidates or diagnostic traces in backups.
- Review each proposed field; never overwrite accepted facts merely because a provider fails or finds no match.
- Show mockups and obtain visual approval before changing the interface; backend work can proceed independently after plan approval.
- Do not use em dashes in source copy or documentation.
- Do not select Astra for a subagent unless the user specifically requests Astra.
- Use high reasoning effort only for implementation plans or specifications; use medium or lower for implementation, research, review and tests.

## Review Focus

- A provider can ignore its requested record limit; exact matches, ambiguity and conflict proof must survive bounded processing. Tested in Tasks 2 and 5.
- A late primary-source identity may arrive after catalogue noise fills source slots; enrich it within the original counters and retain its citation closure. Tested in Tasks 4 and 5.
- A valid cover can belong to an older book or an audiobook; a portrait ratio alone must not make it a next-book match. Tested in Tasks 7 and 9.
- A reviewed author edit or title acceptance can race an image request; stale replies must not change the edited library. Tested in Tasks 8 and 9.
- A clean check may have unknown facts, while a partial check may contain fully verified dates; status labels must report source coverage consistently. Tested in Tasks 6, 9 and 10 with Sun Eater and The Band controls.

---

## Execution boundary and scope

This document is planning only. The investigation added research scripts and evidence under `docs/investigations`; it did not repair production code or alter accepted library data. The repository had a clean baseline at investigation start. Concurrent edits appeared in App, useDiscovery, LibraryView, SeriesCard, SeriesTable, app.css and batch tests; inspect the current diff and preserve those edits before implementation.

There are three coupled delivery stages in one plan: trace/contracts, discovery correctness, then cover/review integration. They share work identity, acceptance and evidence contracts, so implementing separate independent pipelines would recreate the failure. Tasks 1 through 6 deliver independently testable backend behavior. Tasks 7 and 8 deliver the cover backend and correction contract. Task 9 is the visual approval and integration gate. Task 10 verifies the combined pipeline.

Default recommendation for later execution: Native, with one independent whole-branch review at the end, because the contracts and request-budget changes are tightly coupled. If the user chooses Subagent-driven, assign explicit file ownership, tell every worker that other edits must be preserved, and use medium or lower effort for implementation/review. Never choose Astra without an explicit request.

Before execution, inspect `git status --short`, applicable AGENTS.md files and active worktrees. Use the using-git-worktrees skill if isolation is needed, and reuse a suitable attached worktree. Do not create or switch a worktree as part of this planning task. Each task ends with named-path staging and a scoped commit; do not stage the entire tree or push automatically.

## File map

| File | Responsibility |
| --- | --- |
| `shared/discovery.ts`, `shared/discoveryValidation.ts` | Backward-readable API contracts for lifecycle and related review candidates. |
| `shared/covers.ts`, `shared/coverValidation.ts` (new) | Named cover request/candidate/result contracts and bounded parser. |
| `server/discovery/diagnostics.ts`, `http.ts` | Safe stable rejection and transport decisions. |
| `server/discovery/hardcover.ts` | Correct relationship semantics, format resolution and identity-bound image metadata. |
| `server/discovery/workIdentity.ts` (new) | Exact title/decorated-title binding shared by providers and covers. |
| `server/discovery/primarySources.ts` (new) | Supported primary-source extraction, separate related works. |
| `server/discovery/retrievalContext.ts` (new) | Per-check attempt ledger/cache, never global check data. |
| `server/discovery/catalogs.ts`, `runtime.ts`, `runDiscovery.ts`, `evidenceAllocation.ts` | Identity-first enrichment, source closure, budget continuity and image metadata retention. |
| `shared/discoveryPolicy.ts` | Lifecycle-aware release selection with existing date/conflict rules. |
| `server/discovery/coverCatalogs.ts`, `covers.ts` (new), `server.ts` | Service-side cover retrieval through existing credentials/transports. |
| `src/services/covers.ts`, `src/services/coverImages.ts` (new) | Local API client and cancellable browser image decode/geometry checks. |
| `src/components/CoverPicker.tsx`, `src/features/library/SeriesForm.tsx` | Named image review and reviewed author correction. |
| `src/features/discovery/DiscoveryDialog.tsx`, `DiscoverySummary.tsx`, `acceptDiscovery.ts`, `useDiscovery.ts` | Related work review, lifecycle labels, reused cover review and stale acceptance guards. |
| `src/features/library/model.ts`, `validation.ts`, `useLibrary.ts`, `progress.ts`, `releases.ts` | Version-3 migration, cover attribution/invalidation and compatible release display. |
| `src/storage/libraryStorage.ts`, `backup.ts` | Version-1/2 recovery and version-3 export with accepted facts only. |
| `tests/discovery/data/pipeline-repair/` (new) | Sanitized, compact regression fixtures derived from the fresh investigation. |
| `tests/discovery/*.test.ts`, `tests/covers.test.ts`, `tests/e2e/discovery.spec.ts`, `tests/e2e/library.spec.ts` | Owned behavioral gates. |
| `docs/discovery-usage.md`, `docs/phase-2-discovery-report.md` | Current operational behavior and measured limitations. |

### Task 1: Add traceable, bounded decision diagnostics

**Files:** Modify `server/discovery/diagnostics.ts`, `http.ts`, `hardcover.ts`, `catalogs.ts`, `runDiscovery.ts`; modify `tests/discovery/diagnostics.test.ts`, `http.test.ts`; create `tests/discovery/data/pipeline-repair/manifest.json`.

**Interfaces:** Extend `DiagnosticEvent` with optional `provider: Provider`, `recordRef: string`, `rule: DiagnosticRule`, `httpStatus: number`; preserve all existing required count/stage/category fields. `emitDiagnostic(observer, event): void` remains nonthrowing. Record references are provider IDs hashed to a hex digest, never raw titles, query strings or headers. New transport/cover stages are explicit enumerated values.

- [ ] **Step 1: Pin privacy and observational behavior with failing tests.** Add to the existing diagnostics test file:

```ts
test('records a fixed rejection without exposing arbitrary transport data', () => {
  const events: unknown[] = [];
  emitDiagnostic(e => events.push(e), {
    ...valid, provider: 'hardcover', rule: 'position-mismatch',
    recordRef: 'a'.repeat(32), httpStatus: 200,
    authorization: 'secret', rawBody: 'untrusted',
  } as typeof valid);
  expect(events).toEqual([{
    ...valid, provider: 'hardcover', rule: 'position-mismatch',
    recordRef: 'a'.repeat(32), httpStatus: 200,
  }]);
  expect(JSON.stringify(events)).not.toMatch(/secret|untrusted/);
});
test('throwing diagnostic observer cannot change a fixed decision', () => {
  expect(() => emitDiagnostic(() => { throw Error('observer'); }, valid)).not.toThrow();
});
```

- [ ] **Step 2: Run the red test.** `npm.cmd test -- tests/discovery/diagnostics.test.ts`. The new context assertion fails because the current emitter drops these fields. Existing observational tests must continue passing.

- [ ] **Step 3: Add fixed context parsing and emit decisions at their actual rejection sites.** Define the rule union once in diagnostics.ts:

```ts
export const diagnosticRules = [
  'http-quota', 'http-failure', 'no-match', 'author-mismatch',
  'series-mismatch', 'position-mismatch', 'compilation', 'placeholder-title',
  'ambiguous-work', 'edition-format', 'edition-language', 'unsupported-title',
  'citation-closure', 'evidence-bound', 'request-bound', 'image-geometry',
] as const;
export type DiagnosticRule = typeof diagnosticRules[number];
```

Copy only valid optional fields into the existing frozen safe event. Reject an invalid present optional field, just as an invalid present count is rejected. Provider must match the existing Provider union, recordRef `/^[a-f0-9]{32}$/`, status an integer 100 through 599, rule one of diagnosticRules. Add a transport outcome event after the actual HTTP response; no init headers or full URL are included. In Hardcover, split the current compound `continue` into named decision predicates with one stable rule per rejected row. In allocation, record the dropped closure's digest and `citation-closure` or `evidence-bound`, not a raw source. Keep 128 events per trace with a dropped count. Preserve the old aggregate events for compatibility.

```ts
const safeContext = {
  ...(event.provider === undefined ? {} : { provider: event.provider }),
  ...(event.rule === undefined ? {} : { rule: event.rule }),
  ...(event.recordRef === undefined ? {} : { recordRef: event.recordRef }),
  ...(event.httpStatus === undefined ? {} : { httpStatus: event.httpStatus }),
};
const safe = Object.freeze({ stage: event.stage, category: event.category,
  sources: event.sources, identities: event.identities, editions: event.editions,
  ...safeContext });
try { observer(safe); } catch { /* Observation cannot alter the check. */ }
```

Copy compact public API fixtures from the investigation into the new fixture directory, excluding descriptions, prices, preview URLs, credentials and unrelated records. Record each source artifact, retrieval timestamp, whether fixture fields are captured or synthetic, and expected rejected rule in manifest.json. Macmillan HTTP 403 bodies cannot be fixtures for successful publisher content. Use clearly synthetic parser samples for that shape.

- [ ] **Step 4: Run green tests.** `npm.cmd test -- tests/discovery/diagnostics.test.ts tests/discovery/http.test.ts`. Verify the old exact-event tests still pass, rejected inputs never leak data, and a throwing observer preserves response and usage.
- [ ] **Step 5: Commit.** Stage only the named Task 1 production/test paths and the new fixture directory; commit `feat: explain provider and evidence rejection decisions`.

### Task 2: Fix Hardcover membership and format semantics

**Files:** Modify `server/discovery/hardcover.ts`, `tests/discovery/hardcover.test.ts`; add `tests/discovery/data/pipeline-repair/malazan-hardcover.json` and `placeholder-hardcover.json`.

**Interfaces:** Preserve `normalizeHardcover(input, request, checkedAt): EvidenceBundle`. Add `isPlaceholderTitle(title: string): boolean` exported from `workIdentity.ts` in Task 3, initially local in this task and moved there in Task 3. Add optional observer argument after checkedAt. Return the same datedness behavior: Hardcover dates remain null. Work image metadata is a separate sidecar introduced in Task 7.

- [ ] **Step 1: Add the recorded failing identity test.** Import readFileSync and normalizeHardcover in the existing test file:

```ts
test('Blood and Bone is position 5 when series is not featured on the book', () => {
  const raw = JSON.parse(readFileSync(new URL(
    './data/pipeline-repair/malazan-hardcover.json', import.meta.url), 'utf8'));
  const target = request({ target: { series: 'Novels of the Malazan Empire',
    author: 'Ian C. Esslemont', position: 5, title: '', orderNote: '' } });
  const evidence = normalizeHardcover(raw, target, checkedAt);
  expect(evidence.identities.map(i => i.title)).toEqual(['Blood and Bone']);
  expect(evidence.editions.every(e => e.date === null)).toBe(true);
});
```

The existing Hardcover tests have a local `req`, not the fixtures request helper; import `request` from `./fixtures` for this new test. Add mutations for wrong author role, wrong position, compilation, fractional companion, duplicate different title and placeholder Untitled. Each mutation must independently block the corresponding result. Add explicit Read plus missing raw physical format, and conflicting Ebook plus Read.

- [ ] **Step 2: Run red.** `npm.cmd test -- tests/discovery/hardcover.test.ts`. The recorded position-5 case fails under `row.featured !== true`.
- [ ] **Step 3: Correct the predicates and query overflow handling.** Remove `featured` from acceptance, retaining it only as diagnostic metadata. Maintain literal alias membership, exact author-role matching, position, compilation and qualifying edition conditions. Reject explicit partial-work markers if present. Reject placeholder title before emission:

```ts
const isPlaceholderTitle = (title: string) =>
  /^(?:untitled|tba|tbd|to be announced)(?:\s*\([^)]*\))?$/i.test(title.trim());
// Add to the existing guard after title validation:
if (isPlaceholderTitle(title)) continue;
// Delete only this old guard term: row.featured !== true.
```

For physical format, distinguish absent raw format from an explicit conflicting raw format:

```ts
if (readingValue === 'read') {
  if (literalFormat === 'print') return 'print';
  if (raw.edition_format === null || raw.edition_format === undefined ||
      raw.edition_format === '') return 'print';
  return null;
}
return literalFormat && readingFormat && literalFormat !== readingFormat
  ? null : literalFormat ?? readingFormat;
```

Handle the six-series sentinel deliberately. Add `$author: String!` and constrain the series query at the provider, not just after truncation:

```graphql
series(where: {name: {_in: $names}, author: {name: {_eq: $author}}},
  order_by: {id: asc}, limit: 6) {
  id name author { name }
  book_series(where: {position: {_eq: $position}}, limit: 21) {
    id position featured compilation details
    book { id slug title compilation }
  }
}
```

The shown selection is the changed series/relationship portion; preserve the existing book contributions and English-edition selection verbatim beneath book. Pass only the request's author as the variable. Check returned aliases and author again. If six rows still arrive, emit a request-bound diagnostic and keep autonomous identity unresolved regardless of how many survive local filtering, because a seventh plausible match is unknown. Do not let unrelated unfiltered catalogue noise exhaust the series sentinel. Bound nested editions with sentinel accounting too; retained edition omissions must be visible and cannot turn two identities into one.

- [ ] **Step 4: Run green.** `npm.cmd test -- tests/discovery/hardcover.test.ts tests/discovery/runtime.test.ts`. Assert the transport sends the author constraint. A below-sentinel single qualifying work succeeds; six-row responses containing five unrelated authors plus one requested author, or six plausible requested-author rows, remain bounded/unresolved rather than proving an arbitrary survivor.
- [ ] **Step 5: Commit named Task 2 paths.** `fix: use Hardcover series relationship evidence correctly`.

### Task 3: Share strict title binding across editions and images

**Files:** Create `server/discovery/workIdentity.ts`, `tests/discovery/work-identity.test.ts`; modify `applePages.ts`, `googleBooks.ts`, `hardcover.ts`; modify `tests/discovery/apple-pages.test.ts`.

**Interfaces:** `bindWorkTitle(actual: string, request: CheckRequest): string | null` consumes a known canonical target and request-derived series aliases. It returns only that canonical title or null. `isPlaceholderTitle(title: string): boolean` owns placeholder detection. Existing ordinal parsing stays in seriesOrder.ts. Author verification remains a caller precondition and is explicitly enforced in appleCanonicalTitle before calling bindWorkTitle.

- [ ] **Step 1: Add exact positive and negative tests.**

```ts
import { expect, test } from 'vitest';
import { request } from './fixtures';
import { bindWorkTitle } from '../../server/discovery/workIdentity';
const req = request({ target: { series: 'Book of the Dead', author: 'RinoZ',
  position: 5, title: 'Ascension', orderNote: '' } });
test('binds the explicit numbered Ascension audio decoration', () => {
  expect(bindWorkTitle('Ascension: A LitRPG Adventure (Book of the Dead 5) (Unabridged)', req)).toBe('Ascension');
});
test.each([
  'Ascension: A LitRPG Adventure (Book of the Dead 4) (Unabridged)',
  'Ascension: A LitRPG Adventure (Other Series 5) (Unabridged)',
  'Other Ascension: A LitRPG Adventure (Book of the Dead 5) (Unabridged)',
])('does not accept a different work or position: %s', actual => {
  expect(bindWorkTitle(actual, req)).toBeNull();
});
```

- [ ] **Step 2: Run red.** `npm.cmd test -- tests/discovery/work-identity.test.ts`. Expected missing module/function, then the unsupported positive grammar.
- [ ] **Step 3: Implement anchored request-derived labels and reuse them.**

```ts
import type { CheckRequest } from '../../shared/discovery';
import { normalizeIdentity } from '../../shared/discoveryPolicy';
import { orderedTitle, seriesBase } from './seriesOrder';
export function hardcoverAliases(series: string): string[] {
  const original = series.trim();
  const base = seriesBase(original);
  return [...new Set([original, original.replace(/^the\s+/i, ''), base,
    `The ${base}`, `${base} Series`, `${base} Mysteries`, `${base} Trilogy`,
    `Tales of ${base}`].filter(Boolean))].slice(0, 8);
}
export const isPlaceholderTitle = (title: string) =>
  /^(?:untitled|tba|tbd|to be announced)(?:\s*\([^)]*\))?$/i.test(title.trim());
export function bindWorkTitle(actual: string, request: CheckRequest): string | null {
  const canonical = request.target.title.trim();
  if (!canonical || isPlaceholderTitle(canonical)) return null;
  const normalized = normalizeIdentity(actual);
  const labels = [canonical, `${canonical} (Unabridged)`];
  const ordinal = orderedTitle(actual, request);
  if (ordinal && normalizeIdentity(ordinal.title) === normalizeIdentity(canonical)) return canonical;
  for (const series of hardcoverAliases(request.target.series)) {
    labels.push(`${canonical}: ${series}, Book ${request.target.position} (Unabridged)`);
    labels.push(`${canonical}: A LitRPG Adventure (${series} ${request.target.position}) (Unabridged)`);
  }
  return labels.some(label => normalizeIdentity(label) === normalized) ? canonical : null;
}
```

Avoid a circular import when moving placeholder detection: move request-derived aliases from hardcover.ts into workIdentity.ts, re-export `hardcoverAliases` from hardcover.ts for existing callers, and have workIdentity.ts import only seriesOrder.ts and shared types/policy. In appleCanonicalTitle, require exact author first, call binding only for a supported format, and retain all existing ebook/audio constraints. Carry raw display title and binding citations in source text when normalizing to canonical title; do not rewrite provider facts without traceable proof. Google identity discovery still needs explicit ordinal evidence independently of this known-title helper.

- [ ] **Step 4: Run green and a recorded Ascension replay.** `npm.cmd test -- tests/discovery/work-identity.test.ts tests/discovery/apple-pages.test.ts tests/discovery/google-books.test.ts`. Add the captured Apple API row and successful product HTML stripped to the relevant product schema/language/date sections. Assert language is unknown before hydration, English afterward, and date stays 2026-08-19. Wrong author, wrong product ID, landscape unrelated product, wrong market and French page all fail.
- [ ] **Step 5: Commit named Task 3 paths.** `fix: bind numbered provider title decorations to the exact work`.

### Task 4: Interpret supported primary sources and expose related works

**Files:** Create `server/discovery/primarySources.ts`, `tests/discovery/primary-sources.test.ts`; modify `shared/discovery.ts`, `discoveryValidation.ts`, `server/discovery/search.ts`, `runDiscovery.ts`, `evidenceAllocation.ts`, `sourceExcerpt.ts`; modify `tests/discovery/contracts.test.ts`, `search.test.ts`, `source-excerpt.test.ts`.

**Interfaces:** Add optional `related: RelatedWorkEvidence[]` to EvidenceBundle and `related: RelatedWorkEvidence[]` to Proposals, defaulting to empty during parsing old payloads. Define:

```ts
export interface RelatedWorkEvidence {
  title: string; author: string;
  relationship: 'prequel' | 'continuation';
  position: null; citations: Citation[];
}
```

`interpretPrimarySources(request: CheckRequest, evidence: EvidenceBundle): EvidenceBundle` returns original sources plus supported numbered identities/related candidates. `parseNumberedPrimary(source: Source, request: CheckRequest): IdentityEvidence | null` handles only supported host-specific product blocks. `parseRelatedPrimary(source: Source, request: CheckRequest): RelatedWorkEvidence | null` never emits numbered identity. Parser outputs must pass parseExtraction literal-quote validation.

- [ ] **Step 1: Write tests using synthetic primary blocks and real source URLs.**

```ts
test('publisher volume proof supplies identity despite absent catalog order', () => {
  const req = request({ target: { series: 'Novels of the Malazan Empire',
    author: 'Ian C. Esslemont', position: 5, title: '', orderNote: '' } });
  const source = { id: 'publisher', title: 'Blood and Bone', provider: 'tavily' as const,
    market: null, retrievedAt: checkedAt,
    url: 'https://us.macmillan.com/books/9781429943635/bloodandbone/',
    text: 'Blood and Bone\nA Novel of the Malazan Empire\nNovels of the Malazan Empire (Volume 5)\nAuthor: Ian C. Esslemont\nBook Details' };
  expect(parseNumberedPrimary(source, req)).toMatchObject({ title: 'Blood and Bone', position: 5 });
});
test('related candidates cannot supply integer sequel identity', () => {
  const candidate: RelatedWorkEvidence = { title: "The Daughters' War",
    author: 'Christopher Buehlman', relationship: 'prequel', position: null,
    citations: [{ sourceId: 's1', quote: 'Prequel' }] };
  const req = request({ target: { series: 'Blacktongue', author: candidate.author,
    position: 2, title: '', orderNote: '' } });
  const e = { ...bundle([]), related: [candidate] };
  expect(selectProposals(req, e, checkedAt).identity).toBeNull();
});
```

Define `checkedAt` locally as `2026-10-02T00:00:00Z`; import request/bundle and the declared types/functions. Add adversarial fixtures with the correct title in Recommended Books, an unrelated author elsewhere on the page, a quoted review containing Volume 5, embedded instructions, and a nonprimary host. All must fail numbered extraction.

- [ ] **Step 2: Run red.** `npm.cmd test -- tests/discovery/primary-sources.test.ts tests/discovery/contracts.test.ts`.
- [ ] **Step 3: Add exact host/block parsers and integrate before bounding.** Start with this Macmillan product-header grammar, bounded before Book Details:

```ts
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const block = source.text.split(/\nBook Details\b/)[0].trim();
const pattern = new RegExp(`^([^\\n]+)\\n(?:[^\\n]+\\n)?${escape(request.target.series)} \\(Volume ${request.target.position}\\)\\nAuthor: ${escape(request.target.author)}$`, 'i');
const matched = pattern.exec(block);
if (new URL(source.url).hostname === 'us.macmillan.com' && matched) {
  return { title: matched[1].trim(), author: request.target.author,
    position: request.target.position, citations: [{ sourceId: source.id, quote: block }] };
}
```

For Aethon, require the same product block's heading `Exact Series N: Title`, series field `Exact Series Book N` and `By Exact Author`, and exclude the complete-series/recommendation sections. For Pike related articles, require its actual site masthead to agree with the requested author, the article heading naming the candidate and a sentence linking it to the requested series; emit only the continuation relationship. For Macmillan prequels, require product heading, explicit author and publisher relationship sentence referencing the requested known series/work. Quote only exact source substrings under the existing 600-character citation bound; split longer verified blocks into multiple citations. Unsupported text shapes remain reviewable source links.

Remap related citations in validatedBundle, merge and AI-preservation paths. Add the related collection to parseExtraction's optional fields and quote-containment loop; reject non-null positions, more than six candidates and unrelated author claims. Add it to response parsing with full attribution/source checks. Keep AI output schema at identities/editions; do not ask AI to invent relations. Reserve supported primary numbered and related source closures before generic prose/editions. Parse a search bundle before `bound`, not after its source was discarded.

In shared/discoveryPolicy.ts, add this selector for already validated relationship evidence, and include its return value in Proposals.related. A relation never enters identity selection or release-title narrowing:

```ts
export function selectRelatedWorks(request: CheckRequest, evidence: EvidenceBundle): RelatedWorkEvidence[] {
  const sourceIds = new Set(evidence.sources.map(source => source.id));
  const seen = new Set<string>();
  return (evidence.related ?? []).filter(item => {
    const key = `${normalizeIdentity(item.title)}:${item.relationship}`;
    if (item.position !== null || normalizeIdentity(item.author) !== normalizeIdentity(request.target.author) ||
        !item.citations.length || item.citations.some(citation => !sourceIds.has(citation.sourceId)) || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}
```

Add shared/discoveryPolicy.ts and tests/discovery/policy.test.ts to this task's owned paths. Import RelatedWorkEvidence from shared/discovery.ts alongside its existing CheckRequest/EvidenceBundle types. The parser and protected allocation closure must suppress conflicting relation claims rather than allowing the six-item cap to hide ambiguity.

Use the remaining search slots for a primary-host query derived from the requested author/series when identity remains unresolved; no hardcoded candidate titles. A targeted primary query still counts against Tavily 3. Do not assert Crypt Currency appears in the current production searches: the fresh searches did not retrieve its official announcement. This task adds a bounded retrieval route and parser, not a seeded answer.

- [ ] **Step 4: Run green.** `npm.cmd test -- tests/discovery/primary-sources.test.ts tests/discovery/contracts.test.ts tests/discovery/search.test.ts tests/discovery/source-excerpt.test.ts tests/discovery/allocation-retention.test.ts`. Assert related candidates cannot enter normal numbered acceptance and that custom order notes remain manual-only.
- [ ] **Step 5: Commit named Task 4 paths.** `feat: review primary-source identities and related works without AI`.

### Task 5: Preserve budgets and evidence across late identity enrichment

**Files:** Create `server/discovery/retrievalContext.ts`, `tests/discovery/retrieval-context.test.ts`; modify `catalogs.ts`, `runtime.ts`, `runDiscovery.ts`, `evidenceAllocation.ts`; modify `tests/discovery/pipeline.test.ts`, `runtime.test.ts`, `allocation-retention.test.ts`.

**Interfaces:** `createRetrievalContext(): RetrievalContext` is called once inside runDiscovery. Pass it as the fourth argument to runtime catalogs, with an explicit `phase: 'initial' | 'enrich'` fifth argument. It contains mutable attempt ledger, metadata query promise cache and Apple HTML-start count. `CatalogResult.usage` reports the aggregate snapshot, not a newly reset counter. Enrichment uses a supported title but retains original request intent for identity/ambiguity selection.

- [ ] **Step 1: Pin counter continuity and conflict preservation.**

```ts
test('one ledger cannot spend a second Hardcover request or a third Google request', () => {
  const ctx = createRetrievalContext();
  expect(ctx.claim('hardcover')).toBe(true);
  expect(ctx.claim('hardcover')).toBe(false);
  expect(ctx.claim('googlebooks')).toBe(true);
  expect(ctx.claim('googlebooks')).toBe(true);
  expect(ctx.claim('googlebooks')).toBe(false);
});
```

Add an integration scenario with 30 unrelated initial catalogue sources, a late explicitly numbered primary identity, and a dated English exact-title Apple edition. Require the identity/date closures to survive, request counts to stay under original ceilings and no automatic retries. Add a competing identity and a conflicting earlier date; neither may disappear merely because enrichment narrowed the query.

- [ ] **Step 2: Run red.** `npm.cmd test -- tests/discovery/retrieval-context.test.ts tests/discovery/pipeline.test.ts`.
- [ ] **Step 3: Implement the ledger and title enrichment.**

```ts
import type { Provider } from '../../shared/discovery';
const caps: Record<Provider, number> = {
  hardcover: 1, googlebooks: 2, apple: 12, openlibrary: 3, tavily: 3, deepseek: 1,
};
export function createRetrievalContext() {
  const counts = Object.fromEntries(Object.keys(caps).map(p => [p, 0])) as Record<Provider, number>;
  const cache = new Map<string, Promise<unknown>>();
  let htmlStarts = 0;
  return {
    cache,
    claim(provider: Provider, html = false): boolean {
      if ((html && provider !== 'apple') || counts[provider] >= caps[provider] || (html && htmlStarts >= 6)) return false;
      counts[provider]++;
      if (html) htmlStarts++;
      return true;
    },
    snapshot: () => ({ ...counts }),
  };
}
export type RetrievalContext = ReturnType<typeof createRetrievalContext>;
```

Claim only at actual queue transport start. Check cached requests before claiming. In initial runtime catalogs, claim Hardcover once; in enrich, skip Hardcover and reuse the supported identity already retained. Apple API and HTML share the same `apple` ledger and HTML subcap. Preserve queues as provider-global, and pass the original combined abort/deadline signal everywhere. Do not add request cache keys, URLs containing keys or ledger internals to public responses.

After an identity is newly established by primary-source search, call the enrichment phase once for that canonical identity with the same context. Rebuild remaining search queries afterward. Track identities already enriched so repeated same-title evidence cannot cause another pass. Verify unknown original targets still compare all identity alternatives, not merely the enrichment target.

At allocation, filter exact author/known work/requested formats before singleton ranking. Retain identity alternatives and date-conflict groups as complete closures. Reserve supported primary order and related-work closures before undated generic editions. If all alternatives cannot fit, explicitly suppress that fact and emit its rule; do not keep one arbitrary survivor. An over-limit Apple record response is processed with deterministic bounded relevance grouping and an overflow marker, preserving exact target/conflict alternatives or suppressing the affected fact when completeness cannot be established.

- [ ] **Step 4: Run green.** `npm.cmd test -- tests/discovery/retrieval-context.test.ts tests/discovery/pipeline.test.ts tests/discovery/runtime.test.ts tests/discovery/allocation-retention.test.ts tests/discovery/catalogs.test.ts`. Include a 22-record Apple fixture, preferred-market conflict and cancelled enrichment. Assert actual starts equal usage and never exceed ceilings.
- [ ] **Step 5: Commit named Task 5 paths.** `fix: enrich verified identities within one bounded check context`.

### Task 6: Separate catalogued editions from publication announcements

**Files:** Modify `shared/discovery.ts`, `discoveryValidation.ts`, `discoveryPolicy.ts`, `server/discovery/hardcover.ts`, `catalogs.ts`, `applePages.ts`, `googleBooks.ts`; modify `tests/discovery/policy.test.ts`, `contracts.test.ts`, `hardcover.test.ts`.

**Interfaces:** Add optional `publication: 'catalogued' | 'announced' | 'published'` to EditionEvidence, parsed as catalogued when absent. New emitted adapters always set it explicitly. Extend ReleaseProposal.state with `catalogued` and `released`. Keep scheduled exact-day behavior; released/null requires explicit publication evidence with English/format/market verification. Provenance retains actual source links and precision.

- [ ] **Step 1: Write lifecycle selection tests.**

```ts
test('an undated Hardcover edition is catalogued, not announced', () => {
  const e = edition({ date: null, precision: 'none', publication: 'catalogued' });
  const p = selectProposals(request(), bundle([e]), at);
  expect(p.releases.book).toMatchObject({ state: 'catalogued', date: null });
});
test('an explicitly published English edition can be released without a day', () => {
  const e = edition({ date: null, precision: 'none', publication: 'published' });
  expect(selectProposals(request(), bundle([e]), at).releases.book)
    .toMatchObject({ state: 'released', date: null });
});
test('a format announcement remains announced when no day is supported', () => {
  const e = edition({ date: null, precision: 'none', publication: 'announced' });
  expect(selectProposals(request(), bundle([e]), at).releases.book?.state).toBe('announced');
});
```

Add missing-language, ambiguous-format, unknown-market and contradictory same-edition tests. Publication state cannot bypass any existing evidence filter or conflict. Older evidence with no publication field must not infer announced merely because its date is null.

- [ ] **Step 2: Run red.** `npm.cmd test -- tests/discovery/policy.test.ts tests/discovery/contracts.test.ts`.
- [ ] **Step 3: Update the selector and adapters.** Keep exact-day selection first. For undated eligible evidence, prefer explicit published over announced over catalogued within the existing market/ranking logic. Use:

```ts
const exact = chosen.precision === 'day' && chosen.date !== null;
const state = exact ? 'scheduled'
  : chosen.publication === 'published' ? 'released'
  : chosen.publication === 'announced' ? 'announced' : 'catalogued';
```

Hardcover always emits publication catalogued. Apple product extraction emits published only for the bound same-product RELEASED block, and announced only for an explicit same-format preorder/announcement. Exact future/past API dates retain scheduled storage as before. Google publication metadata does not assert stock or a market date; a supported format-specific partial-date announcement may set announced, while ordinary incomplete bibliographic metadata remains catalogued. Extend request/response validators and AI normalization to preserve allowed values; omitted AI fields are catalogued, never an inferred future announcement. In runDiscovery's provenance matching, include publication equality when undated records otherwise have identical citations/edition keys.

- [ ] **Step 4: Run green.** `npm.cmd test -- tests/discovery/policy.test.ts tests/discovery/contracts.test.ts tests/discovery/hardcover.test.ts tests/discovery/apple-pages.test.ts tests/discovery/pipeline.test.ts`. Confirm captured Ascension audio becomes dated only after valid hydration, and catalogue-only book evidence remains catalogued. Add a clean unknown-identity check and a partial check with supported dates to preserve status semantics.
- [ ] **Step 5: Commit named Task 6 paths.** `fix: distinguish catalogue evidence from publication status`.

### Task 7: Retrieve structured covers through the local service

**Files:** Create `shared/covers.ts`, `shared/coverValidation.ts`, `server/discovery/coverCatalogs.ts`, `server/discovery/covers.ts`, `src/services/coverImages.ts`, `tests/discovery/cover-catalogs.test.ts`; modify `server/discovery/server.ts`, `http.ts`, `runtime.ts`, `catalogs.ts`, `hardcover.ts`, `googleBooks.ts`, `src/services/covers.ts`, `tests/covers.test.ts`, `tests/discovery/server.test.ts`.

**Interfaces:**

```ts
export interface CoverRequest {
  requestId: string; seriesId: string;
  series: string; author: string; nextTitle: string; position: number;
  previousTitle: string | null; preferredMarket: string;
}
export interface CoverCandidate {
  id: string; title: string; author: string;
  role: 'next' | 'previous'; format: 'ebook' | 'print' | 'audio';
  provider: 'apple' | 'hardcover' | 'googlebooks' | 'openlibrary';
  source: SourceLink; imageUrl: string;
  workKey: string; editionKey: string | null;
  width: number | null; height: number | null;
}
export interface AuthorSuggestion {
  author: string; title: string; source: SourceLink;
}
export interface CoverResult {
  requestId: string; seriesId: string; candidates: CoverCandidate[];
  authorSuggestions: AuthorSuggestion[];
  outcomes: { provider: CoverCandidate['provider']; state: 'ok' | 'no-match' | 'quota' | 'failed' }[];
}
```

Import SourceLink from discovery.ts. `collectCoverCandidates(request, config, signal, fetcher): Promise<CoverResult>` uses native bounded provider transport. `fetchCoverCandidates(request, signal): Promise<CoverResult>` calls `/api/discovery/covers`, never Google directly. `decodeCover(candidate, signal): Promise<CoverCandidate | null>` validates loaded dimensions client-side. `isPortrait(width, height): boolean` is a pure helper.

- [ ] **Step 1: Pin exact target and image geometry.** Add pure image tests:

```ts
test.each([[400, 400, false], [1200, 630, false], [1617, 2560, true], [65, 100, true]])(
  'checks decoded portrait dimensions %d x %d', (width, height, expected) => {
    expect(isPortrait(width, height)).toBe(expected);
  });
```

Add service fixtures with NextBook, PreviousBook, a different-author NextBook, a square audio image, an Apple exact-work ebook image and the captured Ascension Hardcover cached_image. Require named next/previous roles, no cross-author selection and source URLs. A reused release image must carry the same bound work/edition, not merely the same provider hostname. A metadata-only width/height assertion cannot skip client decoding.

- [ ] **Step 2: Run red.** `npm.cmd test -- tests/covers.test.ts tests/discovery/cover-catalogs.test.ts tests/discovery/server.test.ts`.
- [ ] **Step 3: Implement the bounded endpoint and replace the unlabelled URL service.** The cover route uses the existing host, origin, body-size, busy-lock, method and abort guards. Validate URLs only from the observed image hosts: `covers.openlibrary.org`, `books.google.com`, `books.googleusercontent.com`, `assets.hardcover.app` and `is1-ssl.mzstatic.com` through `is5-ssl.mzstatic.com`. Reject credentials, fragments, non-HTTPS URLs, private addresses and unexpected hostnames. HTTPS-upgrade only explicitly known Google image URLs, preserving query parameters; do not append guessed zoom/dimension transforms.

Use a separate cover budget of Hardcover 1, Google 2, Apple 2, Open Library 2. Retrieve exact next title first; previous title only as its own labelled group. A series query can discover leads but cannot produce a next cover without validated work identity. Preserve actual provider title/author and edition IDs before extracting image fields. Include `cached_image` in Hardcover's already-budgeted identity request and keep image metadata as a sidecar in release responses; adding its image field must not discard otherwise valid identities if image metadata is missing. Apple ebook artwork is eligible; audio art is separately labelled. Use Google volumeInfo.imageLinks with server credentials and known author/title checks. Include Open Library title/author/cover_edition_key/cover_i fields.

Define the geometry helper exactly:

```ts
export function isPortrait(width: number, height: number): boolean {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 &&
    width / height >= 0.45 && width / height <= 0.85;
}
```

Use this abortable image decoder after URL/work validation:

```ts
export function decodeCover(candidate: CoverCandidate, signal: AbortSignal): Promise<CoverCandidate | null> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(null); return; }
    const image = new Image();
    let done = false;
    const finish = (value: CoverCandidate | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      image.onload = null;
      image.onerror = null;
      if (!value) image.src = '';
      resolve(value);
    };
    const abort = () => finish(null);
    const timer = setTimeout(abort, 10000);
    signal.addEventListener('abort', abort, { once: true });
    image.onerror = abort;
    image.onload = () => {
      const width = image.naturalWidth, height = image.naturalHeight;
      const audioSquare = candidate.format === 'audio' && width > 0 && width === height;
      finish(isPortrait(width, height) || audioSquare ? { ...candidate, width, height } : null);
    };
    image.src = candidate.imageUrl;
  });
}
```

Never persist or select a failed decode. Validate at most nine images. Rank correct next-book portrait candidates before previous-book alternatives, then high resolution before low resolution. Do not strip the audio label after ranking. Square audio choices are reviewable audio artwork only, not eligible for the portrait book card's selection action.

Add optional `coverCandidates` to CheckResponse with at most nine schema-validated, exact-work candidates, defaulting to empty in old responses. Reuse only the current review session's structured artwork. Unaccepted cover candidates are not part of persisted CheckSummary or backups.

- [ ] **Step 4: Run green.** `npm.cmd test -- tests/covers.test.ts tests/discovery/cover-catalogs.test.ts tests/discovery/server.test.ts tests/discovery/client.test.ts tests/discovery/http.test.ts`. Verify no-key Google capability disables that provider, missing providers do not erase valid others, empty results plus quota produce an incomplete outcome, and no request fires on render.
- [ ] **Step 5: Commit named Task 7 paths.** `feat: bind cover retrieval to verified works and provider credentials`.

### Task 8: Offer author corrections without silently accepting them

**Files:** Modify `server/discovery/coverCatalogs.ts`, `shared/coverValidation.ts`, `src/services/covers.ts`; modify `tests/discovery/cover-catalogs.test.ts`, `tests/covers.test.ts`. UI belongs to Task 9.

**Interfaces:** `AuthorSuggestion` from Task 7 is returned separately from eligible candidates. A mismatch from a title-only fallback cannot enter `candidates`. Exact-author retrieval consumes the first Google/Open Library slot; one title-only fallback may consume the remaining slot, within each provider's two-call cap. No global typo map or edit occurs on the server.

- [ ] **Step 1: Add the recorded spelling differential and unrelated-book control.**

```ts
test('a title-only correction is a suggestion, not a verified cover', async () => {
  const req: CoverRequest = { requestId: 'correction', seriesId: 'ana',
    series: 'Ana and Din Mysteries', author: 'Robert Jackson Benett',
    nextTitle: '', position: 4, previousTitle: 'A Trade of Blood', preferredMarket: 'US' };
  const fetcher = vi.fn<typeof fetch>(async input => {
    const url = new URL(String(input));
    return Response.json(url.searchParams.has('author') ? { docs: [] } : {
      docs: [{ key: '/works/OL1W', title: 'A Trade of Blood',
        author_name: ['Robert Jackson Bennett'], cover_i: 15249591 }],
    });
  });
  const result = await collectCoverCandidates(req,
    { tavilyKey: null, deepseekKey: null, model: 'deepseek-flash' },
    new AbortController().signal, fetcher);
  expect(result.candidates).toEqual([]);
  expect(result.authorSuggestions).toMatchObject([{ author: 'Robert Jackson Bennett', title: 'A Trade of Blood' }]);
  expect(req.author).toBe('Robert Jackson Benett');
});
```

- [ ] **Step 2: Run red.** `npm.cmd test -- tests/discovery/cover-catalogs.test.ts`.
- [ ] **Step 3: Implement title-only fallback and exact-title suggestion validation.** Only run fallback when a known next/previous title has no exact-author candidate, never on a broad series-only search. Require exact bound title and a single explicit author. Separate mismatches from eligible covers:

```ts
if (normalizeIdentity(row.title) !== normalizeIdentity(searchedTitle)) continue;
if (row.authors.length !== 1) continue;
if (normalizeIdentity(row.authors[0]) !== normalizeIdentity(request.author)) {
  authorSuggestions.push({ author: row.authors[0], title: row.title, source: row.source });
  continue;
}
```

Normalize each provider row to `{title, authors, source, image}` before this branch. Deduplicate suggestions by normalized author/title, cap at three, retain provider source attribution and permit no broad fuzzy matching. Foundryside cannot suggest an author for A Trade of Blood. Both Wil and Will Wight empty results remain no-match; do not manufacture a correction.

- [ ] **Step 4: Run green.** `npm.cmd test -- tests/discovery/cover-catalogs.test.ts tests/covers.test.ts`. Assert no correction changes release identity or stored author and that fallback attempts remain within the same ledger.
- [ ] **Step 5: Commit named Task 8 paths.** `feat: review author spelling suggestions from exact book metadata`.

### Task 9: Review UI, compatibility and stale cover guards

**Files:** Create `docs/mockups/pipeline-repair-review-a.html`, `docs/mockups/pipeline-repair-review-b.html`; modify `src/components/CoverPicker.tsx`, `src/features/library/SeriesForm.tsx`, `src/features/library/model.ts`, `src/features/library/validation.ts`, `src/features/library/useLibrary.ts`, `src/features/library/progress.ts`, `src/features/library/releases.ts`, `src/features/discovery/DiscoveryDialog.tsx`, `src/features/discovery/DiscoverySummary.tsx`, `src/features/discovery/useDiscovery.ts`, `src/features/discovery/acceptDiscovery.ts`, `src/storage/libraryStorage.ts`, `src/storage/backup.ts`; modify `tests/fixtures.ts`, `tests/backups.test.tsx`, `tests/storage.test.ts`, `tests/domain.test.ts`, `tests/release-display.test.tsx`, `tests/discovery/acceptance.test.ts`, `tests/discovery/dialog.test.tsx`; create `tests/cover-picker.test.tsx`.

**Interfaces:** Version-3 Series retains `coverUrl` and adds nullable `coverAttribution: {title: string; author: string; role: 'next' | 'previous'; source: SourceLink; editionKey: string | null} | null`. Version-1/2 import defaults attribution to null and preserves coverUrl. Add `catalogued` to ReleaseState and supported parsing/display maps. `applyDiscovery` accepts only selected fields from a current snapshot; related candidates are excluded. Extend Selection with optional cover candidate ID, defaulting to no cover selection. An author suggestion edits the existing form's draft; saving uses existing updateSeries confirmation/invalidation behavior.

- [ ] **Step 1: Produce two static directions before editing product UI.** Direction A keeps the existing comparison rows and adds Related works and named cover choices below; direction B uses a staged work/format/cover review. Both show: Daughters' War as Prequel with no numbered acceptance checkbox, Crypt Currency as Unnumbered continuation, a Benett/Bennett author suggestion, Heretics portrait versus labelled Devils audio square, Catalogue edition/release unverified copy, and partial versus complete coverage explanations. No mockup makes network calls. Preserve the existing selected SeriesTrackr identity and typography. Present the actual mockups for review and wait for the user's visual selection. This gate comes from the spec's existing interface approval requirement; backend work does not require repeating that visual approval.

- [ ] **Step 2: Add meaningful UI/migration tests after selection.**

```ts
import { emptyDocument } from '../../src/features/library/model';
import { parseDocument } from '../../src/features/library/validation';
import { seriesFixture } from '../fixtures';

test('v2 import preserves manually chosen cover and accepted release facts', () => {
  const old = { ...emptyDocument(), version: 2,
    series: [seriesFixture({ coverUrl: 'https://example.com/manual.jpg' })] };
  delete (old.series[0] as Partial<typeof old.series[0]>).coverAttribution;
  const parsed = parseDocument(old);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.value.version).toBe(3);
  expect(parsed.value.series[0].coverUrl).toBe(old.series[0].coverUrl);
  expect(parsed.value.series[0].coverAttribution).toBeNull();
  expect(parsed.value.series[0].releases).toEqual(old.series[0].releases);
});
```

Place this migration test in `tests/discovery/acceptance.test.ts` with the shown import paths. Add `coverAttribution: null` to the shared `tests/fixtures.ts` series factory when the version-3 model makes that field required. Use existing domain helpers to set an accepted release fact in the fixture as a separate preservation assertion. Add interaction tests that click named cover choices, reject square book candidates, edit author while a request is pending, change next title during image decode, close a dialog before response, recover/import v1/v2 and undo an accepted cover. Assert no stale response can select/commit an image, no automatic request on mount and unaccepted related/diagnostic data absent from exports.

- [ ] **Step 3: Run red.** `npm.cmd test -- tests/cover-picker.test.tsx tests/backups.test.tsx tests/storage.test.ts tests/discovery/acceptance.test.ts tests/release-display.test.tsx`.
- [ ] **Step 4: Wire the selected UI and migrate safely.** Use AbortController plus request identity checks for cover requests and image decode. Increment request generation on title, author, progress, market changes and close/unmount. Disable acceptance for a mismatched requestId/seriesId/snapshot revision. Cover buttons display title, author, provider, book/audio format and previous/next role; their accessible names include that work. Show provider incomplete/no-match states even when another provider supplies valid images.

Lifecycle copy is exact:

```ts
const releaseLabels = {
  catalogued: 'Edition found; release unverified',
  announced: 'Announced; date unknown',
  scheduled: 'Scheduled',
  released: 'Available',
} as const;
```

An undated released proposal requires same-edition publication proof; catalogue-only evidence cannot produce Available. Preserve scheduled-to-released calendar display using localToday. In acceptance, cover selection requires either an already matching saved title or selection of the proposed matching title, independently of date checkboxes. Copy only accepted image URL and attribution, never candidates, decoded buffers or traces. A title/author/progress change clears associated automatic target covers; legacy manual URLs are preserved unless the user changes them. finishNext clears both coverUrl and coverAttribution together.

Upgrade parseDocument to accept input versions 1/2/3, output version 3, default old coverAttribution to null, preserve old accepted release/provenance fields and run all existing invalid-input checks. Extend release/provenance compatibility for catalogued and undated released. Keep exact-day precision requirements when a date is present. Existing storage migration/recovery writes must use the same guarded candidate commit and retain recoveryRaw on failure.

Status receipt continues to describe operational coverage: complete if no operational failure, partial for quota, provider error, invalid evidence, bounds or missing configured capability actually needed, failed only under the existing hard-failure/no-supported-result rule, cancelled when caller cancelled. Unknown identity alone does not imply a partial transport run. Show incomplete facts as a separate message. Specifically assert Sun Eater/The Band clean receipts have no partial badge, while a budget-affected run with valid dates still does.

- [ ] **Step 5: Run green and browser checks.** `npm.cmd test -- tests/cover-picker.test.tsx tests/backups.test.tsx tests/storage.test.ts tests/domain.test.ts tests/discovery/acceptance.test.ts tests/discovery/dialog.test.tsx tests/release-display.test.tsx`. Then `npm.cmd run test:e2e -- tests/e2e/discovery.spec.ts tests/e2e/library.spec.ts tests/e2e/backups.spec.ts`. Check keyboard selection, focus restoration, 390-pixel layout, no horizontal overflow and manual offline tracking. Preserve concurrent App/SeriesCard/SeriesTable work and reconcile only the copy/attribution integration needed here.
- [ ] **Step 6: Commit only the approved mockups and named Task 9 paths.** `feat: review named covers and publication evidence with safe migration`.

### Task 10: Replay the failure matrix and publish a bounded verification report

**Files:** Create `tests/discovery/pipeline-repair.test.ts`, `scripts/discovery-pipeline-repair-pilot.ts`; modify `docs/discovery-usage.md`, `docs/phase-2-discovery-report.md`; reuse sanitized fixtures from Task 1 and current snapshot input definitions from the investigation. Keep expected answers in a separate assertion file, never in the live request builder.

**Interfaces:** Replay inputs include all 11 failures and two clean receipt controls, Sun Eater and The Band. CLI is dry-run by default; `--run --case <id> --output <new-name>` runs exactly one case with AI disabled and exclusive output reservation. A repeated output name fails before any network request. It exports sanitized status/decisions and measured starts, not credentials. The caller chooses whether to use saved-title recheck or blank-title autonomous discovery; report that distinction explicitly.

- [ ] **Step 1: Write outcome assertions before adding the runner.** Create compact `<case>-replay.json` fixtures with this exact schema and a fetcher that cannot make network calls. Each response has a sanitized URL, query (GraphQL variables, Tavily query string, or null), HTTP status, content type and response body string. Capture-derived rows retain their source manifest; new primary-search and supported parser responses are explicitly synthetic in that manifest. Do not put researched titles in request targets that were originally blank.

```ts
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';
import type { CheckRequest } from '../../shared/discovery';
import { createDiscoveryRuntime } from '../../server/discovery/runtime';
import { runDiscovery } from '../../server/discovery/runDiscovery';

interface ReplayFixture {
  request: CheckRequest;
  responses: { url: string; query: unknown; status: number; contentType: string; body: string }[];
}
async function replay(caseId: string) {
  const saved: ReplayFixture = JSON.parse(readFileSync(
    new URL(`./data/pipeline-repair/${caseId}-replay.json`, import.meta.url), 'utf8'));
  const remaining = [...saved.responses];
  const unexpected: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    url.searchParams.delete('key');
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    const query = body?.variables ?? body?.query ?? null;
    const index = remaining.findIndex(row => row.url === url.href &&
      JSON.stringify(row.query) === JSON.stringify(query));
    if (index < 0) { unexpected.push(url.hostname); throw Error('unexpected-fixture-request'); }
    const [row] = remaining.splice(index, 1);
    return new Response(row.body, { status: row.status, headers: { 'Content-Type': row.contentType } });
  };
  const runtime = createDiscoveryRuntime({ hardcoverToken: 'fixture', googleBooksKey: 'fixture',
    tavilyKey: 'fixture', deepseekKey: null, model: 'deepseek-flash' }, fetcher);
  runtime.now = () => '2026-10-02T00:00:00Z';
  const pending = runDiscovery({ ...saved.request, useAi: false }, runtime, new AbortController().signal);
  await vi.runAllTimersAsync();
  const result = await pending;
  expect(unexpected).toEqual([]);
  expect(remaining).toEqual([]);
  return result;
}
afterEach(() => vi.useRealTimers());
test('repairs numbered work, relation, lifecycle and clean receipt cases', async () => {
  vi.useFakeTimers();
  const blacktongue = await replay('the-blacktongue-thief');
  const darkProfit = await replay('the-dark-profit-saga');
  const malazan = await replay('novels-of-the-malazan-empire');
  const ascension = await replay('book-of-the-dead');
  const path = await replay('path-to-ascendancy');
  const sunEater = await replay('the-sun-eater');
  const band = await replay('the-band');
  expect(blacktongue.proposals.identity).toBeNull();
  expect(blacktongue.proposals.related.map(r => r.relationship)).toContain('prequel');
  expect(darkProfit.proposals.identity).toBeNull();
  expect(darkProfit.proposals.related.map(r => r.title)).toContain('Crypt Currency');
  expect(malazan.proposals.identity).toMatchObject({ title: 'Blood and Bone', position: 5 });
  expect(ascension.proposals.releases.audio).toMatchObject({ date: '2026-08-19' });
  expect(ascension.proposals.releases.book?.state).not.toBe('announced');
  expect((path.coverCandidates ?? []).filter(c => c.role === 'next')).toEqual([]);
  expect(sunEater.summary).toMatchObject({ status: 'complete', reasons: [] });
  expect(band.summary).toMatchObject({ status: 'complete', reasons: [] });
});
```

Keep release replay and standalone cover replay as separate tests, because a release request cannot invoke Find cover. Use the Task 7 CoverRequest and collectCoverCandidates contract with the same no-network matching strategy for cover fixtures. Add explicit Witness artwork, Ana correction, Devils portrait/audio grouping, Last Horizon honest no-match, and Dark Profit provider-quota assertions. Include a sparse-primary response control with no prequel/continuation evidence; it must not fabricate a candidate. Preserve old conflict, cancellation and custom-order regression suites.

- [ ] **Step 2: Run red if any integration is incomplete.** `npm.cmd test -- tests/discovery/pipeline-repair.test.ts`. Every failure identifies the unmet spec requirement, not an expected provider network result.
- [ ] **Step 3: Add the bounded pilot using existing reservation/diagnostic patterns.** Reuse the exclusive directory reservation and origin restrictions from scripts/discovery-diagnostic-pilot.ts, but keep AI disabled and use the enhanced request ledger. Dry run prints chosen case, exact saved-title/blank-title mode and limits with zero requests. Live run feeds only captured user input fields, never publisher-researched titles. Record declared ceilings, actual starts, rejected rule counts, supported sources, candidate roles and remaining unknowns. Save per-provider quota failures separately from no matches. Do not automatically rerun a case or enable AI when coverage is sparse.
- [ ] **Step 4: Run the complete offline gate once.**

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:e2e
git diff --check
```

Run credential-value scanning against rebuilt frontend assets and new public/backup payloads using the service's actual loaded keys without printing them. If unrelated existing failures occur, report the exact baseline comparison and do not claim a full pass. Repeating broad tests is only necessary after further edits/failures.

- [ ] **Step 5: Run bounded live rechecks only after offline gates pass.** Run one selected case at a time with exclusive dated output and AI disabled. Compare all current-user cases plus Sun Eater/The Band, report source availability rather than forcing seeded expected answers, and stop/revise if a structural failure recurs. Provider quota or no-match remains a documented external limitation if the correct pipeline status/candidate rules hold. Existing permission for this investigation is not permission to enable billed AI or publish/deploy.
- [ ] **Step 6: Update usage/status docs and commit the named Task 10 paths.** Lead with measured behavior, exact input positions/markets, remaining unknowns, tests and evidence links. Document cover budgets and manual author/related-work review. Mark this plan complete only after all task checks and the chosen UI gate pass. Commit `test: verify release and cover repair against recorded failures`; do not merge, push or deploy without the user's requested next action.

## Self-review and requirement coverage

| Requirement | Owning tasks | Regression gate |
| --- | --- | --- |
| R1 rejection/transport diagnostics | 1, 10 | Fixed schema, observer isolation, quota/no-match distinctions. |
| R2 Hardcover/order semantics | 2 | Blood and Bone featured=false, placeholder/fractional/duplicate controls. |
| R3 exact decorated title binding | 3 | Ascension API/page join and author/title/number/product negatives. |
| R4 primary and related review | 4, 5, 9 | No integer identity from prequel/continuation; source closure and late enrichment. |
| R5 lifecycle distinctions | 6, 9 | Catalogue versus announcement versus publication, no guessed audio dates. |
| R6 named covers | 7, 9 | Exact-work art, geometry, role labels, no render requests. |
| R7 reviewed author correction | 8, 9 | Benett/Bennett differential, unrelated Foundryside and stale response controls. |
| R8 compatibility/UI review | 9 | v1/v2 recovery, v3 export, manual cover preservation, approved mockup. |
| R9 clean versus partial coverage | 6, 9, 10 | Sun Eater/The Band clean receipts, partial-with-valid-dates control. |

The inspection found no need to add AI, background work, a full series database or an image proxy. Static mockups are the only planned visual artifacts before user selection. All researched expected titles remain fixture assertions, apart from user-supplied saved targets. The implementation cannot promise that every external provider will have every future cover or numbered sequel; it can ensure that missing evidence is visible and never replaced by an incorrect asset or lifecycle claim.
