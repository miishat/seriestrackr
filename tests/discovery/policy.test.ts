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

const undated = (publication?: 'catalogued' | 'announced' | 'published', overrides = {}) =>
  edition({ date: null, precision: 'none', ...(publication ? { publication } : {}), ...overrides });
test('an undated Hardcover edition is catalogued, not announced', () => {
  const p = selectProposals(request(), bundle([undated('catalogued', { market: null })]), at);
  expect(p.releases.book).toMatchObject({ state: 'catalogued', date: null });
});
test('an explicitly published English edition can be released without a day', () => {
  expect(selectProposals(request(), bundle([undated('published')]), at).releases.book)
    .toMatchObject({ state: 'released', date: null });
});
test('a format announcement remains announced when no day is supported', () => {
  expect(selectProposals(request(), bundle([undated('announced')]), at).releases.book?.state).toBe('announced');
});
test('older evidence without publication is catalogued, never inferred announced', () => {
  expect(selectProposals(request(), bundle([undated()]), at).releases.book).toMatchObject({ state: 'catalogued', date: null });
  expect(selectProposals(request(), bundle([edition({ date: '2027-05', precision: 'month' })]), at).releases.book)
    .toMatchObject({ state: 'catalogued', date: null });
});
test('exact scheduled day wins regardless of publication', () => {
  for (const publication of ['catalogued', 'announced', 'published'] as const) {
    expect(selectProposals(request(), bundle([edition({ publication })]), at).releases.book)
      .toMatchObject({ state: 'scheduled', date: '2027-03-01' });
  }
});
test('published outranks announced outranks catalogued within a market', () => {
  const p = selectProposals(request(), bundle([
    undated('catalogued', { id: 'a', editionKey: 'k1' }), undated('announced', { id: 'b', editionKey: 'k2' }),
    undated('published', { id: 'c', editionKey: 'k3' })]), at);
  expect(p.releases.book).toMatchObject({ state: 'released' });
  const q = selectProposals(request(), bundle([
    undated('catalogued', { id: 'a', editionKey: 'k1' }), undated('announced', { id: 'b', editionKey: 'k2' })]), at);
  expect(q.releases.book).toMatchObject({ state: 'announced' });
});
test('preferred market still outranks a better publication state elsewhere', () => {
  const p = selectProposals(request(), bundle([
    undated('catalogued', { id: 'ca', market: 'CA', editionKey: 'k1' }),
    undated('published', { id: 'us', market: 'US', editionKey: 'k2' })]), at);
  expect(p.releases.book).toMatchObject({ state: 'catalogued', provenance: { sourceMarket: 'CA' } });
});
test.each([
  ['missing language', { language: null }],
  ['non-English language', { language: 'fr' }],
  ['wrong title', { title: 'Other' }],
])('publication cannot bypass the %s filter', (_n, change) => {
  expect(selectProposals(request(), bundle([undated('published', change)]), at).releases.book).toBeNull();
});
test('ambiguous format and wrong requested format never release', () => {
  expect(selectProposals(request({ formats: ['audio'] }), bundle([undated('published')]), at).releases.audio).toBeNull();
});
test('published evidence with an unknown market is not released', () => {
  expect(selectProposals(request(), bundle([undated('published', { market: null })]), at).releases.book)
    .toMatchObject({ state: 'catalogued' });
});
test('contradictory dates for one edition still conflict despite publication', () => {
  const p = selectProposals(request(), bundle([
    edition({ id: 'a', publication: 'published' }), edition({ id: 'b', date: '2027-04-01', publication: 'published' })]), at);
  expect(p.releases.book).toBeNull();
  expect(p.conflicts).toHaveLength(1);
});
