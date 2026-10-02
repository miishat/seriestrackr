import type { Provider } from '../../shared/discovery';

// Per-check request ceilings. One context is created for each check and is
// shared by the initial and enrichment catalogue phases, so late identity
// enrichment can never reset a counter or spend a second Hardcover request.
const caps: Record<Provider, number> = {
  hardcover: 1, googlebooks: 2, apple: 12, openlibrary: 3, tavily: 3, deepseek: 1,
};
const APPLE_HTML_STARTS = 6;

export function createRetrievalContext() {
  const counts = Object.fromEntries(Object.keys(caps).map(provider => [provider, 0])) as Record<Provider, number>;
  const cache = new Map<string, Promise<unknown>>();
  let htmlStarts = 0;
  const allowed = (provider: Provider, html: boolean) =>
    !(html && provider !== 'apple') && counts[provider] < caps[provider] && !(html && htmlStarts >= APPLE_HTML_STARTS);
  return {
    cache,
    // Claim only when a request actually starts on its transport queue.
    claim(provider: Provider, html = false): boolean {
      if (!allowed(provider, html)) return false;
      counts[provider]++;
      if (html) htmlStarts++;
      return true;
    },
    canClaim: (provider: Provider, html = false): boolean => allowed(provider, html),
    snapshot: (): Record<Provider, number> => ({ ...counts }),
  };
}
export type RetrievalContext = ReturnType<typeof createRetrievalContext>;
export type RetrievalPhase = 'initial' | 'enrich';
