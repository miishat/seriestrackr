# Next-book probe, 2026-10-03

Probe: `probe.ts release` (live providers, unchanged production pipeline, useAi false, market US). Library: `library-snapshot.json` (private, not committed).

## The Bound and the Broken (Ryan Cahill)
- Request: position 5, title empty (snapshot: last finished "Of Empires and Dust" #4, `next.title` empty).
- `proposals.identity`: none. `releases.book` and `releases.audio`: none (unknown). `summary.reasons`: `budget`, `unknown-identity`.
- Compared with 2026-10-01: that snapshot had `Of Gods and Ashes` as next; now the title is gone. This is a regression, not a moved target.
- Cause: the Hardcover call returns `{"data":{"series":[]}}`. The series exists (id 4979, name "The Bound and the Broken") and does list position 5 "Of Gods and Ashes" (release_date 2028-01-01), but its author is stored as `Ryan  Cahill` (two spaces). The query filters `author: {name: {_eq: "Ryan Cahill"}}`, so zero rows come back. Confirmed by a direct Hardcover query by series name only.
- This is NOT the series-row bound in the brief's table (the call returns nothing, not too many rows). `budget` comes from the later stages, with no identity to work from.
- Apple audio does list Books 1 to 4 (Of Empires and Dust 2025-09-30) and novellas; no Book 5 anywhere except Hardcover. Apple ebook and Google Books hold only older/Italian/collector editions.

## Dungeon Crawler Carl (Matt Dinniman)
- Request: position 8, title "A Parade of Horribles".
- Identity: present (Hardcover, position 8). `releases.book`: catalogued, no date (Hardcover, print/ebook editions without a date). `releases.audio`: dated 2026-05-12, US, Apple audiobook "A Parade of Horribles: Dungeon Crawler Carl, Book 8 (Unabridged)", published (past date). No Apple ebook exists in the US results. `summary.reasons`: `invalid-evidence` (status partial; both formats supported).
- No code defect shown. The target moved: the user finished book 7, so book 8 is correct.

## Book of the Dead (RinoZ)
- Request: position 5, title "Ascension". Identity present (Hardcover). `releases.book`: catalogued, no date. `releases.audio`: 2026-08-19, US, Apple audiobook. `summary.reasons`: none.
- Healthy.

## The Dark Profit Saga (J. Zachary Pike)
- Request: position 4, title empty (last finished "Dragonfired" #3).
- `proposals.identity`: none. `releases`: none. `summary.reasons`: `budget`, `unknown-identity`.
- Hardcover has the series (id 6611, author name correct) but lists only positions 1, 2, 2.1, 2.5, 3; no position 4, so `book_series` is empty for the position filter. Not a guard or author problem.
- Apple audio lists "Crypt Currency: The Dark Profit Saga, Book 4 (Unabridged)", 2026-05-19, but with no catalog identity to bind to it. Google Books and Apple ebook do not list Crypt Currency. This is the author-site continuation case for Task 5.

## Cause table
| Series | Table cause | Applies |
|---|---|---|
| Bound and the Broken | Hardcover author `_eq` with a double-space author name (not in the table) | Needs a decision |
| Dungeon Crawler Carl | target moved | Yes, no change |
| Book of the Dead | none | Healthy |
| Dark Profit Saga | missing Hardcover position, Task 5 | Task 5 |

## Fix applied (Bound and the Broken)
Hardcover rejects _ilike, _like and regex operators (checked live), so the author filter was removed from the query instead. The query now filters series by name only (limit 20). The author is matched in `normalizeHardcover` with `normalizeIdentity` before the six-row ambiguity bound, so same-name series by other authors are rejected as author-mismatch and never counted. After the fix the probe returns identity "Of Gods and Ashes" at position 5 (book catalogued, no date; audio none), with no reasons. Replay: `tests/discovery/data/pipeline-repair/the-bound-and-the-broken-replay.json`, recorded from the post-fix probe run. Ten existing replay fixtures had the `author` variable removed from their recorded Hardcover query; the cover query (server/discovery/covers.ts) still uses the author filter and is unchanged.
