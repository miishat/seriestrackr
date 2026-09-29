import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../src/app/App';
import { emptyDocument } from '../src/features/library/model';
import type { LibraryDocument } from '../src/features/library/model';
import { decodeBackup, encodeBackup } from '../src/storage/backup';
import { seriesFixture } from './fixtures';

const key = 'seriestrackr:v1';
const limit = 5 * 1024 * 1024;

function documentWithSeries(): LibraryDocument {
  return { ...emptyDocument(), settings: { ...emptyDocument().settings, market: 'CA' }, series: [seriesFixture()] };
}

function seed(doc: LibraryDocument = documentWithSeries()) {
  localStorage.setItem(key, JSON.stringify(doc));
}

function chooseFile(text: string, name = 'backup.json') {
  fireEvent.change(screen.getByLabelText('Choose backup file'), { target: { files: [new File([text], name, { type: 'application/json' })] } });
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
}

beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:backup-test'),
    revokeObjectURL: vi.fn(),
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

test('backup round trip preserves the library and preferences', () => {
  const doc = { ...documentWithSeries(), settings: { ...documentWithSeries().settings, market: 'GB' as const, theme: 'dark' as const, view: 'list' as const } };
  expect(decodeBackup(encodeBackup(doc))).toEqual({ ok: true, value: doc });
  expect(encodeBackup(doc)).toContain('\n  "settings":');
});

test('decoder rejects unsupported, duplicate, and unsafe-source documents', () => {
  const doc = documentWithSeries();
  expect(decodeBackup(JSON.stringify({ ...doc, version: 99 })).ok).toBe(false);
  expect(decodeBackup(JSON.stringify({ ...doc, series: [doc.series[0], doc.series[0]] })).ok).toBe(false);
  const unsafe = { ...doc, series: [{ ...doc.series[0], releases: { ...doc.series[0].releases, book: { ...doc.series[0].releases.book, source: { title: 'Source', url: 'javascript:alert(1)' } } } }] };
  expect(decodeBackup(JSON.stringify(unsafe)).ok).toBe(false);
  expect(decodeBackup('{bad').ok).toBe(false);
});

test('decoder limits UTF-8 byte size and validates the whole document', () => {
  expect(decodeBackup('é'.repeat(limit / 2 + 1)).ok).toBe(false);
  expect(decodeBackup(JSON.stringify({ version: 1, series: [] })).ok).toBe(false);
});

test('export downloads the complete current library without changing it', async () => {
  const user = userEvent.setup(); const doc = documentWithSeries(); seed(doc);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Backups' }));
  await user.click(screen.getByRole('button', { name: 'Export current library' }));
  expect(await readBlob(vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob)).toBe(encodeBackup(doc));
  expect(localStorage.getItem(key)).toBe(JSON.stringify(doc));
  await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:backup-test'));
});

test('import previews a complete replacement and cancel preserves the stored document', async () => {
  const user = userEvent.setup();
  const original = documentWithSeries(); seed(original); render(<App />);
  await user.click(screen.getByRole('button', { name: 'Backups' }));
  const replacement = { ...emptyDocument(), settings: { ...emptyDocument().settings, market: 'GB' as const, theme: 'dark' as const }, series: [seriesFixture({ id: 'new', name: '<New series>' })] };
  chooseFile(JSON.stringify(replacement));
  expect(await screen.findByText(/1 series.*GB/)).toBeVisible();
  expect(screen.getByText(/replace.*current library and settings/i)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Download current backup' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Cancel replacement' }));
  expect(localStorage.getItem(key)).toBe(JSON.stringify(original));
  expect(screen.getByText('Example')).toBeVisible();
});

test('confirmed import replaces series and settings together', async () => {
  const user = userEvent.setup(); seed(); render(<App />);
  await user.click(screen.getByRole('button', { name: 'Backups' }));
  const replacement = { ...emptyDocument(), settings: { ...emptyDocument().settings, market: 'US' as const, theme: 'dark' as const, view: 'compact' as const }, series: [seriesFixture({ id: 'new', name: '<New series>' })] };
  chooseFile(JSON.stringify(replacement));
  await user.click(await screen.findByRole('button', { name: 'Confirm replacement' }));
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual(replacement);
  expect(screen.getByText('<New series>')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Market: US' })).toBeVisible();
});

test('invalid and oversized files never replace the stored document', async () => {
  const user = userEvent.setup(); const original = documentWithSeries(); seed(original); render(<App />);
  await user.click(screen.getByRole('button', { name: 'Backups' }));
  chooseFile('{bad');
  expect(await screen.findByRole('alert')).toHaveTextContent(/invalid.*json/i);
  expect(screen.queryByRole('button', { name: 'Confirm replacement' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Choose backup file'), { target: { files: [new File(['x'.repeat(limit + 1)], 'large.json')] } });
  expect(await screen.findByRole('alert')).toHaveTextContent(/5 MiB/i);
  expect(localStorage.getItem(key)).toBe(JSON.stringify(original));
});

test('recovery downloads original malformed text and requires reset confirmation', async () => {
  const user = userEvent.setup(); localStorage.setItem(key, '{broken');
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Backups' }));
  const dialog = screen.getByRole('dialog', { name: 'Backups' });
  expect(within(dialog).getByRole('button', { name: 'Export current library' })).toBeDisabled();
  await user.click(within(dialog).getByRole('button', { name: 'Download stored data' }));
  expect(click).toHaveBeenCalledTimes(1);
  expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
  expect(await readBlob(blob)).toBe('{broken');
  await user.click(within(dialog).getByRole('button', { name: 'Reset library' }));
  expect(localStorage.getItem(key)).toBe('{broken');
  await user.click(within(dialog).getByRole('button', { name: 'Cancel reset' }));
  expect(localStorage.getItem(key)).toBe('{broken');
  await user.click(within(dialog).getByRole('button', { name: 'Reset library' }));
  await user.click(within(dialog).getByRole('button', { name: 'Confirm reset' }));
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual(emptyDocument());
});

test('failed recovery reset still exposes original raw data for download', async () => {
  const user = userEvent.setup(); localStorage.setItem(key, '{broken'); render(<App />);
  await user.click(screen.getByRole('button', { name: 'Backups' }));
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });
  await user.click(screen.getByRole('button', { name: 'Reset library' }));
  await user.click(screen.getByRole('button', { name: 'Confirm reset' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/quota exceeded/i);
  await user.click(screen.getByRole('button', { name: 'Backups' }));
  expect(screen.getByRole('button', { name: 'Download stored data' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Export current library' })).toBeEnabled();
  expect(localStorage.getItem(key)).toBe('{broken');
});

test('failed storage write retains imported data in memory and shows an export warning', async () => {
  const user = userEvent.setup(); seed(); render(<App />);
  await user.click(screen.getByRole('button', { name: 'Backups' }));
  const replacement = { ...documentWithSeries(), settings: { ...documentWithSeries().settings, market: 'GB' as const }, series: [seriesFixture({ id: 'new', name: 'Imported' })] };
  chooseFile(JSON.stringify(replacement));
  await screen.findByRole('button', { name: 'Confirm replacement' });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });
  await user.click(screen.getByRole('button', { name: 'Confirm replacement' }));
  expect(screen.getByText('Imported')).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent(/quota exceeded/i);
  expect(screen.getByRole('button', { name: 'Export now' })).toBeEnabled();
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual(documentWithSeries());
});
