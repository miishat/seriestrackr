import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { SeriesCard } from '../src/features/library/SeriesCard';
import { displaySeriesRelease, displayRelease, releaseLabels } from '../src/features/library/releases';
import { emptyRelease } from '../src/features/library/model';
import { seriesFixture } from './fixtures';
import { response } from './discovery/fixtures';
afterEach(cleanup);
test.each(['complete','partial'] as const)('%s check with unknown format displays Not Found', status => {
  const series = seriesFixture({lastCheck:{...response().summary,status,formats:{book:'unknown',audio:'not-requested'}}});
  expect(displaySeriesRelease(series,'book','2026-10-01')).toBe('not-found');
  expect(displaySeriesRelease(series,'audio','2026-10-01')).toBe('not-checked');
});
test.each(['failed','cancelled'] as const)('%s attempt does not assert a negative result', status => {
  expect(displaySeriesRelease(seriesFixture({lastCheck:{...response().summary,status,formats:{book:'unknown',audio:'unknown'}}}),'book','2026-10-01')).toBe('not-checked');
});
test('accepted release is preserved even if latest check has no result',()=> {
  const series=seriesFixture(); series.releases.book.state='announced'; series.lastCheck={...response().summary,formats:{book:'unknown',audio:'unknown'}};
  expect(displaySeriesRelease(series,'book','2026-10-01')).toBe('announced');
});
test('compact card removes duplicate title and keeps individual action visible while batch is busy',()=> {
  render(<SeriesCard series={seriesFixture()} today="2026-10-01" market="US" showCovers={false} compact onEdit={vi.fn()} onFinish={vi.fn()} onCheck={vi.fn()} checkDisabled />);
  expect(screen.queryByText(/Next book:/)).toBeNull();
  expect(screen.getByRole('button',{name:'Check releases'})).toBeDisabled();
  expect(screen.getAllByText('Second').length).toBeGreaterThan(0);
});

test('lifecycle labels are exact', () => {
  expect(releaseLabels).toMatchObject({ catalogued: 'Listed', announced: 'Announced',
    scheduled: 'Scheduled', released: 'Available' });
});
test('catalogued stays catalogued and scheduled becomes available by local today', () => {
  expect(displayRelease({ ...emptyRelease(), state: 'catalogued' }, '2026-10-01')).toBe('catalogued');
  const scheduled = { ...emptyRelease(), state: 'scheduled' as const, date: '2026-10-01' };
  expect(displayRelease(scheduled, '2026-09-30')).toBe('scheduled');
  expect(displayRelease(scheduled, '2026-10-01')).toBe('released');
});
test('card shows Listed with Date Unknown on the date line', () => {
  const series = seriesFixture(); series.releases.book.state = 'catalogued';
  render(<SeriesCard series={series} today="2026-10-01" market="US" showCovers={false} onEdit={vi.fn()} onFinish={vi.fn()} onCheck={vi.fn()} />);
  expect(screen.getByText('Listed')).toBeVisible();
  expect(screen.getByText('Date Unknown')).toBeVisible();
});


test('source metadata stays behind Check details and links use the saved book title', () => {
  const series = seriesFixture();
  series.releases.audio = {
    ...emptyRelease(), state: 'scheduled', date: '2027-03-01',
    source: { title: 'Second: A Tale of Example', url: 'https://example.com/audio' },
    provenance: { checkedAt: '2026-10-01T00:00:00Z', sources: [], preferredMarket: 'US',
      sourceMarket: 'CA', language: 'en', editionFormat: 'audio', editionKey: null,
      datePrecision: 'day', interpreted: false },
  };
  render(<SeriesCard series={series} today="2026-10-01" market="US" showCovers={false} onEdit={vi.fn()} onFinish={vi.fn()} />);
  expect(screen.getByRole('link', { name: 'Second' })).toHaveAttribute('title', 'Second: A Tale of Example');
  const metadata = screen.getByText(/English audiobook/);
  expect(metadata).not.toBeVisible();
  fireEvent.click(screen.getByText('Check details'));
  expect(metadata).toBeVisible();
});
