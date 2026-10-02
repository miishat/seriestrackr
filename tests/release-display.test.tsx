import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { SeriesCard } from '../src/features/library/SeriesCard';
import { displaySeriesRelease } from '../src/features/library/releases';
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
