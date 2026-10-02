import { useEffect, useRef, useState } from 'react';
import type { CheckRequest, Selection } from '../../../shared/discovery';
import type { Result } from '../library/model';
import { nextPosition } from '../library/progress';
import type { useLibrary } from '../library/useLibrary';
import { checkDiscovery, getDiscoveryCapabilities } from '../../services/discovery';
import type { DiscoverySession } from './discoverySession';

const staleMessage = 'The series changed. Check again before saving.';
export function useDiscovery(library: ReturnType<typeof useLibrary>) {
  const [batch, setBatch] = useState<{ running: boolean; total: number; done: number; results: DiscoverySession[] }>({ running: false, total: 0, done: 0, results: [] });
  const batchToken = useRef(0);
  const batchRunning = useRef(false);
  const retainedReviews = useRef(new Set<string>());
  const [session, setSession] = useState<DiscoverySession | null>(null);
  const sessionRef = useRef(session);
  const libraryRef = useRef(library);
  libraryRef.current = library;
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const publish = (value: DiscoverySession | null) => { sessionRef.current = value; setSession(value); };
  const invalidate = () => {
    generation.current += 1;
    controller.current?.abort();
    const current = sessionRef.current;
    if (current && (!current.snapshot || !retainedReviews.current.has(current.snapshot.requestId))) libraryRef.current.cancelDiscovery(current.seriesId);
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; invalidate(); };
  }, []);
  // Title, author, progress or market edits advance the generation and abort any in-flight check so
  // a late response cannot reach review or be accepted.
  const watched = library.doc.series.find(item => item.id === session?.seriesId);
  const fingerprint = watched ? JSON.stringify([watched.id, watched.next.title, watched.author, watched.name, nextPosition(watched),
    watched.marketOverride ?? library.doc.settings.market]) : null;
  const lastFingerprint = useRef<string | null>(null);
  useEffect(() => {
    const previous = lastFingerprint.current;
    lastFingerprint.current = fingerprint;
    if (previous === null || fingerprint === null || previous === fingerprint) return;
    if (JSON.parse(previous)[0] !== JSON.parse(fingerprint)[0]) return;
    const current = sessionRef.current;
    if (!current || batchRunning.current) return;
    generation.current += 1;
    controller.current?.abort();
    if (current.phase === 'preparing' || current.phase === 'checking') {
      libraryRef.current.cancelDiscovery(current.seriesId);
      publish({ ...current, phase: 'error', error: staleMessage });
    }
  }, [fingerprint]);
  const currentGeneration = (token: number) => mounted.current && token === generation.current;
  const close = () => { invalidate(); publish(null); };
  const open = (seriesId: string) => {
    const cached = batch.results.find(item => item.seriesId === seriesId);
    if (cached?.snapshot && libraryRef.current.isDiscoveryCurrent(cached.snapshot)) { invalidate(); publish(cached); return; }
    invalidate();
    const series = libraryRef.current.doc.series.find(item => item.id === seriesId);
    if (!series || series.readingStatus === 'completed') { publish(null); return; }
    const token = generation.current;
    const activeController = new AbortController(); controller.current = activeController;
    const preparing: DiscoverySession = { seriesId, phase: 'preparing', capabilities: null, snapshot: null, response: null, error: null };
    publish(preparing);
    void getDiscoveryCapabilities(activeController.signal).then(capabilities => {
      if (currentGeneration(token)) publish({ ...preparing, phase: 'ready', capabilities });
    }).catch(error => {
      if (currentGeneration(token)) publish({ ...preparing, phase: 'error', error: error instanceof Error ? error.message : 'Could not prepare this check.' });
    });
  };
  const run = async (useAi: boolean): Promise<void> => {
    const previous = sessionRef.current;
    if (!previous || previous.phase === 'preparing' || previous.phase === 'checking') return;
    invalidate();
    const token = generation.current;
    const activeController = new AbortController(); controller.current = activeController;
    let checking: DiscoverySession = { ...previous, phase: 'checking', snapshot: null, response: null, error: null };
    publish(checking);
    try {
      const capabilities = previous.capabilities ?? await getDiscoveryCapabilities(activeController.signal);
      if (!currentGeneration(token)) return;
      const latest = libraryRef.current;
      const series = latest.doc.series.find(item => item.id === previous.seriesId);
      const preferredMarket = series?.marketOverride ?? latest.doc.settings.market;
      if (!series || series.readingStatus === 'completed' || !preferredMarket) throw new Error('Choose an active series and preferred country before checking.');
      const request: CheckRequest = { requestId: crypto.randomUUID(), seriesId: series.id,
        target: { series: series.name, author: series.author, position: nextPosition(series), title: series.next.title, orderNote: series.next.orderNote },
        preferredMarket, formats: (['book', 'audio'] as const).filter(format => series.formats[format]), useAi: useAi && capabilities.ai };
      const started = latest.beginDiscovery(series.id, request.requestId);
      if (started.ok === false) throw new Error(started.error);
      checking = { ...checking, capabilities, snapshot: started.value }; publish(checking);
      const response = await checkDiscovery(request, activeController.signal);
      if (!currentGeneration(token)) return;
      if (!libraryRef.current.isDiscoveryCurrent(started.value)) throw new Error(staleMessage);
      if (response.requestId !== request.requestId || response.seriesId !== request.seriesId) throw new Error('The check response did not match this request. Check again.');
      const recorded = libraryRef.current.recordDiscoveryCheck(started.value, response.summary);
      if (recorded.ok === false) throw new Error(recorded.error);
      if (!currentGeneration(token) || !libraryRef.current.isDiscoveryCurrent(started.value)) throw new Error(staleMessage);
      publish({ ...checking, phase: 'review', response });
    } catch (error) {
      if (currentGeneration(token)) publish({ ...checking, phase: 'error', error: error instanceof Error ? error.message : 'Could not complete this check.' });
    }
  };
  const accept = (selection: Selection): Result<void> => {
    const current = sessionRef.current;
    if (!current || current.phase !== 'review' || !current.snapshot || !current.response) return { ok: false, error: 'Check releases before saving changes.' };
    if (!libraryRef.current.isDiscoveryCurrent(current.snapshot)) return { ok: false, error: staleMessage };
    if (current.response.requestId !== current.snapshot.requestId || current.response.seriesId !== current.snapshot.seriesId ||
      current.snapshot.seriesId !== current.seriesId) return { ok: false, error: 'The check response did not match this request. Check again.' };
    const accepted = libraryRef.current.acceptDiscovery(current.snapshot, current.response, selection);
    if (accepted.ok) close();
    return accepted;
  };
  const runBatch = async (seriesIds: string[]) => {
    if (batch.running) return;
    close();
    const token = ++batchToken.current;
    const ids = [...new Set(seriesIds)].filter(id => libraryRef.current.doc.series.some(s => s.id === id && s.readingStatus === 'active'));
    batchRunning.current = true;
    setBatch({ running: true, total: ids.length, done: 0, results: [] });
    const results: DiscoverySession[] = [];
    for (const seriesId of ids) {
      if (token !== batchToken.current || !mounted.current) break;
      // Preserve completed snapshots for review instead of cancelling them.
      publish({ seriesId, phase: 'ready', capabilities: null, snapshot: null, response: null, error: null });
      await run(false);
      if (token !== batchToken.current || !mounted.current) break;
      const result = sessionRef.current;
      if (result) {
        results.push(result);
        if (result.snapshot && result.response) retainedReviews.current.add(result.snapshot.requestId);
      }
      publish(null);
      setBatch({ running: true, total: ids.length, done: results.length, results: [...results] });
      if (result?.error?.includes('unavailable') || result?.error?.includes('quota') || result?.response?.summary.reasons.includes('quota')) break;
    }
    if (token === batchToken.current && mounted.current) {
      publish(null);
      batchRunning.current = false;
      setBatch({ running: false, total: ids.length, done: results.length, results: [...results] });
    }
  };
  const cancelBatch = () => {
    ++batchToken.current;
    batchRunning.current = false;
    close();
    setBatch(previous => ({ ...previous, running: false }));
  };
  return { session, open, run, close, accept, batch, runBatch, cancelBatch };
}
