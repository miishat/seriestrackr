import { expect, test } from '@playwright/test';

const key = 'seriestrackr:v1';

test.use({ viewport: { width: 390, height: 800 } });

for (const view of ['grid', 'compact', 'list'] as const) {
  test(`unverified cover and old evidence labels fit 390px in ${view} view`, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Default market').selectOption('CA');
    await page.getByRole('button', { name: 'Start tracking' }).click();
    await page.getByRole('button', { name: 'Add series', exact: true }).click();
    await page.getByLabel('Series name', { exact: true }).fill('Example series');
    await page.getByLabel('Author', { exact: true }).fill('Example author');
    await page.getByLabel('Next book title').fill('Second');
    await page.getByLabel('Cover URL').fill('https://example.com/cover.jpg');
    await expect(page.getByText(/Current cover is unverified/)).toBeVisible();
    await page.getByRole('button', { name: 'Save series' }).click();
    await page.evaluate(([storageKey, mode]) => {
      const doc = JSON.parse(localStorage.getItem(storageKey)!);
      const checkedAt = '2026-01-05T12:00:00Z';
      doc.settings.view = mode;
      doc.series[0].releases.book = { state: 'announced', date: null, origin: 'discovery', lastCheckedAt: checkedAt,
        source: { title: 'Second', url: 'https://hardcover.app/books/second' },
        provenance: { checkedAt, sources: [{ id: 'h', title: 'Second', url: 'https://hardcover.app/books/second' }], preferredMarket: 'CA', sourceMarket: null,
          language: 'en', editionFormat: 'ebook', editionKey: null, datePrecision: 'none', interpreted: false } };
      localStorage.setItem(storageKey, JSON.stringify(doc));
    }, [key, view] as const);
    await page.reload();
    if (view !== 'list') await expect(page.getByText('Cover unverified')).toBeVisible();
    await expect(page.getByText(/Evidence is old/).first()).toBeVisible();
    if (view === 'compact') await page.getByText(/Release Details/).click();
    await expect(page.getByRole('button', { name: /Review book announcement again/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: /Review book announcement again/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
}
