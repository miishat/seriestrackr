# Ascension book date

The saved 2026-10-03 Book of the Dead check retrieved Aethon's exact Book 5 product page, including `Price Ebook` and `Publication Date: July 22, 2026`. Hardcover supplied English ebook format evidence but no date. The deterministic primary-source interpreter previously emitted reading-order identity only, leaving optional AI to interpret the publisher page without combining its language evidence with the catalog.

The fix reads Aethon's numbered product header and Book Details publication-date/format fields. It requires matching English catalog evidence for the same title, author and format, retains literal citations from both sources, and leaves country and edition identifier unspecified. Recommendations cannot provide the product date. Invalid dates, ambiguous date fields, wrong volumes/authors/hosts, absent language proof and absent format fields are rejected.

Replaying the saved catalog and search responses now produces book date `2026-07-22` and retains the independent audiobook date `2026-08-19`. The publisher page was also checked live and still lists July 22, 2026. This does not establish the exact cause of the user's latest AI output, which was not captured. It removes reliance on that output for this publisher metadata pattern.
