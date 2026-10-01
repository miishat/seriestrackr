# Production free-pages pilot report

Run and independently audited 2026-10-01. This tracked handoff preserves the public sanitized outcomes and primary corroboration from the independent audit. All 13 `phase2-free-pages-*-1` results available at the final audit snapshot were read, together with their counts and implementation fingerprints. This audit made no provider API calls, source edits, credential reads, retries, or commits. Public primary pages were independently checked through web browsing. `tests/discovery/data/pilot-expected.json` was used only as an audit reference.

## Ruling

Custom-order scope limit: all 13 batch inputs had blank order notes. The integration excludes automatic identity/book/audio proposals when a custom-order note is nonblank because the current evidence schema cannot attest its meaning; source links and unknowns remain available for manual review. Fractional positions still require cited identity. This limitation does not change the batch's measured outcomes.

No unsupported accepted-ready date or incorrect identity/title/position was found in the audited proposals. The eight known cases satisfy the specification's identity reporting alternative only with **Witness, The Devils, and Path to Ascendancy explicitly named unsupported for this run**. Five known identities matched their frozen expected title and position. This is evidence for bounded discovery of supported series entries and English storefront edition dates, with truthful unknowns. It does not establish universal next-novel coverage, worldwide availability, every preferred-market release, or exhaustive earliest print/ebook coverage.

The live proposal audit is complete for all 13 available cases. Phase 2 integration verification is recorded separately at the end of this report and in [usage](discovery-usage.md). A live market fallback is not a substitute for the deterministic preferred-market control.

## Eight known cases

| Case | Identity/position | Book | Audio | Finding |
| --- | --- | --- | --- | --- |
| Hierarchy | The Strength of the Few, 2 | CA ebook 2025-11-11 | CA audio 2025-11-11 | Same edition links confirm author, English and listed day independently. |
| Witness | Unknown | Unknown | Unknown | Named unsupported: Legacies of Betrayal, 3 was not proposed. Reasons: budget, unknown-identity. |
| Last Horizon | The Pilot, 4 | Undated English ebook announcement | CA audio 2025-07-01 | Audio date is explicit on its Apple edition, independent of author's general July 4 release post. |
| Ana and Din | A Trade of Blood, 3 | CA ebook 2026-08-04 | CA audio 2026-08-04 | Both linked editions independently confirm English, author and listed day. |
| Bound and Broken | Of Empires and Dust, 4 | Undated English print announcement | CA audio 2025-09-30 | Author distinguishes main novels from novellas; Apple audio independently confirms literal book-4 label, English and listed day. |
| The Devils | Unknown | Unknown | Unknown | Named unsupported: The Heretics, 2 was not proposed. Reasons: budget, invalid-evidence, unknown-identity. |
| Book of the Dead | Ascension, 5 | Undated English ebook announcement | Undated English audio announcement | Publisher explicitly lists Book of the Dead 5: Ascension and RinoZ. The general July 22 listing is correctly not promoted to an edition/country/language date. |
| Path to Ascendancy | Unknown | Unknown | Unknown | Named unsupported: Deadhouse Landing, 2 was not proposed. Reasons: provider-error, budget, unknown-identity. Independent GB control success does not rewrite this case. |

Primary corroboration: [Hierarchy ebook](https://books.apple.com/ca/book/the-strength-of-the-few/id6743716497), [Hierarchy audio](https://books.apple.com/ca/audiobook/the-strength-of-the-few-hierarchy-book-2-unabridged/id1852118863), [Ana ebook](https://books.apple.com/ca/book/a-trade-of-blood/id6749252239), [Ana audio](https://books.apple.com/ca/audiobook/a-trade-of-blood-unabridged/id1829582507), [Ana publisher order](https://www.penguinrandomhouse.com/series/LVI/ana-and-din-mysteries/), [Pilot audio](https://books.apple.com/ca/audiobook/the-pilot-the-last-horizon-book-4-unabridged/id1816312467), [Will Wight July archive](https://www.willwight.com/a-blog-of-dubious-intent/archives/07-2025), [Bound audio](https://books.apple.com/ca/audiobook/of-empires-and-dust-the-bound-and/id1824333097), [Ryan Cahill main/novella order](https://www.ryancahillauthor.com/books), [Aethon Book 5 listing](https://aethonbooks.com/2026/06/12/july-2026-litrpg-progression-fantasy-releases/).

The July 4 author post celebrates that week's release and identifies the fourth novel; it does not assert a Canadian audiobook date of July 4. Apple explicitly lists July 1 for the audited audio product. There is no supported same-edition conflict here.

## Additional cases and country control

| Case | Identity/position | Book | Audio | Finding |
| --- | --- | --- | --- | --- |
| Mistborn | The Well of Ascension, 2 | CA ebook 2010-04-01 | CA audio 2008-12-23 | Both Apple pages confirm English and day. Historical 2007 hardcover month with unknown country cannot override supported preferred CA evidence or supply an exact day. |
| Murderbot | Artificial Condition, 2 | CA ebook 2018-05-08 | Undated English audio announcement | Correct serialized-entry identity and explicit ebook date; classify this as a novella/series entry, not proof of a next-main-novel-only feature. |
| Scholomance | The Last Graduate, 2 | CA ebook 2021-09-28 | GB audio 2021-09-28 | Actual GB market retained for audio fallback; no claim that it is CA evidence. |
| Masquerade | The Monster Baru Cormorant, 2 | CA ebook 2018-10-30 | CA audio 2018-10-30 | Both product pages confirm English, author and day; audio page identifies entry 2. |
| Path to Ascendancy GB | Deadhouse Landing, 2 | CA ebook fallback 2017-11-14 | Unknown | Google bibliographic source explicitly identifies Volume 2 and author; Apple CA date and English independently corroborated. Live preferred GB coverage is not established. |

Primary corroboration: [Mistborn ebook](https://books.apple.com/ca/book/the-well-of-ascension/id385972806), [Mistborn audio](https://books.apple.com/ca/audiobook/the-well-of-ascension/id1442083889), [Murderbot ebook](https://books.apple.com/ca/book/artificial-condition/id1279281658), [Scholomance ebook](https://books.apple.com/ca/book/the-last-graduate/id1533584913), [Scholomance GB audio](https://books.apple.com/gb/audiobook/the-last-graduate/id1584785225), [Masquerade ebook](https://books.apple.com/ca/book/the-monster-baru-cormorant/id1333501426), [Masquerade audio](https://books.apple.com/ca/audiobook/the-monster-baru-cormorant/id1443710128), [Deadhouse CA ebook](https://books.apple.com/ca/book/deadhouse-landing/id1200479305), [Google Volume 2 record](https://books.google.com/books?id=k_jtDQAAQBAJ).

The GB control's CA fallback is consistent with selecting only eligible retrieved dates. It does not prove absence of a GB edition: frozen audit references independently list GB November 16 editions, but these references are not provider inputs. Report the retrieval shortfall and preserve the separate fixture test requiring eligible preferred GB November 16 to outrank earlier CA November 14. Likewise Scholomance's GB audio is a supported fallback, not proof of complete CA search coverage.

Murderbot scope ruling: Artificial Condition is the explicitly numbered second entry of its primary sequence, even though it is a novella. Selecting the publisher's existing Volume 2 is not inventing an integer position for a fractional companion novella. This fits a claim of next numbered primary-series book entry and the frozen expected identity; it cannot support a claim of next full-length novel. The spec's prohibition on promoting novellas remains necessary for companions such as Bound and Broken's interstitial novellas. The observed Murderbot proposal is not a migration blocker under the numbered-entry interpretation, but this interpretation must remain explicit in the product claim. [Publisher Volume 2 record](https://us.macmillan.com/books/9781250186935/artificialcondition/) is the frozen primary reference, while the audited Apple page independently identifies the same title/author and describes it as a novella.

## Field-level and transport checks

All 13 implementation files contain the same eight fingerprints, and every fingerprint matches the current source at the audit snapshot. Thus the inspected production normalizers and selection policy match the batch. Hardcover query requests no release dates and requires exact series alias/position, author-role agreement, featured main membership, no compilation, and at least one exact-title English edition with a consistent recognized format before emitting identity. Hardcover dates are not used as market evidence.

Apple page normalization binds URL country, product ID, book/audio path, exact product title and author, product type, ebook format, explicit English metadata or tightly scoped audio LANGUAGE badge, and date to the same product. It rejects ambiguous language and mismatched canonical product URLs. Audio canonicalization permits an already exact title, the literal title plus `(Unabridged)`, or the exact canonical-title/series/book-position/unabridged grammar. It does not strip arbitrary subtitles, abridged labels, novel labels, or other suffixes. Audited decorated labels match those supported grammars.

Selection first takes eligible preferred-market day dates, then the earliest eligible fallback day, independently by format. Undated announcements retain no invented country/day. All 14 proposed dates are day-precision, English, uninterpreted, attributed to matching Apple product IDs and actual country paths. No quote, HTML, key, or raw provider body appears in any result source: source entries are only id/title/url. The runtime also returns those three source fields; HTML stays within transport and normalization.

Important evidence limit: sanitized result artifacts omit normalized citation quotes and Hardcover row/edition membership fields. Therefore this audit independently corroborates visible identity/order and all proposed Apple dates using public pages, and verifies the production qualification gates through matching fingerprints. It cannot reconstruct every returned Hardcover row's English/main-membership metadata from the persisted result alone. Undated Hardcover announcements and qualifying-edition metadata are checked through the gate and frozen reference consistency, not a retained raw response. No unsupported assertion was observed; this is not a claim of complete forensic replay.

## Counts and truthful status

| Case | Apple combined API/page starts | Hardcover | Google | Open Library | Tavily | AI |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hierarchy | 4 | 1 | 1 | 3 | 0 | 0 |
| Witness | 6 | 1 | 1 | 2 | 3 | 0 |
| Last Horizon | 5 | 1 | 1 | 1 | 1 | 0 |
| Ana and Din | 4 | 1 | 1 | 2 | 0 | 0 |
| Bound and Broken | 5 | 1 | 1 | 2 | 1 | 0 |
| The Devils | 6 | 1 | 1 | 3 | 3 | 0 |
| Book of the Dead | 6 | 1 | 1 | 1 | 2 | 0 |
| Path to Ascendancy | 6 | 1 | 1 | 3 | 3 | 0 |
| Mistborn | 4 | 1 | 1 | 3 | 0 | 0 |
| Murderbot | 5 | 1 | 1 | 3 | 1 | 0 |
| Scholomance | 6 | 1 | 1 | 3 | 0 | 0 |
| Masquerade | 4 | 1 | 1 | 3 | 0 | 0 |
| Path to Ascendancy GB | 9 | 1 | 1 | 3 | 1 | 0 |

Counts match result usage. All cases stay below 12 combined Apple starts; page starts consume the same usage counter and have an additional six-page ceiling. Zero DeepSeek calls and zero input/output tokens occurred. Results contain 10 identities, 7 dated book proposals, 7 dated audio proposals, 3 undated book announcements, and 2 undated audio announcements. These are counts, not a universal coverage threshold.

Eight runs are operationally partial and five complete. Partial reasons represent retrieval/shape/allocation limitations alongside preserved valid facts: Hierarchy and Bound report invalid-evidence; Ana, Mistborn and Murderbot report budget plus invalid-evidence; Witness reports budget plus unknown-identity; Devils reports budget, invalid-evidence and unknown-identity; Path reports provider-error, budget and unknown-identity. Do not convert these reasons into a claim that their separately supported dates are false. Conversely a complete status with unknown formats means the attempt finished without recorded operational failure, not that every field is known.

No critical unsupported-proposal defect was found. Material limits to retain in the handoff are the three named unsupported known cases, live GB preferred-country shortfall, novella versus main-novel semantics for Murderbot, and the sanitized-artifact replay limit. The old phase report's failed original pilot is immutable; this authorized batch supplies new measured evidence rather than changing that historical outcome.

## Durable handoff and aggregate usage

| Measure | Observed total |
| --- | ---: |
| Cases | 13 |
| Identities | 10 |
| Dated book proposals | 7 |
| Dated audio proposals | 7 |
| Undated book announcements | 3 |
| Undated audio announcements | 2 |
| Apple combined API/HTML starts | 70 |
| Hardcover | 13 |
| Google Books | 13 |
| Open Library | 32 |
| Tavily | 15 |
| DeepSeek calls / input tokens / output tokens | 0 / 0 / 0 |

These totals are actual runtime starts from the sanitized results, not provider billing, quota remaining or an estimate. All 14 offered dates were independently corroborated. The independently audited result was 10/13 identities, with known-case coverage 5/8 and the three unsupported cases explicitly named above. Four additional cases and one GB control supplied the other five identities. The first 14-case pilot and the separate four-case pilot remain failed historical observations with zero supported dates. This batch does not rewrite them.

The underlying sanitized files are `.superpowers/sdd/2026-09-30-discovery-retrieval-diagnostics/phase2-free-pages-*-1/{result,counts,implementation,reservation}.json`; that scratch directory is ignored. This tracked report preserves case-level fields, actual counts, source proof links and caveats so the handoff does not depend on ignored scratch. Source quotes, raw responses and credentials are deliberately absent. The independent audit is `.superpowers/sdd/2026-09-30-discovery-fact-windows/free-pages-audit.md`.

A separate Hardcover defect was discovered: a Hierarchy audio record listed October 11 instead of the independently supported November 11 day. Hardcover dates are quarantined from proposals entirely; its identity/English edition gates do not confer date authority. Same-title dates from another provider are never treated as proof of the same edition.

Final integration status, 2026-10-01: Phase 2 implementation and verification are complete with the named limits above. Fresh checks passed 1133 tests across 33 files, typecheck, build (55 modules) and all 24 browser tests (14 discovery, 10 existing workflows, 10.7 seconds). Deterministic preferred-GB precedence and withheld-CA fallback controls passed independently by format. Migration/recovery, acceptance, app wiring, service-absent/manual offline and keyboard checks passed. Actual wired views at 1440 and 390 pixels were readable without horizontal overflow. Independent scoped re-review approved the custom-order repair after 82 focused tests with no new material findings. Rebuilt credential scanning found no frontend leak, and local startup/frontend HTTP 200/proxied capabilities passed without provider calls. These are integration results, not new live-provider observations. Changes remain uncommitted and unmerged. See [usage](discovery-usage.md), [plan](superpowers/plans/2026-09-29-release-discovery.md) and [specification](superpowers/specs/2026-09-29-release-discovery-design.md).
