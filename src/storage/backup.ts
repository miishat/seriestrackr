import type { LibraryDocument, Result } from '../features/library/model';
import { parseDocument } from '../features/library/validation';

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

export function encodeBackup(doc: LibraryDocument): string {
  // Serialize the validated shape only so unaccepted candidates and diagnostics cannot ride along.
  const parsed = parseDocument(doc);
  return JSON.stringify(parsed.ok ? parsed.value : doc, null, 2);
}

export function decodeBackup(text: string): Result<LibraryDocument> {
  if (new Blob([text]).size > MAX_BACKUP_BYTES) return { ok: false, error: 'Backup exceeds the 5 MiB limit.' };
  try {
    return parseDocument(JSON.parse(text));
  } catch (error) {
    return { ok: false, error: `Invalid backup JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function downloadJson(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
