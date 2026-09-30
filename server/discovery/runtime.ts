import type { DiscoveryConfig } from './config';
import { collectCatalogs } from './catalogs';
import { searchEvidence } from './search';
import { extractEvidence } from './deepseek';
import type { DiscoveryDependencies } from './runDiscovery';

// No per-check state lives in this factory. Catalog counters are local to its
// single collection, orchestrator counters are local to runDiscovery, and the
// existing catalog provider queues remain global across runtimes/checks.
export function createDiscoveryRuntime(config: DiscoveryConfig, fetcher: typeof fetch = fetch): DiscoveryDependencies {
  return {
    catalogs: (request, markets, signal) => collectCatalogs(request, markets, signal, fetcher, { googleBooksKey: config.googleBooksKey }),
    search: (query, signal) => searchEvidence(query, config, signal, fetcher),
    extract: (request, evidence, signal) => extractEvidence(request, evidence, config, signal, fetcher),
    now: () => new Date().toISOString(), canSearch: Boolean(config.tavilyKey?.trim()), canExtract: Boolean(config.deepseekKey?.trim()),
  };
}
