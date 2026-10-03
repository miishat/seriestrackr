import type { CoverCandidate } from '../../../shared/covers';
import { decodeCover, fetchCoverCandidates, rankCovers, selectableCover } from '../../services/coverImages';
import type { CoverAttribution, Series } from './model';
import { nextPosition } from './progress';

const providerOrder: CoverCandidate['provider'][] = ['hardcover', 'googlebooks', 'apple', 'openlibrary'];

// A usable next-book cover wins over a previous-book cover; within a role Hardcover is preferred.
export function pickAutomaticCover(candidates: CoverCandidate[]): CoverCandidate | null {
  const usable = rankCovers(candidates).filter(selectableCover);
  const role = usable.some(item => item.role === 'next') ? 'next' : 'previous';
  const pool = usable.filter(item => item.role === role);
  return [...pool].sort((a, b) => providerOrder.indexOf(a.provider) - providerOrder.indexOf(b.provider))[0] ?? null;
}

export async function findAutomaticCover(series: Series, market: string, signal: AbortSignal): Promise<{ url: string; attribution: CoverAttribution } | null> {
  if (!series.name.trim() || !series.author.trim() || (!series.next.title.trim() && !series.lastFinished?.title.trim())) return null;
  const found = await fetchCoverCandidates({ requestId: crypto.randomUUID(), seriesId: series.id, series: series.name, author: series.author,
    nextTitle: series.next.title, position: nextPosition(series), previousTitle: series.lastFinished?.title.trim() || null, preferredMarket: market }, signal);
  const decoded = await Promise.all(found.candidates.map(item => decodeCover(item, signal)));
  const chosen = pickAutomaticCover(decoded.filter((item): item is CoverCandidate => item !== null));
  return chosen ? { url: chosen.imageUrl, attribution: { title: chosen.title, author: chosen.author, role: chosen.role, source: chosen.source, editionKey: chosen.editionKey } } : null;
}
