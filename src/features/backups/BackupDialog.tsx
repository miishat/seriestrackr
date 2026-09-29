import { useState, type ChangeEvent } from 'react';
import { Dialog } from '../../components/Dialog';
import type { LibraryDocument, Result } from '../library/model';
import type { LibraryMode } from '../library/useLibrary';
import { decodeBackup, downloadJson, encodeBackup, MAX_BACKUP_BYTES } from '../../storage/backup';

type Props = {
  doc: LibraryDocument;
  mode: LibraryMode;
  recoveryRaw: string | null;
  onReplace: (doc: LibraryDocument) => Result<void>;
  onReset: () => Result<void>;
  onClose: () => void;
};

export function BackupDialog({ doc, mode, recoveryRaw, onReplace, onReset, onClose }: Props) {
  const [preview, setPreview] = useState<LibraryDocument | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = (text: string, name: string) => {
    try { downloadJson(text, name); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setPreview(null);
    setError(null);
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) { setError('Backup exceeds the 5 MiB limit.'); return; }
    const reader = new FileReader();
    reader.onerror = () => setError('Could not read the backup file.');
    reader.onload = () => {
      if (typeof reader.result !== 'string') { setError('Could not read the backup file.'); return; }
      const decoded = decodeBackup(reader.result);
      if (decoded.ok === false) setError(decoded.error);
      else setPreview(decoded.value);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const replace = () => {
    if (!preview) return;
    const result = onReplace(preview);
    if (result.ok === false) { setError(result.error); return; }
    onClose();
  };

  const reset = () => {
    const result = onReset();
    if (result.ok === false) { setError(result.error); return; }
    onClose();
  };

  return <Dialog open title="Backups" onClose={onClose}>
    <p>Download a copy of your current library and settings, or restore both from a backup.</p>
    <div className="actions"><button type="button" disabled={mode === 'recovery'} onClick={() => download(encodeBackup(doc), 'seriestrackr-backup.json')}>Export current library</button></div>
    {(mode === 'recovery' || recoveryRaw !== null) && <section>
      <p>The stored data could not be loaded. Download it before restoring a backup or resetting the library.</p>
      <div className="actions"><button type="button" disabled={recoveryRaw === null} onClick={() => { if (recoveryRaw !== null) download(recoveryRaw, 'seriestrackr-recovery.txt'); }}>Download stored data</button>
        {mode === 'recovery' && !confirmingReset && <button type="button" onClick={() => setConfirmingReset(true)}>Reset library</button>}</div>
      {confirmingReset && <div><p>Reset replaces the stored data with a new empty library and removes your current settings.</p><div className="actions"><button type="button" onClick={() => setConfirmingReset(false)}>Cancel reset</button><button className="danger" type="button" onClick={reset}>Confirm reset</button></div></div>}
    </section>}
    <label>Choose backup file<input type="file" accept=".json,application/json" onChange={chooseFile} /></label>
    {error && <p role="alert" className="form-error">{error}</p>}
    {preview && <section aria-label="Import preview">
      <p>{preview.series.length} series in backup. Default market: {preview.settings.market ?? 'not chosen'}.</p>
      <p>Confirming will replace the current library and settings, including all series and preferences.</p>
      {mode !== 'recovery' && <button type="button" onClick={() => download(encodeBackup(doc), 'seriestrackr-before-import.json')}>Download current backup</button>}
      <div className="actions"><button type="button" onClick={() => setPreview(null)}>Cancel replacement</button><button className="danger" type="button" onClick={replace}>Confirm replacement</button></div>
    </section>}
  </Dialog>;
}
