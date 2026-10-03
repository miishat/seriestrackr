import { expect, test } from 'vitest';
import { request } from './fixtures';
import { bindWorkTitle, isPlaceholderTitle } from '../../server/discovery/workIdentity';
const req = request({ target: { series: 'Book of the Dead', author: 'RinoZ',
  position: 5, title: 'Ascension', orderNote: '' } });
test('binds the explicit numbered Ascension audio decoration', () => {
  expect(bindWorkTitle('Ascension: A LitRPG Adventure (Book of the Dead 5) (Unabridged)', req)).toBe('Ascension');
});
test.each([
  'Ascension: A LitRPG Adventure (Book of the Dead 4) (Unabridged)',
  'Ascension: A LitRPG Adventure (Other Series 5) (Unabridged)',
  'Other Ascension: A LitRPG Adventure (Book of the Dead 5) (Unabridged)',
])('does not accept a different work or position: %s', actual => {
  expect(bindWorkTitle(actual, req)).toBeNull();
});
test('placeholder detection and placeholder canonical targets', () => {
  expect(isPlaceholderTitle('TBA (2027)')).toBe(true);
  expect(isPlaceholderTitle('Ascension')).toBe(false);
  const placeholder = request({ target: { ...req.target, title: 'TBA' } });
  expect(bindWorkTitle('TBA', placeholder)).toBeNull();
});
test.each([
  ['A Parade of Horribles: Dungeon Crawler Carl, Book 8', 'Dungeon Crawler Carl', 8, 'A Parade of Horribles'],
  ['Ascension: A LitRPG Adventure (Book of the Dead 5)', 'Book of the Dead', 5, 'Ascension'],
  ['Ascension (Book of the Dead Book 5)', 'Book of the Dead', 5, 'Ascension'],
  ['Ascension (Book of the Dead, Book 5)', 'Book of the Dead', 5, 'Ascension'],
])('ebook label %s binds to the canonical title', (actual, series, position, title) => {
  const req = request({ target: { series, author: 'Someone', position, title, orderNote: '' } });
  expect(bindWorkTitle(actual, req)).toBe(title);
});

test('a decorated label for another position does not bind', () => {
  const req = request({ target: { series: 'Dungeon Crawler Carl', author: 'Matt Dinniman', position: 8, title: 'A Parade of Horribles', orderNote: '' } });
  expect(bindWorkTitle('A Parade of Horribles: Dungeon Crawler Carl, Book 9', req)).toBeNull();
});
