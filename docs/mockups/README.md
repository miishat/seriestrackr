# SeriesTrackr design preview

Open seriestrackr-directions.html directly in a desktop browser. It is self-contained and does not require npm, external assets, credentials or a server. The current review session also serves it at http://127.0.0.1:4173 while that local process is running.

- A: release table, an alternate view for comparing many series.
- B: bookshelf cards, the approved default. Sample jacket artwork shows the space for actual next-book covers when available; an absent cover uses a neutral placeholder.
- Toggle theme or empty state, search by series, filter by reading status, and open the editor, setup and backup previews.

All release metadata is fictional. Controls demonstrate presentation only; edits, backups and market selection do not save data. These records are not a proposed initial library. The final product starts empty.

Screenshots: direction-a.jpg and direction-b.jpg.

## Verification

Verified in Edge during the planning session: A/B switching, search reducing the displayed records, empty-state toggle, light/dark toggle, editor opening and Escape dismissal with focus returned to the opener, setup dialog and backup dialog. The standalone script also passed a JavaScript syntax check. The in-app browser rendered the table, but its automation clicks did not consistently update the page; interaction checks were completed in Edge instead.

These are mockup checks, not production app tests. No production dependencies were installed and no product build or test suite was run in this planning session.
