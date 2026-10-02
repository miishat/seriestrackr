import { mkdir } from 'node:fs/promises';
import { expect, test, type Locator } from '@playwright/test';
import { response } from '../discovery/fixtures';
import { identitySeries, seedIdentity } from './identity-fixtures';

test('long and mixed-script text fits all views and themes', async ({ page }) => {
  const series = identitySeries();
  series[0].name = 'X'.repeat(160) + ' L’Été 世界';
  series[0].author = 'A very long author name with several words and diacritics Éléonore';
  series[0].next.title = 'Y'.repeat(120) + ' & the next chapter';
  await seedIdentity(page, 'dark', series); await page.goto('/');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await mkdir('node_modules/.cache/playwright-visual', { recursive: true });
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark'] as const) {
      const toggle = page.getByRole('button', { name: theme === 'light' ? 'Light Theme' : 'Dark Theme', exact: true });
      if (await toggle.count()) await toggle.click();
      for (const view of ['Grid', 'Compact', 'Table']) {
        await page.getByRole('button', { name: view, exact: true }).click();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (view === 'Table') await expect(page.getByRole('region', { name: 'Release table' })).toBeVisible();
        else {
          const clipped = await page.locator('.card-header h2, .card-next strong').evaluateAll(elements =>
            elements.filter(el => el.getBoundingClientRect().width > 0 && el.scrollWidth > el.getBoundingClientRect().width + 1).length);
          expect(clipped).toBe(0);
        }
        await page.screenshot({ path: `node_modules/.cache/playwright-visual/mixed-${width}-${theme}-${view}.png`, fullPage: true });
      }
    }
  }
});

test('L2 has a stable decorative mark and readable wordmark', async ({ page }) => {
  await seedIdentity(page); await page.goto('/');
  const mark = page.locator('.brand .brand-mark');
  await expect(mark).toBeVisible();
  await expect(mark).toHaveAttribute('aria-hidden', 'true');
  await expect(mark).toHaveAttribute('focusable', 'false');
  await expect(mark).toHaveCSS('width', '28px');
  await expect(mark).toHaveCSS('color', 'rgb(181, 196, 255)');
  await expect(page.locator('.brand strong')).toHaveText('SeriesTrackr');
  await expect(page.locator('.brand .small')).toHaveText('You don’t have a reading problem. You have a tracking problem.');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

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

test('D colors are applied and switching themes preserves series records', async ({ page }) => {
  const series = identitySeries();
  const accepted = response();
  const proposal = accepted.proposals.releases.book!;
  series[0].next.attribution = { checkedAt: accepted.summary.checkedAt, sources: accepted.sources };
  series[0].releases.book = { ...series[0].releases.book, state: proposal.state as 'scheduled', date: proposal.date,
    origin: 'discovery', lastCheckedAt: accepted.summary.checkedAt, provenance: proposal.provenance,
    source: { title: proposal.provenance.sources[0].title, url: proposal.provenance.sources[0].url } };
  series[0].lastCheck = accepted.summary;
  await seedIdentity(page, 'dark', series); await page.goto('/');
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem('seriestrackr:v1')!).series);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(23, 29, 43)');
  await expect(page.locator('.series-card').first()).toHaveCSS('background-color', 'rgb(33, 43, 61)');
  await expect(page.getByRole('button', { name: 'Add series', exact: true })).toHaveCSS('background-color', 'rgb(181, 196, 255)');
  await page.getByRole('button', { name: 'Light Theme', exact: true }).click();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(246, 245, 241)');
  await page.getByRole('button', { name: 'Dark Theme', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('seriestrackr:v1')!));
  expect(saved.series).toEqual(records);
});

function contrastRatio(a: number[], b: number[]): number {
  const luminance = (values: number[]) => {
    const linear = values.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

// Resolve transparent element/ancestor backgrounds and any foreground alpha in
// the browser before calculating contrast. Native dialog surfaces are opaque.
async function renderedColors(locator: Locator, property = 'color') {
  return locator.evaluate((element, property) => {
    const parse = (value: string) => {
      const values = value.match(/[\d.]+/g)!.map(Number);
      return [values[0], values[1], values[2], values[3] ?? 1];
    };
    const over = (front: number[], back: number[]) => {
      const alpha = front[3] + back[3] * (1 - front[3]);
      return [...front.slice(0, 3).map((channel, i) =>
        alpha ? (channel * front[3] + back[i] * back[3] * (1 - front[3])) / alpha : 0), alpha];
    };
    const ancestors: Element[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) ancestors.unshift(node);
    let background = [255, 255, 255, 1];
    for (const node of ancestors.slice(0, -1)) background = over(parse(getComputedStyle(node).backgroundColor), background);
    const parentBackground = background;
    const style = getComputedStyle(element);
    background = over(parse(style.backgroundColor), parentBackground);
    let foreground = over(parse(style.getPropertyValue(property)), background);
    const opacity = Number(style.opacity);
    foreground = over([...foreground.slice(0, 3), opacity], parentBackground);
    background = over([...background.slice(0, 3), opacity], parentBackground);
    return { foreground: foreground.slice(0, 3), background: background.slice(0, 3) };
  }, property);
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} badges, errors, focus and input edges retain contrast`, async ({ page }, testInfo) => {
    const measurements: Record<string, number> = {};
    await seedIdentity(page, theme); await page.goto('/');
    for (const selector of ['.badge.released', '.badge.scheduled', '.badge.announced',
      '.badge.not-checked', '.badge.not-found', '.library-tools .primary']) {
      const colors = await renderedColors(page.locator(selector).first());
      measurements[selector] = contrastRatio(colors.foreground, colors.background);
      expect(measurements[selector], selector).toBeGreaterThanOrEqual(4.5);
    }
    const search = page.getByLabel('Search series or author');
    await search.focus();
    await expect(search).toHaveCSS('outline-style', 'solid');
    await expect(search).toHaveCSS('outline-width', '3px');
    const border = await renderedColors(search, 'border-top-color');
    const outline = await renderedColors(search, 'outline-color');
    const canvas = await renderedColors(page.locator('body'));
    measurements['input border / panel'] = contrastRatio(border.foreground, border.background);
    measurements['focus / panel'] = contrastRatio(outline.foreground, outline.background);
    measurements['focus / canvas'] = contrastRatio(outline.foreground, canvas.background);
    for (const key of ['input border / panel', 'focus / panel', 'focus / canvas']) {
      expect(measurements[key], key).toBeGreaterThanOrEqual(3);
    }
    await page.getByRole('button', { name: 'Add series', exact: true }).click();
    await page.getByRole('button', { name: 'Save series', exact: true }).click();
    const error = page.locator('.form-error');
    await expect(error).toBeVisible();
    const colors = await renderedColors(error);
    measurements['form error / dialog'] = contrastRatio(colors.foreground, colors.background);
    expect(measurements['form error / dialog']).toBeGreaterThanOrEqual(4.5);
    await mkdir('node_modules/.cache/playwright-visual', { recursive: true });
    await page.screenshot({ path: `node_modules/.cache/playwright-visual/identity-error-${theme}.png`, fullPage: true });
    await testInfo.attach('rendered-contrast', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
    console.log(`${theme} rendered contrast: ${JSON.stringify(measurements)}`);
  });

  test(`${theme} warning and partial/failed summaries keep nested text readable`, async ({ page }, testInfo) => {
    const series = identitySeries();
    const summary = response().summary;
    series[0].lastCheck = { ...summary, status: 'partial', reasons: ['timeout'] };
    series[1].lastCheck = { ...summary, status: 'failed', reasons: ['provider-error'] };
    await seedIdentity(page, theme, series); await page.goto('/');
    const measurements: Record<string, number> = {};
    const summaries = page.locator('.discovery-summary.warn');
    await expect(summaries).toHaveCount(2);
    await expect(summaries.nth(0)).toContainText('Check partially completed');
    await expect(summaries.nth(1)).toContainText('Your saved release details are unchanged.');
    for (let i = 0; i < 2; i++) {
      for (const selector of ['strong', 'p.small', 'p:not(.small)', 'li']) {
        const colors = await renderedColors(summaries.nth(i).locator(selector).first());
        const key = `${i === 0 ? 'partial' : 'failed'} ${selector}`;
        measurements[key] = contrastRatio(colors.foreground, colors.background);
        expect(measurements[key], key).toBeGreaterThanOrEqual(4.5);
      }
    }
    await mkdir('node_modules/.cache/playwright-visual', { recursive: true });
    await page.screenshot({ path: `node_modules/.cache/playwright-visual/identity-summaries-${theme}.png`, fullPage: true });
    // Trigger the real storage warning without changing the active theme.
    await page.getByRole('button', { name: theme === 'dark' ? 'Light Theme' : 'Dark Theme', exact: true }).click();
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'seriestrackr:v1') throw new Error('quota exceeded');
        original.call(this, key, value);
      };
    });
    await page.getByRole('button', { name: theme === 'dark' ? 'Dark Theme' : 'Light Theme', exact: true }).click();
    await expect(page.locator('.warning')).toContainText('Changes are in memory and may be lost');
    for (const selector of ['.warning', '.warning strong']) {
      const colors = await renderedColors(page.locator(selector));
      measurements[selector] = contrastRatio(colors.foreground, colors.background);
      expect(measurements[selector], selector).toBeGreaterThanOrEqual(4.5);
    }
    await page.screenshot({ path: `node_modules/.cache/playwright-visual/identity-warning-${theme}.png`, fullPage: true });
    await testInfo.attach('rendered-warning-contrast', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
    console.log(`${theme} rendered warning contrast: ${JSON.stringify(measurements)}`);
  });

  test(`${theme} partial review preserves disabled controls and readable warnings`, async ({ page }, testInfo) => {
    await seedIdentity(page, theme);
    await page.route('**/api/discovery/capabilities', route => route.fulfill({ json: {
      search: false, ai: false, googleBooks: false, hardcover: false, model: 'deepseek-flash',
      limits: { search: 3, ai: 1, googleBooks: 2, hardcover: 1, outputTokens: 2048, inputBytes: 20000 },
      pricingAsOf: '2026-09-29', estimatedMaxAiUsd: 0.02,
    } }));
    await page.route('**/api/discovery/check', route => {
      const sent = route.request().postDataJSON();
      const result = response();
      result.requestId = sent.requestId; result.seriesId = sent.seriesId;
      result.summary = { ...result.summary, requestId: sent.requestId, status: 'partial', reasons: ['timeout'] };
      return route.fulfill({ json: result });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Check releases', exact: true }).first().click();
    await expect(page.getByLabel('Use DeepSeek for this check')).toBeDisabled();
    await page.getByRole('button', { name: 'Check release', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Review release details' })).toBeVisible();
    const save = page.getByRole('button', { name: 'Save selected changes', exact: true });
    await expect(save).toBeDisabled();
    await expect(save).toHaveCSS('opacity', '0.55');
    const measurements: Record<string, number> = {};
    for (const selector of ['.discovery-content .warn p.small', '.discovery-content .warn p:not(.small)']) {
      const colors = await renderedColors(page.locator(selector));
      measurements[selector] = contrastRatio(colors.foreground, colors.background);
      expect(measurements[selector], selector).toBeGreaterThanOrEqual(4.5);
    }
    const disabledColors = await renderedColors(save);
    measurements['disabled primary text / composed button'] = contrastRatio(disabledColors.foreground, disabledColors.background);
    // Inactive controls are exempt from WCAG text contrast, retain the existing
    // opacity and report its composed value alongside a visual inspection.
    await mkdir('node_modules/.cache/playwright-visual', { recursive: true });
    await page.screenshot({ path: `node_modules/.cache/playwright-visual/identity-review-${theme}.png`, fullPage: true });
    await save.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `node_modules/.cache/playwright-visual/identity-review-disabled-${theme}.png`, fullPage: true });
    await page.getByRole('checkbox', { name: 'Save Book', exact: true }).check();
    await expect(save).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Check releases', exact: true }).first()).toBeFocused();
    await testInfo.attach('rendered-review-contrast', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
    console.log(`${theme} rendered review contrast: ${JSON.stringify(measurements)}`);
  });
}
