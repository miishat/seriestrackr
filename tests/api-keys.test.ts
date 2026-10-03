import { beforeEach, expect, test } from 'vitest';
import { clearApiKeys, loadApiKeys, saveApiKeys } from '../src/storage/apiKeys';
import { encodeBackup } from '../src/storage/backup';
import { emptyDocument } from '../src/features/library/model';

beforeEach(() => window.localStorage.clear());

test('no stored keys means no keys', () => expect(loadApiKeys(window.localStorage)).toEqual({ tavily: null, deepseek: null }));
test('keys round trip and can be cleared individually', () => {
  expect(saveApiKeys(window.localStorage, { tavily: 'tavily-key-123', deepseek: 'deepseek-key-123' })).toEqual({ ok: true, value: undefined });
  expect(loadApiKeys(window.localStorage)).toEqual({ tavily: 'tavily-key-123', deepseek: 'deepseek-key-123' });
  saveApiKeys(window.localStorage, { tavily: null, deepseek: 'deepseek-key-123' });
  expect(loadApiKeys(window.localStorage)).toEqual({ tavily: null, deepseek: 'deepseek-key-123' });
  clearApiKeys(window.localStorage);
  expect(loadApiKeys(window.localStorage)).toEqual({ tavily: null, deepseek: null });
});
test('malformed storage or malformed stored keys load as absent', () => {
  window.localStorage.setItem('seriestrackr:apiKeys', '{not json');
  expect(loadApiKeys(window.localStorage)).toEqual({ tavily: null, deepseek: null });
  window.localStorage.setItem('seriestrackr:apiKeys', JSON.stringify({ tavily: 'has a space', deepseek: 42 }));
  expect(loadApiKeys(window.localStorage)).toEqual({ tavily: null, deepseek: null });
});
test('saving rejects a malformed key without writing', () => {
  expect(saveApiKeys(window.localStorage, { tavily: 'short', deepseek: null }).ok).toBe(false);
  expect(window.localStorage.getItem('seriestrackr:apiKeys')).toBeNull();
});
test('a throwing storage never throws', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } } as unknown as Storage;
  expect(loadApiKeys(broken)).toEqual({ tavily: null, deepseek: null });
  expect(saveApiKeys(broken, { tavily: 'tavily-key-123', deepseek: null }).ok).toBe(false);
});
test('keys are never part of a library backup', () => {
  saveApiKeys(window.localStorage, { tavily: 'tavily-key-123', deepseek: 'deepseek-key-123' });
  const text = encodeBackup(emptyDocument());
  expect(text).not.toContain('tavily-key-123'); expect(text).not.toContain('deepseek-key-123');
});
