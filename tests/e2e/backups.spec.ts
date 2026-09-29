import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('failed recovery reset leaves raw storage downloadable through the real modal flow', async ({ page }) => {
  await page.addInitScript(() => {
    const key = 'seriestrackr:v1';
    localStorage.setItem(key, '{broken');
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new Error('quota exceeded');
      return original.call(this, name, value);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Backups', exact: true }).click();
  await page.getByRole('button', { name: 'Reset library' }).click();
  await page.getByRole('button', { name: 'Confirm reset' }).click();

  await expect(page.getByRole('dialog', { name: 'Which releases should we track?' })).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('quota exceeded');
  await page.getByRole('button', { name: 'Open backups' }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download stored data' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('seriestrackr-recovery.txt');
  expect(await readFile(await download.path(), 'utf-8')).toBe('{broken');
  expect(await page.evaluate(() => localStorage.getItem('seriestrackr:v1'))).toBe('{broken');
});
