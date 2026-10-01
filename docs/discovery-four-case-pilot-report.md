# Revised four-case discovery pilot

Run date: 2026-09-30. Source commit: `52641b7`. This is the separately approved follow-up, not a replay under the exhausted original 14-case or Google research allowances.

## Result

All four checks returned a proposed next identity. Three also returned an undated ebook announcement. **No check returned a supported book date or an audiobook proposal. The original release-discovery gate remains failed.** An announcement means evidence of an edition, not proof of current availability. Four diagnostic cases do not replace the original eight-case acceptance requirement.

| Case | Proposed identity | Book proposal | Audio proposal | Reasons | Latency |
| --- | --- | --- | --- | --- | ---: |
| Hierarchy, position 2, CA | The Strength of the Few | Ebook, date and country unknown | None | budget, invalid-evidence | 25,151 ms |
| Ana and Din, position 3, CA | A Trade of Blood | None | None | budget, invalid-evidence | 23,831 ms |
| Scholomance, position 2, CA | The Last Graduate | Ebook, date and country unknown | None | budget, invalid-evidence | 23,830 ms |
| Path to Ascendancy, position 2, GB | Deadhouse Landing | Ebook, date and country unknown | None | invalid-evidence | 22,926 ms |

All statuses were partial; no conflicts were offered. The three ebook proposals came from structured Google Books evidence and were not marked AI-interpreted. Their source country remains null rather than being assigned the requested market. No date was promoted from publication metadata. The run cannot demonstrate successful preferred-market or any-market date selection because it produced no dates.

## Actual requests and authorization

| Provider | Requests started | Approved ceiling |
| --- | ---: | ---: |
| Google Books | 5 | 8 |
| Apple | 24 | 48 |
| Open Library | 8 | 12 |
| Tavily basic search | 11 | 12 |
| DeepSeek | 4 | 4 |

Every case ran once with no retries. Catalogs and search preceded AI, which was used once per case for remaining gaps. Reported DeepSeek totals were 16,430 input tokens and 3,358 output tokens. The approved estimate was approximately USD 0.04; the provider's actual invoice was not inspected. Request attempts are not independently verified account charges. No additional live allowance is inferred from unused ceilings.

An exclusive batch reservation prevented replay after a crash, and a fetch wrapper enforced total provider ceilings before each request. Each sanitized output and counter record is retained in the ignored implementation workspace. The [sanitized results](discovery-four-case-pilot-results.json) contain only proposals, source links, summaries and usage, with no credentials, quotations, retrieved page bodies, prompts or raw model replies. Expected answers never entered runtime queries or extraction input.

## Manual audit and limits

The author identifies [The Strength of the Few as Hierarchy book 2](https://jamesislington.com/updates.html). The publisher identifies [A Trade of Blood as Ana and Din book 3](https://www.penguinrandomhouse.com/series/LVI/shadow-of-the-leviathan/), [The Last Graduate as Scholomance book 2](https://www.penguinrandomhouse.com/series/2TS/the-scholomance/), and [Deadhouse Landing as Path to Ascendancy book 2](https://www.penguinrandomhouse.co.uk/books/421794/deadhouse-landing-by-esslemont-ian-c/9780857502841). These checks corroborate all four identity proposals. These separate browser searches were audit work after results, not runtime provider input.

The Scholomance publisher page explicitly lists an ebook format; the Deadhouse Landing publisher page offers an ebook format. The exact Google public volume pages and an Apple public page could not be fetched by the web audit tool, so independent review of every returned Google edition's language and sale status is incomplete. Hierarchy's author states an ebook launch, corroborating an edition's existence without verifying the exact Google record. No assertion of zero unsupported edition facts or a fully passed live audit is made. There are no proposed dates to audit and no current availability assertion was offered.

`budget` and `invalid-evidence` are observed runtime outcomes. The sanitized report does not establish the exact rejected model field or budget cause. Raw model output was deliberately not persisted. Do not attribute these failures to billing exhaustion or change validation solely to increase coverage.

## Recommendation and next checkpoint

Retain free catalogs/search first and DeepSeek as the sole optional AI candidate. Google improves useful structured evidence, but this run does not establish reliable date extraction. Do not introduce another provider or increase paid calls on these results alone.

Before Tasks 8 through 11, revise the retrieval plan to investigate allocation and extraction validation using fictional regression fixtures and sanitized rejection categories. Preserve strict title, language, format, market, day and citation checks. A future live test needs a new explicit allowance; this pilot must not be replayed. A narrower feature limited to source review and suggested titles is a separate product scope choice, not an automatic pass of the existing release-date requirement.

Offline integration review is complete: an independent medium-effort CLI review found plural companion exclusions; commit `52641b7` fixed them after 14 meaningful failing regression cases. Independent scoped re-review accepted the fix with no new blocking issue. Fresh offline checks passed 832/832 tests across 20 files, typecheck and build. Reviewer limitations were a supplied-diff-only review and no independent test execution. Those offline results do not pass the live gate.
