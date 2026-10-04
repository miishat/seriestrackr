import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { seedIdentity } from './identity-fixtures';

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} dialogs theme their controls and preserve keyboard behavior`, async ({ page }) => {
    await seedIdentity(page, theme);
    await page.route('**/api/discovery/capabilities', route => route.fulfill({ json: {
      search: false, ai: false, googleBooks: false, hardcover: false, model: 'deepseek-flash',
      limits: { search: 3, ai: 1, googleBooks: 2, hardcover: 1, outputTokens: 2048, inputBytes: 20000 },
      pricingAsOf: '2026-09-29', estimatedMaxAiUsd: 0.02,
    } }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Add series', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Add series', exact: true });
    const backdrop = await editor.evaluate(el => getComputedStyle(el, '::backdrop').backdropFilter);
    expect(backdrop).toBe('blur(4px)');
    const scrollbar = await editor.evaluate(el => getComputedStyle(el).scrollbarColor);
    expect(scrollbar).toBe(theme === 'dark' ? 'rgb(113, 128, 156) rgb(33, 43, 61)' : 'rgb(97, 112, 103) rgb(255, 255, 255)');
    const book = editor.getByRole('checkbox', { name: 'Track book', exact: true });
    await book.focus();
    await page.keyboard.press('Space');
    await expect(book).not.toBeChecked();
    await expect(book).toHaveCSS('background-color', theme === 'dark' ? 'rgb(33, 43, 61)' : 'rgb(255, 255, 255)');
    await expect(book).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Space');
    await expect(book).toBeChecked();
    await expect(book).toHaveCSS('background-color', theme === 'dark' ? 'rgb(181, 196, 255)' : 'rgb(40, 93, 72)');
    await mkdir('node_modules/.cache/playwright-visual', { recursive: true });
    await page.screenshot({ path: `node_modules/.cache/playwright-visual/modal-editor-${theme}.png`, fullPage: false });
    await page.emulateMedia({ forcedColors: 'active' });
    await expect(book).toHaveCSS('appearance', 'auto');
    await page.emulateMedia({ forcedColors: 'none' });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Add series', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Check Releases', exact: true }).first().click();
    const ready = page.getByRole('dialog', { name: 'Check Release' });
    await expect(ready).toBeVisible();
    await expect(ready.getByRole('checkbox', { name: 'Use DeepSeek for this check' })).toBeDisabled();
    await expect(ready.getByRole('checkbox', { name: 'Use DeepSeek for this check' })).toHaveCSS('opacity', '0.55');
    await page.screenshot({ path: `node_modules/.cache/playwright-visual/modal-discovery-${theme}.png`, fullPage: false });
  });
}
