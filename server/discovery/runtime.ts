import type { DiscoveryConfig } from './config';
import { collectHardcover } from './hardcover';
import { collectCatalogs } from './catalogs';
import { searchEvidence } from './search';
import { extractEvidence } from './deepseek';
import type { DiscoveryDependencies } from './runDiscovery';
import type { CoverRequest, CoverResult } from '../../shared/covers';
import { collectCoverCandidates } from './covers';
import type { DiagnosticObserver } from './diagnostics';
import { createRetrievalContext } from './retrievalContext';

// No per-check state lives in this factory. Catalog counters are local to its
// single check's retrieval context, created by runDiscovery, and the
// existing catalog provider queues remain global across runtimes/checks.
export function createDiscoveryRuntime(config: DiscoveryConfig, fetcher: typeof fetch = fetch,
  options: { onDiagnostic?: DiagnosticObserver } = {}): DiscoveryDependencies & { covers: (request: CoverRequest, signal: AbortSignal) => Promise<CoverResult> } {
  return {
    covers: (request, signal) => collectCoverCandidates(request, config, signal, fetcher, options.onDiagnostic),
    catalogs: async (request, markets, signal, context = createRetrievalContext(), phase = 'initial', seed) => {
      // Enrichment reuses the identity already retained; it never spends a second Hardcover request.
      const hardcover = phase === 'initial'
        ? await collectHardcover(request, config.hardcoverToken, signal, fetcher, options.onDiagnostic, context) : null;
      const catalogs = await collectCatalogs(request, markets, signal, fetcher, { googleBooksKey: config.googleBooksKey,
        onDiagnostic: options.onDiagnostic, seedEvidence: hardcover ? hardcover.evidence : seed, appleIsbnJoin: true, appleProductPages: true,
        context, phase });
      catalogs.reasons = [...new Set([...(hardcover?.reasons ?? []), ...catalogs.reasons])];
      if (hardcover?.covers) catalogs.covers = hardcover.covers;
      return catalogs;
    },
    search: (query, signal) => searchEvidence(query, config, signal, fetcher),
    extract: (request, evidence, signal) => extractEvidence(request, evidence, config, signal, fetcher, options.onDiagnostic),
    onDiagnostic: options.onDiagnostic,
    now: () => new Date().toISOString(), canSearch: Boolean(config.tavilyKey?.trim()), canExtract: Boolean(config.deepseekKey?.trim()),
  };
}


