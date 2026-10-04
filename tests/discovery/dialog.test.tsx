import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Capabilities, CheckResponse } from '../../shared/discovery';
import { DiscoveryDialog } from '../../src/features/discovery/DiscoveryDialog';
import { DiscoverySummary } from '../../src/features/discovery/DiscoverySummary';
import type { DiscoverySession } from '../../src/features/discovery/discoverySession';
import { seriesFixture } from '../fixtures';
import { response } from './fixtures';

const capabilities: Capabilities = {
  search: true, ai: true, googleBooks: false, hardcover: false, model: 'deepseek-flash',
  limits: { search: 3, ai: 1, googleBooks: 2, hardcover: 1, outputTokens: 2048, inputBytes: 20000 },
  pricingAsOf: '2026-09-29', estimatedMaxAiUsd: 0.02,
};
function session(phase: DiscoverySession['phase'] = 'review', result: CheckResponse | null = response()): DiscoverySession {
  return { seriesId: 's1', phase, capabilities, snapshot: null, response: result, error: null };
}
function show(active = session(), overrides: Partial<Parameters<typeof DiscoveryDialog>[0]> = {}) {
  const props = { session: active, series: seriesFixture(), preferredMarket: 'CA', stale: false, apiKeys: { tavily: null, deepseek: 'deepseek-key-123' },
    onRun: vi.fn(), onClose: vi.fn(), onAccept: vi.fn(() => ({ ok: true as const, value: undefined })), ...overrides };
  return { ...render(<DiscoveryDialog {...props} />), props };
}
const open = (name: string) => userEvent.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) }));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('ready is source-only by default and render makes no request', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const view = show(session('ready', null));
  expect(screen.getByRole('heading', { name: 'Check Release' })).toBeVisible();
  expect(screen.getAllByRole('button', { name: 'Close', exact: true })).toHaveLength(1);
  expect(screen.getByRole('checkbox', { name: 'Use DeepSeek for this check' })).not.toBeChecked();
  expect(screen.getByText('AI reads retrieved sources. One billed request.')).toBeVisible();
  expect(screen.getByText(/2026-09-29/)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Check' }));
  expect(view.props.onRun).toHaveBeenCalledWith({ useAi: false, useSearch: false, fallbackMarkets: true });
  expect(fetcher).not.toHaveBeenCalled();
});
test('missing AI and search keys leave source-only checking usable', async () => {
  const view = show(session('ready', null), { apiKeys: { tavily: null, deepseek: null } });
  expect(screen.getByRole('checkbox', { name: 'Use DeepSeek for this check' })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: 'Use Tavily web search for this check' })).toBeDisabled();
  expect(screen.getByText(/Add your own DeepSeek key in Settings/)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Check' }));
  expect(view.props.onRun).toHaveBeenCalledWith({ useAi: false, useSearch: false, fallbackMarkets: true });
});
test('AI resets after each check and when another session opens', async () => {
  const view = show(session('ready', null));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Use DeepSeek for this check' }));
  await userEvent.click(screen.getByRole('button', { name: 'Check' }));
  expect(view.props.onRun).toHaveBeenCalledWith({ useAi: true, useSearch: false, fallbackMarkets: true });
  expect(screen.getByRole('checkbox', { name: 'Use DeepSeek for this check' })).not.toBeChecked();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Use DeepSeek for this check' }));
  view.rerender(<DiscoveryDialog {...view.props} session={{ ...session('ready', null), seriesId: 's2' }} />);
  expect(screen.getByRole('checkbox', { name: 'Use DeepSeek for this check' })).not.toBeChecked();
});
test('review starts empty and accepts whole format bundles only by selection', async () => {
  const view = show();
  const save = screen.getByRole('button', { name: 'Save Selected Changes' });
  expect(save).toBeDisabled();
  await open('Book');
  expect(screen.getByRole('checkbox', { name: 'Save Book' })).not.toBeChecked();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Save Book' }));
  await userEvent.click(save);
  expect(view.props.onAccept).toHaveBeenCalledWith({ title: false, book: true, audio: false });
  expect(screen.getByRole('tab', { name: /^Book/ })).toHaveAttribute('aria-selected', 'true');
});
test('changed title controls dependent selections and warns about clearing old values', async () => {
  const result = response();
  result.proposals.identity = { title: 'Third', author: 'Example Author', position: 2, citations: [] };
  result.proposals.identityAttribution = { checkedAt: result.summary.checkedAt, sources: result.sources };
  result.proposals.releases.book!.title = 'Third';
  show(session('review', result));
  const title = screen.getByRole('checkbox', { name: 'Save Next title' });
  expect(screen.getByText(/replaces old release details.*Your selected cover is kept/)).toBeVisible();
  await open('Book');
  const book = screen.getByRole('checkbox', { name: 'Save Book' });
  expect(book).toBeDisabled();
  await open('Next title'); await userEvent.click(title);
  await open('Book'); await userEvent.click(book);
  await open('Next title'); await userEvent.click(title);
  await open('Book');
  expect(book).toBeDisabled(); expect(book).not.toBeChecked();
});
test('format title differing without an identity proposal cannot be selected', async () => {
  const result = response(); result.proposals.releases.book!.title = 'Other title';
  show(session('review', result));
  await open('Book');
  expect(screen.getByRole('checkbox', { name: 'Save Book' })).toBeDisabled();
});
test('conflict and absent proposals are disabled independently', async () => {
  const result = response(); result.proposals.conflicts = [{ format: 'book', evidenceIds: ['e1'], reason: 'Dates disagree.' }];
  show(session('review', result));
  await open('Book');
  expect(screen.getByRole('checkbox', { name: 'Save Book' })).toBeDisabled();
  expect(screen.getByText('Dates disagree.')).toBeVisible();
  await open('Audiobook');
  expect(screen.getByRole('checkbox', { name: 'Save Audiobook' })).toBeDisabled();
});
test('announced proposals retain unknown dates and unspecified source country', async () => {
  const result = response(); const proposal = result.proposals.releases.book!;
  proposal.state = 'announced'; proposal.date = null; proposal.provenance.sourceMarket = null; proposal.provenance.datePrecision = 'none';
  show(session('review', result));
  await open('Book');
  expect(screen.getByText('Announced')).toBeVisible();
  expect(screen.getByText(/source country unspecified/)).toBeVisible();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Save Book' }));
  expect(screen.getByRole('button', { name: 'Save Selected Changes' })).toBeEnabled();
});
test('fallback shows actual country and supported-date qualification with cited links', async () => {
  const result = response(); result.proposals.releases.book!.provenance.sourceMarket = 'GB';
  show(session('review', result));
  await open('Book');
  expect(screen.getByText('Date from GB; no supported CA date found in sources checked.')).toBeVisible();
  expect(screen.getByText('Earliest supported date in sources checked.')).toBeVisible();
  expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', 'https://example.com/second');
});
test('stale review disables saving and requires explicit refresh', async () => {
  const view = show(session(), { stale: true });
  expect(screen.getByText('The series changed. Check Again before saving.')).toBeVisible();
  await open('Book');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Save Book' }));
  expect(screen.getByRole('button', { name: 'Save Selected Changes' })).toBeDisabled();
  expect(view.props.onRun).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Check Again' }));
  expect(view.props.onRun).toHaveBeenCalledWith({ useAi: false, useSearch: false, fallbackMarkets: true });
});
test('recoverable save error preserves selection and current manual details', async () => {
  const saved = seriesFixture(); saved.releases.book = { ...saved.releases.book, state: 'scheduled', date: '2027-01-02' };
  const view = show(session(), { series: saved, onAccept: vi.fn(() => ({ ok: false as const, error: 'Storage is full.' })) });
  await open('Book');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Save Book' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save Selected Changes' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Storage is full.');
  expect(screen.getByRole('checkbox', { name: 'Save Book' })).toBeChecked();
  expect(screen.getByText('2027-01-02')).toBeVisible();
  expect(view.props.onClose).not.toHaveBeenCalled();
});
test('loading offers cancellation and disables paid choice', async () => {
  const view = show(session('checking', null));
  for (const box of screen.getAllByRole('checkbox')) expect(box).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel Checking' }));
  expect(view.props.onClose).toHaveBeenCalledOnce();
});
test('native dialog focuses a control, handles Escape and returns focus on unmount', async () => {
  const opener = document.createElement('button'); document.body.append(opener); opener.focus();
  const view = show(session('ready', null)); await Promise.resolve();
  expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
  expect(view.props.onClose).toHaveBeenCalledOnce();
  view.unmount(); expect(opener).toHaveFocus(); opener.remove();
});
test('source titles and quotes render as text and unsafe source URLs never become links', () => {
  const result = response(); result.sources[0] = { id: 's1', title: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)' };
  result.proposals.releases.book!.provenance.sources = result.sources;
  show(session('review', result));
  expect(screen.getAllByText('<img src=x onerror=alert(1)>').length).toBeGreaterThan(0);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(document.querySelector('img')).toBeNull();
});
test('failed check summary stays separate from accepted release values and unknown outcomes', () => {
  const result = response(); result.summary.status = 'failed'; result.summary.reasons = ['timeout'];
  const view = render(<DiscoverySummary summary={result.summary} />);
  expect(screen.getByRole('status')).toHaveTextContent('Check failed');
  expect(screen.getByText(/saved release details are unchanged/i)).toBeVisible();
  view.rerender(<DiscoverySummary summary={{ ...result.summary, status: 'complete', formats: { book: 'unknown', audio: 'unknown' } }} />);
  expect(within(screen.getByRole('status')).queryByText('Check failed')).toBeNull();
  expect(screen.getByText(/no verified release details/i)).toBeVisible();
  view.rerender(<DiscoverySummary summary={null} />); expect(view.container).toBeEmptyDOMElement();
});

test('preparing cannot run and operational errors retry only on user click', async () => {
  const view = show({ ...session('preparing', null), capabilities: null });
  expect(screen.getByRole('button', { name: 'Preparing…' })).toBeDisabled();
  for (const box of screen.getAllByRole('checkbox')) expect(box).toBeDisabled();
  view.rerender(<DiscoveryDialog {...view.props} session={{ ...session('error', null), error: 'Sources are unavailable.' }} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Sources are unavailable.');
  expect(view.props.onRun).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Check Again' }));
  expect(view.props.onRun).toHaveBeenCalledWith({ useAi: false, useSearch: false, fallbackMarkets: true });
});

test('new check results clear selections and partial results keep supported fields reviewable', async () => {
  const view = show();
  await open('Book');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Save Book' }));
  const result = response(); result.requestId = 'r2'; result.summary.requestId = 'r2'; result.summary.status = 'partial';
  view.rerender(<DiscoveryDialog {...view.props} session={session('review', result)} />);
  await open('Book');
  expect(screen.getByRole('checkbox', { name: 'Save Book' })).not.toBeChecked();
  expect(screen.getByText(/Source coverage is incomplete/i)).toBeVisible();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Save Book' }));
  expect(screen.getByRole('button', { name: 'Save Selected Changes' })).toBeEnabled();
});

test('unknown outcomes do not offer a not-found state or any selectable release', async () => {
  const result = response(); result.proposals.releases = { book: null, audio: null };
  result.summary.formats = { book: 'unknown', audio: 'unknown' };
  show(session('review', result));
  await open('Book');
  expect(screen.getByRole('checkbox', { name: 'Save Book' })).toBeDisabled();
  await open('Audiobook');
  expect(screen.getByRole('checkbox', { name: 'Save Audiobook' })).toBeDisabled();
  expect(screen.getAllByText('Date Unknown · no supported change offered')).toHaveLength(2);
  expect(screen.queryByText('Not found')).toBeNull();
});

test.each(['preparing', 'checking'] as const)('%s focuses Close when the AI control is disabled', async phase => {
  show(session(phase, null));
  await Promise.resolve();
  expect(screen.getByRole('button', { name: phase === 'checking' ? 'Cancel Checking' : 'Close' })).toHaveFocus();
});

const receipt = (overrides: Partial<ReturnType<typeof response>['summary']>) => ({ ...response().summary, ...overrides });
test.each([
  ['Sun Eater clean receipt with one unknown format', { status: 'complete' as const, reasons: [], formats: { book: 'supported' as const, audio: 'unknown' as const } }],
  ['The Band control clean receipt', { status: 'complete' as const, reasons: [], formats: { book: 'supported' as const, audio: 'supported' as const } }],
  ['unknown identity alone', { status: 'complete' as const, reasons: ['unknown-identity' as const], formats: { book: 'unknown' as const, audio: 'unknown' as const } }],
])('%s shows no partial badge', (_name, summary) => {
  render(<DiscoverySummary summary={receipt(summary)} />);
  expect(screen.getByRole('status')).toHaveTextContent('Check complete');
  expect(screen.queryByText(/partial/i)).toBeNull();
});
test('a budget-affected run with valid dates still shows partial', () => {
  render(<DiscoverySummary summary={receipt({ status: 'partial', reasons: ['budget'], formats: { book: 'supported', audio: 'supported' } })} />);
  expect(screen.getByText('Check partially completed')).toBeVisible();
  expect(screen.getByText(/exceeded this check's limits/)).toBeVisible();
  expect(screen.getByText(/Verified results are still usable/)).toBeVisible();
});
test('incomplete facts are a separate message from the coverage status', () => {
  render(<DiscoverySummary summary={receipt({ status: 'complete', reasons: [], formats: { book: 'unknown', audio: 'supported' } })} />);
  const message = screen.getByText(/Some formats have no verified release details/);
  expect(message).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('Check complete');
  expect(screen.queryByText(/partial/i)).toBeNull();
});

test('the outline tablist holds only tabs and every tabpanel is focusable', () => {
  show();
  const list = screen.getByRole('tablist', { name: 'Review outline' });
  expect(Array.from(list.children).every(child => child.getAttribute('role') === 'tab')).toBe(true);
  for (const panel of document.querySelectorAll('[role=tabpanel]')) expect(panel).toHaveAttribute('tabindex', '0');
});

test('web search is opt in, needs your own Tavily key and resets after each check', async () => {
  const view = show(session('ready', null), { apiKeys: { tavily: 'tavily-key-123', deepseek: null } });
  const box = screen.getByRole('checkbox', { name: 'Use Tavily web search for this check' });
  expect(box).toBeEnabled(); expect(box).not.toBeChecked();
  await userEvent.click(box);
  await userEvent.click(screen.getByRole('button', { name: 'Check' }));
  expect(view.props.onRun).toHaveBeenCalledWith({ useAi: false, useSearch: true, fallbackMarkets: true });
  expect(screen.getByRole('checkbox', { name: 'Use Tavily web search for this check' })).not.toBeChecked();
});
test('other storefronts are searched by default in a manual check and can be turned off for speed', async () => {
  const view = show(session('ready', null));
  const box = screen.getByRole('checkbox', { name: /Include US, UK and Canada/ });
  expect(box).toBeChecked();
  await userEvent.click(box);
  await userEvent.click(screen.getByRole('button', { name: 'Check' }));
  expect(view.props.onRun).toHaveBeenCalledWith({ useAi: false, useSearch: false, fallbackMarkets: false });
});
test('the dialog never prints a stored key', () => {
  const view = show(session('ready', null), { apiKeys: { tavily: 'tavily-key-123', deepseek: 'deepseek-key-123' } });
  expect(view.container.textContent).not.toContain('tavily-key-123'); expect(view.container.textContent).not.toContain('deepseek-key-123');
});
