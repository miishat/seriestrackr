import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthorSuggestion, CoverCandidate, CoverRequest, CoverResult } from '../../shared/covers';
import { decodeCover, fetchCoverCandidates, rankCovers, selectableCover } from '../services/coverImages';
import type { CoverAttribution, Series } from '../features/library/model';
import { nextPosition } from '../features/library/progress';

export interface CoverSearchState {
  phase: 'idle' | 'searching' | 'ready' | 'error';
  candidates: CoverCandidate[];
  outcomes: CoverResult['outcomes'];
  authorSuggestions: AuthorSuggestion[];
  error: string | null;
}
const idle: CoverSearchState = { phase: 'idle', candidates: [], outcomes: [], authorSuggestions: [], error: null };

// A request is bound to the title, author, progress and market it was started with. Any change, a close or an
// unmount advances the generation and aborts the request, so no late response can list or commit an image.
export function useCoverSearch(series: Series, market: string) {
  const [state, setState] = useState<CoverSearchState>(idle);
  const stateRef = useRef(state);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const publish = (value: CoverSearchState) => { stateRef.current = value; setState(value); };
  const invalidate = useCallback(() => {
    generation.current += 1;
    controller.current?.abort();
    controller.current = null;
  }, []);
  const key = JSON.stringify([series.next.title, series.author, series.name, nextPosition(series), series.lastFinished?.title ?? null, market]);
  const firstKey = useRef(key);
  useEffect(() => {
    if (firstKey.current === key) return;
    firstKey.current = key;
    invalidate();
    publish(idle);
  }, [key, invalidate]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; invalidate(); };
  }, [invalidate]);

  const search = async (): Promise<void> => {
    invalidate();
    const token = generation.current;
    const active = new AbortController();
    controller.current = active;
    const live = () => mounted.current && token === generation.current && !active.signal.aborted;
    // The service rejects blank fields, so name the missing one here instead of surfacing a generic failure.
    const missing = !series.name.trim() ? 'series name' : !series.author.trim() ? 'author' : null;
    if (missing) { publish({ ...idle, phase: 'error', error: `Add the ${missing} before searching for a cover.` }); return; }
    // A blank next title is fine while a last finished title exists: the search then offers the last read book's cover.
    if (!series.next.title.trim() && !series.lastFinished?.title.trim()) { publish({ ...idle, phase: 'error', error: "Add the next book's title or a last finished title before searching for a cover." }); return; }
    publish({ ...idle, phase: 'searching' });
    const request: CoverRequest = { requestId: crypto.randomUUID(), seriesId: series.id || 'new', series: series.name, author: series.author,
      nextTitle: series.next.title, position: nextPosition(series), previousTitle: series.lastFinished?.title.trim() || null, preferredMarket: market };
    try {
      const found = await fetchCoverCandidates(request, active.signal);
      if (!live()) return;
      const decoded = await Promise.all(found.candidates.map(item => decodeCover(item, active.signal)));
      if (!live()) return;
      const usable = rankCovers(decoded.filter((item): item is CoverCandidate => item !== null));
      publish({ phase: 'ready', candidates: usable, outcomes: found.outcomes, authorSuggestions: found.authorSuggestions, error: null });
    } catch (error) {
      if (!live()) return;
      publish({ ...idle, phase: 'error', error: error instanceof Error ? error.message : 'Cover search failed.' });
    }
  };

  const choose = (id: string): { url: string; attribution: CoverAttribution } | null => {
    const current = stateRef.current;
    if (current.phase !== 'ready' || !mounted.current) return null;
    const item = current.candidates.find(candidate => candidate.id === id);
    if (!item || !selectableCover(item)) return null;
    return { url: item.imageUrl, attribution: { title: item.title, author: item.author, role: item.role, source: item.source, editionKey: item.editionKey } };
  };

  const reset = () => { invalidate(); publish(idle); };
  return { state, search, choose, reset };
}
