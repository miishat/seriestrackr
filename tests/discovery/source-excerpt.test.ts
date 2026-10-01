// @vitest-environment node
import { expect, test } from 'vitest';
import { sourceExcerpt, OMITTED } from '../../server/discovery/sourceExcerpt';

test('overlapping protected citations share their contiguous source window', () => {
  const text = Array.from({ length: 1600 }, (_, index) => String.fromCodePoint(0x400 + index)).join('');
  const first = text.slice(300, 900);
  const second = text.slice(700, 1300);
  const preview = sourceExcerpt(text, [first, second]);
  expect(preview.text.slice(0, preview.mandatory)).toContain(first);
  expect(preview.text.slice(0, preview.mandatory)).toContain(second);
  expect(preview.mandatory).toBeLessThan(1100);
});

test.each([0, 1000])('reserved omission marker in a protected quote rejects before allocation %i', length => {
  expect(() => sourceExcerpt('x'.repeat(length) + 'before' + OMITTED + 'after', ['before' + OMITTED + 'after']))
    .toThrow();
});

test('explicit footer fields precede repeated generic description hints', () => {
  const text = ('An English release described in this English release story.\n' + 'x'.repeat(200) + '\n').repeat(15)
    + 'LANGUAGE\nEN English\nRELEASED\n2027-03-01\nISBN 9780000000001';
  const preview = sourceExcerpt(text, []);
  expect(preview.text.slice(0, 700)).toContain('LANGUAGE\nEN English');
  expect(preview.text.slice(0, 700)).toContain('RELEASED\n2027-03-01');
});
