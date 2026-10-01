import type { EvidenceBundle } from '../../shared/discovery';

export type DiagnosticStage = 'catalog' | 'allocation' | 'prompt' | 'envelope' | 'identity' | 'edition';
export type DiagnosticCategory = 'shape' | 'citation' | 'duplicate-id' | 'date-precision' |
  'target-mismatch' | 'bounds' | 'trimmed' | 'accepted';
export interface DiagnosticEvent {
  stage: DiagnosticStage; category: DiagnosticCategory;
  sources: number; identities: number; editions: number;
}
export type DiagnosticObserver = (event: DiagnosticEvent) => void;

export function classifyExtractionFailure(error: string): DiagnosticCategory {
  if (error === 'evidence.citations: quote must appear in supplied source') return 'citation';
  if (error === 'evidence.editions: duplicate values') return 'duplicate-id';
  if (/^evidence\.editions\[\d+\]\.date: date and precision disagree$/.test(error)) return 'date-precision';
  return 'shape';
}

export function emitDiagnostic(observer: DiagnosticObserver | undefined, event: DiagnosticEvent): void {
  if (!observer || !['catalog', 'allocation', 'prompt', 'envelope', 'identity', 'edition'].includes(event.stage) ||
    !['shape', 'citation', 'duplicate-id', 'date-precision', 'target-mismatch', 'bounds', 'trimmed', 'accepted'].includes(event.category)) return;
  const limits = { sources: 30, identities: 30, editions: 100 };
  for (const key of ['sources', 'identities', 'editions'] as const) {
    if (!Number.isSafeInteger(event[key]) || event[key] < 0 || event[key] > limits[key]) return;
  }
  const safe = Object.freeze({ stage: event.stage, category: event.category,
    sources: event.sources, identities: event.identities, editions: event.editions });
  try { observer(safe); } catch { /* Diagnostics cannot alter discovery. */ }
}

// Footprint counts saturate at the evidence caps; they do not report raw sizes.
export function diagnosticCounts(evidence: EvidenceBundle): Pick<DiagnosticEvent, 'sources' | 'identities' | 'editions'> {
  return { sources: Math.min(30, evidence.sources.length), identities: Math.min(30, evidence.identities.length),
    editions: Math.min(100, evidence.editions.length) };
}
