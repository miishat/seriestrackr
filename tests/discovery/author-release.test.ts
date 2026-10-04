import { expect, test } from 'vitest';
import { interpretPrimarySources } from '../../server/discovery/primarySources';
import { runDiscovery } from '../../server/discovery/runDiscovery';
import { selectProposals } from '../../shared/discoveryPolicy';
import { parseExtraction } from '../../shared/discoveryValidation';
import { emptyUsage, type Source } from '../../shared/discovery';
import { bundle, edition, request } from './fixtures';

const req = request({ target: { series: 'Example', title: 'Second', author: 'Example Author', position: 2, orderNote: '' } });
const catalog = bundle([edition({ date: null, precision: 'none', market: null })]);
const announcement: Source = { id: 'author', title: 'Second release dates', url: 'https://exampleauthor.com/second-release-dates', provider: 'tavily', market: null, retrievedAt: '2026-10-04T00:00:00Z',
  text: 'Example Author\nSecond release dates\nUpdate: All versions will release on May 12, 2026.\n1. The ebook is available for preorder.\n2. The hardcover edition is available for preorder.' };
const combined = () => ({ ...catalog, sources: [...catalog.sources, announcement] });

test('explicit author date uses English catalog format proof and preserves unknown market', () => {
  const evidence = interpretPrimarySources(req, combined());
  expect(parseExtraction(evidence, evidence.sources).ok).toBe(true);
  expect(selectProposals(req, evidence, '2026-10-04T00:00:00Z').releases.book).toMatchObject({ date: '2026-05-12', provenance: { sourceMarket: null, language: 'en', editionFormat: 'ebook' } });
  expect(evidence.editions.filter(item => item.id.startsWith('author:'))).toHaveLength(1);
});

test.each(['wrong host', 'no English proof', 'no format', 'invalid date', 'conflicting dates', 'wrong title'])('rejects author date with %s', mode => {
  const evidence = combined();
  evidence.sources[1] = { ...announcement };
  if (mode === 'wrong host') evidence.sources[1].url = 'https://unrelated.example/second';
  if (mode === 'no English proof') evidence.editions = evidence.editions.map(item => ({ ...item, language: null }));
  if (mode === 'no format') evidence.sources[1].text = announcement.text.split('\n').slice(0, 3).join('\n');
  if (mode === 'invalid date') evidence.sources[1].text = announcement.text.replace('May 12', 'February 30');
  if (mode === 'conflicting dates') evidence.sources[1].text += '\nAll versions will release on June 12, 2026.';
  if (mode === 'wrong title') evidence.sources[1].title = 'Another novel';
  expect(interpretPrimarySources(req, evidence).editions.filter(item => item.id.startsWith('author:'))).toHaveLength(0);
});

test.each([false, true])('pipeline joins separately retrieved catalog and author sources with AI=%s', async useAi => {
  const result = await runDiscovery({ ...req, formats: ['book'], useAi }, {
    catalogs: async () => ({ evidence: catalog, usage: emptyUsage(), reasons: [] }),
    search: async () => ({ sources: [announcement], identities: [], editions: [] }),
    extract: async () => { throw new Error('Dated requested book should not need extraction'); },
    canSearch: true, canExtract: true, now: () => '2026-10-04T00:00:00Z',
  }, new AbortController().signal);
  expect(result.proposals.releases.book?.date).toBe('2026-05-12');
});

import { normalizeSearch } from '../../server/discovery/search';

test('author year-only schedule offers Announced with no invented date after long-page truncation', () => {
  const raw = 'Example Author\nChronicles of Example\n' + 'Earlier update.\n'.repeat(600) + '\n2028 – Publication of Second\nConclusion';
  const search = normalizeSearch({ results: [{ title: 'Chronicles of Example', url: 'https://exampleauthorauthor.com/post/update', raw_content: raw }] }, '2026-10-04T00:00:00Z');
  const evidence = interpretPrimarySources(req, { ...catalog, sources: [...catalog.sources, ...search.sources] });
  expect(selectProposals(req, evidence, '2026-10-04T00:00:00Z').releases.book).toMatchObject({ state: 'announced', date: null });
});

test.each(['wrong host', 'wrong author', 'wrong title', 'no English edition', 'conflicting schedule'])('rejects year announcement with %s', mode => {
  const source = { ...announcement, url: 'https://exampleauthorauthor.com/update', text: 'Example Author\n2028 – Publication of Second' };
  const evidence = { ...catalog, editions: [...catalog.editions], sources: [...catalog.sources, source] };
  if (mode === 'wrong host') source.url = 'https://unrelated.example/update';
  if (mode === 'wrong author') source.text = source.text.replace('Example Author', 'Someone Else');
  if (mode === 'wrong title') source.text = source.text.replace('Second', 'Third');
  if (mode === 'no English edition') evidence.editions = evidence.editions.map(item => ({ ...item, language: null }));
  if (mode === 'conflicting schedule') source.text += '\n2029 – Publication of Second';
  expect(interpretPrimarySources(req, evidence).editions.filter(item => item.publication === 'announced')).toHaveLength(0);
});
