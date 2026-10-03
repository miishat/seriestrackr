import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../src/app/App';
import { emptyDocument, emptyRelease } from '../src/features/library/model';
import type { Series } from '../src/features/library/model';
import { seriesFixture } from './fixtures';
import { response } from './discovery/fixtures';
import { checkDiscovery, getDiscoveryCapabilities } from '../src/services/discovery';

vi.mock('../src/services/discovery', () => ({ checkDiscovery: vi.fn(), getDiscoveryCapabilities: vi.fn() }));
beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  vi.mocked(getDiscoveryCapabilities).mockResolvedValue({ ai: false } as never);
  vi.mocked(checkDiscovery).mockImplementation(async request => {
    const reply = response({ requestId: request.requestId, seriesId: request.seriesId });
    reply.summary.requestId = request.requestId;
    return reply;
  });
});
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); });
function seed(series: Series) {
  const doc = emptyDocument();
  doc.settings.market = 'CA';
  doc.series = [series];
  localStorage.setItem('seriestrackr:v1', JSON.stringify(doc));
}

test('on open, a stale series with a safe result is updated automatically and shows the badge', async () => {
  seed(seriesFixture({ id: 's1', coverUrl: 'https://example.com/keep.jpg' }));
  render(<App />);
  const card = await screen.findByRole('article');
  expect(await within(card).findByText('Updated automatically', {}, { timeout: 3000 })).toBeVisible();
  expect(vi.mocked(checkDiscovery).mock.calls[0][0].useAi).toBe(false);
  expect(screen.queryByText('Ready to review')).toBeNull();
  expect(JSON.parse(localStorage.getItem('seriestrackr:v1')!).series[0].coverUrl).toBe('https://example.com/keep.jpg');
  await userEvent.click(within(card).getByRole('button', { name: 'Undo automatic update for Example' }));
  expect(within(card).queryByText('Updated automatically')).toBeNull();
});

test('an unsafe result is queued for review instead of applied', async () => {
  seed(seriesFixture({ id: 's1', formats: { book: true, audio: false },
    releases: { book: { ...emptyRelease(), state: 'announced', origin: 'manual' }, audio: emptyRelease() } }));
  render(<App />);
  expect(await screen.findByText('Ready to review', {}, { timeout: 3000 })).toBeVisible();
  expect(screen.queryByText('Updated automatically')).toBeNull();
});

test('a fresh series is not checked on open', async () => {
  seed(seriesFixture({ id: 's1', lastCheck: { requestId: 'r0', checkedAt: new Date().toISOString(), status: 'complete', reasons: [] } as never }));
  render(<App />);
  await new Promise(resolve => setTimeout(resolve, 1500));
  expect(checkDiscovery).not.toHaveBeenCalled();
});
