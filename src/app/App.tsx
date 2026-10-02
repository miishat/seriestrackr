import { useEffect, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { BrandMark } from '../components/BrandMark';
import { BrandTagline } from '../components/BrandTagline';
import { BackupDialog } from '../features/backups/BackupDialog';
import { LibraryView } from '../features/library/LibraryView';
import { SeriesForm } from '../features/library/SeriesForm';
import type { LibraryDocument, Series } from '../features/library/model';
import { displayRelease, localToday } from '../features/library/releases';
import { useLibrary } from '../features/library/useLibrary';
import { useDiscovery } from '../features/discovery/useDiscovery';
import { DiscoveryDialog } from '../features/discovery/DiscoveryDialog';
import { MarketSelect, SettingsDialog } from '../features/settings/SettingsDialog';
import { downloadJson, encodeBackup } from '../storage/backup';

function useToday() {
  const [today, setToday] = useState(localToday);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => { setToday(localToday()); schedule(); };
    const schedule = () => {
      clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(update, Math.max(1, midnight.getTime() - now.getTime()));
    };
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    schedule();
    return () => { clearTimeout(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, []);
  return today;
}

type Pending = { kind: 'series'; value: Series; message: string } | { kind: 'settings'; value: LibraryDocument['settings']; message: string };
export function App() {
  const library = useLibrary();
  const discovery = useDiscovery(library);
  const discoverySeries = library.doc.series.find(series => series.id === discovery.session?.seriesId);
  const today = useToday();
  const [editor, setEditor] = useState<Series | 'new' | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backupsOpen, setBackupsOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportUnsaved = () => {
    try { downloadJson(encodeBackup(library.doc), 'seriestrackr-unsaved.json'); setExportError(null); }
    catch (cause) { setExportError(`Could not export: ${cause instanceof Error ? cause.message : String(cause)}`); }
  };
  const [setupMarket, setSetupMarket] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Series | null>(null);
  const [finishTarget, setFinishTarget] = useState<Series | null>(null);
  const [finishTitle, setFinishTitle] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 6000); };
  const closeEditor = () => { setEditor(null); setDialogError(null); };
  const handleUpdate = (value: Series) => {
    const result = library.updateSeries(value, false);
    if (result.ok === true) closeEditor();
    else if (/confirm.*reset/i.test(result.error) || /resets.*confirm/i.test(result.error)) setPending({ kind: 'series', value, message: result.error });
    else setDialogError(result.error);
  };
  const handleSettings = (value: LibraryDocument['settings']) => {
    const result = library.updateSettings(value, false);
    if (result.ok === true) setSettingsOpen(false);
    else if (/confirm.*reset/i.test(result.error) || /resets.*confirm/i.test(result.error)) setPending({ kind: 'settings', value, message: result.error });
    else setDialogError(result.error);
  };
  const confirmReset = () => {
    if (!pending) return;
    const result = pending.kind === 'series' ? library.updateSeries(pending.value, true) : library.updateSettings(pending.value, true);
    if (result.ok === true) { setPending(null); closeEditor(); setSettingsOpen(false); }
    else { setDialogError(result.error); setPending(null); }
  };
  const finish = (series: Series) => {
    if (!series.next.title.trim()) { setFinishTarget(series); setFinishTitle(''); return; }
    const result = library.markFinished(series.id);
    if (result.ok === true) notify('Book finished. Undo is available until another library change or reload.'); else notify(result.error);
  };
  const finishWithTitle = () => {
    if (!finishTarget || !finishTitle.trim()) return;
    const result = library.markFinished(finishTarget.id, finishTitle.trim());
    if (result.ok === true) { setFinishTarget(null); setDialogError(null); notify('Book finished. Undo is available until another library change or reload.'); }
    else setDialogError(result.error);
  };
  const setup = () => {
    const market = setupMarket.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(market)) return setSetupError('Choose a two-letter country market.');
    const result = library.updateSettings({ ...library.doc.settings, market }, false);
    if (result.ok === false) setSetupError(result.error);
  };
  useEffect(() => { if (library.mode !== 'unsaved') setExportError(null); }, [library.mode]);
  useEffect(() => { document.documentElement.dataset.theme = library.doc.settings.theme; }, [library.doc.settings.theme]);
  const availableCount = library.doc.series.filter((s) => s.readingStatus !== 'completed' && s.formats.book && displayRelease(s.releases.book, today) === 'released').length;
  const availableAudioCount = library.doc.series.filter((s) => s.readingStatus !== 'completed' && s.formats.audio && displayRelease(s.releases.audio, today) === 'released').length;
  return <div className="app-shell">
    <header className="site-header"><div className="brand"><BrandMark /><div><strong>Series<span>Trackr</span></strong><BrandTagline /></div></div>
      <nav aria-label="Library tools"><button onClick={() => setSettingsOpen(true)}>Market: {library.doc.settings.market ?? 'Choose'}</button><button onClick={() => library.updateSettings({ ...library.doc.settings, theme: library.doc.settings.theme === 'dark' ? 'light' : 'dark' }, false)}>{library.doc.settings.theme === 'dark' ? 'Light Theme' : 'Dark Theme'}</button><button onClick={() => setBackupsOpen(true)}>Backups</button></nav></header>
    {library.mode === 'recovery' && <div className="warning" role="alert"><strong>Stored library needs recovery.</strong> {library.error} Download the original data, restore a backup, or reset explicitly.
      <button onClick={() => setBackupsOpen(true)}>Open backups</button></div>}
    {library.mode === 'unsaved' && <div className="warning" role="alert"><strong>Changes are in memory and may be lost.</strong> {library.error} <button onClick={exportUnsaved}>Export now</button>{exportError && <span className="form-error" role="alert"> {exportError}</span>}{library.recoveryRaw !== null && <button onClick={() => setBackupsOpen(true)}>Open backups</button>}</div>}
    <section className="intro"><div><div className="eyebrow">Your library</div><h1>What comes next?</h1><p>A bookshelf for the stories you are following. Your next read stays in focus.</p></div>
      {library.doc.series.length > 0 && <div className="summary"><div><b>{library.doc.series.length}</b><span>Tracked series</span></div><div><b>{availableCount}</b><span>Next book available</span></div><div><b>{availableAudioCount}</b><span>Next audiobook available</span></div></div>}</section>
    {library.doc.settings.market && library.mode !== 'recovery' && <LibraryView doc={library.doc} today={today} onEdit={(s) => { setDialogError(null); setEditor(s); }} onFinish={finish} onCheck={(series) => discovery.open(series.id)} onCheckAll={discovery.runBatch} batchRunning={discovery.batch.running} checkingSeriesId={discovery.session?.phase === 'checking' ? discovery.session.seriesId : null} onAdd={() => { setDialogError(null); setEditor('new'); }} onView={(view) => library.updateSettings({ ...library.doc.settings, view }, false)} />}
    {discovery.batch.total > 0 && <section className="batch-results" aria-label="Release check results">
      <div className="batch-results-header"><div>
        <h2>{discovery.batch.running ? 'Checking releases' : 'Release check results'}</h2>
        <p role="status">{discovery.batch.done} of {discovery.batch.total} checked · Review results before saving.</p>
      </div>{discovery.batch.running && <button onClick={discovery.cancelBatch}>Cancel checks</button>}</div>
      {discovery.batch.running && <progress value={discovery.batch.done} max={discovery.batch.total} aria-label="Release check progress" />}
      <ul className="batch-results-list">{discovery.batch.results.map(result => {
        const proposals = result.response?.proposals;
        const supported = proposals?.identity || proposals?.releases.book || proposals?.releases.audio;
        const status = result.error ? 'Check failed' : result.response?.summary.status === 'failed' ? 'Check failed' : supported ? 'Ready to review' : 'No supported result';
        const preview = result.error ?? [proposals?.identity?.title,
          proposals?.releases.book ? `Book: ${proposals.releases.book.date ?? 'Date unknown'}` : null,
          proposals?.releases.audio ? `Audio: ${proposals.releases.audio.date ?? 'Date unknown'}` : null].filter(Boolean).join(' · ');
        return <li className="batch-result-row" key={result.seriesId}>
          <div className="batch-result-description"><strong>{library.doc.series.find(s => s.id === result.seriesId)?.name ?? 'Removed series'}</strong>
            {preview && <p>{preview}</p>}
            {result.response?.summary.status === 'partial' && <span className="sub">Some sources need attention</span>}
          </div>
          <span className={`badge ${supported ? 'announced' : 'not-found'}`}>{status}</span>
          {result.response && <button aria-label={`Review ${library.doc.series.find(s => s.id === result.seriesId)?.name ?? 'series'} results`} disabled={discovery.batch.running} onClick={() => discovery.open(result.seriesId)}>Review results</button>}
        </li>;
      })}</ul>
    </section>}
    <aside className="next-phase"><span>YOUR CHOICE</span><div><strong>Discovery, when you ask for it.</strong><p>Check releases, review sources and choose what to save. Manual tracking works independently.</p></div></aside>
    {library.canUndo && (library.undoKind === 'cover'
      ? <div className="undo" role="status">Most recent cover choice can be undone until another change or reload. <button onClick={() => library.undo()}>Undo cover</button></div>
      : <div className="undo" role="status">Most recent finish can be undone until another change or reload. <button onClick={() => library.undo()}>Undo finish</button></div>)}
    {toast && <div className="toast" role="status">{toast}</div>}
    <Dialog open={library.doc.settings.market === null && library.mode !== 'recovery' && library.recoveryRaw === null} title="Which releases should we track?" onClose={() => {}} closable={false}><p>Choose your preferred country for English releases. Each format can use another country when no supported preferred-country date is found. You can override the preference for each series.</p><MarketSelect value={setupMarket} onChange={setSetupMarket} />{setupError && <p role="alert" className="form-error">{setupError}</p>}<div className="actions"><button className="primary" onClick={setup}>Start tracking</button></div></Dialog>
    <Dialog open={editor !== null} title={editor === 'new' ? 'Add series' : 'Edit series'} onClose={closeEditor}>{editor && <SeriesForm key={editor === 'new' ? 'new' : editor.id} series={editor === 'new' ? undefined : editor} market={library.doc.settings.market ?? ''} onCreate={(input) => { const result = library.addSeries(input); if (result.ok === true) closeEditor(); else setDialogError(result.error); }} onUpdate={handleUpdate} onCancel={closeEditor} onDelete={() => { if (editor !== 'new') setDeleteTarget(editor); }} error={dialogError} />}</Dialog>
    <Dialog open={pending !== null} title="Confirm metadata reset" onClose={() => setPending(null)}><p>{pending?.message}</p><p>Release information will be cleared. A changed next-book identity also clears its cover.</p><div className="actions"><button onClick={() => setPending(null)}>Cancel</button><button className="primary" onClick={confirmReset}>Confirm reset</button></div></Dialog>
    <Dialog open={deleteTarget !== null} title="Delete series" onClose={() => setDeleteTarget(null)}><p>Delete {deleteTarget?.name}? This removes its progress and release details.</p><div className="actions"><button onClick={() => setDeleteTarget(null)}>Cancel delete</button><button className="danger" onClick={() => { if (deleteTarget) { const result = library.deleteSeries(deleteTarget.id); if (result.ok === true) { setDeleteTarget(null); closeEditor(); } else setDialogError(result.error); } }}>Delete {deleteTarget?.name}</button></div></Dialog>
    <Dialog open={finishTarget !== null} title="Finish next book" onClose={() => setFinishTarget(null)}><p>Enter the title before moving this book to Last finished.</p><label>Finished book title<input value={finishTitle} onChange={(event) => setFinishTitle(event.target.value)} /></label>{dialogError && <p role="alert">{dialogError}</p>}<div className="actions"><button onClick={() => setFinishTarget(null)}>Cancel</button><button className="primary" onClick={finishWithTitle}>Finish book</button></div></Dialog>
    <Dialog open={settingsOpen} title="Settings" onClose={() => setSettingsOpen(false)}><SettingsDialog settings={library.doc.settings} onSave={handleSettings} onCancel={() => setSettingsOpen(false)} error={dialogError} /></Dialog>
    {!discovery.batch.running && discovery.session && discoverySeries && <DiscoveryDialog session={discovery.session} series={discoverySeries} preferredMarket={discoverySeries.marketOverride ?? library.doc.settings.market ?? ''} stale={!!discovery.session.snapshot && !library.isDiscoveryCurrent(discovery.session.snapshot)} onRun={discovery.run} onClose={discovery.close} onAccept={discovery.accept} />}
    {backupsOpen && <BackupDialog doc={library.doc} mode={library.mode} recoveryRaw={library.recoveryRaw} onReplace={library.replaceLibrary} onReset={library.resetLibrary} onClose={() => setBackupsOpen(false)} />}
  </div>;
}
