import type { CheckRequest } from '../../shared/discovery';
import { normalizeIdentity } from '../../shared/discoveryPolicy';

export function seriesBase(series: string): string {
  return series.trim().replace(/^the\s+/i, '').replace(/\s+(?:series|mysteries|trilogy)$/i, '').replace(/^tales? of\s+/i, '');
}

export function ordinalSubtitlePosition(subtitle: string, request: CheckRequest): number | null {
  if (!Number.isSafeInteger(request.target.position) || request.target.position <= 0) return null;
  const stem = normalizeIdentity(seriesBase(request.target.series));
  if (!stem) return null;
  const literal = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const words = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
  const match = new RegExp(`^the (${words.join('|')}) tale of ${literal}(?:: a novel of [^:()]+)?$`).exec(normalizeIdentity(subtitle));
  const position = match ? words.indexOf(match[1]) + 1 : null;
  return position === request.target.position ? position : null;
}

// Only an explicit, request-matched ordinal series qualifier can be separated.
// Ordinary subtitles and arbitrary colon-delimited titles remain literal.
export function orderedTitle(title: string, request: CheckRequest): { title: string; subtitle: string } | null {
  const matches: { title: string; subtitle: string }[] = [];
  for (const separator of title.matchAll(/:\s+/g)) {
    const base = title.slice(0, separator.index).trim();
    const subtitle = title.slice(separator.index! + separator[0].length).trim();
    if (base && ordinalSubtitlePosition(subtitle, request) !== null) matches.push({ title: base, subtitle });
  }
  return matches.length === 1 ? matches[0] : null;
}
