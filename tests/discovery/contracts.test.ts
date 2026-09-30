import { expect, test } from 'vitest';
import { parseCheckRequest, parseCheckResponse, parseExtraction } from '../../shared/discoveryValidation';
import { bundle, edition, request, response } from './fixtures';
import { selectProposals } from '../../shared/discoveryPolicy';

const at = '2026-09-29T12:00:00Z';

test('rejects invalid calendar days in extracted editions', () => {
  const evidence = bundle([edition({ date: '2027-02-30' })]);
  expect(parseExtraction(evidence, evidence.sources).ok).toBe(false);
});
test('rejects malformed response fields and unexpected fields', () => {
  const valid = response();
  expect(parseCheckResponse(valid).ok).toBe(true);
  expect(parseCheckResponse({ ...valid, summary: { ...valid.summary, status: 'maybe' } }).ok).toBe(false);
  expect(parseCheckResponse({ ...valid, extra: true }).ok).toBe(false);
});
test('rejects response proposals citing sources absent from the response', () => {
  const valid = response();
  expect(parseCheckResponse({ ...valid, sources: [] }).ok).toBe(false);
});
test('rejects duplicate edition IDs and made-up source IDs', () => {
  const duplicate = bundle([edition(), edition({ date: '2027-04-01' })]);
  expect(parseExtraction(duplicate, duplicate.sources).ok).toBe(false);
  const missingSource = bundle([edition({ citations: [{ sourceId: 'absent', quote: 'invented' }] })]);
  expect(parseExtraction(missingSource, []).ok).toBe(false);
});
test('rejects missing or nonliteral quotes', () => {
  const missing = bundle([edition({ citations: [] })]);
  expect(parseExtraction(missing, missing.sources).ok).toBe(false);
  const invented = bundle([edition({ citations: [{ sourceId: 's1', quote: 'not in text' }] })]);
  expect(parseExtraction(invented, invented.sources).ok).toBe(false);
});
test('identity-only fixture supplies literal source text', () => {
  const evidence = bundle([], [{ title: 'Second', author: 'Example Author', position: 2,
    citations: [{ sourceId: 's1', quote: 'Second by Example Author. Book 2.' }] }]);
  expect(parseExtraction(evidence, evidence.sources).ok).toBe(true);
});
test('rejects unsafe URLs and credentials', () => {
  const valid = response();
  expect(parseCheckResponse({ ...valid, sources: [{ id: 's1', title: 'Bad', url: 'javascript:alert(1)' }] }).ok).toBe(false);
  expect(parseCheckResponse({ ...valid, sources: [{ id: 's1', title: 'Bad', url: 'https://user:password@example.com/' }] }).ok).toBe(false);
});
test('accepts a bounded request and rejects invalid position, country, and formats', () => {
  expect(parseCheckRequest(request()).ok).toBe(true);
  expect(parseCheckRequest(request({ target: { ...request().target, position: 0 } })).ok).toBe(false);
  expect(parseCheckRequest(request({ preferredMarket: 'ca' })).ok).toBe(false);
  expect(parseCheckRequest(request({ formats: ['book', 'book'] })).ok).toBe(false);
});
test('month evidence becomes an announced proposal without an exact date', () => {
  const evidence = bundle([edition({ date: '2027-05', precision: 'month' })]);
  expect(parseExtraction(evidence, evidence.sources).ok).toBe(true);
  const proposal = selectProposals(request(), evidence, at).releases.book;
  expect(proposal?.state).toBe('announced');
  expect(proposal?.date).toBeNull();
});
test('unspecified market can supply a fallback date', () => {
  const proposal = selectProposals(request(), bundle([edition({ market: null })]), at).releases.book;
  expect(proposal?.date).toBe('2027-03-01');
  expect(proposal?.provenance.sourceMarket).toBeNull();
});
test('different edition dates do not conflict', () => {
  const proposals = selectProposals(request(), bundle([
    edition(), edition({ id: 'e2', editionKey: 'isbn:test-2', date: '2027-04-01' }),
  ]), at);
  expect(proposals.conflicts).toEqual([]);
  expect(proposals.releases.book?.date).toBe('2027-03-01');
});
test('unknown title and uncited order yield no proposals', () => {
  const proposals = selectProposals(request({ target: { ...request().target, title: '' } }), bundle([edition()]), at);
  expect(proposals.identity).toBeNull();
  expect(proposals.releases.book).toBeNull();
});
test('fractional position requires matching cited order evidence', () => {
  const fractional = request({ target: { ...request().target, position: 1.5 } });
  const evidence = bundle([edition({ position: 1.5 })], [{
    title: 'Second', author: 'Example Author', position: 1.5,
    citations: [{ sourceId: 's1', quote: 'Book 1.5.' }],
  }]);
  expect(selectProposals(fractional, evidence, at).releases.book?.date).toBe('2027-03-01');
  expect(selectProposals(fractional, bundle([edition({ position: 1.5 })]), at).releases.book).toBeNull();
});
test('different cited identities at the requested position block dependent dates', () => {
  const evidence = bundle([edition()], [
    { title: 'Second', author: 'Example Author', position: 2, citations: [{ sourceId: 's1', quote: 'Book 2.' }] },
    { title: 'Another', author: 'Different Author', position: 2, citations: [{ sourceId: 's1', quote: 'Book 2.' }] },
  ]);
  expect(selectProposals(request(), evidence, at).releases.book).toBeNull();
});
