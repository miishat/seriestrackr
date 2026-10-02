// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';
import { collectHardcover, normalizeHardcover, hardcoverAliases } from '../../server/discovery/hardcover';
import { parseExtraction } from '../../shared/discoveryValidation';
import { selectProposals } from '../../shared/discoveryPolicy';
import { request } from './fixtures';
const checkedAt = '2026-09-30T12:00:00Z';
const req = request({ target: { ...request().target, title: '' } });
const row = (changes: Record<string, unknown> = {}) => ({ id: 1, position: 2, featured: true, compilation: false, details: null,
  series: { name: 'Example' }, book: { id: 20, slug: 'second', title: 'Second', compilation: false, release_date: '2025-01-01',
    contributions: [{ author: { name: 'Example Author' }, contributor_role: { name: 'Author' } }],
    editions: [{ id: 40, title: 'Second', edition_format: 'Ebook', release_date: '2027-03-01',
      language: { code2: 'en', code3: 'eng' }, isbn_13: '9780000000002' }] }, ...changes });
const envelope = (rows: unknown[] = [row()]) => ({ data: { series: rows.map(item => ({ name: (item as ReturnType<typeof row>).series.name, book_series: [item] })) } });
afterEach(() => vi.useRealTimers());
test('exact series, author role and position establish identity and explicit null-market English edition', () => {
  const result = normalizeHardcover(envelope(), req, checkedAt);
  expect(result.identities).toHaveLength(1); expect(parseExtraction(result, result.sources).ok).toBe(true);
  expect(result.editions[0]).toMatchObject({ language: 'en', format: 'ebook', market: null, date: null, precision: 'none' });
  expect(result.sources[1].text).toContain('Raw format: Ebook');
});
test.each([{ position: 2.5 }, { compilation: true }, { details: 'Companion' },
  { series: { name: 'Unrelated Example' } }, { book: { ...row().book, contributions: [{ author: { name: 'Example Author' }, contributor_role: { name: 'Narrator' } }] } },
  { book: { ...row().book, contributions: [{ author: { name: 'Other Author' }, contributor_role: { name: 'Author' } }] } }])('rejects unrelated and non-main rows %j', changes => {
  expect(normalizeHardcover(envelope([row(changes)]), req, checkedAt).identities).toEqual([]);
});
test('multiple different target works remain ambiguous; fractional order stays literal', () => {
  const other = row({ book: { ...row().book, id: 21, slug: 'other', title: 'Other', editions: [{ ...row().book.editions[0], id: 41, title: 'Other' }] } });
  const evidence = normalizeHardcover(envelope([row(), other]), req, checkedAt);
  expect(selectProposals(req, evidence, checkedAt).identity).toBeNull();
  const fractional = { ...req, target: { ...req.target, position: 2.5 } };
  expect(normalizeHardcover(envelope([row({ position: 2.5 })]), fractional, checkedAt).identities[0].position).toBe(2.5);
});
test.each([
  [{ language: { id: 1, language: 'English' } }, { language: null }],
  [{ language: { code2: 'fr', code3: 'eng' } }, { language: null }],
  [{ release_date: null }, { date: null, precision: 'none' }],
  [{ release_date: '2027-03' }, { date: null, precision: 'none' }],
  [{ release_date: '2027' }, { date: null, precision: 'none' }],
  [{ release_date: '2027-02-30' }, { date: null, precision: 'none' }],
] as const)('does not hydrate dates or language, keeps precision %j', (changes, expected) => {
  const book = row().book; book.editions = [{ ...book.editions[0], ...changes } as typeof book.editions[0]];
  const evidence = normalizeHardcover(envelope([row({ book })]), req, checkedAt);
  if ('language' in changes) expect(evidence.identities).toEqual([]); else expect(evidence.editions[0]).toMatchObject(expected);
});
test('unknown raw format does not become edition via reading_format', () => {
  const book = row().book; book.editions = [{ ...book.editions[0], edition_format: 'Digital', reading_format: { name: 'Ebook' } } as typeof book.editions[0]];
  expect(normalizeHardcover(envelope([row({ book })]), req, checkedAt).editions).toEqual([]);
});
test.each([{}, { errors: [{ message: 'fictional' }], data: { book_series: [] } }, { data: { series: null } }])('rejects malformed GraphQL %j', value => {
  expect(() => normalizeHardcover(value, req, checkedAt)).toThrow();
});
test('bound overflow fails rather than retaining a false survivor', () => {
  expect(() => normalizeHardcover(envelope(Array.from({ length: 31 }, (_, index) => row({ id: index + 1 }))), req, checkedAt)).toThrow();
});
test('aliases are request-derived bounded literals', () => {
  expect(hardcoverAliases('The Example Series')).toContain('Example');
  expect(hardcoverAliases('The Example Series').length).toBeLessThanOrEqual(8);
});

test.each(['Witness', 'Example [A]'])('singular Tale of %s resolves plural catalog alias using literal request text', base => {
  const series = `The Tale of ${base}`;
  const aliases = hardcoverAliases(series);
  expect(aliases).toContain(`Tales of ${base}`);
  expect(aliases).toContain(base);
  expect(aliases).not.toContain(`Tales of Tale of ${base}`);
  expect(aliases.length).toBeLessThanOrEqual(8);
  const target = { ...req, target: { ...req.target, series } };
  expect(normalizeHardcover(envelope([row({ series: { name: `Tales of ${base}` } })]), target, checkedAt).identities).toHaveLength(1);
  expect(normalizeHardcover(envelope([row({ series: { name: `Tales of ${base} Other` } })]), target, checkedAt).identities).toEqual([]);
});
test('missing token performs no calls and abort before queue performs no attempt', async () => {
  const fetcher = vi.fn<typeof fetch>(); const signal = new AbortController().signal;
  expect((await collectHardcover(req, null, signal, fetcher)).usage.hardcover).toBe(0);
  const controller = new AbortController(); controller.abort();
  expect((await collectHardcover(req, 'fake', controller.signal, fetcher)).reasons).toContain('cancelled');
  expect(fetcher).not.toHaveBeenCalled();
});
test('one fixed GraphQL call has explicit guard fields and counts malformed attempt', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ errors: [{ message: 'fictional' }] }));
  const result = await collectHardcover(req, ' fake-secret ', new AbortController().signal, fetcher);
  expect(result.usage.hardcover).toBe(1); expect(result.reasons).toEqual(['invalid-evidence']);
  expect(fetcher).toHaveBeenCalledOnce(); const [url, init] = fetcher.mock.calls[0];
  expect(String(url)).toBe('https://api.hardcover.app/v1/graphql');
  expect(init).toMatchObject({ method: 'POST', redirect: 'error', headers: { Authorization: 'Bearer fake-secret' } });
  const body = JSON.parse(String(init?.body)); expect(body.variables).toEqual({ names: hardcoverAliases('Example'), position: 2, author: 'Example Author' });
  expect(body.query).toContain('contributor_role { name }'); expect(body.query).toContain('author: {name: {_eq: $author}}'); expect(body.query).toContain('language { code2 code3 }');
});


test('numeric relationship details confirm literal order while conflicting details exclude it', () => {
  expect(normalizeHardcover(envelope([row({ details: '2' })]), req, checkedAt).identities).toHaveLength(1);
  expect(normalizeHardcover(envelope([row({ details: '3' })]), req, checkedAt).identities).toEqual([]);
  expect(normalizeHardcover(envelope([row({ book: { ...row().book, compilation: true } })]), req, checkedAt).identities).toEqual([]);
});
test('bounded nested position and edition overflow discard affected closure', () => {
  expect(() => normalizeHardcover({ data: { series: [{ name: 'Example', book_series: Array.from({ length: 21 }, () => row()) }] } }, req, checkedAt)).toThrow('budget');
  expect(() => normalizeHardcover(envelope([row({ book: { ...row().book, editions: Array.from({ length: 21 }, () => row().book.editions[0]) } })]), req, checkedAt)).toThrow('budget');
});
test('global queue spaces requests and cancellation while waiting counts only started attempts', async () => {
  vi.useFakeTimers(); const starts: number[] = [];
  const fetcher = vi.fn<typeof fetch>(async () => { starts.push(Date.now()); return Response.json(envelope()); });
  const first = collectHardcover(req, 'fake', new AbortController().signal, fetcher);
  const controller = new AbortController(); const second = collectHardcover(req, 'fake', controller.signal, fetcher);
  await vi.advanceTimersByTimeAsync(1); controller.abort();
  await vi.runAllTimersAsync();
  expect((await first).usage.hardcover).toBe(1); expect((await second).usage.hardcover).toBe(0);
  const third = collectHardcover(req, 'fake', new AbortController().signal, fetcher); await vi.runAllTimersAsync(); await third;
  expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1100);
});


test('explicit relational reading format supports literal Audible with provenance and rejects contradictory format', () => {
  const book = row().book;
  const audio = { ...book.editions[0], edition_format: 'Audible', reading_format: { format: 'Listened' } };
  const result = normalizeHardcover(envelope([row({ book: { ...book, editions: [audio] } })]), req, checkedAt);
  expect(result.editions[0]?.format).toBe('audio'); expect(result.sources[1].text).toContain('Raw format: Audible. Reading format: Listened.');
  expect(normalizeHardcover(envelope([row({ book: { ...book, editions: [{ ...audio, edition_format: 'ebook' }] } })]), req, checkedAt).editions).toEqual([]);
});


test('Hardcover dates never reach proposals or AI source text even with explicit English editions', () => {
  const evidence = normalizeHardcover(envelope(), req, checkedAt);
  expect(evidence.editions[0]).toMatchObject({ date: null, precision: 'none' });
  expect(JSON.stringify(evidence)).not.toContain('2027-03-01'); expect(JSON.stringify(evidence)).not.toContain('2025-01-01');
  expect(selectProposals(req, evidence, checkedAt).releases.book?.date).toBeNull();
});
test('duplicate edition IDs with contradictory metadata fail closed', () => {
  const book = row().book;
  expect(() => normalizeHardcover(envelope([row({ book: { ...book, editions: [book.editions[0], { ...book.editions[0], language: { code2: 'fr', code3: 'fra' } }] } })]), req, checkedAt)).toThrow('invalid-evidence');
});

test.each(['Unknown', 'Read', 'ebook', 'Audiobook'])('reading format Read cannot establish print from raw format %s', edition_format => {
  const book = row().book;
  const edition = { ...book.editions[0], edition_format, reading_format: { format: 'Read' } };
  expect(normalizeHardcover(envelope([row({ book: { ...book, editions: [edition] } })]), req, checkedAt).editions).toEqual([]);
});
test('explicit Paperback paired with Read establishes print', () => {
  const book = row().book;
  const edition = { ...book.editions[0], edition_format: 'Paperback', reading_format: { format: 'Read' } };
  expect(normalizeHardcover(envelope([row({ book: { ...book, editions: [edition] } })]), req, checkedAt).editions[0]?.format).toBe('print');
});


test('translation without English editions cannot obscure qualifying English sibling', () => {
  const translation = row({ book: { ...row().book, id: 21, slug: 'translated-second', title: 'Second. Fictional Translation', editions: [] } });
  const evidence = normalizeHardcover({ data: { series: [
    { name: 'The Example', book_series: [translation] }, { name: 'Example', book_series: [row()] },
  ] } }, req, checkedAt);
  expect(evidence.identities.map(item => item.title)).toEqual(['Second']);
  expect(selectProposals(req, evidence, checkedAt).identity?.title).toBe('Second');
  expect(JSON.stringify(evidence)).not.toContain('Fictional Translation');
});
test.each([
  [], [{ ...row().book.editions[0], language: { code2: null, code3: null } }],
  [{ ...row().book.editions[0], language: { code2: 'fr', code3: 'fra' } }],
  [{ ...row().book.editions[0], edition_format: 'Unknown' }],
  [{ ...row().book.editions[0], title: null }],
  [{ ...row().book.editions[0], title: 'Other Title' }],
].map(editions => ({ editions })))('identity requires supported English edition with explicit matching title %j', ({ editions }) => {
  const evidence = normalizeHardcover(envelope([row({ book: { ...row().book, editions } })]), req, checkedAt);
  expect(evidence.identities).toEqual([]);
});
test('two qualifying English works at the same position remain ambiguous', () => {
  const other = row({ book: { ...row().book, id: 21, title: 'Other', slug: 'other', editions: [{ ...row().book.editions[0], id: 41, title: 'Other' }] } });
  const evidence = normalizeHardcover(envelope([row(), other]), req, checkedAt);
  expect(evidence.identities).toHaveLength(2); expect(selectProposals(req, evidence, checkedAt).identity).toBeNull();
});



const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./data/pipeline-repair/${name}`, import.meta.url), 'utf8'));
const rules = (value: unknown, target = req) => { const seen: string[] = []; try { normalizeHardcover(value, target, checkedAt, event => { if (event.rule) seen.push(event.rule); }); } catch { /* bounded */ } return seen; };
test('Blood and Bone is position 5 when series is not featured on the book', () => {
  const raw = fixture('malazan-hardcover.json');
  const target = request({ target: { series: 'Novels of the Malazan Empire', author: 'Ian C. Esslemont', position: 5, title: '', orderNote: '' } });
  const evidence = normalizeHardcover(raw, target, checkedAt);
  expect(evidence.identities.map(i => i.title)).toEqual(['Blood and Bone']);
  expect(evidence.editions.every(e => e.date === null)).toBe(true);
  expect(evidence.editions.map(e => e.format)).toContain('print');
});
test('featured flag is diagnostic only', () => {
  expect(normalizeHardcover(envelope([row({ featured: false })]), req, checkedAt).identities).toHaveLength(1);
  expect(normalizeHardcover(envelope([row({ featured: null })]), req, checkedAt).identities).toHaveLength(1);
});
test.each([
  ['wrong author role', { book: { ...row().book, contributions: [{ author: { name: 'Example Author' }, contributor_role: { name: 'Illustrator' } }] } }, 'author-mismatch'],
  ['wrong position', { position: 3 }, 'position-mismatch'],
  ['compilation', { compilation: true }, 'compilation'],
  ['fractional companion', { position: 2.5, details: '2.5' }, 'position-mismatch'],
  ['placeholder', { book: { ...row().book, title: 'Untitled', editions: [{ ...row().book.editions[0], title: 'Untitled' }] } }, 'placeholder-title'],
] as const)('mutation %s blocks identity independently', (_name, changes, rule) => {
  const mutated = envelope([row(changes)]);
  expect(normalizeHardcover(mutated, req, checkedAt).identities).toEqual([]);
  expect(rules(mutated)).toContain(rule);
});
test('placeholder fixture is rejected before emission', () => {
  const raw = fixture('placeholder-hardcover.json');
  expect(normalizeHardcover(raw, req, checkedAt).identities).toEqual([]);
  expect(rules(raw)).toContain('placeholder-title');
});
test('duplicate different title at same position stays ambiguous', () => {
  const other = row({ book: { ...row().book, id: 21, slug: 'other', title: 'Other', editions: [{ ...row().book.editions[0], id: 41, title: 'Other' }] } });
  expect(selectProposals(req, normalizeHardcover(envelope([row(), other]), req, checkedAt), checkedAt).identity).toBeNull();
});
test.each([['Read', null], ['Read', undefined], ['Read', '']])('Read with absent raw format (%s, %s) is print', (read, raw) => {
  const edition = { ...row().book.editions[0], edition_format: raw, reading_format: { format: read } };
  expect(normalizeHardcover(envelope([row({ book: { ...row().book, editions: [edition] } })]), req, checkedAt).editions[0]?.format).toBe('print');
});
test('conflicting Ebook raw format with Read stays rejected', () => {
  const edition = { ...row().book.editions[0], edition_format: 'Ebook', reading_format: { format: 'Read' } };
  expect(normalizeHardcover(envelope([row({ book: { ...row().book, editions: [edition] } })]), req, checkedAt).editions).toEqual([]);
});
test('series author is checked again after the provider constraint', () => {
  const wrong = envelope(); wrong.data.series[0] = { ...wrong.data.series[0], author: { name: 'Other Author' } } as never;
  expect(normalizeHardcover(wrong, req, checkedAt).identities).toEqual([]);
  expect(rules(wrong)).toContain('author-mismatch');
  const right = envelope(); right.data.series[0] = { ...right.data.series[0], author: { name: 'Example Author' } } as never;
  expect(normalizeHardcover(right, req, checkedAt).identities).toHaveLength(1);
});
test('six series rows stay unresolved even when only one survives local filtering', () => {
  const series = Array.from({ length: 6 }, (_, index) => ({ name: index ? `Unrelated ${index}` : 'Example', author: { name: index ? `Other ${index}` : 'Example Author' }, book_series: index ? [] : [row()] }));
  const raw = { data: { series } };
  expect(() => normalizeHardcover(raw, req, checkedAt)).toThrow('budget');
  expect(rules(raw)).toContain('request-bound');
  const five = { data: { series: series.slice(0, 5) } };
  expect(normalizeHardcover(five, req, checkedAt).identities).toHaveLength(1);
});
test('six plausible requested-author rows are unresolved', () => {
  const series = Array.from({ length: 6 }, () => ({ name: 'Example', author: { name: 'Example Author' }, book_series: [row()] }));
  expect(() => normalizeHardcover({ data: { series } }, req, checkedAt)).toThrow('budget');
});
test('nested edition overflow is visible rather than silently truncated', () => {
  const book = { ...row().book, editions: Array.from({ length: 21 }, () => row().book.editions[0]) };
  expect(rules(envelope([row({ book })]))).toContain('request-bound');
});
test('hashed diagnostic ids carry book and edition prefixes', () => {
  const seen: (string | undefined)[] = [];
  normalizeHardcover(envelope([row({ position: 9 })]), req, checkedAt, event => seen.push(event.recordRef));
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  expect(seen).toEqual([createHash('sha256').update('hardcover:book:20').digest('hex').slice(0, 32)]);
});
