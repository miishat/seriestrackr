import { expect, test } from 'vitest';
import { selectProposals } from '../../shared/discoveryPolicy';
import { request, edition, bundle } from './fixtures';
const at = '2026-09-29T12:00:00Z';

test('preferred-market date wins; audio falls back independently', () => {
  const p = selectProposals(request(), bundle([
    edition({ id: 'ca', date: '2027-03-01' }),
    edition({ id: 'us', market: 'US', editionKey: 'isbn:us', date: '2027-02-01' }),
    edition({ id: 'gb-audio', market: 'GB', format: 'audio', editionKey: 'isbn:audio' }),
  ]), at);
  expect(p.releases.book?.date).toBe('2027-03-01');
  expect(p.releases.audio?.provenance.sourceMarket).toBe('GB');
});
test('earliest ebook/print wins within selected market', () => {
  const p = selectProposals(request(), bundle([
    edition(), edition({ id: 'paper', editionKey: 'isbn:paper', format: 'print', date: '2027-08-01' }),
  ]), at);
  expect(p.releases.book?.provenance.editionFormat).toBe('ebook');
});
test('same-edition contradictory dates block the affected format', () => {
  const p = selectProposals(request(), bundle([edition(), edition({ id: 'other', date: '2027-04-01' })]), at);
  expect(p.releases.book).toBeNull();
  expect(p.conflicts[0].format).toBe('book');
});
test.each([
  { language: 'fr' }, { language: null }, { author: 'Different Author' },
  { position: 1.5 }, { title: 'Second boxed set' },
])('rejects mismatched evidence %j', (patch) => {
  expect(selectProposals(request(), bundle([edition(patch)]), at).releases.book).toBeNull();
});
