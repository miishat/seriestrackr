import type { Capabilities, CheckResponse, DiscoverySnapshot } from '../../../shared/discovery';

export interface DiscoverySession {
  seriesId: string;
  phase: 'preparing' | 'ready' | 'checking' | 'review' | 'error';
  capabilities: Capabilities | null;
  snapshot: DiscoverySnapshot | null;
  response: CheckResponse | null;
  error: string | null;
}

// What a check may spend or wait for. Everything beyond the free catalogs is opt in.
export interface RunOptions { useAi: boolean; useSearch: boolean; fallbackMarkets: boolean }
export const sourceOnly: RunOptions = { useAi: false, useSearch: false, fallbackMarkets: false };
