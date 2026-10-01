# Existing-app research for phase 2

Researched 2026-09-29. These observations inform the proposed design; they do not establish how every product handles country fallback.

| Product or system | Documented behavior | Consequence for SeriesTrackr |
| --- | --- | --- |
| BookWyrm | Its [book-data vocabulary](https://docs.joinbookwyrm.com/bookwyrm-vocabulary.html) distinguishes works, editions, edition languages, physical formats, publication dates and series membership. Its [catalog workflow](https://docs.joinbookwyrm.com/adding-books.html) supports searching external catalogs, choosing another edition and entering a book manually. | Keep next-work identity separate from edition evidence. Preserve manual entry when catalogs cannot resolve a record. This is a design inference, not a claim that BookWyrm implements our release policy. |
| Book Notification | Its [roadmap](https://www.booknotification.com/site-roadmap/) describes ongoing database checking, author/series audits and work on chronological reading order. Its [site](https://www.booknotification.com/) provides author/series following and upcoming-release tracking. | Series order needs its own evidence and correction path. A release date alone does not identify the next main novel. Do not assume a small unattended extractor can reproduce a curated database's coverage. |
| Readarr | The [project's retirement announcement](https://readarr.com/) attributes retirement partly to unusable metadata and a stalled Open Library transition. | Keep providers replaceable and preserve the local manual tracker when discovery is unavailable. Readarr is an architectural caution, not a proposed dependency. |
| Penguin Random House developer platform | Its [representative-edition rules](https://developer.penguinrandomhouse.com/docs/read/enhanced_prh_api/concepts/Frontlistiest) favor the edition receiving promotion, using format priorities and descending publication dates. A work groups multiple ISBNs. | Neither the first search result nor the representative edition necessarily gives earliest availability. Compare qualifying editions explicitly. Do not add a publisher-specific API dependency in this phase. |

No source above establishes the exact rule we need: prefer the user's chosen country when it has a supported date, otherwise accept any supported market independently for book and audio. That remains a user-defined policy, implemented locally rather than delegated to a provider.

## Effect on our discoveries

The research supports the catalog-first recommendation and changes the implementation emphasis:

1. Resolve series/author/position separately from format/date/language/market. Reject novellas, translations, boxed sets and unrelated same-name books unless they match the explicitly selected reading order.
2. Select an edition using our policy, not a catalog's ordering. Preserve actual country attribution and expose same-edition date disagreements.
3. Treat incomplete retrieval as incomplete evidence. Keep current accepted facts and provide source links for manual review.
4. Test the production retrieval path before adding storage migration or UI. Our successful DeepSeek trial interpreted assistant-prepared summaries; it did not prove this retrieval path.

## Search implementation verified for the plan

The current [Tavily Search reference](https://docs.tavily.com/documentation/api-reference/endpoint/search) supports `include_raw_content: "text"`, explicit `search_depth: "basic"`, `include_answer: false` and `auto_parameters: false`. Country boosts ranking; it does not prove a result's market. The plan therefore omits country restrictions and checks country evidence in each result.

The [credit documentation](https://docs.tavily.com/documentation/api-credits) lists 1,000 free credits per month and one credit per basic search. Three searches per check is a proposed ceiling, not measured average usage or a guarantee that an account has that quota remaining. No Extract, Crawl, Research or paid fallback is included. Account-level access and useful raw-content coverage still require a live pilot.

DeepSeek remains the sole proposed AI provider. Its [pricing](https://api-docs.deepseek.com/quick_start/pricing) describes token billing, and its [Responses API documentation](https://api-docs.deepseek.com/guides/responses_api) does not provide built-in web search. Free retrieval and bounded extraction are separate responsibilities. The saved [trial results](discovery-deepseek-real-check.json) support testing that composition, not claiming free AI or universal discovery.
