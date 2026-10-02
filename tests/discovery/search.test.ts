// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import type { DiscoveryConfig } from '../../server/discovery/config';
import { buildSearchQueries, normalizeSearch, searchEvidence } from '../../server/discovery/search';
import { parseExtraction } from '../../shared/discoveryValidation';
import { selectProposals } from '../../shared/discoveryPolicy';
import { request } from './fixtures';

const checkedAt = '2026-09-29T12:00:00Z';
const config: DiscoveryConfig = { tavilyKey: 'fake-test-key', deepseekKey: null, model: 'deepseek-flash' };
const fixture = JSON.parse(readFileSync(new URL('./data/tavily.json', import.meta.url), 'utf8'));
const signal = () => new AbortController().signal;
const allNeeds = { identity: true, book: true, audio: true };

test('uses one basic search without generated answer or automatic depth changes', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(fixture));
  const result = await searchEvidence('Example Example Author book 2', config, signal(), fetcher);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0][0])).toBe('https://api.tavily.com/search');
  const init = fetcher.mock.calls[0][1]!;
  expect(init.method).toBe('POST');
  expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  expect(new Headers(init.headers).get('Authorization')).toBe('Bearer fake-test-key');
  expect(JSON.parse(String(init.body))).toEqual({
    query: 'Example Example Author book 2', topic: 'general', search_depth: 'basic', max_results: 5,
    include_answer: false, include_raw_content: 'text', include_images: false, auto_parameters: false,
  });
  expect(result.sources).toHaveLength(4);
  expect(result.sources.every(source => Number.isFinite(Date.parse(source.retrievedAt)))).toBe(true);
  expect(result.identities).toEqual([]);
  expect(result.editions).toEqual([]);
  expect(parseExtraction(result, result.sources).ok).toBe(true);
});

test('builds only the three requested gaps in identity, book, audio order', () => {
  const req = request();
  req.target.orderNote = 'novels only';
  expect(buildSearchQueries(req, allNeeds)).toEqual([
    'Example Example Author book 2 reading order next novel novels only',
    'Second Example Author ebook hardcover publication release date English CA',
    'Second Example Author audiobook release date English CA',
  ]);
  expect(buildSearchQueries(req, { identity: false, book: true, audio: false })).toEqual([
    'Second Example Author ebook hardcover publication release date English CA',
  ]);
  expect(buildSearchQueries(req, { identity: false, book: false, audio: false })).toEqual([]);
});

test('unknown title uses series without inventing the next title and normalizes whitespace', () => {
  const req = request({ preferredMarket: ' US ' });
  req.target = { series: ' Example\n Saga ', author: ' Example\t Author ', position: 3, title: '', orderNote: '  exclude\n novellas ' };
  expect(buildSearchQueries(req, allNeeds)).toEqual([
    'Example Saga Example Author book 3 reading order next novel exclude novellas',
    'Example Saga Example Author ebook hardcover publication release date English US',
    'Example Saga Example Author audiobook release date English US',
  ]);
  req.target.title = ' \n ';
  expect(buildSearchQueries(req, allNeeds)[1]).toContain('Example Saga Example Author');
});

test('disabled formats cannot trigger searches even if their gap flag is set', () => {
  expect(buildSearchQueries(request({ formats: ['book'] }), allNeeds)).toHaveLength(3);
  expect(buildSearchQueries(request({ formats: ['audio'] }), { identity: false, book: true, audio: true })).toEqual([
    'Second Example Author audiobook release date English CA',
  ]);
  expect(buildSearchQueries(request({ formats: [] }), { identity: false, book: true, audio: true })).toEqual([]);
});

test('keeps original raw text ahead of snippets with unknown facts and source markets', () => {
  const result = normalizeSearch(fixture, checkedAt);
  expect(result.sources[0]).toMatchObject({
    title: fixture.results[0].title, url: 'https://author.example/reading-order',
    text: fixture.results[0].raw_content, retrievedAt: checkedAt, market: null, provider: 'tavily',
  });
  expect(result.sources.map(source => source.market)).toEqual([null, null, null, null]);
  expect(new Set(result.sources.map(source => source.id)).size).toBe(4);
  expect(result.identities).toEqual([]);
  expect(result.editions).toEqual([]);
});

test('missing raw text falls back to content then snippet and remains insufficient for proposals', () => {
  const result = normalizeSearch({ results: [
    { title: 'Page title is not a novel title', url: 'https://snippet.example/one', raw_content: null, content: 'Only a content snippet.' },
    { title: 'Other page', url: 'https://snippet.example/two', raw_content: ' ', content: '', snippet: 'Only a fallback snippet.' },
    { title: 'No evidence', url: 'https://snippet.example/three', content: null },
  ] }, checkedAt);
  expect(result.sources.map(source => source.text)).toEqual(['Only a content snippet.', 'Only a fallback snippet.']);
  expect(selectProposals(request(), result, checkedAt)).toMatchObject({ identity: null, releases: { book: null, audio: null } });
});

test('malicious source instructions remain inert original evidence', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ results: [fixture.results[3]] }));
  const result = await searchEvidence('Example Example Author', config, signal(), fetcher);
  expect(result.sources[0].text).toBe(fixture.results[3].raw_content);
  expect(result.sources[0].market).toBeNull();
  expect(result.identities).toEqual([]);
  expect(result.editions).toEqual([]);
  expect(selectProposals(request(), result, checkedAt).releases).toEqual({ book: null, audio: null });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test.each([
  'javascript:alert(1)', 'file:///etc/passwd', 'ftp://source.example/file', '/relative', 'not a URL',
  'https://name:password@source.example/page', 'http://localhost/page', 'http://10.1.2.3/page',
  'http://127.0.0.1/page', 'http://[::1]/page', 'http://[::ffff:7f00:1]/page',
])('rejects unsafe source URL %s using shared source rules', url => {
  expect(normalizeSearch({ results: [{ title: 'Unsafe page', url, raw_content: 'Evidence' }] }, checkedAt).sources).toEqual([]);
});

test('canonical URLs deduplicate fragments, host casing and default ports while distinct sources survive', () => {
  const result = normalizeSearch({ results: [
    { title: 'One', url: 'https://SOURCE.example:443/second#book', raw_content: 'Release: March 1, 2027.' },
    { title: 'Duplicate', url: 'https://source.example/second#audio', raw_content: 'Duplicate page text.' },
    { title: 'Different', url: 'https://different.example/second', raw_content: 'Release: April 2, 2027.' },
  ] }, checkedAt);
  expect(result.sources.map(source => source.url)).toEqual(['https://source.example/second', 'https://different.example/second']);
  expect(result.sources.map(source => source.text)).toEqual(['Release: March 1, 2027.', 'Release: April 2, 2027.']);
  expect(normalizeSearch({ results: [{ title: 'One', url: 'https://source.example/second', content: 'Other text' }] }, checkedAt).sources[0].id)
    .toBe(result.sources[0].id);
});

test('bounds result count and fields locally even if the provider ignores request limits', () => {
  const result = normalizeSearch({ results: Array.from({ length: 12 }, (_, i) => ({
    title: 'T'.repeat(400), url: `https://source.example/${i}`, raw_content: 'X'.repeat(7000),
  })) }, checkedAt);
  expect(result.sources).toHaveLength(5);
  expect(result.sources.every(source => source.title.length === 300 && source.text.length === 6000)).toBe(true);
  expect(parseExtraction(result, result.sources).ok).toBe(true);
});

test.each([null, [], {}, { results: null }, { results: {} }, { results: [null, {}, { title: 2, url: 4, content: [] }] }])(
  'normalizes malformed unknown input without inventing evidence: %j', input => {
    expect(normalizeSearch(input, checkedAt)).toEqual({ sources: [], identities: [], editions: [] });
  },
);

test('429 propagates quota without retrying or leaking response text', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ message: 'private-provider-details' }, { status: 429 }));
  await expect(searchEvidence('Example', config, signal(), fetcher)).rejects.toMatchObject({
    provider: 'tavily', reason: 'quota', message: 'quota',
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test.each([null, '', ' \n '])('missing key %j performs zero fetches', async tavilyKey => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(fixture));
  await expect(searchEvidence('Example', { ...config, tavilyKey }, signal(), fetcher)).rejects.toMatchObject({
    provider: 'tavily', reason: 'missing-key', message: 'missing-key',
  });
  expect(fetcher).not.toHaveBeenCalled();
});

test('already aborted search performs zero fetches', async () => {
  const controller = new AbortController(); controller.abort();
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(fixture));
  await expect(searchEvidence('Example', config, controller.signal, fetcher)).rejects.toMatchObject({ reason: 'cancelled' });
  expect(fetcher).not.toHaveBeenCalled();
});

test('invalid provider envelope returns a sanitized error instead of empty success', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ results: null, answer: 'Do not trust generated answers' }));
  await expect(searchEvidence('Example', config, signal(), fetcher)).rejects.toMatchObject({ reason: 'invalid-evidence' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test('unresolved identity uses a spare slot for a primary-host query derived from the request', () => {
  const req = request({ formats: ['book'], target: { series: 'Example Saga', author: 'Example Author', position: 3, title: '', orderNote: '' } });
  const queries = buildSearchQueries(req, allNeeds);
  expect(queries).toHaveLength(3);
  expect(queries[2]).toBe('Example Saga Example Author book 3 official publisher author announcement');
  expect(buildSearchQueries(req, { identity: false, book: true, audio: false })).toHaveLength(1);
  expect(buildSearchQueries(request(), allNeeds)).toHaveLength(3);
});
