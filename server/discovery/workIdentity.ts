import type { CheckRequest } from '../../shared/discovery';
import { normalizeIdentity } from '../../shared/discoveryPolicy';
import { orderedTitle, seriesBase } from './seriesOrder';

export function hardcoverAliases(series: string): string[] {
  const original = series.trim();
  const base = seriesBase(original);
  return [...new Set([original, original.replace(/^the\s+/i, ''), base,
    `The ${base}`, `${base} Series`, `${base} Mysteries`, `${base} Trilogy`,
    `Tales of ${base}`].filter(Boolean))].slice(0, 8);
}

export const isPlaceholderTitle = (title: string): boolean =>
  /^(?:untitled|tba|tbd|to be announced)(?:\s*\([^)]*\))?$/i.test(title.trim());

// Author verification is a caller precondition. Returns only the canonical title or null.
export function bindWorkTitle(actual: string, request: CheckRequest): string | null {
  const canonical = request.target.title.trim();
  if (!canonical || isPlaceholderTitle(canonical)) return null;
  const normalized = normalizeIdentity(actual);
  const ordinal = orderedTitle(actual, request);
  if (ordinal && normalizeIdentity(ordinal.title) === normalizeIdentity(canonical)) return canonical;
  const labels = [canonical, `${canonical} (Unabridged)`];
  if (Number.isInteger(request.target.position)) for (const series of hardcoverAliases(request.target.series)) {
    const n = request.target.position;
    for (const label of [`${canonical}: ${series}, Book ${n}`, `${canonical}: A LitRPG Adventure (${series} ${n})`,
      `${canonical} (${series} Book ${n})`, `${canonical} (${series}, Book ${n})`]) {
      labels.push(label, `${label} (Unabridged)`);
    }
  }
  return labels.some(label => normalizeIdentity(label) === normalized) ? canonical : null;
}
