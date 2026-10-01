import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const output = 'node_modules/.cache/playwright-visual';
const release = (state: string, date: string | null = null) => ({ state, date, source: null, origin: 'manual', lastCheckedAt: null });
const baseSeries = {
  author: 'A very long author name that needs to wrap naturally', readingStatus: 'active',
  lastFinished: { position: 1, title: 'The first book' }, currentBook: null,
  next: { positionOverride: null, title: 'A very long next book title with enough words to wrap across several lines', orderNote: '' },
  publicationRunComplete: false, latestPublishedPosition: null, marketOverride: null,
  formats: { book: true, audio: true },
  releases: { book: release('scheduled', '2099-03-15'), audio: release('announced') },
};
const seedDocument = {
  version: 1,
  settings: { market: 'CA', language: 'en', theme: 'light', view: 'grid', showCovers: true },
  series: [
    { ...baseSeries, id: 'visual-cover', name: 'The Witness Trilogy: the unusually long card heading', coverUrl: 'https://covers.example.test/cover.svg' },
    { ...baseSeries, id: 'visual-broken', name: 'Broken cover example', coverUrl: 'https://covers.example.test/missing.svg' },
    { ...baseSeries, id: 'visual-one-format', name: 'Book only example', coverUrl: null, formats: { book: true, audio: false } },
  ],
};

async function clippedElements(page: import('@playwright/test').Page): Promise<string[]> {
  const viewport = await page.evaluate(() => window.innerWidth);
  const outsideViewport = await page.locator('.brand, .site-header nav button, .library-tools input, .library-tools summary, .library-tools button, .series-card, .series-card button, .next-phase').evaluateAll((elements, viewport) =>
    elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left < -1 || rect.right > viewport + 1 ? [`${element.tagName.toLowerCase()} ${element.textContent?.trim().slice(0, 32) ?? ''}: ${Math.round(rect.left)}..${Math.round(rect.right)} outside 0..${viewport}`] : [];
    }), viewport);
  const clippedText = await page.locator('.brand, .intro, .filter-menu summary, .series-card h2, .release-summary, .next-phase p').evaluateAll((elements) =>
    elements.flatMap((element) => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1
      ? [`${element.tagName.toLowerCase()} ${element.textContent?.trim().slice(0, 32) ?? ''}: content ${element.scrollWidth}px exceeds ${element.clientWidth}px`]
      : []));
  return [...outsideViewport, ...clippedText];
}

async function setTheme(page: import('@playwright/test').Page, theme: 'light' | 'dark') {
  const toggle = page.getByRole('button', { name: theme === 'light' ? 'Light theme' : 'Dark theme' });
  if (await toggle.count()) await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

test('approved desktop card states fit both widths, themes and 200% effective zoom', async ({ page }) => {
  await page.route('https://covers.example.test/cover.svg', (route) => route.fulfill({
    status: 200, contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><rect width="600" height="900" fill="#294d52"/><rect x="40" y="40" width="520" height="820" fill="#d7bd89"/><text x="300" y="320" text-anchor="middle" font-family="serif" font-size="48" fill="#173943">THE WITNESS</text><text x="300" y="390" text-anchor="middle" font-family="serif" font-size="45" fill="#173943">TRILOGY</text></svg>',
  }));
  await page.route('https://covers.example.test/missing.svg', (route) => route.abort());
  await page.addInitScript((seed) => localStorage.setItem('seriestrackr:v1', JSON.stringify(seed)), seedDocument);
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect(page.locator('.series-card')).toHaveCount(3);
  await expect(page.getByText('No cover available')).toHaveCount(2);
  await expect(page.locator('.cover-image')).toHaveCount(1);
  await expect.poll(() => page.locator('.cover-image').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(600);
  await mkdir(output, { recursive: true });

  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await expect.poll(() => clippedElements(page)).toEqual([]);
      await page.screenshot({ path: `${output}/cards-${width}-${theme}.png`, fullPage: true });
    }
  }
  for (const width of [1440, 1024]) {
    // Browser zoom halves the effective CSS viewport at 200%. Set that viewport
    // directly so screenshots and element bounds use the same dimensions.
    await page.setViewportSize({ width: width / 2, height: 900 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width / 2);
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await expect.poll(() => clippedElements(page)).toEqual([]);
      await page.screenshot({ path: `${output}/cards-${width}-${theme}-zoom-200.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.getByLabel('Search series or author').fill('no result for this query');
  await expect(page.getByText('No matching series')).toBeVisible();
  await page.screenshot({ path: `${output}/empty-search.png`, fullPage: true });
  await page.getByLabel('Search series or author').fill('');
  await setTheme(page, 'light');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'seriestrackr:v1') throw new Error('quota exceeded');
      original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Dark theme' }).click();
  await expect(page.getByRole('alert')).toContainText('Changes are in memory and may be lost');
  await page.screenshot({ path: `${output}/unsaved-banner.png`, fullPage: true });
});
