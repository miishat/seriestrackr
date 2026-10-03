import type { CheckResponse, Selection, SourceLink } from '../../../shared/discovery';
import { normalizeIdentity } from '../../../shared/discoveryPolicy';
import type { Format, LibraryDocument, Release, ReleaseState, Series } from '../library/model';

export const STALE_DAYS = 7;
const rank: Record<ReleaseState, number> = { 'not-checked': 0, 'not-found': 0, catalogued: 1, announced: 2, scheduled: 3, released: 4 };

// Active series with no usable check in the last STALE_DAYS. Failed or cancelled checks retry on the next open.
export function staleSeriesIds(doc: LibraryDocument, now: Date): string[] {
  const cutoff = now.getTime() - STALE_DAYS * 86_400_000;
  return doc.series.filter(series => {
    if (series.readingStatus !== 'active') return false;
    const check = series.lastCheck;
    if (!check || check.status === 'failed' || check.status === 'cancelled') return true;
    const at = Date.parse(check.checkedAt);
    return !Number.isFinite(at) || at <= cutoff;
  }).map(series => series.id);
}

const hostOf = (url: string): string | null => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; } };
const independentSources = (sources: SourceLink[]): number => new Set(sources.map(source => hostOf(source.url)).filter(Boolean)).size;
const manualEntry = (release: Release): boolean => release.origin === 'manual' && release.state !== 'not-checked';

// What an automatic check may save without review. Anything else waits for the user.
export function safeSelection(series: Series, response: CheckResponse): Selection | null {
  const { identity, identityAttribution, releases, conflicts } = response.proposals;
  const saved = series.next.title.trim();
  let title = false;
  if (identity && normalizeIdentity(identity.title) !== normalizeIdentity(saved)) {
    if (saved || !identityAttribution || independentSources(identityAttribution.sources) < 2) return null;
    title = true;
  }
  const target = title ? identity!.title : saved;
  if (!target) return null;
  const forward = (format: Format): boolean => {
    const proposal = releases[format];
    const current = series.releases[format];
    if (!series.formats[format] || !proposal || conflicts.some(conflict => conflict.format === format) || manualEntry(current)) return false;
    if (normalizeIdentity(proposal.title) !== normalizeIdentity(target)) return false;
    if (proposal.state === 'released' && proposal.date === null && proposal.provenance.sourceMarket === null) return false;
    return rank[proposal.state] > rank[current.state];
  };
  const selection: Selection = { title, book: forward('book'), audio: forward('audio'), coverId: null };
  return selection.title || selection.book || selection.audio ? selection : null;
}
