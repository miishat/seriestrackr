# Dungeon Crawler Carl Book 8: missing book date

Reviewed the saved 2026-10-03 live-provider trace in the original checkout's `docs/investigations/2026-10-03-next-book/dungeon-crawler-carl`, against current discovery code. This is a trace analysis, not a fresh provider run.

## Findings

- Hardcover supplied undated print/ebook edition evidence. Apple ebook search returned no results, including fallback storefronts.
- Google Books returned two records dated 2026-05-12 with `isEbook: false` and `saleability: NOT_FOR_SALE`. A separate ebook returned 2026-10-01 but no `onSaleDate`. `normalizeGoogleBooks` does not use a generic bibliographic publication date as a verified format/market release date. Print records can supply identity, not a dated print release.
- Search successfully retrieved `https://mattdinniman.com/a-parade-of-horribles-release-dates`, including "Update: All versions will release on May 12, 2026." It also retrieved the author's Book 8 page with "Published May 12, 2026". The date was present in normalized source text, so retrieval and truncation did not cause this omission.
- `normalizeSearch` emits sources only. `interpretPrimarySources` adds identities and related-work claims, but no edition release evidence. Consequently these retrieved dates cannot become release proposals through the deterministic pipeline.
- The recorded request had `useAi: false`. The optional extraction step in `runDiscovery` was therefore skipped. It would need to extract valid, cited format-specific evidence to supplement the catalog result; success is not guaranteed merely by enabling it.

## Conclusion

The undated book result reflects an interpretation coverage gap, combined with intentionally conservative Google Books rules. The author date was found but never converted into edition evidence. A general fix would add citation-backed release-date interpretation for explicit author/publisher format announcements, preserving title, author, language, market and format validation. The subsequent fix adds deterministic interpretation of explicit all-version author release announcements, combining matching English catalog format evidence with literal author-page citations. Country stays unspecified. Replaying the saved trace now proposes 2026-05-12 for Book 8. Web search must be enabled to retrieve these announcements; AI alone does not fetch web pages.

