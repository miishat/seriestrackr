import { expect, test, type Page } from '@playwright/test';
import type { CheckRequest } from '../../shared/discovery';
import { response } from '../discovery/fixtures';
import { seriesFixture } from '../fixtures';
import { seedIdentity } from './identity-fixtures';
import { mkdir } from 'node:fs/promises';

const capabilities = {
  search: false, ai: false, googleBooks: false, hardcover: false, model: 'deepseek-flash',
  limits: { search: 3, ai: 1, googleBooks: 2, hardcover: 1, outputTokens: 2048, inputBytes: 20000 },
  pricingAsOf: '2026-09-29', estimatedMaxAiUsd: 0.02,
};
// Recently checked, so the automatic check on open leaves these manual-flow specs alone.
const checkedSeries = () => seriesFixture({ lastCheck: { ...response().summary, checkedAt: new Date().toISOString() } });
const output = 'node_modules/.cache/playwright-visual';
async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  const dialog = page.getByRole('dialog').last();
  if (await dialog.count()) {
    await dialog.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.screenshot({ path: `${output}/${name}-footer.png`, fullPage: true });
    await dialog.evaluate(el => { el.scrollTop = 0; });
  }
}

test('D and T2 keep discovery review usable at narrow widths', async ({ page }) => {
  let checkCount = 0;
  await seedIdentity(page, 'dark', [checkedSeries()]);
  await page.route('**/api/discovery/capabilities', route => route.fulfill({ json: capabilities }));
  await page.route('**/api/discovery/check', route => {
    checkCount++;
    const sent = route.request().postDataJSON() as CheckRequest;
    const result = response();
    result.requestId = sent.requestId; result.seriesId = sent.seriesId;
    result.summary.requestId = sent.requestId;
    result.summary.status = 'partial'; result.summary.reasons = ['quota'];
    result.proposals.releases.book!.provenance.sourceMarket = 'GB';
    return route.fulfill({ json: result });
  });
  await page.goto('/'); expect(checkCount).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  const opener = page.getByRole('button', { name: 'Check Releases', exact: true });
  await opener.focus(); await page.keyboard.press('Enter');
  const ready = page.getByRole('dialog', { name: 'Check Release' });
  await expect(ready).toBeVisible();
  await expect(ready.getByLabel('Use DeepSeek for this check')).not.toBeChecked();
  await ready.getByRole('button', { name: 'Check', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Check Release' });
  await expect(review).toBeVisible();
  await expect(review.getByRole('heading', { name: 'Check Release' })).toHaveCSS('font-family', /Newsreader/);
  await expect(review.getByText('Check partially completed', { exact: true })).toBeVisible();
  await review.getByRole('tab', { name: /^Book/ }).click();
  await expect(review.getByText('Date from GB; no supported CA date found in sources checked.')).toBeVisible();
  const save = review.getByRole('button', { name: 'Save Selected Changes', exact: true });
  await expect(save).toBeDisabled();
  await review.getByRole('tab', { name: /^Book/ }).click();
  const book = review.getByRole('checkbox', { name: 'Save Book', exact: true });
  await book.focus(); await page.keyboard.press('Space');
  await expect(save).toBeEnabled();
  await save.focus(); await expect(save).toHaveCSS('outline-style', 'solid');
  await expect.poll(() => review.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await capture(page, 'identity-discovery-dark-390');
  await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
  expect(checkCount).toBe(1);
});

for (const theme of ['light', 'dark'] as const) for (const width of [390, 1024]) {
  test(`discovery inventory ${theme} ${width}`, async ({ page }) => {
    await seedIdentity(page, theme, [checkedSeries()]);
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/discovery/capabilities', route => route.fulfill({ json: capabilities }));
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    let conflict = false;
    await page.route('**/api/discovery/check', async route => {
      const sent = route.request().postDataJSON() as CheckRequest;
      await pending;
      const result = response();
      result.requestId = sent.requestId; result.seriesId = sent.seriesId; result.summary.requestId = sent.requestId;
      if (conflict) result.proposals.conflicts = [{ format: 'book', evidenceIds: ['fake-a', 'fake-b'], reason: 'Sources disagree about the release date.' }];
      await route.fulfill({ json: result });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Check Releases', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Check Release' })).toBeVisible();
    await capture(page, `discovery-ready-${theme}-${width}`);
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Check Release' })).toBeVisible();
    await capture(page, `discovery-checking-${theme}-${width}`);
    release();
    await expect(page.getByRole('dialog', { name: 'Check Release' })).toBeVisible();
    await capture(page, `discovery-review-${theme}-${width}`);
    conflict = true;
    await page.getByRole('button', { name: 'Check Again', exact: true }).click();
    await page.getByRole('tab', { name: /^Book/ }).click();
    await expect(page.getByText('Sources disagree about the release date.')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Save Book', exact: true })).toBeDisabled();
    await capture(page, `discovery-conflict-${theme}-${width}`);
    await page.getByText('Sources disagree about the release date.').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/discovery-conflict-${theme}-${width}-warning.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await page.route('**/api/discovery/capabilities', route => route.abort());
    await page.getByRole('button', { name: 'Check Releases', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Check Release' })).toBeVisible();
    await capture(page, `discovery-error-${theme}-${width}`);
  });
}

test('stale fake response remains visibly unsaveable', async ({ page }) => {
  await seedIdentity(page, 'dark', [checkedSeries()]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/discovery/capabilities', route => route.fulfill({ json: capabilities }));
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/discovery/check', async route => {
    const sent = route.request().postDataJSON() as CheckRequest;
    await pending;
    const result = response(); result.requestId = sent.requestId; result.seriesId = sent.seriesId; result.summary.requestId = sent.requestId;
    await route.fulfill({ json: result });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Check Releases', exact: true }).click();
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Check Release' })).toBeVisible();
  // Simulate an in-flight library mutation, as in the existing stale regression.
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Mark finished')!.click());
  release();
  await expect(page.getByText('The series changed. Check Again before saving.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Selected Changes' })).toHaveCount(0);
  await capture(page, 'discovery-stale-dark-390');
});

for (const theme of ['light', 'dark'] as const) for (const width of [390, 1024]) {
  test(`manual dialog inventory ${theme} ${width}`, async ({ page }) => {
    await seedIdentity(page, theme); await page.setViewportSize({ width, height: 900 }); await page.goto('/');
    for (const view of ['Grid', 'Compact', 'Table']) {
      await page.getByRole('button', { name: view, exact: true }).click();
      await capture(page, `library-${theme}-${width}-${view}`);
    }
    await page.getByRole('button', { name: 'Grid', exact: true }).click();
    await page.getByLabel('Search series or author').fill('no such series');
    await expect(page.getByText('No matching series')).toBeVisible();
    await capture(page, `empty-search-${theme}-${width}`);
    await page.getByLabel('Search series or author').fill('');
    for (const name of ['Settings', 'Backups']) {
      await page.getByRole('button', { name: name === 'Settings' ? 'Settings' : name, exact: true }).click();
      await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible();
      await capture(page, `${name.toLowerCase()}-${theme}-${width}`); await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: 'Add series', exact: true }).click();
    await page.getByRole('button', { name: 'Save series', exact: true }).click();
    await expect(page.locator('.form-error')).toBeVisible();
    await capture(page, `editor-validation-${theme}-${width}`); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Edit details', exact: true }).first().click();
    await page.getByLabel('Next book title').fill('An edited next title');
    await page.getByRole('button', { name: 'Save series', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Confirm reset', exact: true })).toBeVisible();
    await capture(page, `reset-confirmation-${theme}-${width}`);
  });
  test(`empty library ${theme} ${width}`, async ({ page }) => {
    await seedIdentity(page, theme, []); await page.setViewportSize({ width, height: 900 }); await page.goto('/');
    await expect(page.getByText('Your bookshelf is empty', { exact: true })).toBeVisible();
    await capture(page, `empty-library-${theme}-${width}`);
  });
}
