// @vitest-environment node
import { expect, test, vi } from 'vitest';
import { runDiscovery } from '../../server/discovery/runDiscovery';
import type { DiscoveryDependencies } from '../../server/discovery/runDiscovery';
import { emptyUsage } from '../../shared/discovery';
import { parseCheckRequest } from '../../shared/discoveryValidation';
import { bundle, request } from './fixtures';

const deps = (overrides: Partial<DiscoveryDependencies> = {}): DiscoveryDependencies => ({
  catalogs: vi.fn(async () => ({ evidence: bundle([]), usage: emptyUsage(), reasons: [] })),
  search: vi.fn(async () => bundle([])), extract: vi.fn(async () => ({ evidence: bundle([]), usage: emptyUsage() })),
  now: () => '2026-09-29T12:00:00Z', canSearch: true, canExtract: true, ...overrides,
});
const wire = (extra: Record<string, unknown> = {}) => { const { useSearch, fallbackMarkets, ...legacy } = request(); return { ...legacy, ...extra }; };

test('a request without the opt-in flags validates as source-only with the preferred market', () => {
  const parsed = parseCheckRequest(wire());
  expect(parsed).toMatchObject({ ok: true, value: { useSearch: false, fallbackMarkets: false } });
});
test('opt-in flags must be booleans', () => {
  expect(parseCheckRequest(wire({ useSearch: true, fallbackMarkets: true }))).toMatchObject({ ok: true, value: { useSearch: true, fallbackMarkets: true } });
  expect(parseCheckRequest(wire({ useSearch: 'yes' })).ok).toBe(false);
  expect(parseCheckRequest(wire({ fallbackMarkets: 1 })).ok).toBe(false);
});
test('web search never runs unless the request opts in, even when a key is available', async () => {
  const d = deps(); const result = await runDiscovery(request({ useSearch: false }), d, new AbortController().signal);
  expect(d.search).not.toHaveBeenCalled(); expect(result.summary.usage.tavily).toBe(0);
  expect(result.summary.reasons).not.toContain('missing-key');
});
test('web search opt-in without a key reports a missing key and makes no search call', async () => {
  const d = deps({ canSearch: false }); const result = await runDiscovery(request({ useSearch: true }), d, new AbortController().signal);
  expect(d.search).not.toHaveBeenCalled(); expect(result.summary.reasons).toContain('missing-key');
});
test('web search opt-in with a key searches', async () => {
  const d = deps(); await runDiscovery(request({ useSearch: true }), d, new AbortController().signal);
  expect(d.search).toHaveBeenCalled();
});
test('fallback storefronts are searched only on request', async () => {
  const off = deps(); await runDiscovery(request({ fallbackMarkets: false }), off, new AbortController().signal);
  expect(vi.mocked(off.catalogs).mock.calls[0][1]).toEqual(['CA']);
  const on = deps(); await runDiscovery(request({ fallbackMarkets: true }), on, new AbortController().signal);
  expect(vi.mocked(on.catalogs).mock.calls[0][1]).toEqual(['CA', 'US', 'GB']);
});
