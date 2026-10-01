import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { seedIdentity } from './identity-fixtures';

test('opening a filter closes the other filter without clearing selections', async ({ page }) => {
  await seedIdentity(page);
  await page.goto('/');
  await page.getByText('All reading statuses', { exact: true }).click();
  const active = page.getByRole('checkbox', { name: 'Reading status: Active', exact: true });
  await active.check();
  await page.getByText('All book statuses', { exact: true }).click();
  await expect(page.getByRole('group', { name: 'Reading status', exact: true })).not.toBeVisible();
  await expect(page.getByRole('group', { name: 'Book availability', exact: true })).toBeVisible();
  const audio = page.getByText('All audiobook statuses', { exact: true });
  await audio.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('group', { name: 'Book availability', exact: true })).not.toBeVisible();
  await expect(page.getByRole('group', { name: 'Audiobook availability', exact: true })).toBeVisible();
  await page.getByText('Reading status: 1 selected', { exact: true }).click();
  await expect(active).toBeChecked();
  await expect(page.getByRole('group', { name: 'Audiobook availability', exact: true })).not.toBeVisible();
  await page.getByRole('heading', { name: 'What comes next?' }).click();
  await expect(page.getByRole('group', { name: 'Reading status', exact: true })).not.toBeVisible();
  await page.getByText('Reading status: 1 selected', { exact: true }).click();
  await expect(active).toBeChecked();
  await active.focus();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Reading status: 1 selected', { exact: true })).toBeFocused();
  await expect(page.getByRole('group', { name: 'Reading status', exact: true })).not.toBeVisible();
});

test('compact shows horizontal rows distinctly smaller than grid cards', async ({ page }) => {
  await seedIdentity(page);
  await page.setViewportSize({ width: 1391, height: 1244 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const grid = await page.locator('.series-card').first().boundingBox();
  await page.getByRole('button', { name: 'Compact', exact: true }).click();
  const compact = await page.locator('.series-card').first().boundingBox();
  expect(compact!.width).toBeGreaterThan(grid!.width * 2);
  expect(compact!.height).toBeLessThan(grid!.height * 0.75);
  await mkdir('node_modules/.cache/playwright-visual', { recursive: true });
  await page.screenshot({ path: 'node_modules/.cache/playwright-visual/compact-1391-dark.png', fullPage: true });
});

test('organized library tools fit desktop and phone and retain filtering', async ({ page }) => {
  await seedIdentity(page);
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await mkdir('node_modules/.cache/playwright-visual', { recursive: true });
  for (const width of [1091, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark'] as const) {
      const toggle = page.getByRole('button', { name: theme === 'light' ? 'Light Theme' : 'Dark Theme', exact: true });
      if (await toggle.count()) await toggle.click();
      await expect(page.getByRole('group', { name: 'Filters', exact: true })).toBeVisible();
      await expect(page.getByRole('group', { name: 'View', exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 1091) {
        const search = await page.getByLabel('Search series or author').boundingBox();
        const add = await page.getByRole('button', { name: 'Add series', exact: true }).boundingBox();
        expect(Math.abs(search!.y - add!.y)).toBeLessThan(2);
      }
      await page.screenshot({ path: `node_modules/.cache/playwright-visual/toolbar-${width}-${theme}.png`, fullPage: true });
    }
  }
  await page.getByLabel('Search series or author').fill('Glass');
  await expect(page.locator('.series-card')).toHaveCount(1);
  await page.getByLabel('Search series or author').fill('');
  await page.getByText('All book statuses', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Book availability: Available', exact: true }).check();
  await expect(page.locator('.series-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Release table' })).toBeVisible();
  await page.getByRole('button', { name: 'Add series', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add series', exact: true })).toBeVisible();
});
