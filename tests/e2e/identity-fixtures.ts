import type { Page } from '@playwright/test';
import { emptyDocument, emptyRelease } from '../../src/features/library/model';
import type { Series } from '../../src/features/library/model';
import { seriesFixture } from '../fixtures';

export function identitySeries(): Series[] {
  return [
    seriesFixture({ id: 'identity-1', name: 'The Glass Meridian',
      releases: {
        book: { ...emptyRelease(), state: 'released' },
        audio: { ...emptyRelease(), state: 'scheduled', date: '2099-11-18' },
      } }),
    seriesFixture({ id: 'identity-2', name: 'The Tidemark Cycle',
      releases: {
        book: { ...emptyRelease(), state: 'announced' }, audio: emptyRelease(),
      } }),
    seriesFixture({ id: 'identity-3', name: 'Letters from the Orchard',
      releases: {
        book: { ...emptyRelease(), state: 'not-found' }, audio: emptyRelease(),
      } }),
  ];
}

export async function seedIdentity(page: Page, theme: 'light' | 'dark' = 'dark',
  series: Series[] = identitySeries()): Promise<void> {
  const doc = emptyDocument();
  doc.settings.market = 'CA'; doc.settings.theme = theme; doc.series = series;
  await page.addInitScript(input => {
    if (!localStorage.getItem('seriestrackr:v1')) {
      localStorage.setItem('seriestrackr:v1', JSON.stringify(input));
    }
    // Choose the longest tagline consistently in screenshots.
    Math.random = () => 0;
  }, doc);
}