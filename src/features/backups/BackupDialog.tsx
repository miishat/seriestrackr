import { useRef, useState, type ChangeEvent } from 'react';
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
  const selectionId = useRef(0);

  const download = (text: string | (() => string), name: string) => {
    try { downloadJson(typeof text === 'function' ? text() : text, name); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = ++selectionId.current;
    const file = event.target.files?.[0];
    event.target.value = '';
    setPreview(null);
    setError(null);
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) { setError('Backup exceeds the 5 MiB limit.'); return; }
    const reader = new FileReader();
    reader.onerror = () => { if (selected === selectionId.current) setError('Could not read the backup file.'); };
    reader.onload = () => {
      if (selected !== selectionId.current) return;
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
    <p className="backup-intro">Save your library and settings, or restore them from a backup.</p>
    <div className="backup-sections">
    <section className="backup-section" aria-labelledby="backup-export-heading">
      <h3 id="backup-export-heading">Export library</h3>
      <p>Download all {doc.series.length} tracked series and your preferences as a JSON file.</p>
      <button className="primary" type="button" disabled={mode === 'recovery'} onClick={() => download(() => encodeBackup(doc), 'seriestrackr-backup.json')}>Export</button>
    </section>
    {(mode === 'recovery' || recoveryRaw !== null) && <section className="backup-section backup-recovery" aria-label="Recover stored data">
      <p>The stored data could not be loaded. Download it before restoring a backup or resetting the library.</p>
      <div className="actions"><button type="button" disabled={recoveryRaw === null} onClick={() => { if (recoveryRaw !== null) download(recoveryRaw, 'seriestrackr-recovery.txt'); }}>Download stored data</button>
        {mode === 'recovery' && !confirmingReset && <button type="button" onClick={() => setConfirmingReset(true)}>Reset library</button>}</div>
      {confirmingReset && <div><p>Reset replaces the stored data with a new empty library and removes your current settings.</p><div className="actions"><button type="button" onClick={() => setConfirmingReset(false)}>Cancel reset</button><button className="danger" type="button" onClick={reset}>Confirm reset</button></div></div>}
    </section>}
    <section className="backup-section" aria-labelledby="backup-restore-heading">
      <h3 id="backup-restore-heading">Restore backup</h3>
      <p>Choose a backup to review before replacing your library and settings.</p>
      <label>Choose backup file<input className="backup-file" type="file" accept=".json,application/json" onChange={chooseFile} /></label>
      <p className="small">JSON files only · Maximum size: 5 MiB</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    {preview && <section aria-label="Import preview">
      <p>{preview.series.length} series in backup. Default market: {preview.settings.market ?? 'not chosen'}.</p>
      <p>Confirming will replace the current library and settings, including all series and preferences.</p>
      {mode !== 'recovery' && <button type="button" onClick={() => download(() => encodeBackup(doc), 'seriestrackr-before-import.json')}>Download current backup</button>}
      <div className="actions"><button type="button" onClick={() => { selectionId.current++; setPreview(null); }}>Cancel replacement</button><button className="danger" type="button" onClick={replace}>Confirm replacement</button></div>
    </section>}
    </section>
    </div>
  </Dialog>;
}
