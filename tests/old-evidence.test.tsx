import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../src/app/App';
import { SeriesCard } from '../src/features/library/SeriesCard';
import { SeriesTable } from '../src/features/library/SeriesTable';
import { emptyDocument, emptyRelease } from '../src/features/library/model';
import type { Release } from '../src/features/library/model';
import { hasOldAnnouncementEvidence, localToday, OLD_EVIDENCE_DAYS } from '../src/features/library/releases';
import { checkDiscovery, getDiscoveryCapabilities } from '../src/services/discovery';
import { seriesFixture } from './fixtures';

vi.mock('../src/services/discovery', () => ({ checkDiscovery: vi.fn(), getDiscoveryCapabilities: vi.fn() }));
const key = 'seriestrackr:v1';
const capabilities = { search: false, ai: false, googleBooks: false, hardcover: false, model: 'deepseek-flash', limits: { search: 3, ai: 1, googleBooks: 2, hardcover: 1, outputTokens: 2048, inputBytes: 20000 }, pricingAsOf: '2026-09-29', estimatedMaxAiUsd: 0.01 } as const;
const daysAgo = (days: number) => { const date = new Date(); date.setDate(date.getDate() - days); return `${localToday(date)}T12:00:00Z`; };
const hardcoverAnnounced = (checkedAt: string, url = 'https://hardcover.app/books/second'): Release => ({ ...emptyRelease(), state: 'announced', origin: 'discovery', lastCheckedAt: checkedAt,
  source: { title: 'Second', url }, provenance: { checkedAt, sources: [{ id: 'h', title: 'Second', url }], preferredMarket: 'CA', sourceMarket: null, language: 'en',
    editionFormat: 'ebook', editionKey: null, datePrecision: 'none', interpreted: false } });

beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  vi.mocked(getDiscoveryCapabilities).mockResolvedValue(capabilities);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test('the threshold is defined once and applies only to old Hardcover-only announcements', () => {
  const today = localToday();
  expect(hasOldAnnouncementEvidence(hardcoverAnnounced(daysAgo(OLD_EVIDENCE_DAYS + 1)), today)).toBe(true);
  expect(hasOldAnnouncementEvidence(hardcoverAnnounced(daysAgo(OLD_EVIDENCE_DAYS)), today)).toBe(false);
  expect(hasOldAnnouncementEvidence(hardcoverAnnounced(daysAgo(400), 'https://books.apple.com/ca/book/x/id1'), today)).toBe(false);
  expect(hasOldAnnouncementEvidence(hardcoverAnnounced(daysAgo(400), 'https://evilhardcover.app/books/second'), today)).toBe(false);
  expect(hasOldAnnouncementEvidence(hardcoverAnnounced(daysAgo(400), 'https://www.hardcover.app/books/second'), today)).toBe(true);
  expect(hasOldAnnouncementEvidence({ ...hardcoverAnnounced(daysAgo(400)), state: 'scheduled' }, today)).toBe(false);
  expect(hasOldAnnouncementEvidence({ ...hardcoverAnnounced(daysAgo(400)), origin: 'manual' }, today)).toBe(false);
});

test('an old Hardcover announcement shows a notice, and Review again opens the check without a request or any change', async () => {
  const user = userEvent.setup();
  const doc = { ...emptyDocument(), settings: { ...emptyDocument().settings, market: 'CA' }, series: [seriesFixture({ releases: { book: hardcoverAnnounced(daysAgo(200)), audio: emptyRelease() } })] };
  localStorage.setItem(key, JSON.stringify(doc));
  const before = localStorage.getItem(key);
  render(<App />);
  expect(screen.getByText(/Evidence is old/)).toBeVisible();
  expect(getDiscoveryCapabilities).not.toHaveBeenCalled(); expect(checkDiscovery).not.toHaveBeenCalled();
  expect(localStorage.getItem(key)).toBe(before);
  expect(within(screen.getByRole('article')).getByText('Announced; date unknown')).toBeVisible();
  await user.click(screen.getByRole('button', { name: /Review book announcement again/ }));
  expect(await screen.findByRole('heading', { name: /Check next release|Checking release details|Preparing release check/ })).toBeVisible();
  expect(checkDiscovery).not.toHaveBeenCalled();
  expect(localStorage.getItem(key)).toBe(before);
});

test('a recent announcement shows no notice', () => {
  render(<SeriesCard series={seriesFixture({ releases: { book: hardcoverAnnounced(daysAgo(10)), audio: emptyRelease() } })} today={localToday()} market="CA" showCovers onEdit={vi.fn()} onFinish={vi.fn()} onCheck={vi.fn()} />);
  expect(screen.queryByText(/Evidence is old/)).toBeNull();
});

test('the list view offers the same notice and action', async () => {
  const onCheck = vi.fn(); const series = seriesFixture({ releases: { book: hardcoverAnnounced(daysAgo(200)), audio: emptyRelease() } });
  render(<SeriesTable series={[series]} today={localToday()} market="CA" onEdit={vi.fn()} onFinish={vi.fn()} onCheck={onCheck} />);
  await userEvent.click(screen.getByRole('button', { name: /Review book announcement again/ }));
  expect(onCheck).toHaveBeenCalledWith(series);
});

const attribution = { title: 'Second', author: 'Example Author', role: 'next' as const, source: { id: 'o', title: 'Second', url: 'https://example.com/o' }, editionKey: null };
test.each([['regular', false], ['compact', true]])('%s card labels a legacy manual cover as unverified, and not a named one', (_name, compact) => {
  const props = { today: localToday(), market: 'CA', showCovers: true, compact, onEdit: vi.fn(), onFinish: vi.fn() };
  const { unmount } = render(<SeriesCard {...props} series={seriesFixture({ coverUrl: 'https://example.com/c.jpg' })} />);
  expect(screen.getByText('Cover unverified')).toBeVisible();
  unmount();
  render(<SeriesCard {...props} series={seriesFixture({ coverUrl: 'https://example.com/c.jpg', coverAttribution: attribution })} />);
  expect(screen.queryByText('Cover unverified')).toBeNull();
});

test('the series editor labels a manual cover URL unverified until a named cover replaces it', async () => {
  const user = userEvent.setup();
  localStorage.setItem(key, JSON.stringify({ ...emptyDocument(), settings: { ...emptyDocument().settings, market: 'CA' }, series: [seriesFixture({ coverUrl: 'https://example.com/c.jpg' })] }));
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Edit details' }));
  expect(screen.getByText(/Current cover is unverified/)).toBeVisible();
  await user.clear(screen.getByLabelText('Cover URL'));
  expect(screen.queryByText(/Current cover is unverified/)).toBeNull();
});
