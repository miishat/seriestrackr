import { emptyDocument } from '../features/library/model';
import type { LibraryDocument, Result } from '../features/library/model';
import { parseDocument } from '../features/library/validation';
export type LoadResult = { kind: 'ready'; doc: LibraryDocument } | { kind: 'recovery'; raw: string; error: string } | { kind: 'unavailable'; error: string };

const KEY = 'seriestrackr:v1';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function loadLibrary(storage: Storage): LoadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(KEY);
  } catch (error) {
    return { kind: 'unavailable', error: errorMessage(error) };
  }
  if (raw === null) return { kind: 'ready', doc: emptyDocument() };
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch (error) {
    return { kind: 'recovery', raw, error: `Invalid library JSON: ${errorMessage(error)}` };
  }
  const parsed = parseDocument(input);
  if (parsed.ok === false) return { kind: 'recovery', raw, error: parsed.error };
  return { kind: 'ready', doc: parsed.value };
}

export function saveLibrary(storage: Storage, doc: LibraryDocument): Result<void> {
  try {
    storage.setItem(KEY, JSON.stringify(doc));
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export function loadBrowserLibrary(): LoadResult {
  try {
    return loadLibrary(window.localStorage);
  } catch (error) {
    return { kind: 'unavailable', error: errorMessage(error) };
  }
}
