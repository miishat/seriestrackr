import { expect, test } from 'vitest';
import type { CoverCandidate } from '../shared/covers';
import { pickAutomaticCover } from '../src/features/library/autoCover';

const item = (id: string, provider: CoverCandidate['provider'], overrides: Partial<CoverCandidate> = {}): CoverCandidate => ({
  id, title: 'Second', author: 'Example Author', role: 'next', format: 'ebook', provider,
  source: { id, title: 'Second', url: `https://example.com/${id}` }, imageUrl: `https://covers.openlibrary.org/b/id/${id}-L.jpg`,
  workKey: 'second|example author', editionKey: null, width: 600, height: 900, ...overrides,
});

test('prefers Hardcover among usable next-book covers', () => {
  expect(pickAutomaticCover([item('a', 'openlibrary'), item('b', 'apple'), item('c', 'hardcover')])?.id).toBe('c');
});
test('falls back in provider order when Hardcover has none', () => {
  expect(pickAutomaticCover([item('a', 'openlibrary'), item('b', 'googlebooks')])?.id).toBe('b');
});
test('skips audio, landscape and undecoded covers', () => {
  expect(pickAutomaticCover([item('a', 'hardcover', { format: 'audio' }), item('b', 'hardcover', { width: 900, height: 600 }),
    item('c', 'hardcover', { width: null, height: null }), item('d', 'openlibrary')])?.id).toBe('d');
});
test('prefers a next-book cover over a previous-book cover from a better provider', () => {
  expect(pickAutomaticCover([item('a', 'hardcover', { role: 'previous' }), item('b', 'openlibrary')])?.id).toBe('b');
});
test('returns null when nothing is usable', () => {
  expect(pickAutomaticCover([item('a', 'hardcover', { format: 'audio' })])).toBeNull();
});
