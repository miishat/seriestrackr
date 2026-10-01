import { expect, test } from '@playwright/test';
import { seedIdentity } from './identity-fixtures';

test('T2 fonts load locally and style the actual library', async ({ page }) => {
  const external: string[] = [];
  page.on('request', req => {
    if (new URL(req.url()).hostname !== '127.0.0.1') external.push(req.url());
  });
  await seedIdentity(page); await page.goto('/');
  const faces = await page.evaluate(async () => {
    const results = await Promise.all([
      document.fonts.load('400 40px "Newsreader"'),
      document.fonts.load('400 14px "Manrope"'),
      document.fonts.load('600 14px "Manrope"'),
    ]);
    return results.map(result => result.length);
  });
  expect(faces.every(count => count > 0)).toBe(true);
  await expect(page.locator('h1')).toHaveCSS('font-family', /Newsreader/);
  await expect(page.locator('.series-card h2').first()).toHaveCSS('font-family', /Newsreader/);
  await expect(page.getByLabel('Search series or author')).toHaveCSS('font-family', /Manrope/);
  expect(external).toEqual([]);
});

test('font failure preserves usable controls and fallback text', async ({ page }) => {
  await page.route('**/*.woff2', route => route.abort());
  await seedIdentity(page); await page.goto('/');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect(page.getByRole('heading', { name: 'What comes next?' })).toBeVisible();
  await page.getByLabel('Search series or author').fill('Tidemark');
  await expect(page.locator('.series-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Add series', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add series' })).toBeVisible();
  await expect(page.getByLabel('Series name', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Add series', exact: true })).toBeFocused();
});