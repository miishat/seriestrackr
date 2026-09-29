import { useRef, useState } from 'react';
import { emptyDocument, emptyRelease } from './model';
import type { LibraryDocument, Result, Series } from './model';
import { finishNext } from './progress';
import { parseDocument } from './validation';
import { loadBrowserLibrary, saveLibrary } from '../../storage/libraryStorage';

export type LibraryMode = 'ready' | 'recovery' | 'unsaved';
type Settings = LibraryDocument['settings'];

function writeBrowserDocument(doc: LibraryDocument): Result<void> {
  try {
    return saveLibrary(window.localStorage, doc);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function sameBook(a: Series['lastFinished'], b: Series['lastFinished']): boolean {
  return a?.position === b?.position && a?.title === b?.title;
}

function identityChanged(before: Series, after: Series): boolean {
  return before.name !== after.name || before.author !== after.author ||
    !sameBook(before.lastFinished, after.lastFinished) ||
    before.next.positionOverride !== after.next.positionOverride ||
    before.next.title !== after.next.title || before.next.orderNote !== after.next.orderNote;
}

function invalid(error: string): Result<void> {
  return { ok: false, error };
}

export function useLibrary() {
  const [initial] = useState(loadBrowserLibrary);
  const [doc, setDoc] = useState<LibraryDocument>(initial.kind === 'ready' ? initial.doc : emptyDocument());
  const [mode, setMode] = useState<LibraryMode>(initial.kind === 'ready' ? 'ready' : initial.kind === 'recovery' ? 'recovery' : 'unsaved');
  const [error, setError] = useState<string | null>(initial.kind === 'ready' ? null : initial.error);
  const [recoveryRaw, setRecoveryRaw] = useState<string | null>(initial.kind === 'recovery' ? initial.raw : null);
  const current = useRef(doc);
  const currentMode = useRef(mode);
  const undoSnapshot = useRef<LibraryDocument | null>(null);

  const commit = (next: LibraryDocument): void => {
    current.current = next;
    setDoc(next);
    const saved = writeBrowserDocument(next);
    currentMode.current = saved.ok ? 'ready' : 'unsaved';
    setMode(currentMode.current);
    setError(saved.ok === true ? null : saved.error);
    if (saved.ok) setRecoveryRaw(null);
  };

  const requireReady = (): Result<void> => currentMode.current === 'recovery'
    ? invalid('Recover, import, or reset the stored library before editing.')
    : { ok: true, value: undefined };

  const validated = (candidate: LibraryDocument): Result<LibraryDocument> => parseDocument(candidate);

  const addSeries = (input: Omit<Series, 'id'>): Result<void> => {
    const allowed = requireReady();
    if (allowed.ok === false) return allowed;
    const candidate = { ...current.current, series: [...current.current.series, { ...input, id: crypto.randomUUID() }] };
    const checked = validated(candidate);
    if (checked.ok === false) return invalid(checked.error);
    undoSnapshot.current = null;
    commit(checked.value);
    return { ok: true, value: undefined };
  };

  const updateSeries = (changed: Series, confirmReset: boolean): Result<void> => {
    const allowed = requireReady();
    if (allowed.ok === false) return allowed;
    const before = current.current.series.find((item) => item.id === changed.id);
    if (!before) return invalid('Series not found.');
    const checkedInput = validated({ ...current.current, series: current.current.series.map((item) => item.id === changed.id ? changed : item) });
    if (checkedInput.ok === false) return invalid(checkedInput.error);
    const after = checkedInput.value.series.find((item) => item.id === changed.id)!;
    const changedIdentity = identityChanged(before, after);
    const changedMarket = (before.marketOverride ?? current.current.settings.market) !== (after.marketOverride ?? current.current.settings.market);
    if ((changedIdentity || changedMarket) && !confirmReset) {
      return invalid('This change resets next-book release information. Confirm the reset to save it.');
    }
    const updated: Series = {
      ...after,
      currentBook: after.readingStatus === 'completed' ? null : after.currentBook,
      coverUrl: changedIdentity ? null : after.coverUrl,
      releases: changedIdentity || changedMarket ? { book: emptyRelease(), audio: emptyRelease() } : after.releases,
    };
    const checked = validated({ ...current.current, series: current.current.series.map((item) => item.id === changed.id ? updated : item) });
    if (checked.ok === false) return invalid(checked.error);
    undoSnapshot.current = null;
    commit(checked.value);
    return { ok: true, value: undefined };
  };

  const deleteSeries = (id: string): Result<void> => {
    const allowed = requireReady();
    if (allowed.ok === false) return allowed;
    if (!current.current.series.some((item) => item.id === id)) return invalid('Series not found.');
    undoSnapshot.current = null;
    commit({ ...current.current, series: current.current.series.filter((item) => item.id !== id) });
    return { ok: true, value: undefined };
  };

  const markFinished = (id: string, suppliedTitle?: string): Result<void> => {
    const allowed = requireReady();
    if (allowed.ok === false) return allowed;
    const before = current.current.series.find((item) => item.id === id);
    if (!before) return invalid('Series not found.');
    const finishing = suppliedTitle === undefined ? before : { ...before, next: { ...before.next, title: suppliedTitle } };
    const finished = finishNext(finishing);
    if (finished.ok === false) return invalid(finished.error);
    const candidate = validated({ ...current.current, series: current.current.series.map((item) => item.id === id ? finished.value : item) });
    if (candidate.ok === false) return invalid(candidate.error);
    undoSnapshot.current = current.current;
    commit(candidate.value);
    return { ok: true, value: undefined };
  };

  const undo = (): Result<void> => {
    const allowed = requireReady();
    if (allowed.ok === false) return allowed;
    if (!undoSnapshot.current) return invalid('There is no finish action to undo.');
    const previous = undoSnapshot.current;
    undoSnapshot.current = null;
    commit(previous);
    return { ok: true, value: undefined };
  };

  const updateSettings = (settings: Settings, confirmReset: boolean): Result<void> => {
    const allowed = requireReady();
    if (allowed.ok === false) return allowed;
    const checkedSettings = validated({ ...current.current, settings });
    if (checkedSettings.ok === false) return invalid(checkedSettings.error);
    const marketChanged = settings.market !== current.current.settings.market;
    const affected = marketChanged ? current.current.series.filter((item) => item.marketOverride === null) : [];
    if (affected.length > 0 && !confirmReset) {
      return invalid(`Changing the default market resets release information for ${affected.length} series. Confirm the reset to save it.`);
    }
    const next: LibraryDocument = {
      ...checkedSettings.value,
      series: checkedSettings.value.series.map((item) => marketChanged && item.marketOverride === null
        ? { ...item, releases: { book: emptyRelease(), audio: emptyRelease() } }
        : item),
    };
    undoSnapshot.current = null;
    commit(next);
    return { ok: true, value: undefined };
  };

  const replaceLibrary = (replacement: LibraryDocument): Result<void> => {
    const checked = validated(replacement);
    if (checked.ok === false) return invalid(checked.error);
    undoSnapshot.current = null;
    commit(checked.value);
    return { ok: true, value: undefined };
  };

  const resetLibrary = (): Result<void> => {
    undoSnapshot.current = null;
    commit(emptyDocument());
    return { ok: true, value: undefined };
  };

  return { doc, mode, error, recoveryRaw, canUndo: undoSnapshot.current !== null,
    addSeries, updateSeries, deleteSeries, markFinished, undo, updateSettings, replaceLibrary, resetLibrary };
}
