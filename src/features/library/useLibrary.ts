import { useRef, useState } from 'react';
import { emptyDocument, emptyRelease } from './model';
import type { LibraryDocument, Result, Series } from './model';
import { finishNext } from './progress';
import { parseDocument } from './validation';
import { loadBrowserLibrary, saveLibrary } from '../../storage/libraryStorage';
import type { CheckResponse, CheckSummary, DiscoverySnapshot, Selection } from '../../../shared/discovery';
import { parseCheckResponse, parseCheckSummary } from '../../../shared/discoveryValidation';
import { applyDiscovery } from '../discovery/acceptDiscovery';
import { createDiscoveryGuard } from '../discovery/discoveryGuard';

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
  const discoveryGuard = useRef(createDiscoveryGuard());

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
    discoveryGuard.current.touch(checked.value.series[checked.value.series.length - 1].id);
    commit(checked.value);
    return { ok: true, value: undefined };
  };

  const updateSeries = (changed: Series, confirmReset: boolean): Result<void> => {
    const allowed = requireReady();
    if (allowed.ok === false) return allowed;
    const before = current.current.series.find((item) => item.id === changed.id);
    if (!before) return invalid('Series not found.');
    const changedIdentityInput = identityChanged(before, changed);
    const changedMarketInput = (before.marketOverride ?? current.current.settings.market) !== (changed.marketOverride ?? current.current.settings.market);
    const sanitized: Series = { ...changed,
      next: { ...changed.next, attribution: changedIdentityInput ? null : changed.next.attribution },
      lastCheck: changedIdentityInput || changedMarketInput ? null : changed.lastCheck,
      releases: changedIdentityInput || changedMarketInput ? { book: emptyRelease(), audio: emptyRelease() }
        : { ...changed.releases },
    };
    for (const format of ['book', 'audio'] as const) {
      const previous = before.releases[format];
      const edited = changed.releases[format];
      if (!changedIdentityInput && !changedMarketInput && (previous.state !== edited.state || previous.date !== edited.date
        || previous.source?.title !== edited.source?.title || previous.source?.url !== edited.source?.url
        || previous.origin !== edited.origin || previous.lastCheckedAt !== edited.lastCheckedAt)) {
        sanitized.releases[format] = { ...edited, provenance: null };
      }
    }
    const checkedInput = validated({ ...current.current, series: current.current.series.map((item) => item.id === changed.id ? sanitized : item) });
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
    discoveryGuard.current.touch(changed.id);
    commit(checked.value);
    return { ok: true, value: undefined };
  };

  const deleteSeries = (id: string): Result<void> => {
    const allowed = requireReady();
    if (allowed.ok === false) return allowed;
    if (!current.current.series.some((item) => item.id === id)) return invalid('Series not found.');
    undoSnapshot.current = null;
    discoveryGuard.current.touch(id);
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
    discoveryGuard.current.touch(id);
    commit(candidate.value);
    return { ok: true, value: undefined };
  };

  const undo = (): Result<void> => {
    const allowed = requireReady();
    if (allowed.ok === false) return allowed;
    if (!undoSnapshot.current) return invalid('There is no finish action to undo.');
    const previous = undoSnapshot.current;
    undoSnapshot.current = null;
    discoveryGuard.current.replace();
    commit(previous);
    return { ok: true, value: undefined };
  };

  const updateSettings = (settings: Settings, confirmReset: boolean): Result<void> => {
    const allowed = requireReady();
    if (allowed.ok === false) return allowed;
    const marketChanged = settings.market !== current.current.settings.market;
    const checkedSettings = validated({ ...current.current, settings, series: current.current.series.map(item => marketChanged && item.marketOverride === null
      ? { ...item, lastCheck: null, releases: { book: emptyRelease(), audio: emptyRelease() } } : item) });
    if (checkedSettings.ok === false) return invalid(checkedSettings.error);
    const affected = marketChanged ? current.current.series.filter((item) => item.marketOverride === null) : [];
    if (affected.length > 0 && !confirmReset) {
      return invalid(`Changing the default market resets release information for ${affected.length} series. Confirm the reset to save it.`);
    }
    const next: LibraryDocument = {
      ...checkedSettings.value,
      series: checkedSettings.value.series.map((item) => marketChanged && item.marketOverride === null
        ? { ...item, lastCheck: null, releases: { book: emptyRelease(), audio: emptyRelease() } }
        : item),
    };
    undoSnapshot.current = null;
    for (const item of affected) discoveryGuard.current.touch(item.id);
    commit(next);
    return { ok: true, value: undefined };
  };

  const replaceLibrary = (replacement: LibraryDocument): Result<void> => {
    const checked = validated(replacement);
    if (checked.ok === false) return invalid(checked.error);
    undoSnapshot.current = null;
    discoveryGuard.current.replace();
    commit(checked.value);
    return { ok: true, value: undefined };
  };

  const resetLibrary = (): Result<void> => {
    undoSnapshot.current = null;
    discoveryGuard.current.replace();
    commit(emptyDocument());
    return { ok: true, value: undefined };
  };

  const beginDiscovery = (id: string, requestId: string): Result<DiscoverySnapshot> => {
    const allowed = requireReady();
    if (allowed.ok === false) return allowed;
    if (!current.current.series.some(item => item.id === id)) return { ok: false, error: 'Series not found.' };
    if (!requestId.trim()) return { ok: false, error: 'Discovery request ID is required.' };
    return { ok: true, value: discoveryGuard.current.begin(id, requestId) };
  };

  const isDiscoveryCurrent = (snapshot: DiscoverySnapshot): boolean => discoveryGuard.current.isCurrent(snapshot);
  const cancelDiscovery = (id: string): void => discoveryGuard.current.cancel(id);

  const recordDiscoveryCheck = (snapshot: DiscoverySnapshot, summary: CheckSummary): Result<void> => {
    const allowed = requireReady();
    if (allowed.ok === false) return allowed;
    if (!isDiscoveryCurrent(snapshot)) return invalid('Discovery result is stale. Check again.');
    const parsed = parseCheckSummary(summary);
    if (parsed.ok === false) return parsed;
    if (parsed.value.requestId !== snapshot.requestId) return invalid('Discovery request does not match.');
    if (!current.current.series.some(item => item.id === snapshot.seriesId)) return invalid('Series not found.');
    const checked = validated({ ...current.current, series: current.current.series.map(item => item.id === snapshot.seriesId
      ? { ...item, lastCheck: parsed.value } : item) });
    if (checked.ok === false) return invalid(checked.error);
    undoSnapshot.current = null;
    commit(checked.value);
    return { ok: true, value: undefined };
  };

  const acceptDiscovery = (snapshot: DiscoverySnapshot, response: CheckResponse, selection: Selection): Result<void> => {
    const allowed = requireReady();
    if (allowed.ok === false) return allowed;
    if (!isDiscoveryCurrent(snapshot)) return invalid('Discovery result is stale. Check again.');
    const before = current.current.series.find(item => item.id === snapshot.seriesId);
    if (!before) return invalid('Series not found.');
    const parsed = parseCheckResponse(response);
    if (parsed.ok === false) return parsed;
    if (parsed.value.requestId !== snapshot.requestId || parsed.value.seriesId !== snapshot.seriesId) return invalid('Discovery request does not match.');
    for (const format of ['book', 'audio'] as const) {
      if (selection[format] && parsed.value.proposals.releases[format]?.provenance.preferredMarket !== (before.marketOverride ?? current.current.settings.market)) {
        return invalid('Discovery market does not match.');
      }
    }
    const accepted = applyDiscovery(before, parsed.value, selection);
    if (accepted.ok === false) return accepted;
    if (accepted.value === before) return { ok: true, value: undefined };
    const checked = validated({ ...current.current, series: current.current.series.map(item => item.id === before.id ? accepted.value : item) });
    if (checked.ok === false) return invalid(checked.error);
    undoSnapshot.current = null;
    discoveryGuard.current.touch(before.id);
    commit(checked.value);
    return { ok: true, value: undefined };
  };

  return { doc, mode, error, recoveryRaw, canUndo: undoSnapshot.current !== null,
    beginDiscovery, isDiscoveryCurrent, cancelDiscovery, recordDiscoveryCheck, acceptDiscovery,
    addSeries, updateSeries, deleteSeries, markFinished, undo, updateSettings, replaceLibrary, resetLibrary };
}
