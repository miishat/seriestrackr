import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Capabilities, CheckResponse } from '../../shared/discovery';
import type { CoverCandidate } from '../../shared/covers';
import { DiscoveryDialog } from '../../src/features/discovery/DiscoveryDialog';
import type { DiscoverySession } from '../../src/features/discovery/discoverySession';
import { seriesFixture } from '../fixtures';
import { response } from './fixtures';

const services = vi.hoisted(() => ({ decodeCover: vi.fn() }));
vi.mock('../../src/services/coverImages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/coverImages')>()), ...services,
}));

const capabilities: Capabilities = {
  search: false, ai: false, googleBooks: false, hardcover: false, model: 'deepseek-flash',
  limits: { search: 3, ai: 1, googleBooks: 2, hardcover: 1, outputTokens: 2048, inputBytes: 20000 },
  pricingAsOf: '2026-09-29', estimatedMaxAiUsd: 0.02,
};
const cover = (overrides: Partial<CoverCandidate> = {}): CoverCandidate => ({ id: 'c1', title: 'Second', author: 'Example Author', role: 'next',
  format: 'ebook', provider: 'hardcover', source: { id: 'cs', title: 'Second', url: 'https://hardcover.app/books/second' },
  imageUrl: 'https://assets.hardcover.app/second.jpg', workKey: 'second|example author', editionKey: null, width: null, height: null, ...overrides });
const session = (result: CheckResponse): DiscoverySession => ({ seriesId: 's1', phase: 'review', capabilities, snapshot: null, response: result, error: null });
function show(result: CheckResponse, overrides: Partial<Parameters<typeof DiscoveryDialog>[0]> = {}) {
  const props = { session: session(result), series: seriesFixture(), preferredMarket: 'CA', stale: false,
    onRun: vi.fn(), onClose: vi.fn(), onAccept: vi.fn(() => ({ ok: true as const, value: undefined })), ...overrides };
  return { ...render(<DiscoveryDialog {...props} />), props };
}
const open = (name: string) => userEvent.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) }));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  services.decodeCover.mockReset();
  services.decodeCover.mockImplementation(async (item: CoverCandidate) => item.format === 'audio' ? { ...item, width: 500, height: 500 } : { ...item, width: 600, height: 900 });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('opening the review makes no request and decodes nothing until the user asks for cover previews', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  show(response({ coverCandidates: [cover()] }));
  await open('Covers');
  expect(services.decodeCover).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByText(/Images load only when you ask/)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Load cover previews' }));
  await screen.findByRole('group', { name: 'Cover choices' });
  expect(services.decodeCover).toHaveBeenCalledOnce();
  expect(fetcher).not.toHaveBeenCalled();
});

test('named portrait cover shows work, provider, format and role, and sends coverId on save', async () => {
  const view = show(response({ coverCandidates: [cover()] }));
  await open('Covers');
  await userEvent.click(screen.getByRole('button', { name: 'Load cover previews' }));
  const choice = await screen.findByRole('button', { name: 'Select cover: Second by Example Author, Hardcover, Book, Next book' });
  expect(choice).toHaveTextContent('Second'); expect(choice).toHaveTextContent('by Example Author'); expect(choice).toHaveTextContent('Hardcover, Book, Next book');
  expect(choice).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'Save selected changes' })).toBeDisabled();
  await userEvent.click(choice);
  expect(choice).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('tab', { name: /^Covers/ })).toHaveTextContent('Selected');
  await userEvent.click(screen.getByRole('button', { name: 'Save selected changes' }));
  expect(view.props.onAccept).toHaveBeenCalledWith({ title: false, book: false, audio: false, coverId: 'c1' });
});

test('audio square art is labelled review only and has no selection control', async () => {
  show(response({ coverCandidates: [cover({ id: 'au', title: 'Second', format: 'audio', provider: 'apple' })] }));
  await open('Covers');
  await userEvent.click(screen.getByRole('button', { name: 'Load cover previews' }));
  expect(await screen.findByText(/Audiobook art, review only/)).toBeVisible();
  expect(screen.getByText('Apple Books, Audiobook, Next book')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Select cover/ })).toBeNull();
});

test('a cover for a proposed title stays unavailable until that title is selected', async () => {
  const result = response({ coverCandidates: [cover({ id: 'h', title: 'Third' })] });
  result.proposals.identity = { title: 'Third', author: 'Example Author', position: 2, citations: [] };
  result.proposals.identityAttribution = { checkedAt: result.summary.checkedAt, sources: result.sources };
  const view = show(result);
  await open('Covers');
  await userEvent.click(screen.getByRole('button', { name: 'Load cover previews' }));
  const choice = await screen.findByRole('button', { name: /Select cover: Third/ });
  expect(choice).toBeDisabled();
  expect(screen.getByText(/Select the matching new title first/)).toBeVisible();
  await open('Next title'); await userEvent.click(screen.getByRole('checkbox', { name: 'Save Next title' }));
  await open('Covers');
  expect(screen.getByRole('button', { name: /Select cover: Third/ })).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: /Select cover: Third/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Save selected changes' }));
  expect(view.props.onAccept).toHaveBeenCalledWith({ title: true, book: false, audio: false, coverId: 'h' });
  await open('Next title'); await userEvent.click(screen.getByRole('checkbox', { name: 'Save Next title' }));
  await open('Covers');
  expect(screen.getByRole('button', { name: /Select cover: Third/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save selected changes' })).toBeDisabled();
});

test('provider trouble is stated even when another source supplied a valid image', async () => {
  const result = response({ coverCandidates: [cover()] });
  result.summary.status = 'partial'; result.summary.reasons = ['provider-error'];
  show(result);
  await open('Covers');
  await userEvent.click(screen.getByRole('button', { name: 'Load cover previews' }));
  await screen.findByRole('group', { name: 'Cover choices' });
  expect(screen.getByText(/Some cover sources could not be fully checked/)).toBeVisible();
});

test('unusable images are counted and an empty candidate list says so', async () => {
  services.decodeCover.mockImplementation(async (item: CoverCandidate) => item.id === 'bad' ? null : { ...item, width: 600, height: 900 });
  const view = show(response({ coverCandidates: [cover(), cover({ id: 'bad', title: 'Bad' })] }));
  await open('Covers');
  await userEvent.click(screen.getByRole('button', { name: 'Load cover previews' }));
  expect(await screen.findByText(/1 offered cover could not be loaded/)).toBeVisible();
  view.unmount();
  show(response());
  await open('Covers');
  expect(screen.getByText(/No cover artwork was offered/)).toBeVisible();
});

test('closing the dialog while previews decode aborts the work', async () => {
  let signal: AbortSignal | undefined;
  services.decodeCover.mockImplementation((_item: CoverCandidate, abort: AbortSignal) => { signal = abort; return new Promise(() => {}); });
  const view = show(response({ coverCandidates: [cover()] }));
  await open('Covers');
  await userEvent.click(screen.getByRole('button', { name: 'Load cover previews' }));
  await waitFor(() => expect(signal).toBeDefined());
  view.unmount();
  expect(signal!.aborted).toBe(true);
});

test('related works are cited reference items without acceptance and never reach the saved selection', async () => {
  const result = response();
  const cited = result.sources[0].id;
  result.proposals.related = [
    { title: 'The Daughters War', author: 'Example Author', relationship: 'prequel', position: null, citations: [{ sourceId: cited, quote: 'Set before the first book.' }] },
    { title: 'Crypt Currency', author: 'Example Author', relationship: 'continuation', position: null, citations: [{ sourceId: cited, quote: 'Continues the series without a number.' }] },
  ];
  const view = show(result);
  await open('Related works');
  const pane = screen.getByRole('tabpanel', { name: /^Related works/ });
  expect(pane).toHaveTextContent('Prequel'); expect(pane).toHaveTextContent('Unnumbered continuation');
  expect(pane.querySelector('input')).toBeNull();
  expect(screen.getByText('Set before the first book.')).toBeVisible();
  expect(screen.getByText('Continues the series without a number.')).toBeVisible();
  await open('Book'); await userEvent.click(screen.getByRole('checkbox', { name: 'Save Book' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save selected changes' }));
  expect(JSON.stringify(vi.mocked(view.props.onAccept).mock.calls)).not.toMatch(/Daughters|Crypt/);
});

test('an undated available proposal with no source market is explained and cannot be selected', async () => {
  const result = response(); const proposal = result.proposals.releases.book!;
  proposal.state = 'released'; proposal.date = null; proposal.provenance.sourceMarket = null; proposal.provenance.datePrecision = 'none';
  show(result);
  await open('Book');
  expect(screen.getByRole('checkbox', { name: 'Save Book' })).toBeDisabled();
  expect(screen.getByText(/needs a source country, so it cannot be saved/)).toBeVisible();
});

test.each([
  ['catalogued', 'Edition found; release unverified'], ['announced', 'Announced'],
] as const)('%s undated proposals use the exact lifecycle copy', async (state, copy) => {
  const result = response(); const proposal = result.proposals.releases.book!;
  proposal.state = state; proposal.date = null; proposal.provenance.datePrecision = 'none';
  show(result);
  await open('Book');
  expect(screen.getByText(copy)).toBeVisible();
  expect(screen.getByText(`Status: ${copy}`)).toBeVisible();
});

test('scheduled and released proposals show Scheduled and Available lifecycle copy', async () => {
  const result = response(); const proposal = result.proposals.releases.book!;
  proposal.state = 'scheduled';
  show(result);
  await open('Book');
  expect(screen.getByText('Status: Scheduled')).toBeVisible();
  cleanup();
  proposal.state = 'released';
  show(result);
  await open('Book');
  expect(screen.getByText('Status: Available')).toBeVisible();
});

test('outline tabs move with arrow keys and keep the detail pane in step', async () => {
  show(response());
  await open('Next title');
  screen.getByRole('tab', { name: /^Next title/ }).focus();
  await userEvent.keyboard('{ArrowDown}');
  expect(screen.getByRole('tab', { name: /^Book/ })).toHaveFocus();
  expect(screen.getByRole('tab', { name: /^Book/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tabpanel', { name: /^Book/ })).toBeVisible();
  await userEvent.keyboard('{End}');
  expect(screen.getByRole('tab', { name: /^Coverage/ })).toHaveFocus();
  await userEvent.keyboard('{Home}');
  expect(screen.getByRole('tab', { name: /^Next title/ })).toHaveFocus();
});

test.each([
  ['complete', 'Complete', /Every source this run needed was checked/],
  ['partial', 'Partial', /A source quota, timeout, error or limit affected this run/],
  ['failed', 'Failed', /The check failed/],
  ['cancelled', 'Cancelled', /The check was cancelled/],
] as const)('coverage pane for a %s check says so', async (status, chip, text) => {
  const result = response(); result.summary.status = status;
  show(result);
  expect(screen.getByRole('tab', { name: new RegExp(`^Coverage.*${chip}`) })).toBeVisible();
  await open('Coverage');
  expect(screen.getByText(text)).toBeVisible();
  if (status !== 'complete') expect(screen.queryByText(/Every source this run needed was checked/)).toBeNull();
  if (status === 'failed') expect(screen.getByText(/could not be checked/)).toBeVisible();
});
