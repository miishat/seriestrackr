# Discovery Pilot Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the bounded retrieval path without accepting unsupported dates, then obtain new consent for a separately measured live pilot.

**Architecture:** Retain the existing catalogs, Tavily search and one optional DeepSeek extraction. Improve target instructions and evidence allocation, then separate validation of the identity batch from validation of the edition batch. No library, storage or UI changes belong to this repair.

**Tech Stack:** Existing TypeScript, Node, Vitest and tsx dependencies.

**Spec:** [Original design](../specs/2026-09-29-release-discovery-design.md), with the reviewed internal validation amendment below. [Pilot findings](../../discovery-pilot-report.md) are observations, not replacement acceptance criteria.

**Status:** Tasks 1 through 5 are implemented and individually independently approved through `5cf3bd0`; fresh full offline checks pass. Whole-repair source review is approved with no findings. Task 6's offline documentation and new consent proposal are prepared. The user authorized the offline repair with the previously selected subagent-driven development method. New consent and live execution remain pending.

## Evidence and scope

The 14 production inputs ran once each. Results were three supported identity proposals and no book/audio release proposals. Six of eight known identities remained unresolved. Fourteen DeepSeek attempts and 42 Tavily attempts exhausted this batch's authorized call allowance; do not repeat any case under that allowance.

Metadata showed valid schema/quotation checks followed by edition relationship failure in several cases. GB Path to Ascendancy specifically failed the edition-title relationship while author and position passed. Scholomance failed literal quotation validation. The Ana and Din control returned three distinct identity titles and failed the combined identity author/position check. No rejected response text was saved, so these observations cannot establish the exact offending titles or reconstruct real quotations.

The repairs below are hypotheses to test, not a claim that the next live pilot will succeed. Primary-source identity and edition evidence remain necessary. A subtitle cannot be stripped to manufacture a title relationship.

## Global Constraints

- Core manual tracking remains usable without AI or the local service.
- Book means the earliest supported English ebook or print date; audio is independent.
- Prefer supported selected-market dates. Otherwise accept supported dates from any market or explicitly country-unspecified sources, independently by format. Preserve the actual source market.
- Do not infer English from storefront country or aggregate work language.
- Use exact Unicode NFKC, case and whitespace-normalized title and author comparisons. No fuzzy matches, punctuation stripping, substring aliases or automatic subtitle removal.
- Maximum 12 Apple requests, three Open Library requests, three Tavily searches and one optional DeepSeek request per check.
- Preserve 180-second check, 20-second HTTP, 45-second DeepSeek, 1 MiB response, 20,000 complete input-byte and 2,048 output-token limits.
- Keep thinking disabled, no tools, no retries, no response repair and no arbitrary returned-page fetching.
- Keep Apple/Open Library global queue spacing of at least 3.1/1.1 seconds.
- AI remains off by default. No live calls while implementing or reviewing these tasks. Test with fictional fixtures and fake fetchers.
- No raw page bodies, prompts, model bodies or credentials in API responses, persisted reports or commits. Existing validated bounded Citation.quote excerpts remain transient review-response fields; never persist them in the library, reports or backups.
- No library migration or UI wiring until the revised live gate passes or the user explicitly agrees to a narrower useful feature.
- Do not use em dashes or select Astra.

## Reviewed validation amendment

This server behavior change received plan review before implementation and independent Task 3 review afterward. Existing public request/response schemas stay unchanged.

1. An invalid transport/envelope, truncated output, invalid JSON, unknown top-level fields, invalid arrays or exceeded global array limits still rejects the entire extraction.
2. Validate all identity records together against supplied sources and the requested target. Multiple valid different titles at the requested position remain ambiguous. Do not silently choose one. Invalid identity quotations or target relationships invalidate the identity batch.
3. Validate all edition records together, including global uniqueness, supplied-source quotations, exact author/title relationships, format, dates and precision. Any invalid edition invalidates the entire AI edition batch for this first repair. This deliberately avoids proposing an artificial minimum or hiding a conflicting edition by dropping just one record.
4. A valid identity batch may survive an invalid edition batch. Return that identity with no AI editions and an `invalid-evidence` reason. Preserve independently validated catalog evidence and existing conflicts.
5. Without a known input title or a valid unambiguous extracted identity, return no AI editions. A valid known-title request with a valid empty identity batch may use its exact input title without inventing identity/order evidence. An invalid nonempty identity batch suppresses all AI editions even for a known title in this iteration.
6. Do not convert invalid evidence into an empty complete success. Keep isolated batch rejection partial and preserve reported trustworthy token counts when the envelope was received. A valid empty output with both arrays empty remains successful and unknown, with no invalid-evidence reason.

Per-edition salvage, automatic alias relationships, source fetching and provider replacement are outside this repair. They need separate designs if this conservative amendment remains insufficient.

## File map and ordering

| Task | Owned files | Deliverable |
| --- | --- | --- |
| 1 | `server/discovery/prompt.ts`, `tests/discovery/deepseek.test.ts` | Clear target-only and canonical-title instructions |
| 2 | Create `server/discovery/evidenceAllocation.ts`; modify `server/discovery/prompt.ts`, `server/discovery/runDiscovery.ts`, `tests/discovery/deepseek.test.ts`, `tests/discovery/pipeline.test.ts` | Bounded evidence allocation that retains useful order and edition evidence |
| 3 | `server/discovery/deepseek.ts`, `server/discovery/runDiscovery.ts`, `tests/discovery/deepseek.test.ts`, `tests/discovery/pipeline.test.ts` | Reviewed identity-versus-edition validation amendment |
| 4 | `tests/discovery/deepseek.test.ts`, `tests/discovery/policy.test.ts` | Explicit canonical title evidence and unmatched-decoration regressions |
| 5 | `tests/discovery/pipeline.test.ts`, `tests/discovery/policy.test.ts` | Independent language, format, precision, conflict and market matrix |
| 6 | `docs/discovery-pilot-report.md`, `docs/discovery-recommendation.md`, this plan | Review record and concrete new-consent evaluation proposal |

Execute sequentially, with one implementer and an independent reviewer per task. Reuse the existing worktree `C:/Users/misha/.codex/worktrees/phase2-release-discovery/seriestrackr`, branch `codex/phase2-release-discovery`. Base implementation is `0f80cea`. Existing research files and ignored credentials must remain intact; stage only each task's owned files.

## Review Focus

1. A correct identity accompanied by a wrong-title edition must not become a date proposal or lose its valid identity solely because that edition is rejected. Task 3 owns this test.
2. Two different cited identities at the requested position must remain ambiguous, even when either has attractive dates. Task 3 owns this test.
3. A large preferred-market catalog can displace the only order or fallback evidence before the prompt sees it. Task 2 owns this test.
4. Canonical and decorated titles are not interchangeable without explicit support. Task 4 owns positive and negative tests.
5. One invalid/conflicting edition must not be silently discarded to produce an earlier accepted date. Tasks 3 and 5 own this test.

### Task 1: Make target-only instructions unambiguous

**Interfaces:** Keep `buildExtractionMessages(request: CheckRequest, evidence: EvidenceBundle): Message[]`. Provider payload and output schema remain unchanged.

- [x] Inspect the existing extractor payload, source-injection, byte-limit and zero-AI tests, then run `npm.cmd test -- tests/discovery/deepseek.test.ts` as the baseline. This reversible instruction-copy change needs no new test that merely repeats its exact sentences. Offline tests cannot prove that a live model follows new prose instructions.

- [x] Amend the system instructions with the exact requirements below, resolving the current unknown-title wording without increasing limits:

```text
Return no neighboring series entries. When the input title is empty, identify only one explicitly supported work at the requested position. For editions, use that exact canonical work title only when the supplied evidence explicitly supports it; otherwise omit the edition. Do not remove subtitles or edition decorations to invent a canonical title. Source titles are display metadata, not proof that differently named editions are the same work.
```

- [x] Run the focused test and `npm.cmd run typecheck`. Preserve existing no-tools, zero-AI, quotation, byte-limit and source-injection tests.
- [x] Commit only the two owned files: `fix: clarify target-only discovery extraction`. Obtain an independent task review.

### Task 2: Allocate scarce input to useful evidence

**Interfaces:** Preserve `buildExtractionMessages` and `runDiscovery(input, dependencies, caller)`. A focused internal `evidenceAllocation.ts` module shares typed identity/conflict grouping and role selection between the two bounds, using existing discovery types only; document its exact helper exports in the implementation report. Do not change source IDs, source text or citation references while ranking evidence.

- [x] Add a fictional saturated-source regression in `tests/discovery/deepseek.test.ts`. Include many large CA catalog sources, a short cited order source and a short explicit GB audio source. Use the existing `source` helper, actual `IdentityEvidence` citations, and source text containing no real book data. Assert both indispensable source IDs survive the complete 20,000-byte message bound. Assert the original evidence is unchanged.
- [x] Add a `tests/discovery/pipeline.test.ts` regression with more than 30 incoming sources using the existing `dependencies` helper. Verify the sole useful order/search evidence survives the earlier aggregate bound, and verify truncation cannot drop a retained conflict and then offer its date. Name both source-pruning and prompt-pruning paths in the test.
- [x] Run both focused files before changing code and capture the actual failing path. If current code already passes a case, retain its coverage and do not manufacture a code change.
- [x] Implement bounded allocation in both stages, keeping retained citation dependencies and unresolved conflicts first. Then reserve space for order evidence and requested-format evidence before filling remaining space with preferred-market and fallback candidates. Treat explicit bibliographic evidence and source relevance as ranking hints only; a ranking never establishes identity, language or dates. For uncited prose, avoid making the presence of a generic word such as `order` a factual trust signal.
- [x] Keep serialized byte measurement as `Buffer.byteLength(JSON.stringify(messages), 'utf8')`, retain code-point-safe trimming, and keep 30-source/100-edition limits. Do not fetch more pages, expand budgets or add a hardcoded oracle list of authors/books.
- [x] Run the two focused files and typechecking; obtain review before committing `fix: preserve bounded discovery evidence coverage`.

#### Concrete bounded allocation ruling

No live raw text was retained, so a passing synthetic fixture is not proof of every production rejection's cause. Apply this deterministic allocation without a new authority registry, schema field or provider request:

1. At the aggregate bound, protect all retained exact-author, requested-position identity alternatives and whole conflicting edition groups first, with every citation's source dependency. Preserve different valid identity titles as alternatives rather than choosing one. If an identity dependency closure cannot fit 30 sources, suppress identity and dependent formats and report `budget`. If a whole conflict group cannot fit 30 sources or 100 editions, suppress its format and report `budget`; never keep just one conflicting side.
2. From remaining eligible source-only prose, reserve one Tavily order candidate when the title is unknown and at most one candidate per requested format. A source covering multiple roles occupies one slot. There are therefore at most three role reservations. Order markers (`reading order`, `series order`, `book order`, or `book` plus the exact requested integer) and format markers (`ebook`, `e-book`, `print`, `hardcover`, `paperback`, `audiobook`, `audio`) are ranking hints, never parsed facts. Prefer a role-matching source to an unmatched one, then preserve input order. The order role may fall back to the first eligible Tavily source when none has an order marker; do not invent a title.
3. A requested-format reservation may instead use a structured source dependency for qualifying evidence already selected by the unchanged policy. Prefer supported selected-market evidence; if that format lacks such evidence, prefer its supported fallback. A structured format/language/date/country relationship comes only from existing validated `EditionEvidence`, never from prose markers. For a policy-chosen edition with several citations, the first cited source in original input order is the one role representative, while the entire edition citation closure is retained and its quotes protected. The three-role cap counts representatives, not required dependency sources; every dependency still counts against the 30-source limit. If a chosen structured closure cannot fit, suppress that format and report budget rather than discard a known minimum and propose a later date as earliest. If no qualifying structured source exists, use the source-only format marker candidate. Missing candidates remain absent rather than being synthesized.
4. After protected closures and fitting reservations, fill nonconflicting singleton edition groups in selected-market-first order, then fallback order, then other unclassified source candidates. Use original input order as the tie-breaker. A role reservation cannot evict protected identity or conflict dependencies; if the protected closure leaves no reservation capacity, retain the closure, report `budget`, and do not exceed either bound. Dropping optional prose alone cannot suppress a supported unrelated proposal; existing conflict/ambiguity suppression remains mandatory.
5. At the prompt bound, use the same retained identities/conflicts and role representatives to identify protected source text. For every protected citation, the minimal prefix ends after the first literal occurrence of its quote in the immutable source. Take the longest such end for a source with multiple protected quotes, rounded to a full Unicode code-point boundary. A source-only reserved role starts with up to 256 code points; a complete short source stays complete. Other optional sources start with metadata and an initial prefix of up to 64 code points only if they fit. Do not force all unrelated retained catalog quotations into the protected set; deterministic evidence remains available to policy outside the model input.
6. Measure the full serialized system/user messages, including source metadata and JSON escaping, against 20,000 UTF-8 bytes. If instructions, target, metadata and the protected prefixes alone cannot fit, throw the existing sanitized `budget` error before calling DeepSeek. Drop optional source metadata before declaring a protected-fit failure. Never shorten a protected quote or silently drop one side of a conflict.
7. Distribute remaining bytes across selected sources by input-order round-robin prefix growth, at most 64 code points per source per round. Accept growth only when the complete message serialization fits; use a bounded binary search for the final smaller fitting increment. Stop when all texts are complete or no source can grow. No mutation of original source bodies, no suffix extraction, and no split surrogate pair.
8. Test two independently saturated fictional evidence sets at both the 30-source and 20,000-byte bounds, a protected quote occurring beyond the initial prefix, an identity-alternative/conflict closure that cannot fit, a protected prompt prefix that cannot fit, deterministic repeatability, and source immutability. Existing tests expecting one huge source to consume the entire prompt must change only where that old behavior contradicts this allocation contract.

### Task 3: Preserve valid identity when the edition batch fails

**Interfaces:** Extend the internal extractor result structurally, without public schema changes:

```ts
type ExtractionResult = {
  evidence: EvidenceBundle;
  usage: Usage;
  reasons?: Reason[];
};
```

`extractEvidence` returns this result. `DiscoveryDependencies.extract` uses the same return shape; fake dependencies may omit `reasons`. `runDiscovery` merges supplied sanitized reasons through its existing `reason` helper. Keep provider attempt counting before calls.

- [x] Add a fake-fetch regression using the existing `response`, `enabled`, `fromSources`, `source` and `edition` test helpers. Set the request's target title to empty. Return one correctly cited `Second` identity at position 2 plus an edition whose title is `Third`. Expect identity retained, editions empty, `invalid-evidence` recorded and one fetch only. Add the pipeline counterpart expecting partial status, correct identity and no dependent AI date.
- [x] Add controls: two different valid target-position identities; false identity quote; malformed outer object; truncated envelope; duplicate edition IDs; a correct edition beside an invalid one; known input title with no extracted identity; and no known/valid identity with editions. Require full rejection for malformed outer/envelope cases, ambiguity for conflicting identities, and whole-edition-batch rejection for any invalid edition. No record repair.
- [x] Run focused extractor and pipeline files to establish red behavior for identity survival.
- [x] Extract the existing envelope/JSON validation without relaxing it. Validate the identity-only bundle through `parseExtraction({ identities, editions: [] }, suppliedSources)` and exact target checks. Then validate the entire edition batch together, using the valid identities or known exact input title for its work relationship. Never validate against source text omitted or trimmed away from the actual prompt.
- [x] When identities are valid but editions are not, return the identity-only evidence plus `reasons: ['invalid-evidence']`. Preserve reported safe integer token counts from the received envelope. For rejected nonempty batches retain invalid-evidence; a valid empty output remains complete/unknown. With unknown title and invalid or ambiguous identity, suppress all AI editions. With known title and invalid nonempty identity, conservatively suppress all AI editions too; the known-title allowance applies only to a valid empty identity batch. Preserve deterministic evidence independently.
- [x] In `runDiscovery`, add each optional extraction reason before applying existing merge/selection logic:

```ts
for (const value of extracted.reasons ?? []) reason(value);
```

- [x] Run focused files and typechecking. Review whether any rejected edition could disappear and expose a false earliest date; the all-or-none AI edition batch is mandatory in this iteration.
- [x] Commit owned files only: `fix: isolate discovery identity from invalid edition batches`. Obtain independent spec and quality review.

### Task 4: Pin canonical title boundaries

**Interfaces:** Keep current `IdentityEvidence.title` and `EditionEvidence.title`. No aliases or work-title schema expansion.

- [x] Add a positive fixture where supplied prose explicitly states `Second by Example Author. Book 2.` and the model uses `Second` for both identity and edition. Storefront display metadata may say `Second: Example, Book 2 (Unabridged)`; this display string alone must not override the explicitly cited canonical work.
- [x] Add a negative fixture where identity is `Second` but edition title remains decorated and has no cited canonical relationship. Expect a valid identity with no AI edition proposal under Task 3's contract. Include distinct works sharing a title prefix and punctuation-distinct author names; both must retain exact matching.
- [x] Run `npm.cmd test -- tests/discovery/deepseek.test.ts tests/discovery/policy.test.ts` and typechecking. These are semantic boundary regressions; do not add a function that simply removes suffixes to make the positive case pass.
- [x] Commit tests only if existing production behavior already satisfies the boundaries: `test: pin canonical discovery title evidence`. Obtain review. Any automatic alias join is a separate design.

### Task 5: Recheck independent formats and market fallback

**Interfaces:** Keep `selectProposals(request, evidence, checkedAt, interpreted?)` and the existing `runDiscovery` response contract.

- [x] Extend the existing policy/pipeline fixtures with this explicit matrix. Assert proposal date, source market, format and unknown state together:

| Input evidence | Expected result |
| --- | --- |
| Supported CA book day, supported GB audio day, no CA audio | CA book and GB audio, independently |
| No supported CA dates, supported US English ebook and audio | US fallback, never relabeled CA |
| Country unspecified, explicitly English print exact day | Supported unspecified-country fallback |
| CA storefront with absent language | No English release inferred |
| English work language without matching edition proof | No edition language join |
| Month-only print date | Month precision retained, never invented day |
| Two incompatible dates for same edition/market/format | Conflict, no proposal for that group |
| Rejected AI edition batch plus valid structured book evidence | Structured evidence preserved; rejected AI dates absent |
| New earlier invalid AI edition beside a valid AI edition | Entire AI edition batch absent, no false minimum |

- [x] Run `npm.cmd test -- tests/discovery/policy.test.ts tests/discovery/pipeline.test.ts`. A passing matrix needs no speculative implementation change. A named failure goes to the owner of that already-implemented policy, with its own red/green fix and review.
- [x] Run typechecking, commit scoped regressions and obtain review. Do not broaden source or language inference to improve coverage.

### Task 6: Review offline repair and propose a new live batch

- [x] Run `npm.cmd test -- --run`, `npm.cmd run typecheck` and `npm.cmd run build` after the last source change. Controller verification at `5cf3bd0`: 403/403 tests across 18 files, typecheck exit 0, build exit 0 with 47 modules transformed; test exit 0. Exact outputs are in ignored `remediation-final-tests.log`, `remediation-final-typecheck.log` and `remediation-final-build.log`. The original 347/347 checkpoint remains historical.
- [x] Perform independent whole-repair review and resolve Critical/Important findings before proposing live execution. Independent review approved `0f80cea..5cf3bd0` with no Critical, Important or Minor findings; verified allocation citation closures, budget bounds, minimum guard and batch isolation integrate, with no extra provider calls, raw evidence persistence, oracle imports or frontend secret exposure.
- [x] Update the pilot report and recommendation, preserving the original 14-case results at `0f80cea` as a dated immutable evaluation. Label offline repairs as tested hypotheses, not improved production coverage, and distinguish original whole-extraction rejection from repaired internal batch isolation.
- [x] Freeze a new proposed four-case subset: Hierarchy / James Islington / 2 / CA; Ana and Din / Robert Jackson Bennett / 3 / CA; Scholomance / Naomi Novik / 2 / CA; Path to Ascendancy / Ian C. Esslemont / 2 / GB. Keep all titles empty and request book plus audio. Existing case IDs are `hierarchy`, `ana-and-din`, `scholomance` and `path-to-ascendancy-gb`. The [report](../../discovery-pilot-report.md) and [recommendation](../../discovery-recommendation.md) freeze the full input tables. This subset probes identity rejection, ambiguity, quotations and edition-title mismatch, but does not replace the eight-case release criterion.
- [x] Prepare a consent request for one run per named case, at most 12 free Tavily basic search attempts and four DeepSeek calls total, no retries. Refresh official pricing and read-only free-account usage first; see the dated observations and concrete request below. The key's presence is not authorization.
- [ ] Ask for and wait for that concrete new live-batch consent. Do not run it automatically. After consent, audit every proposed identity and every edition format/language/date/country field. Reject unsupported assertions and report unresolved cases honestly.
- [x] Keep migrations/UI gated unless the tested release scope passes or the user explicitly chooses a narrower useful source-review feature. The gate is maintained; no title-only result automatically passes a release-discovery gate.

## Review and execution record

Public types and provider budgets remain unchanged. Task 3 implemented the optional internal reasons field and conservative batch split: valid identity survives whole-edition-batch rejection; invalid nonempty identity suppresses AI editions; malformed outer/envelope failures still reject everything; valid empty output remains complete/unknown when no independent retrieval failure is present. Task 2 implemented the concrete bounded allocation ruling above in a focused `evidenceAllocation.ts` helper. The controller's helper-ownership and full citation-closure rulings remain binding. Its reviewed late-identity fix preserves qualifying minimum days or suppresses only the affected work/format, preventing an omitted earlier edition from exposing a false later minimum. No authority registry or oracle was added.

The documentation subagent initially hit a Codex usage limit; all work was preserved. After the user requested continuation, independent plan review resolved the allocation, normalization, transient-citation and batch-validation findings. The user continuation preserved authorization and the selected subagent-driven method. Tasks 1 through 5 then ran sequentially with separate implementation and independent review. No live provider requests were made for the repair.

| Task | Source/test commit | Independent review and offline evidence |
| --- | --- | --- |
| 1 | `a8d2d8b` | Approved, no findings; 40 focused tests before/after and typecheck passed |
| 2 | `79fdd68` plus fix `f968e21` | Late-identity minimum loss addressed in fix round 1; scoped re-review approved, no new findings; 89 focused tests and typecheck passed |
| 3 | `942f49c` | Approved, no findings; 114 focused tests and typecheck passed |
| 4 | `9449a04` | Approved, no findings; 82 focused tests, 396 full tests and typecheck passed |
| 5 | `5cf3bd0` | Approved, no findings; 65 focused tests and typecheck passed |
| Whole repair | `0f80cea..5cf3bd0` | Independent combined source review approved, no Critical/Important/Minor findings; fresh controller 403/403 tests, typecheck and build passed |

The tested changes remain hypotheses about improving bounded retrieval. The original 14-case batch still measured 3 supported identities and 0 book/audio releases, with 42 search and 14 AI attempts exhausted. No new live coverage or universal-accuracy claim follows from synthetic tests. Existing bounded `Citation.quote` excerpts remain transient API review data only; raw pages, prompts, model bodies, quotes and credentials are never persisted in reports, library records or backups.

## Prepared new-consent proposal and dated prerequisites

The controller directly refreshed [official DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing) on 2026-09-30. `deepseek-flash` is DeepSeek-V4.1-Flash. Peak uncached input/output rates are USD 0.30/1.20 per million tokens; off-peak rates are USD 0.15/0.60. Using 20,000 input tokens as a conservative proxy for the 20,000 UTF-8-byte cap plus 2,048 output tokens gives USD 0.0084576 per call and USD 0.0338304 for four calls, approximately USD 0.04 at peak rates. This is an estimate, not a guaranteed bill or verified balance deduction, with no assumed cache discount. No off-peak schedule or automation is proposed.

Read-only [Tavily GET `/usage`](https://docs.tavily.com/documentation/api-reference/endpoint/usage) at 2026-09-30T20:44:46.161Z returned HTTP 200: key usage 42/key limit null, plan usage 42/1000, pay-as-you-go usage 0/pay-as-you-go limit null. The snapshot left 958 plan credits, sufficient for the proposed 12. The prior user confirmation that pay-as-you-go is disabled remains applicable; null limits do not prove that setting. Retain the original post-batch 12/1000 observation separately; the later 42 counter now agrees numerically with runtime attempts, but no explanation for the difference is inferred. Neither refresh made a search or extraction request.

Prepared request following approved whole-repair review, awaiting presentation and fresh user consent:

> Approve one new run each for Hierarchy / James Islington / 2 / CA, Ana and Din / Robert Jackson Bennett / 3 / CA, Scholomance / Naomi Novik / 2 / CA and Path to Ascendancy / Ian C. Esslemont / 2 / GB, all with empty titles and book plus audio requested. The separate new allowance is at most 12 free Tavily basic search attempts and four DeepSeek calls total, with no retries and an estimated peak AI cost of approximately USD 0.04, not a guaranteed bill.

This is a new allowance, not permission to retry under the original batch. Consent and live execution remain pending. After consent, audit every offered identity and edition title relationship, English language, format, exact day and actual country or explicitly unspecified country. Apply selected-market preference and supported fallback independently for book and audio. Report conflicts and unresolved fields honestly. The four cases are diagnostics, not a replacement for the original eight-case release gate. No library migration or UI wiring proceeds unless that scope passes or the user explicitly chooses a narrower source-review feature.
