# ISBN join validation amendment

Scope: preserve the opt-in catalog feature and validate only the ebook ISBN lookup path with fictional provider fixtures. Keep the option off by default and retain Apple 12, Google Books 2, Open Library 3 request limits. No secrets, live calls, commits, ASIN joins, or Hardcover adapter.

1. Add failing tests for identifier-bearing source attribution, a contradictory response ISBN, ambiguous storefront language, conflicting catalog languages in either order, and actual audio-only requests.
2. Join only ebook editions with the same ISBN, title, author, and format. Retain all matching identifier-bearing citations. Reject a supplied response ISBN that disagrees with the lookup identifier, and reject multiple distinct storefront editions returned for one identifier.
3. Hydrate language only when storefront metadata is absent and all catalog editions explicitly agree. Explicit ambiguity or disagreement remains unknown. Preserve the exact ISBN as the joined edition key and cite the lookup association and catalog evidence when canonicalizing the title.
4. Run the scoped tests first for RED and GREEN, then the existing discovery suite and typecheck. Record remaining limits: opt-in only, ebook only, and lookup association relies on the provider's ISBN request semantics when its response omits ISBN metadata.

## Validation results

The initial fictional regression run produced 7 failures out of 13 tests. After the scoped implementation changes, all 13 passed. The full discovery suite passed 837 tests across 18 files, and `npm run typecheck` passed.

The existing Google Books normalizer admits English rows only, so the final conflicting-language fixtures retain English and French Open Library editions in both edition orders alongside Google evidence. Unknown language is preserved for conflicting or ambiguous metadata. Source citations include both the lookup association and the identifier-bearing catalog evidence.

Activation remains separately gated: the option is still off by default, and these local fixtures do not establish live provider lookup behavior. A response with no ISBN is associated through the ISBN-keyed lookup request and a single returned ebook record. ISBN-10/ISBN-13 conversion equivalence is not added; supplied differing ISBN values are rejected conservatively. No ASIN or audiobook lookup path is introduced.
# Live qualification update

The exclusive hierarchy-isbn-seed-2 catalog diagnostic used1Hardcover,1Google,7Apple and3OpenLibrary attempts, noAI or retries. It resolved the English canonical title and offered CA ebook2025-11-11 through ISBN9781982141257. The independently fetched Apple product JSON-LD confirms the same ISBN, explicit English and date. Enable the reviewed ebook-only ISBN join in production runtime, preserving exact author/ISBN, contradiction guards, citation closure and total12Apple count. This successful diagnostic does not alone pass the multi-case release gate.
