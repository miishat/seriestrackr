import { expect, test, type Page } from '@playwright/test';

const key = 'seriestrackr:v1';

async function start(page: Page) {
  await page.goto('/');
  await page.getByLabel('Default market').selectOption('CA');
  await page.getByRole('button', { name: 'Start tracking' }).click();
}

async function addSeries(page: Page, name = 'Example series') {
  await page.getByRole('button', { name: 'Add series', exact: true }).click();
  await page.getByLabel('Series name', { exact: true }).fill(name);
  await page.getByLabel('Author', { exact: true }).fill('Example author');
  await page.getByLabel('Next book title').fill('Second');
}

test('an intentionally empty library stays empty', async ({ page }) => {
  await start(page);
  await addSeries(page);
  await page.getByRole('button', { name: 'Save series' }).click();
  await page.getByRole('button', { name: 'Edit details' }).click();
  await page.getByRole('button', { name: 'Delete series' }).click();
  await page.getByRole('button', { name: 'Delete Example series' }).click();
  await page.reload();
  await expect(page.getByText('Your bookshelf is empty', { exact: true })).toBeVisible();
  expect(JSON.parse(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key) ?? '{}').series).toEqual([]);
});

test('manual book and audio states, finish, undo, reload and format filtering', async ({ page }) => {
  await start(page);
  await addSeries(page);
  await page.getByLabel('Last finished book number').fill('1');
  await page.getByLabel('Last finished title').fill('First');
  await page.getByRole('group', { name: 'Book release', exact: true }).getByRole('combobox').selectOption('scheduled');
  await page.getByLabel('Book release date').fill('2099-01-02');
  await page.getByRole('group', { name: 'Audiobook release', exact: true }).getByRole('combobox').selectOption('released');
  await page.getByRole('button', { name: 'Save series' }).click();
  const card = page.locator('.series-card');
  await expect(card).toContainText('Second');
  await expect(card).toContainText('Scheduled');
  await expect(card).toContainText('Available');
  await page.getByRole('button', { name: 'Mark finished' }).click();
  await expect(card).toContainText('Last finished: Book 2: Second');
  await page.getByRole('button', { name: 'Undo finish' }).click();
  await expect(card).toContainText('Last finished: Book 1: First');
  await page.reload();
  await expect(card).toContainText('Second');
  await expect(page.getByRole('button', { name: 'Undo finish' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Edit details' }).click();
  await page.getByLabel('Track audiobook').uncheck();
  await page.getByRole('button', { name: 'Save series' }).click();
  await page.getByText('All audiobook statuses').click();
  await page.getByLabel('Audiobook availability: Available').check();
  await expect(page.getByText('No matching series')).toBeVisible();
  await page.getByLabel('Audiobook availability: Available').uncheck();
  await page.getByLabel('Search series or author').fill('absent');
  await expect(page.getByText('No matching series')).toBeVisible();
  await page.getByLabel('Search series or author').fill('Example author');
  await expect(card).toBeVisible();
});

test('backup preview can be canceled, then confirmed', async ({ page }) => {
  await start(page);
  await addSeries(page);
  await page.getByRole('button', { name: 'Save series' }).click();
  await page.getByRole('button', { name: 'Backups', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const exported = await download;
  const backup = await (await import('node:fs/promises')).readFile(await exported.path());
  await page.getByRole('button', { name: 'Close Backups' }).click();
  await page.getByRole('button', { name: 'Edit details' }).click();
  await page.getByLabel('Series name', { exact: true }).fill('Changed series');
  await page.getByRole('button', { name: 'Save series' }).click();
  await page.getByRole('button', { name: 'Confirm reset' }).click();
  await page.getByRole('button', { name: 'Backups', exact: true }).click();
  await page.getByLabel('Choose backup file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
  await expect(page.getByRole('region', { name: 'Import preview' })).toContainText('1 series in backup');
  await page.getByRole('button', { name: 'Cancel replacement' }).click();
  await expect(page.getByRole('region', { name: 'Import preview' })).toHaveCount(0);
  await expect(page.getByText('Changed series')).toBeVisible();
  await page.getByLabel('Choose backup file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
  await page.getByRole('button', { name: 'Confirm replacement' }).click();
  await expect(page.getByText('Example series')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Example series')).toBeVisible();
});

test('editor Escape discards changes and restores focus to its opener', async ({ page }) => {
  await start(page);
  await addSeries(page);
  await page.getByRole('button', { name: 'Save series' }).click();
  const opener = page.getByRole('button', { name: 'Edit details' });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Edit series' })).toBeVisible();
  await page.getByLabel('Series name', { exact: true }).fill('Discard this');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Edit series' })).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.getByText('Example series')).toBeVisible();
});

test('keyboard reaches setup, editor, backups and deletion controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Default market')).toBeFocused();
  await page.getByLabel('Default market').selectOption('CA');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Start tracking' })).toBeFocused();
  await page.keyboard.press('Enter');
  const add = page.getByRole('button', { name: 'Add your first series' });
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Series name', { exact: true })).toBeFocused();
  await page.keyboard.type('Keyboard series');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Author', { exact: true })).toBeFocused();
  await page.keyboard.type('Keyboard author');
  await page.getByRole('button', { name: 'Save series' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Keyboard series')).toBeVisible();

  await page.getByRole('button', { name: 'Backups', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Backups' })).toBeVisible();
  await page.getByRole('button', { name: 'Close Backups' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Edit details' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Delete series' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Delete series' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Keyboard series' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Your bookshelf is empty')).toBeVisible();
});

test('manual tracking remains available with remote requests blocked', async ({ page, baseURL }) => {
  const localOrigin = new URL(baseURL!).origin;
  await page.route('**/*', route => new URL(route.request().url()).origin === localOrigin ? route.continue() : route.abort());
  await start(page);
  await addSeries(page, 'Offline series');
  await page.getByRole('button', { name: 'Save series' }).click();
  await page.reload();
  await expect(page.getByText('Offline series')).toBeVisible();
});

test('empty cover lookup leaves manual entry and tracking available', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/discovery/covers', (route) => {
    requests++;
    const request = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ requestId: request.requestId, seriesId: request.seriesId, candidates: [], authorSuggestions: [], outcomes: [{ provider: 'openlibrary', state: 'no-match' }] }) });
  });
  await start(page);
  await addSeries(page);
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'Find cover' }).click();
  await expect(page.getByText('No covers found. You can still add a URL manually.')).toBeVisible();
  expect(requests).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Save series' }).click();
  await expect(page.getByText('No cover available')).toBeVisible();
  await expect(page.getByText('Example series')).toBeVisible();
});

test('corrupted storage offers the original bytes and requires explicit reset', async ({ page }) => {
  await page.addInitScript((storageKey) => localStorage.setItem(storageKey, '{broken'), key);
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Stored library needs recovery');
  await page.getByRole('button', { name: 'Open backups' }).click();
  await expect(page.getByRole('button', { name: 'Export' })).toBeDisabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download stored data' }).click();
  const file = await download;
  expect(await (await import('node:fs/promises')).readFile(await file.path(), 'utf-8')).toBe('{broken');
  await page.getByRole('button', { name: 'Reset library' }).click();
  await page.getByRole('button', { name: 'Confirm reset' }).click();
  await expect(page.getByRole('dialog', { name: 'Which releases should we track?' })).toBeVisible();
  const stored = await page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
  expect(stored).not.toBeNull();
  expect(JSON.parse(stored ?? '{}')).toMatchObject({ version: 3, settings: { market: null }, series: [] });
  const freshPage = await page.context().newPage();
  await freshPage.goto('/');
  await expect(freshPage.getByRole('dialog', { name: 'Which releases should we track?' })).toBeVisible();
  await expect(freshPage.getByRole('alert')).toHaveCount(0);
});
