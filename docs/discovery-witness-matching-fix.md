# Witness matching follow-up, 2026-10-01

The reported failure was reproduced: the catalogs retrieved *Legacies of Betrayal: The Third Tale of Witness*, but the free parser only recognized narrow cardinal Book-number subtitles. Apple's catalog records did not supply a series position. The requested singular `The Tale of Witness` also failed to generate Hardcover's plural `Tales of Witness` alias. Retrieved links therefore survived while the next-title identity stayed unknown and dependent dates were withheld.

The repair recognizes explicit first-through-tenth `The <ordinal> Tale of <requested series>` subtitles, including the bounded `A Novel of ...` qualifier. It handles either a separate subtitle or the exact qualifier embedded in the catalog title. Both forms produce one canonical work, preserving the literal catalog label in cited evidence. This is request-derived grammar, not a hardcoded Witness exception or fuzzy title matching. Author, English-language, requested-position, companion and custom-order guards remain in place. Apple still requires its literal API title and author to agree with the same product's JSON-LD; only the supported qualifier relates that product to the canonical title. Hardcover remains excluded as a date authority.

## Live result

One production check used the user's series name `The Tale of Witness`, Steven Erikson, position 3, unknown next title, CA, both formats, blank order note and AI off. It found **Legacies of Betrayal** and these independently checked primary-product dates:

| Format | English source market | Supported day | Primary source |
| --- | --- | --- | --- |
| Ebook | CA | 2026-10-01 | [Apple book product](https://books.apple.com/ca/book/legacies-of-betrayal-the-third-tale-of-witness/id6759184295) |
| Audiobook | CA | 2026-10-01 | [Apple audio product](https://books.apple.com/ca/audiobook/legacies-of-betrayal-the-third-tale-of-witness/id1892305374) |

The production check attempted 1 Hardcover, 1 Google Books, 4 Apple and 1 Open Library request, with zero Tavily or DeepSeek requests and no retries. A separate two-page verification confirmed the same exact products, English language and dates through the repaired parser. Total Apple starts across check and verification: 6. No accepted user data was changed by testing.

The check remains operationally partial because bounded results/evidence can be truncated. Supported proposals are still available. The UI warning now says that source results or requests exceeded check limits, rather than claiming the provider request allowance was necessarily exhausted.

## Verification and limits

Meaningful regressions failed before the repair. All 1,164 tests across 33 files, typecheck and build passed afterward. An independent review found one inaccurate Apple citation label; two failing citation regressions covered its repair. Scoped re-review approved the corrected labels and warning copy. Existing unabridged audio labels retain their distinct truthful description.

The historical 13-case pilot and its failures are unchanged. This follow-up establishes support for this Witness input and the two linked editions, not universal series, ordinal or market coverage. Nonblank custom-order notes remain source-only/manual. The ordinal grammar stops at tenth and unsupported qualifiers remain unknown. Ignored diagnostic reservations and sanitized results remain under `.superpowers/sdd/witness-matching-fix/` for recovery without exposing credentials or raw HTML.
