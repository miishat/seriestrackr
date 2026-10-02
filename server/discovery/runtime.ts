import type { DiscoveryConfig } from './config';
import { collectHardcover } from './hardcover';
import { collectCatalogs } from './catalogs';
import { searchEvidence } from './search';
import { extractEvidence } from './deepseek';
import type { DiscoveryDependencies } from './runDiscovery';
import type { DiagnosticObserver } from './diagnostics';

// No per-check state lives in this factory. Catalog counters are local to its
// single collection, orchestrator counters are local to runDiscovery, and the
// existing catalog provider queues remain global across runtimes/checks.
export function createDiscoveryRuntime(config: DiscoveryConfig, fetcher: typeof fetch = fetch,
  options: { onDiagnostic?: DiagnosticObserver } = {}): DiscoveryDependencies {
  return {
    catalogs: async (request, markets, signal) => {
      const hardcover = await collectHardcover(request, config.hardcoverToken, signal, fetcher, options.onDiagnostic);
      const catalogs = await collectCatalogs(request, markets, signal, fetcher, { googleBooksKey: config.googleBooksKey,
        onDiagnostic: options.onDiagnostic, seedEvidence: hardcover.evidence, appleIsbnJoin: true, appleProductPages: true });
      catalogs.usage.hardcover = hardcover.usage.hardcover;
      catalogs.reasons = [...new Set([...hardcover.reasons, ...catalogs.reasons])];
      return catalogs;
    },
    search: (query, signal) => searchEvidence(query, config, signal, fetcher),
    extract: (request, evidence, signal) => extractEvidence(request, evidence, config, signal, fetcher, options.onDiagnostic),
    onDiagnostic: options.onDiagnostic,
    now: () => new Date().toISOString(), canSearch: Boolean(config.tavilyKey?.trim()), canExtract: Boolean(config.deepseekKey?.trim()),
  };
}


