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
