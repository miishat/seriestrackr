import { expect, test, vi } from 'vitest';
import { emptyDocument } from '../src/features/library/model';
import { loadBrowserLibrary, loadLibrary, saveLibrary } from '../src/storage/libraryStorage';

test('empty library survives reload', () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value); },
  } as Storage;
  expect(saveLibrary(storage, emptyDocument()).ok).toBe(true);
  expect(memory.has('seriestrackr:v1')).toBe(true);
  expect(loadLibrary(storage)).toEqual({ kind: 'ready', doc: emptyDocument() });
});

test('missing library initializes empty without writing or touching legacy keys', () => {
  const getItem = vi.fn(() => null);
  const setItem = vi.fn();
  expect(loadLibrary({ getItem, setItem } as unknown as Storage)).toEqual({ kind: 'ready', doc: emptyDocument() });
  expect(getItem).toHaveBeenCalledExactlyOnceWith('seriestrackr:v1');
  expect(setItem).not.toHaveBeenCalled();
});

test('invalid stored JSON is exposed without a write', () => {
  const storage = { getItem: () => '{broken', setItem: vi.fn() } as unknown as Storage;
  const result = loadLibrary(storage);
  expect(result.kind).toBe('recovery');
  if (result.kind !== 'recovery') throw new Error('expected recovery');
  expect(result.raw).toBe('{broken');
  expect(storage.setItem).not.toHaveBeenCalled();
});

test('unsupported version is exposed without a write', () => {
  const raw = JSON.stringify({ ...emptyDocument(), version: 99 });
  const storage = { getItem: () => raw, setItem: vi.fn() } as unknown as Storage;
  expect(loadLibrary(storage)).toMatchObject({ kind: 'recovery', raw });
  expect(storage.setItem).not.toHaveBeenCalled();
});

test('denied storage read is unavailable', () => {
  expect(loadLibrary({ getItem: () => { throw new Error('denied'); } } as unknown as Storage)).toEqual({ kind: 'unavailable', error: 'denied' });
});

test('browser loader catches a throwing localStorage getter', () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('denied'); } });
  try {
    expect(loadBrowserLibrary()).toEqual({ kind: 'unavailable', error: 'denied' });
  } finally {
    if (descriptor) Object.defineProperty(window, 'localStorage', descriptor);
  }
});

test('quota failure is reported and leaves the in-memory document available', () => {
  const doc = emptyDocument();
  const storage = { setItem: () => { throw new Error('quota'); } } as unknown as Storage;
  expect(saveLibrary(storage, doc)).toEqual({ ok: false, error: 'quota' });
  expect(doc).toEqual(emptyDocument());
});
