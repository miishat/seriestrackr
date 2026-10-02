import { expect, test } from 'vitest';
import { selectProposals } from '../../shared/discoveryPolicy';
import { request, edition, bundle } from './fixtures';
const at = '2026-09-29T12:00:00Z';

test('a known integer-position title with a custom order note cannot accept catalog dates', () => {
  const req = request({ target: { ...request().target, orderNote: '  Alternate chronology: second entry  ' } });
  const evidence = bundle([edition({ position: null }), edition({ id: 'audio', format: 'audio', editionKey: 'audio' })]);
  const before = structuredClone(evidence);
  expect(selectProposals(req, evidence, at)).toEqual({
    identity: null, identityAttribution: null, releases: { book: null, audio: null }, conflicts: [], related: [],
  });
  expect(evidence).toEqual(before);
});

test('generic same-position identity cannot attest a custom order note', () => {
  const req = request({ target: { ...request().target, title: '', orderNote: 'Novels only' } });
  const evidence = bundle([edition()], [{ title: 'Second', author: 'Example Author', position: 2,
    citations: [{ sourceId: 's1', quote: 'Second by Example Author. Book 2.' }] }]);
  expect(selectProposals(req, evidence, at)).toEqual({
    identity: null, identityAttribution: null, releases: { book: null, audio: null }, conflicts: [], related: [],
  });
});

test.each(['', ' \t\n '])('blank order note %j preserves known titles and cited fractional identities', orderNote => {
  const req = request({ target: { ...request().target, orderNote } });
  expect(selectProposals(req, bundle([edition({ position: null })]), at).releases.book?.date).toBe('2027-03-01');
  const fractional = request({ target: { ...req.target, title: '', position: 1.5 } });
  const identity = { title: 'Second', author: 'Example Author', position: 1.5,
    citations: [{ sourceId: 's1', quote: 'Second by Example Author. Book 1.5.' }] };
  const proposals = selectProposals(fractional, bundle([edition({ position: 1.5 })], [identity]), at);
  expect(proposals.identity).toEqual(identity);
  expect(proposals.releases.book?.date).toBe('2027-03-01');
  expect(selectProposals(fractional, bundle([edition({ position: 1.5 })]), at).releases.book).toBeNull();
});

test('preferred-market date wins; audio falls back independently', () => {
  const p = selectProposals(request(), bundle([
    edition({ id: 'ca', date: '2027-03-01' }),
    edition({ id: 'us', market: 'US', editionKey: 'isbn:us', date: '2027-02-01' }),
    edition({ id: 'gb-audio', market: 'GB', format: 'audio', editionKey: 'isbn:audio' }),
  ]), at);
  expect(p.releases.book).toMatchObject({ date: '2027-03-01',
    provenance: { sourceMarket: 'CA', editionFormat: 'ebook', datePrecision: 'day' } });
  expect(p.releases.audio).toMatchObject({ date: '2027-03-01',
    provenance: { sourceMarket: 'GB', editionFormat: 'audio', datePrecision: 'day' } });
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
  expect(p.releases.audio).toBeNull();
  expect(p.conflicts).toEqual([{ format: 'book', evidenceIds: ['e1', 'other'],
    reason: 'Contradictory dates for the same edition' }]);
});
test('compatible month and day evidence preserves the exact date', () => {
  const p = selectProposals(request(), bundle([
    edition({ id: 'month', date: '2027-03', precision: 'month' }),
    edition({ id: 'day', date: '2027-03-01', precision: 'day' }),
  ]), at);
  expect(p.conflicts).toEqual([]);
  expect(p.releases.book?.date).toBe('2027-03-01');
});
test('disjoint month and day evidence for one edition blocks the date', () => {
  const p = selectProposals(request(), bundle([
    edition({ id: 'month', date: '2027-05', precision: 'month' }),
    edition({ id: 'day', date: '2027-03-01', precision: 'day' }),
  ]), at);
  expect(p.releases.book).toBeNull();
  expect(p.conflicts[0]?.evidenceIds).toEqual(['day', 'month']);
});
test.each([
  { language: 'fr' }, { language: null }, { author: 'Different Author' },
  { position: 1.5 }, { title: 'Second boxed set' },
])('rejects mismatched evidence %j', (patch) => {
  expect(selectProposals(request(), bundle([edition(patch)]), at).releases.book).toBeNull();
});

test.each([
  { label: 'distinct title prefix', title: 'Second Wind', author: 'Example Author',
    otherTitle: 'Second Windfall', otherAuthor: 'Example Author' },
  { label: 'punctuation-distinct author', title: 'Second', author: 'Example-Author',
    otherTitle: 'Second', otherAuthor: 'Example Author' },
])('$label cannot replace an exact work match with an earlier date', ({ title, author, otherTitle, otherAuthor }) => {
  const req = request({ target: { ...request().target, title, author } });
  const exact = edition({ title, author, id: 'exact', editionKey: 'isbn:exact' });
  const other = edition({ title: otherTitle, author: otherAuthor, id: 'other', editionKey: 'isbn:other', date: '2027-02-01' });
  expect(selectProposals(req, bundle([other]), at).releases.book).toBeNull();
  const proposals = selectProposals(req, bundle([other, exact]), at);
  expect(proposals.releases.book).toMatchObject({ title, date: '2027-03-01',
    provenance: { editionKey: 'isbn:exact' } });
  expect(proposals.conflicts).toEqual([]);
});
