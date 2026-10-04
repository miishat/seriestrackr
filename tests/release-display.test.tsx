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
  expect(screen.getByRole('button',{name:'Check Releases'})).toBeDisabled();
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


test('source metadata stays behind Release Details and format tabs and links use the saved book title', () => {
  const series = seriesFixture();
  series.releases.audio = {
    ...emptyRelease(), state: 'scheduled', date: '2027-03-01',
    source: { title: 'Second: A Tale of Example', url: 'https://example.com/audio' },
    provenance: { checkedAt: '2026-10-01T00:00:00Z', sources: [], preferredMarket: 'US',
      sourceMarket: 'CA', language: 'en', editionFormat: 'audio', editionKey: null,
      datePrecision: 'day', interpreted: false },
  };
  render(<SeriesCard series={series} today="2026-10-01" market="US" showCovers={false} onEdit={vi.fn()} onFinish={vi.fn()} />);
  expect(screen.getByRole('link', { name: 'Audiobook' })).toHaveAttribute('title', 'Second: A Tale of Example');
  expect(screen.getByRole('link', { name: 'Audiobook: Scheduled' })).toHaveAttribute('href', 'https://example.com/audio');
  expect(screen.queryByText(/English audiobook/)).toBeNull();
  fireEvent.click(screen.getByText('Release Details'));
  fireEvent.click(screen.getByRole('tab', { name: 'Audiobook' }));
  const metadata = screen.getByText(/English audiobook/);
  expect(metadata).toBeVisible();
  fireEvent.click(screen.getByRole('tab', { name: 'Book' }));
  expect(screen.queryByText(/English audiobook/)).toBeNull();
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Book' }), { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: 'Audiobook' })).toHaveFocus();
  expect(screen.getByText(/English audiobook/)).toBeVisible();
});


test('grid format tabs follow enabled formats and preserve safe actions', () => {
  const onEdit = vi.fn(), onFinish = vi.fn(), onCheck = vi.fn();
  const series = seriesFixture({ formats: { book: false, audio: true } });
  const { rerender } = render(<SeriesCard series={series} today="2026-10-01" market="US" showCovers={false} onEdit={onEdit} onFinish={onFinish} onCheck={onCheck} />);
  fireEvent.click(screen.getByText('Release Details'));
  expect(screen.queryByRole('tab', { name: 'Book' })).toBeNull();
  expect(screen.getByRole('tab', { name: 'Audiobook' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Mark Finished' }));
  fireEvent.click(screen.getByRole('button', { name: 'Check Releases' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit Details' }));
  expect(onEdit).toHaveBeenCalledOnce(); expect(onFinish).toHaveBeenCalledOnce(); expect(onCheck).toHaveBeenCalledOnce();
  rerender(<SeriesCard series={{ ...series, formats: { book: true, audio: false } }} today="2026-10-01" market="US" showCovers={false} onEdit={onEdit} onFinish={onFinish} onCheck={onCheck} checking />);
  expect(screen.getByRole('tab', { name: 'Book' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByRole('tab', { name: 'Audiobook' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
});


test.each([false, true])('release details show only selected format metadata in compact=%s', compact => {
  const series = seriesFixture();
  series.releases.book.provenance = { checkedAt: '2026-10-01T00:00:00Z', sources: [], preferredMarket: 'US', sourceMarket: 'US', language: 'en', editionFormat: 'print', editionKey: null, datePrecision: 'day', interpreted: false };
  series.releases.audio.provenance = { ...series.releases.book.provenance, editionFormat: 'audio', sourceMarket: 'CA' };
  render(<SeriesCard series={series} today="2026-10-04" market="US" showCovers={false} compact={compact} onEdit={vi.fn()} onFinish={vi.fn()} />);
  fireEvent.click(screen.getByText(compact ? 'Release Details' : 'Release Details'));
  expect(screen.getByText(/English print/)).toBeVisible();
  expect(screen.queryByText(/English audiobook/)).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: 'Audiobook' }));
  expect(screen.getByText(/English audiobook/)).toBeVisible();
  expect(screen.queryByText(/English print/)).toBeNull();
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Audiobook' }), { key: 'Home' });
  expect(screen.getByRole('tab', { name: 'Book' })).toHaveFocus();
});

test('grid source links are omitted for unsupported URLs', () => {
  const series = seriesFixture();
  series.releases.book.source = { title: 'Unsafe', url: 'javascript:alert(1)' };
  render(<SeriesCard series={series} today="2026-10-04" market="US" showCovers={false} onEdit={vi.fn()} onFinish={vi.fn()} />);
  expect(screen.queryByRole('link', { name: 'Book' })).toBeNull();
  expect(screen.getByText('Book', { selector: '.grid-format-label' })).toBeVisible();
});
