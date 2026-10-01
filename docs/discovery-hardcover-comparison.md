# Hardcover comparison report

Date: 2026-10-01. Status: bounded live evaluation, no product integration.

Artifacts: [Hardcover probe](discovery-hardcover-probes.json), [Hardcover live schema](discovery-hardcover-schema.json), [probe script](../scripts/discovery-hardcover-probe.ts), [Google Books probe](discovery-google-books-probes.json), [Apple catalog probe](discovery-apple-probes.json), [four-case pilot](discovery-four-case-pilot-report.md).

## What was run

Hardcover made 8 GraphQL requests for the four diagnostic cases: one `books` query by author and one `series` query by exact series name per case, at least 1.1 seconds apart, with 20-second timeouts, a 1 MiB response cap and no retries. The token stayed in the Git-ignored `.env.hardcover.local` and never entered the report.

Two corrections came out of this run. The archived Hardcover documentation is stale: the live `books` type has no `series_names`, `has_audiobook` or `isbns` fields. Those moved to the `book_series`, `default_audio_edition` and `editions` relationships. The live schema was captured by introspection rather than trusting the published docs.

Apple data in this report comes from 13 keyless, read-only catalog requests made on 2026-09-30 and 2026-10-01. Google data is reused from the already captured 2026-09-30 probe; no Google request was made for this comparison.

## Results by case

Expected values are the independently researched audit assertions. They describe listed editions, not exhaustive earliest availability.

| Case | Expected (audit) | Apple CA catalog | Hardcover | Live pipeline (four-case pilot) |
| --- | --- | --- | --- | --- |
| Hierarchy 2, The Strength of the Few | Book 2025-11-11 CA ebook; audio unaudited | Ebook 2025-11-11; audio 2025-11-11 | Ebook 2025-11-11, ISBN 9781982141257; audio 2025-11-11, ASIN B0F6F54HND | Identity only; no book or audio date |
| Ana and Din 3, A Trade of Blood | Book 2026-08-04 US; audio 2026-08-04 US | Ebook 2026-08-04 | Ebook 2026-08-04, ISBN 9780593723869; audio 2026-08-04, ISBN 9798217279296, ASIN B0FKVBM6MV | Identity only; no book or audio date |
| Scholomance 2, The Last Graduate | Audio 2021-09-28 US; book unknown | Ebook 2021-09-28; audio 2021-09-28 | Ebook 2021-09-28, ISBN 9780593128879; audio 2021-09-28, ASIN B08M4DMT5J | Identity plus undated ebook announcement |
| Path to Ascendancy 2, Deadhouse Landing | GB ebook and audio 2017-11-16; CA unaudited | Ebook 2017-11-14 and 2017-11-16; audio 2017-11-14 | Ebook 2017-11-14, ISBN 9781466868595; no audio edition | Identity plus undated ebook announcement |

Hardcover coverage on the four cases: 4 of 4 identities with an explicit series position, 4 of 4 ebook dates, 3 of 4 audio dates. Apple returned both formats with a date for all four cases. The live pipeline returned 0 dates.

## Provider capability

| Dimension | Google Books | Apple catalog | Hardcover |
| --- | --- | --- | --- |
| Identity and order | Ordinal only when encoded in a subtitle | Title and author text only, often decorated | Explicit position per series, plus `primary_books_count` excluding companions |
| Market-scoped date | No, except a rare preorder sale date | Yes, storefront-queried by country | No; dates are global and US-weighted |
| Audiobook | None | Yes, separate audio entity | Yes, `default_audio_edition` and audio editions |
| ISBN and ASIN | Ebook ISBNs only | None in the response | ISBN-10, ISBN-13 and ASIN per edition |
| Country and language | Per-volume sale country, explicit language | Storefront country in the URL | `country_id` and `language_id` IDs |
| Query that works | `intitle`/`inauthor` | `term` search or `lookup` by ISBN/id | `series` by exact name, not `books` by author |
| Request limits | 20 observed, keyed | About 20 per minute | 60 per minute, token expires yearly |

## Findings

1. Retrieval is not the bottleneck. Apple CA already returns a dated edition in both formats for every one of the four cases, using the same query shape the pipeline issues. The four-case pilot still produced zero dates, and every one of its cases carried the `budget` reason. That points at allocation pruning and identity timing downstream of retrieval, not at provider coverage.

2. Hardcover's strength is the series query, not the author query. Querying `books` by author returned 20 loosely related works and missed the target in two of four cases. Querying `series` by exact name returned the correct book, position, dates and identifiers in every case. Any adapter must query by series with exact `_eq`/`_in` matches, because `_ilike` and `_like` are disabled by the provider.

3. Hardcover supplies the missing key for audiobook joins. Google emits ebook editions only, so the Google to Apple ISBN join cannot help audiobooks. Hardcover returned an audiobook ISBN and an ASIN for both Hierarchy and Ana and Din. Feeding that identifier into the existing Apple `/lookup` path is what could resolve the decorated audiobook titles such as "The Last Graduate: A Novel (Unabridged)".

4. Hardcover positions address the novella problem directly. Every matched book carried an explicit `position`, and `primary_books_count` (3 for Hierarchy, 3 for Ana and Din Mysteries, 3 for The Scholomance) separates main series entries from companions. That is the rule the plan currently has to infer from subtitle text.

5. Hardcover is not a market authority. It returned US ISBNs (9780593723869 for A Trade of Blood) with no market scoping on the default edition. The dates happened to match Apple CA dates in three of four cases, but same-day worldwide releases make that coincidence rather than proof of Canadian availability.

6. Hardcover data needs the same strict validation as the other catalogs. Observed defects: A Drop of Corruption carried a release date of 1995-11-24 alongside a correct 2025-04-01 record; a second unrelated series named "Scholomance" exists with 12 books; Deadhouse Landing appears twice at position 2; The Scholomance exists as two series records; a companion sits at position 0.5. Title and position alone are not sufficient without author agreement and a position match.

## Recommendation

Add Hardcover as an identity, ordering and audiobook-edition source, joined by ISBN or ASIN. Do not treat it as a market-scoped date authority; keep Apple in that role. In priority order:

1. Fix allocation so a dated, market-scoped edition survives pruning when identity has not yet resolved. All four cases already had the data, and this is the only change that addresses the measured failure.
2. Extend the existing ISBN join to accept Hardcover audiobook ISBNs and ASINs, which is what makes decorated audiobook titles resolvable.
3. Add a Hardcover adapter that queries `series` by exact name, requires author agreement and an exact position, and treats a missing audio edition as unknown rather than absent.
4. Keep Google in the stack for first-pass identity and ebook ISBNs, but drop it as a date source.

## Caveats

Four cases, one run each, no retries. Hardcover is community-maintained data behind a beta GraphQL API whose terms were not reviewed in this run. No market scoping was validated. This report does not claim phase-2 completion, does not authorize a production integration and does not replace the original eight-case release gate.

## 2026-10-01 corrections and continuation

The raw historical comparison above remains unchanged. Its recommendations are corrected as follows. `primary_books_count` is an aggregate count and cannot establish that a specific row belongs to the main series or excludes companions. Current identity qualification uses exact series alias/position, author-role agreement, featured main membership, compilation guards and a qualifying exact-title English edition with a recognized format. Hardcover is identity/order/English-format/ISBN evidence only and NEVER supplies accepted dates.

The historical suggestion to feed audiobook ISBNs or ASINs to Apple lookup was unsupported. The documented implemented ISBN path is ebook-only; it is neither ASIN lookup nor audiobook ISBN support. Separate catalog/product evidence is required for audio. A separately found Hardcover Hierarchy audio October 11 record conflicts with the actual supported November 11 day and is quarantined from date proposals.

The [new audited 13-case batch](discovery-free-pages-pilot-report.md) yielded 10 identities, seven book dates and seven audio dates from strict English Apple edition evidence, zero AI calls. This improves measured date coverage without altering the historical failed pilot. Three known cases remain unsupported, and live GB preferred-market retrieval remains unproven. Explicitly numbered primary-series novellas qualify as entries, not proof of next full-length novel coverage. Final app integration and whole-phase verification remain PENDING.
