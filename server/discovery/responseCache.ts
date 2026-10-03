// Short-lived cache of successful catalog responses, shared across checks. It saves the
// provider rate-limit waits when a failed check is retried or series share a query.
export interface ResponseCache { get(key: string): { value: unknown } | undefined; set(key: string, value: unknown): void }

// API keys travel in the query string for some providers; they must never become part of a key.
export function responseKey(provider: string, path: string): string {
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query); params.delete('key');
  return `${provider}:${pathname}?${params}`;
}

export function createResponseCache(ttlMs = 30 * 60_000, now: () => number = Date.now, limit = 500): ResponseCache {
  const entries = new Map<string, { value: unknown; expires: number }>();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expires <= now()) { entries.delete(key); return undefined; }
      return { value: entry.value };
    },
    set(key, value) {
      entries.delete(key); entries.set(key, { value, expires: now() + ttlMs });
      for (const oldest of entries.keys()) { if (entries.size <= limit) break; entries.delete(oldest); }
    },
  };
}
