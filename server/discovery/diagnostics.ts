import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Provider, EvidenceBundle } from '../../shared/discovery';

export type DiagnosticStage = 'catalog' | 'allocation' | 'prompt' | 'envelope' | 'identity' | 'edition' | 'transport' | 'cover';
export type DiagnosticCategory = 'shape' | 'citation' | 'duplicate-id' | 'date-precision' |
  'target-mismatch' | 'bounds' | 'trimmed' | 'accepted';
export interface DiagnosticEvent {
  provider?: Provider; recordRef?: string; rule?: DiagnosticRule; httpStatus?: number;
  stage: DiagnosticStage; category: DiagnosticCategory;
  sources: number; identities: number; editions: number;
}
export const diagnosticRules = [
  'http-quota', 'http-failure', 'no-match', 'author-mismatch', 'series-mismatch', 'position-mismatch',
  'compilation', 'placeholder-title', 'ambiguous-work', 'edition-format', 'edition-language',
  'unsupported-title', 'citation-closure', 'evidence-bound', 'request-bound', 'image-geometry',
] as const;
export type DiagnosticRule = typeof diagnosticRules[number];
export const diagnosticRecordRef = (providerId: string): string => createHash('sha256').update(providerId).digest('hex').slice(0, 32);
export interface DiagnosticTrace { readonly events: readonly DiagnosticEvent[]; readonly dropped: number }
const traces = new AsyncLocalStorage<{ events: DiagnosticEvent[]; dropped: number }>();
// Async scope keeps concurrent checks independent without retaining traces in responses.
export function withDiagnosticTrace<T>(operation: () => T): T {
  return traces.getStore() ? operation() : traces.run({ events: [], dropped: 0 }, operation);
}
export function currentDiagnosticTrace(): DiagnosticTrace | undefined {
  const trace = traces.getStore();
  return trace && Object.freeze({ events: Object.freeze([...trace.events]), dropped: trace.dropped });
}
export type DiagnosticObserver = (event: DiagnosticEvent) => void;

export function classifyExtractionFailure(error: string): DiagnosticCategory {
  if (error === 'evidence.citations: quote must appear in supplied source') return 'citation';
  if (error === 'evidence.editions: duplicate values') return 'duplicate-id';
  if (/^evidence\.editions\[\d+\]\.date: date and precision disagree$/.test(error)) return 'date-precision';
  return 'shape';
}

export function emitDiagnostic(observer: DiagnosticObserver | undefined, event: DiagnosticEvent): void {
  if (!observer || !['catalog', 'allocation', 'prompt', 'envelope', 'identity', 'edition', 'transport', 'cover'].includes(event.stage) ||
    !['shape', 'citation', 'duplicate-id', 'date-precision', 'target-mismatch', 'bounds', 'trimmed', 'accepted'].includes(event.category)) return;
  const limits = { sources: 30, identities: 30, editions: 100 };
  for (const key of ['sources', 'identities', 'editions'] as const) {
    if (!Number.isSafeInteger(event[key]) || event[key] < 0 || event[key] > limits[key]) return;
  }
  if (event.provider !== undefined && !['apple', 'openlibrary', 'googlebooks', 'tavily', 'deepseek', 'hardcover'].includes(event.provider)) return;
  if (event.rule !== undefined && !diagnosticRules.includes(event.rule)) return;
  if (event.recordRef !== undefined && (typeof event.recordRef !== 'string' || !/^[a-f0-9]{32}$/.test(event.recordRef))) return;
  if (event.httpStatus !== undefined && (!Number.isInteger(event.httpStatus) || event.httpStatus < 100 || event.httpStatus > 599)) return;
  const safeContext = {
    ...(event.provider === undefined ? {} : { provider: event.provider }),
    ...(event.rule === undefined ? {} : { rule: event.rule }),
    ...(event.recordRef === undefined ? {} : { recordRef: event.recordRef }),
    ...(event.httpStatus === undefined ? {} : { httpStatus: event.httpStatus }),
  };
  const safe = Object.freeze({ stage: event.stage, category: event.category,
    sources: event.sources, identities: event.identities, editions: event.editions, ...safeContext });
  const trace = traces.getStore();
  if (trace) {
    if (trace.events.length >= 128) { trace.dropped++; return; }
    trace.events.push(safe);
  }
  try { observer(safe); } catch { /* Diagnostics cannot alter discovery. */ }
}

// Footprint counts saturate at the evidence caps; they do not report raw sizes.
export function diagnosticCounts(evidence: EvidenceBundle): Pick<DiagnosticEvent, 'sources' | 'identities' | 'editions'> {
  return { sources: Math.min(30, evidence.sources.length), identities: Math.min(30, evidence.identities.length),
    editions: Math.min(100, evidence.editions.length) };
}
