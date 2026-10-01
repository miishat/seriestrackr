# Discovery Retrieval Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Identify the exact class of evidence rejection or allocation loss preventing supported release dates, without weakening validation or repeating paid calls without consent.

**Architecture:** Add an optional server-only observer emitting fixed enums and bounded numeric counts. Keep provider behavior, public responses and browser storage unchanged. Extend the pilot runner to save those sanitized events alongside its existing sanitized output, with exclusive reservation and bounded request accounting. Diagnose before selecting a retrieval or extraction repair.

**Tech Stack:** Existing TypeScript, Node, Vitest, tsx and injected fake providers. No dependencies or model change.

**Spec:** [Original discovery specification](../specs/2026-09-29-release-discovery-design.md), [Google amendment](../specs/2026-09-30-google-books-integration.md), and the binding diagnostic contract below. Evidence: [four-case report](../../discovery-four-case-pilot-report.md). The user explicitly retained date discovery after this pilot failed. Tasks 8 through 11 remain gated. Static mockup preparation is allowed independently.

## Binding diagnostic contract and global constraints

- Preserve free catalogs and free search first; DeepSeek remains the only optional AI candidate, disabled unless explicitly requested. At most one extraction/check, no model retry or repair call.
- Preserve two Google, twelve Apple, three Open Library, three Tavily and one DeepSeek request/check maxima; 30 sources, 30 identities, 100 editions, 20,000 UTF-8 input bytes, 2,048 output tokens and existing deadlines.
- Preserve earliest supported English ebook/print selection, preferred market then any supported market independently per format. Unspecified publisher country remains null. No availability from publication metadata alone.
- Preserve whole-edition-batch rejection, ambiguity/conflict suppression, exact title matching and literal quote containment. Valid identities may survive an invalid edition batch.
- Observer events contain only fixed stage/category enums and safe integer counts. No arbitrary strings, source IDs, titles, URLs, quotes, raw errors, field names supplied by a model, prompts, page bodies, credentials or raw model output.
- Observers are opt-in, server-only, transient by default and exception-isolated. Normal app operation must emit no logs. Public contracts, frontend bundle and stored library stay unchanged.
- All implementation tests use fictional data and fake fetch. No live calls or credential reads by workers. The four-case allowance is closed and cannot be replayed.
- Medium effort or lower for implementation, review, research, debugging and tests. High effort only for implementation plans/specifications. No Astra unless user asks; no em dashes.

## Review focus

1. A malicious unknown model field contains a key or page text: only a fixed `shape` category escapes. Task 1.
2. One invalid edition coexists with a valid identity: preserve the identity and reject all editions, with a diagnostic that identifies the edition stage. Task 1.
3. Literal quotes refer to text trimmed out of the actual prompt: diagnose citation failure without copying the quote or accepting it. Task 1.
4. An observer throws: provider counts, usage, result and cancellation remain identical to observer-disabled behavior. Task 1.
5. A pilot crashes after a request: a second invocation refuses to replay; counters count started attempts even on failure. Task 2.

## File ownership and interfaces

| Task | Files owned | Responsibility |
| --- | --- | --- |
| 1 | Create `server/discovery/diagnostics.ts`, `tests/discovery/diagnostics.test.ts`; modify `server/discovery/deepseek.ts`, `server/discovery/runDiscovery.ts`, `server/discovery/catalogs.ts`, `server/discovery/runtime.ts`, their existing tests | Fixed safe events at real rejection/allocation boundaries, optional internal observer |
| 2 | Modify `scripts/discovery-pilot.ts`, `tests/discovery/pilot.test.ts`; create `scripts/discovery-diagnostic-pilot.ts`, `tests/discovery/diagnostic-pilot.test.ts`; update this plan and recommendation | Explicit reservation, sanitized evidence report and bounded one-case runner |

Sequence: Task 1, independent review, Task 2, independent review, full offline checks, independent integration review, concrete diagnostic dry run, fresh live consent if needed. Do not implement a guessed prompt/allocator repair before the evidence checkpoint.

### Task 1: Observe evidence failures without exposing input

**Consumes:** Existing `parseExtraction(input, sources)`, `matchesTarget`, `extractionContent`, `buildExtractionMessages`, collector bounds and orchestrator `bound`.

**Produces:**

```ts
export type DiagnosticStage = 'catalog' | 'allocation' | 'prompt' | 'envelope' | 'identity' | 'edition';
export type DiagnosticCategory = 'shape' | 'citation' | 'duplicate-id' | 'date-precision' |
  'target-mismatch' | 'bounds' | 'trimmed' | 'accepted';
export interface DiagnosticEvent {
  stage: DiagnosticStage;
  category: DiagnosticCategory;
  sources: number;
  identities: number;
  editions: number;
}
export type DiagnosticObserver = (event: DiagnosticEvent) => void;
export function emitDiagnostic(observer: DiagnosticObserver | undefined, event: DiagnosticEvent): void;
export function classifyExtractionFailure(error: string): DiagnosticCategory;
```

Add optional `onDiagnostic?: DiagnosticObserver` to `DiscoveryDependencies` and collector options. Add an optional sixth observer argument to `extractEvidence`; runtime accepts optional third `{ onDiagnostic?: DiagnosticObserver }` argument and passes it through. Existing call sites remain valid. No observer field goes in `CheckResponse`, `Usage` or configuration/key files.

- [x] **Step 1:** Read the owned production boundaries and existing tests once. Confirm where `invalid-evidence` and `budget` originate. Record a boundary map in the plan workspace, without actual input values. Do not attribute the four live failures to a specific boundary yet.
- [x] **Step 2:** Write failing real-boundary tests for malformed outer reply, invalid identity shape, target mismatch, duplicate edition ID, inconsistent date precision, missing source/literal quote, valid identity plus bad edition batch, and known-title empty identity plus valid editions. Use fictional evidence with hand-written expected events and existing acceptance assertions.

The classifier test pins fixed categories independently of model text:

```ts
test.each([
  ['evidence.citations: quote must appear in supplied source', 'citation'],
  ['evidence.editions: duplicate values', 'duplicate-id'],
  ['evidence.editions[0].date: date and precision disagree', 'date-precision'],
  ['evidence.editions[0].FAKE_SECRET: unexpected field', 'shape'],
])('classifies %s without exposing the error', (error, expected) => {
  expect(classifyExtractionFailure(error)).toBe(expected);
});
```
- [x] **Step 3:** Add a malicious unknown-field fixture and throwing-observer fixture. Assert events contain only the declared keys and fixed enums, results match observer-disabled behavior, and neither diagnostic JSON nor public replies include the fictional secret. Add quote-after-trimming and oversize catalog/allocation tests at their actual owning boundaries. An event for catalog bounds does not establish provider quota exhaustion.
- [x] **Step 4:** Run focused Vitest checks and save their meaningful failures. Expected: existing acceptance behavior passes, missing observer/classifier assertions fail. Do not weaken acceptance assertions to manufacture RED.
- [x] **Step 5:** Implement the fixed enum classifier. Match only known parser-generated rejection patterns; unknown/novel paths map to `shape`. Never emit parser error text. Validate counts as safe nonnegative integers bounded by existing input array caps. Catch observer exceptions. Keep events immutable so an observer cannot mutate production evidence.

```ts
export function classifyExtractionFailure(error: string): DiagnosticCategory {
  if (error === 'evidence.citations: quote must appear in supplied source') return 'citation';
  if (error === 'evidence.editions: duplicate values') return 'duplicate-id';
  if (/^evidence\.editions\[\d+\]\.date: date and precision disagree$/.test(error)) return 'date-precision';
  return 'shape';
}
export function emitDiagnostic(observer: DiagnosticObserver | undefined, event: DiagnosticEvent): void {
  if (!observer) return;
  const limits = { sources: 30, identities: 30, editions: 100 };
  for (const key of ['sources', 'identities', 'editions'] as const) {
    if (!Number.isSafeInteger(event[key]) || event[key] < 0 || event[key] > limits[key]) return;
  }
  const safe = Object.freeze({ stage: event.stage, category: event.category,
    sources: event.sources, identities: event.identities, editions: event.editions });
  try { observer(safe); } catch { /* Diagnostic failure cannot change discovery. */ }
}
```

Only typed internal producers may call the emitter. Add runtime enum checks if accepting events from an untyped boundary; the diagnostic pilot must validate before persistence. Use bounded counts of the actually parsed/sent arrays, not untrusted raw array lengths or text-derived numbers.
- [x] **Step 6:** Emit one event at the relevant failed stage before current return/throw, without adding provider calls. Emit accepted identity/edition counts after existing validation and actual sent-source count at prompt trimming. Preserve malformed-envelope failure and token usage semantics. Avoid freeform details and reasons inferred from optional fields.
- [x] **Step 7:** Run `npm.cmd test -- --run tests/discovery/diagnostics.test.ts tests/discovery/deepseek.test.ts tests/discovery/pipeline.test.ts tests/discovery/catalogs.test.ts tests/discovery/runtime.test.ts`. Prompt tests are currently in `deepseek.test.ts`; add the trimming regression there. Run `npm.cmd run typecheck`. Expected: all pass, fake provider call counts unchanged. Save commands/counts/exits.
- [x] **Step 8:** Commit only owned files: `feat(discovery): add bounded server-only rejection diagnostics`. Obtain independent spec/quality review at medium or lower. Resolve findings with focused regressions and scoped re-review before Task 2.

### Task 2: Prepare a replay-safe diagnostic pilot

**Consumes:** Task 1 observer; existing `readPilotCases`, `runPilot`, `loadDiscoveryConfig` and `createDiscoveryRuntime`.

**Produces:** `runDiagnosticPilot(args, options)` with fake-injectable fetch/root/print; CLI `scripts/discovery-diagnostic-pilot.ts`. Accept `--dry-run` by default and one `--case <id>`; live mode requires `--run` and a unique output directory. No all-case or retry flag. Existing pilot behavior stays compatible.

```ts
export async function runDiagnosticPilot(args: string[], options: {
  root?: string;
  fetcher?: typeof fetch;
  print?: (value: string) => void;
} = {}): Promise<void>;
// runPilot options gains:
// onDiagnostic?: DiagnosticObserver
```

- [x] **Step 1:** Write fake-fetch tests proving dry run reads no credentials and makes zero requests, unknown case rejects before network, output reservation happens before requests, and an existing reservation rejects a second run even when the first failed. Use temporary directories and fictional case input only.
- [x] **Step 2:** Add fake-fetch tests enforcing per-case ceilings of Google 2, Apple 12, Open Library 3, Tavily 3 and DeepSeek 1. Count a started failed request, reject unknown origins including ports/credentials, force redirect:error regardless of injected init, refuse a call beyond a ceiling before fetch, and assert no retries or uncounted redirect request. Use fixed provider mapping without printing URLs or headers.
- [x] **Step 3:** Add diagnostic persistence tests for no source text/quotes/model content/prompt/secret in files or output. Assert non-diagnostic proposal/source-link fields retain the same shape as `runPilot`. A supported fictional English ebook day and separate GB audio fallback must survive; an invalid sibling edition must still suppress the entire AI edition batch.
- [x] **Step 4:** Run the new tests before implementing. Expected: missing runner/reservation/diagnostic assertions fail. Add minimal observer wiring to `runPilot` options and reuse its sanitizer rather than constructing another leaking response shape.
- [x] **Step 5:** Implement bounded runner and reservation. Persist only authorized case ID, ceilings, started counts, fixed diagnostic events and the existing sanitized result. Load real config only inside explicit live mode. Catch raw provider/CLI errors and emit a fixed failure marker. An incomplete reservation stays closed; no resume or overwrite option.

Use literal ceilings and exclusive creation before calling `runPilot`; parse the one case ID through `readPilotCases` first. Require `--output <relative-directory>` in live mode; resolve it beneath the ignored `.superpowers/sdd/2026-09-30-discovery-retrieval-diagnostics/` workspace and reject paths outside that root before creating anything. Require a single leaf directory name matching /^[a-z0-9][a-z0-9-]{0,69}$/; validate existing ancestors with lstat/realpath and reject symlinks or Windows junctions before reservation. Add redirected-ancestor regression. Dry run does not reserve a directory, load config, read key files or invoke `runPilot`.

```ts
const caps = { googlebooks: 2, apple: 12, openlibrary: 3, tavily: 3, deepseek: 1 };
const counts = { googlebooks: 0, apple: 0, openlibrary: 0, tavily: 0, deepseek: 0 };
mkdirSync(output); // Nonrecursive; existing reservation rejects replay.
writeFileSync(resolve(output, 'reservation.json'), JSON.stringify({ caseId, caps, retries: 0 }), { flag: 'wx' });
// In the injected fetch wrapper, map only the existing five fixed HTTPS hosts.
// Increment and persist counts before invoking the underlying fetch.
// Reject an unknown host or count equal to its cap before network work.
await runPilot(['--run', '--case', caseId, '--ai'], {
  root, fetcher: boundedFetcher,
  onDiagnostic: event => { diagnosticEvents.push(event); },
  print: result => writeFileSync(resolve(output, 'result.json'), result, { flag: 'wx' }),
});
```

`boundedFetcher` is the local wrapper described in Step 2, typed as `typeof fetch`; `diagnosticEvents` is a bounded list of at most 128 validated events. Drop further diagnostics without affecting discovery and persist a bounded numeric dropped-event count. Final report generation happens in `finally`; never stringify a caught error. `runPilot` must pass `onDiagnostic` to `createDiscoveryRuntime` when no injected runtime exists.
- [x] **Step 6:** Run `npm.cmd test -- --run tests/discovery/pilot.test.ts tests/discovery/diagnostic-pilot.test.ts` and `npm.cmd run typecheck`. Expected: pass. Commit only owned files: `feat(discovery): prepare replay-safe diagnostic pilot`. Obtain independent review and scoped fixes.
- [ ] **Step 7:** Run full unit tests, typecheck and build after the last source fix. Workers scan fictional secret sentinels and frontend imports only. The controller may separately audit real-key exclusion in memory, printing counts only, under existing credential authorization. Obtain independent integration review. Do not claim new date coverage.
- [ ] **Step 8:** Run the zero-request dry run for `hierarchy`. Prepare a concrete one-case allowance of at most 2 Google, 12 Apple, 3 Open Library, 3 free Tavily and 1 DeepSeek call, no retries. Refresh the capped cost estimate from existing configured pricing; do not run a live request without new user consent.

## Evidence checkpoint before repair or Tasks 8 through 11

After offline implementation, if fictional fixtures locate a real production bug, make a separate scoped amendment for that evidenced bug before changing it. If only the actual live failure remains unknown, obtain the one-case diagnostic allowance after presenting dry-run maxima. Do not rerun four cases merely to observe failures again.

Use the result to choose the smallest evidenced repair: prompt/schema alignment for field-shape errors, preservation of cited facts for allocation loss, or explicit source relationship retrieval for canonical-title mismatches. These are possible branches, not established root causes. A missing date or language remains unknown. Quote containment alone does not prove semantic support.

The gate remains the original acceptance requirement: traceable identity/position for the eight known cases or named unsupported narrowing, audited supported dates, truthful unknowns, zero unsupported accepted-ready assertions, preserved manual/offline tracking and all regressions. Do not replace that requirement with this one-case diagnostic. A later verification batch needs a distinct allowance after a repair and independent review. Store its report separately from both completed pilots. Only a demonstrated gate pass unlocks Tasks 8 and 9; Task 10 additionally requires visual approval of the standalone mockup.

## Planning self-review

Task 1's observer and event enums are Task 2's only new interface. Both share the same exceptions-isolated emitter and fixed event schema; no duplicate sanitizer or public-schema change is planned. Existing collector options remain backward compatible. Five review-focus classes are assigned tests. Live authorization is a deliberate evidence checkpoint, not a plan to exceed the closed four-case allowance. Independent preflight remains required before implementation.

Preflight amendments: fixed exact-origin/no-redirect wrapper enforcement, controller-only real-key scan, and filesystem-aware output ancestor checks. All preserve approved scope; independent preflight otherwise found interfaces consistent.

Execution checkpoint: human plan approval and live-testing authorization received. Task1 commits2a11ca5/bed9b57 independently approved after count/cancellation regression fixes;235focused checks/typecheck pass. Task2 replay-safe runner and39focused checks/typecheck pass; scoped review after persistence/output-failure fixes is pending. Expanded testing authorization is explicit in the human conversation, while this runner keeps per-case ceilings and no retries. Whole-integration review and live diagnostic remain pending. Original date gate and UI visual review remain unpassed.
