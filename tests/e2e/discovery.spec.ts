import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { CheckRequest, CheckResponse } from '../../shared/discovery';
import { selectProposals } from '../../shared/discoveryPolicy';
import { emptyDocument, emptyRelease } from '../../src/features/library/model';
import { seriesFixture } from '../fixtures';
import { bundle, edition, request, response } from '../discovery/fixtures';

const key = 'seriestrackr:v1';
const capabilities = { search: false, ai: false, googleBooks: false, hardcover: false, model: 'deepseek-flash',
  limits: { search: 3, ai: 1, googleBooks: 2, hardcover: 1, outputTokens: 2048, inputBytes: 20000 }, pricingAsOf: '2026-09-29', estimatedMaxAiUsd: 0.02 };
function documentFixture() {
  const doc = emptyDocument(); doc.settings.market = 'CA';
  doc.series = [seriesFixture({ coverUrl: 'https://example.com/cover.jpg', releases: { book: emptyRelease(),
    audio: { ...emptyRelease(), state: 'scheduled', date: '2099-04-05', source: { title: 'Manual audio', url: 'https://example.com/manual' } } } })];
  return doc;
}
async function seed(page: Page, doc: unknown = documentFixture()) {
  await page.addInitScript(({ storageKey, input }) => {
    if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(input));
  }, { storageKey: key, input: doc });
}
function matching(sent: CheckRequest, value: CheckResponse = response()) {
  return { ...value, requestId: sent.requestId, seriesId: sent.seriesId, summary: { ...value.summary, requestId: sent.requestId } };
}
async function mock(page: Page, makeResult: (sent: CheckRequest) => CheckResponse = matching) {
  const calls: CheckRequest[] = [];
  await page.route('**/api/discovery/capabilities', route => route.fulfill({ json: capabilities }));
  await page.route('**/api/discovery/check', route => {
    const sent = route.request().postDataJSON() as CheckRequest; calls.push(sent);
    return route.fulfill({ json: makeResult(sent) });
  });
  return calls;
}
async function check(page: Page) {
  await page.getByRole('button', { name: 'Check releases', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Check next release' })).toBeVisible();
  await expect(page.getByLabel('Use DeepSeek for this check')).not.toBeChecked();
  await page.getByRole('button', { name: 'Check release', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Review release details' })).toBeVisible();
}
async function stored(page: Page) { return page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)!), key); }

test('manual startup makes no discovery requests', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/discovery/**', route => { calls++; return route.abort(); });
  await page.goto('/'); await expect(page.getByRole('dialog', { name: /which releases/i })).toBeVisible();
  expect(calls).toBe(0);
});
test('completed series has no check action in any view', async ({ page }) => {
  const doc = documentFixture(); doc.series[0].readingStatus = 'completed'; doc.series[0].publicationRunComplete = true;
  await seed(page, doc); const calls = await mock(page); await page.goto('/');
  for (const view of ['Compact', 'Table', 'Grid']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Check releases' })).toHaveCount(0);
  }
  expect(calls).toHaveLength(0);
});
test('book only preserves manual audio and provenance through reload and all views', async ({ page }) => {
  await seed(page); const calls = await mock(page); await page.goto('/'); await check(page);
  expect(calls).toHaveLength(1); expect(calls[0].useAi).toBe(false);
  await expect(page.getByLabel('Use DeepSeek for this check')).toBeDisabled();
  await page.getByRole('tab', { name: /^Book/ }).click(); await page.getByRole('checkbox', { name: 'Save Book', exact: true }).check();
  await page.getByRole('button', { name: 'Save selected changes' }).click();
  await page.reload(); const doc = await stored(page);
  expect(doc.series[0].releases.book.provenance.sourceMarket).toBe('CA');
  expect(doc.series[0].releases.audio).toEqual(documentFixture().series[0].releases.audio);
  for (const view of ['Compact', 'Table', 'Grid']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    if (view === 'Compact') await page.getByText('Release details').first().click();
    await expect(page.getByText('Source country: CA', { exact: false })).toBeVisible();
    await expect(page.getByText('2099-04-05', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Check releases', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Check next release' })).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Check releases', exact: true })).toBeFocused();
  }
});
test('changed title requires title selection and preserves cover while clearing unselected audio', async ({ page }) => {
  await page.route('https://example.com/cover.jpg', route => route.fulfill({ contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="88" height="132"><rect width="88" height="132" fill="purple"/></svg>' }));
  await seed(page); await mock(page, sent => {
    const value = response(); const title = 'New Second';
    value.proposals.identity = { title, author: 'Example Author', position: 2, citations: [{ sourceId: 's1', quote: 'New Second by Example Author. Book 2.' }] };
    value.proposals.identityAttribution = { checkedAt: value.summary.checkedAt, sources: value.sources };
    value.proposals.releases.book = { ...value.proposals.releases.book!, title };
    return matching(sent, value);
  });
  await page.goto('/'); await check(page);
  await page.getByRole('tab', { name: /^Book/ }).click(); await expect(page.getByRole('checkbox', { name: 'Save Book', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: /^Next title/ }).click(); await page.getByRole('checkbox', { name: 'Save Next title' }).check();
  await page.getByRole('tab', { name: /^Book/ }).click(); await page.getByRole('checkbox', { name: 'Save Book', exact: true }).check();
  await page.getByRole('tab', { name: /^Next title/ }).click(); await page.getByRole('checkbox', { name: 'Save Next title' }).uncheck();
  await page.getByRole('tab', { name: /^Book/ }).click(); await expect(page.getByRole('checkbox', { name: 'Save Book', exact: true })).not.toBeChecked();
  await page.getByRole('tab', { name: /^Next title/ }).click(); await page.getByRole('checkbox', { name: 'Save Next title' }).check();
  await page.getByRole('tab', { name: /^Book/ }).click(); await page.getByRole('checkbox', { name: 'Save Book', exact: true }).check();
  await page.getByRole('button', { name: 'Save selected changes' }).click(); await page.reload();
  const doc = await stored(page); expect(doc.series[0].next.title).toBe('New Second'); expect(doc.series[0].coverUrl).toBe('https://example.com/cover.jpg');
  await expect(page.getByRole('img', { name: 'Cover for New Second' })).toBeVisible();
  expect(doc.series[0].releases.audio).toEqual(emptyRelease());
});
test('fallback country attribution agrees in every shelf view', async ({ page }) => {
  await seed(page); await mock(page, sent => {
    const evidence = bundle([edition({ market: 'GB' })]); const value = response();
    value.proposals = selectProposals(request(), evidence, value.summary.checkedAt);
    return matching(sent, value);
  });
  await page.goto('/'); await check(page); await page.getByRole('tab', { name: /^Book/ }).click(); await expect(page.getByText('Date from GB; no supported CA date found in sources checked.')).toBeVisible();
  await page.getByRole('tab', { name: /^Book/ }).click(); await page.getByRole('checkbox', { name: 'Save Book', exact: true }).check(); await page.getByRole('button', { name: 'Save selected changes' }).click();
  for (const view of ['Compact', 'Table', 'Grid']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    if (view === 'Compact') await page.getByText('Release details').first().click();
    await expect(page.getByText('Date from GB; no supported CA date found in sources checked.')).toBeVisible();
  }
});
for (const outcome of ['unknown', 'partial', 'failed'] as const) test(`${outcome} result preserves accepted date and has separate check history`, async ({ page }) => {
  const doc = documentFixture(); doc.series[0].releases.book = { ...emptyRelease(), state: 'scheduled', date: '2099-01-02' };
  await seed(page, doc); await mock(page, sent => {
    const value = response(); value.proposals = { identity: null, identityAttribution: null, releases: { book: null, audio: null }, conflicts: [], related: [] };
    value.summary = { ...value.summary, status: outcome === 'unknown' ? 'complete' : outcome === 'partial' ? 'partial' : 'failed',
      reasons: outcome === 'unknown' ? [] : ['quota'], formats: { book: 'unknown', audio: 'unknown' } };
    return matching(sent, value);
  });
  await page.goto('/'); await check(page); await expect(page.getByRole('button', { name: 'Save selected changes' })).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(page.getByText('2099-01-02', { exact: true })).toBeVisible();
  const saved = await stored(page); expect(saved.series[0].releases.book).toEqual(doc.series[0].releases.book); expect(saved.series[0].lastCheck).not.toBeNull();
});
test('non-English edition is never selectable as an English release', async ({ page }) => {
  await seed(page); await mock(page, sent => {
    const value = response(); value.proposals = selectProposals(request(), bundle([edition({ language: 'fr' })]), value.summary.checkedAt);
    value.summary.formats = { book: 'unknown', audio: 'unknown' }; return matching(sent, value);
  });
  await page.goto('/'); await check(page); await page.getByRole('tab', { name: /^Book/ }).click(); await expect(page.getByRole('checkbox', { name: 'Save Book', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape'); expect((await stored(page)).series[0].releases.book.origin).toBe('manual');
});
test('offline check failure leaves edit finish undo and export usable', async ({ page }) => {
  await seed(page); let calls = 0;
  await page.route('**/api/discovery/**', route => { calls++; return route.abort(); });
  await page.goto('/'); expect(calls).toBe(0);
  await page.getByRole('button', { name: 'Check releases' }).click(); await expect(page.getByRole('dialog', { name: 'Could not complete this check' })).toBeVisible();
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Edit details' }).click();
  await page.getByText('Optional progress and series details', { exact: true }).click();
  await page.getByLabel('Next order note').fill('Manual ordering'); await page.getByRole('button', { name: 'Save series' }).click();
  await page.getByRole('button', { name: 'Confirm reset' }).click();
  await page.getByRole('button', { name: 'Mark finished' }).click(); await page.getByRole('button', { name: 'Undo finish' }).click();
  await page.getByRole('button', { name: 'Backups', exact: true }).click();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export' }).click();
  expect(JSON.parse(await readFile((await (await download).path())!, 'utf8')).version).toBe(3); expect(calls).toBe(1);
});

for (const mutation of ['edit', 'finish-undo', 'equal-import'] as const) test(`delayed response after ${mutation} cannot record or save stale proposals`, async ({ page }) => {
  const doc = documentFixture(); await seed(page, doc);
  await page.route('**/api/discovery/capabilities', route => route.fulfill({ json: capabilities }));
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  let sent: CheckRequest | null = null;
  await page.route('**/api/discovery/check', async route => {
    sent = route.request().postDataJSON() as CheckRequest;
    await delayed; await route.fulfill({ json: matching(sent) });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Check releases' }).click();
  await page.getByRole('button', { name: 'Check release', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Checking release details' })).toBeVisible();
  await expect.poll(() => sent).not.toBeNull();
  const invokeShelfAction = (name: string) => page.evaluate(label => {
    const control = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === label);
    if (!control) throw new Error(`Missing shelf action: ${label}`); control.click();
  }, name);
  if (mutation === 'edit') {
    await invokeShelfAction('Edit details');
    await page.getByLabel('Track audiobook').uncheck();
    await page.getByRole('button', { name: 'Save series' }).click();
  } else if (mutation === 'finish-undo') {
    await invokeShelfAction('Mark finished'); await invokeShelfAction('Undo finish');
  } else {
    await invokeShelfAction('Backups');
    await page.getByLabel('Choose backup file').setInputFiles({ name: 'equal.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
    await page.getByRole('button', { name: 'Confirm replacement' }).click();
  }
  release(); await expect(page.getByRole('dialog', { name: 'Could not complete this check' })).toBeVisible();
  await expect(page.getByText('The series changed. Check again before saving.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save selected changes' })).toHaveCount(0);
  const saved = await stored(page); expect(saved.series[0].lastCheck).toBeNull();
  expect(saved.series[0].releases.book.origin).toBe('manual');
  await page.keyboard.press('Escape'); await page.reload(); expect((await stored(page)).series[0].lastCheck).toBeNull();
});
test('legacy storage loads without overwrite then exports v2 and reimports metadata', async ({ page }) => {
  const doc = documentFixture(); const legacy = { ...doc, version: 1, series: doc.series.map(series => {
    const { lastCheck, ...rest } = series; void lastCheck;
    const { attribution, ...next } = series.next; void attribution;
    const strip = (release: typeof series.releases.book) => { const { provenance, ...old } = release; void provenance; return old; };
    return { ...rest, next, releases: { book: strip(series.releases.book), audio: strip(series.releases.audio) } };
  }) };
  await seed(page, legacy); await page.goto('/'); expect((await stored(page)).version).toBe(1);
  await page.getByRole('button', { name: 'Backups', exact: true }).click();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export' }).click();
  const exported = await readFile((await (await download).path())!); const decoded = JSON.parse(exported.toString()); expect(decoded.version).toBe(3); expect(decoded.series[0].lastCheck).toBeNull();
  await page.getByLabel('Choose backup file').setInputFiles({ name: 'v2.json', mimeType: 'application/json', buffer: exported });
  await page.getByRole('button', { name: 'Confirm replacement' }).click(); await page.reload();
  expect((await stored(page))).toEqual(decoded);
});

for (const width of [390, 1024]) test(`review pane is keyboard operable, fits ${width}px, and accepts a named cover`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.route('https://assets.hardcover.app/**', route => route.fulfill({ contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#285d48"/></svg>' }));
  await seed(page);
  await mock(page, sent => {
    const value = matching(sent);
    value.coverCandidates = [{ id: 'c1', title: 'Second', author: 'Example Author', role: 'next', format: 'ebook', provider: 'hardcover',
      source: { id: 'cs', title: 'Second', url: 'https://hardcover.app/books/second' }, imageUrl: 'https://assets.hardcover.app/second.svg',
      workKey: 'second|example author', editionKey: null, width: null, height: null }];
    value.proposals.related = [{ title: 'The Prequel', author: 'Example Author', relationship: 'prequel', position: null,
      citations: [{ sourceId: value.sources[0].id, quote: 'Set before the series.' }] }];
    return value;
  });
  await page.goto('/');
  await check(page);
  const dialog = page.getByRole('dialog', { name: 'Review release details' });
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('dialog')].every(d => d.scrollWidth <= d.clientWidth));
  expect(await fits()).toBe(true);
  const first = dialog.getByRole('tab', { name: /^Next title/ });
  await page.keyboard.press('Shift');
  await first.focus();
  await expect(first).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('tab', { name: /^Book/ })).toBeFocused();
  await expect(dialog.getByRole('tabpanel', { name: /^Book/ })).toBeVisible();
  await dialog.getByRole('tab', { name: /^Related works/ }).click();
  await expect(dialog.getByText('Prequel', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('tabpanel', { name: /^Related works/ }).getByRole('checkbox')).toHaveCount(0);
  expect(await fits()).toBe(true);
  await dialog.getByRole('tab', { name: /^Covers/ }).click();
  await dialog.getByRole('button', { name: 'Load cover previews' }).click();
  await dialog.getByRole('button', { name: 'Select cover: Second by Example Author, Hardcover, Book, Next book' }).click();
  expect(await fits()).toBe(true);
  await dialog.getByRole('button', { name: 'Save selected changes' }).click();
  await page.reload();
  const doc = await stored(page);
  expect(doc.series[0].coverUrl).toBe('https://assets.hardcover.app/second.svg');
  expect(doc.series[0].coverAttribution).toMatchObject({ title: 'Second', role: 'next' });
  expect(JSON.stringify(doc)).not.toContain('The Prequel');
  await page.getByRole('button', { name: 'Check releases', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Check releases', exact: true })).toBeFocused();
});
