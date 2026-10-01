import type { Capabilities, CheckResponse, DiscoverySnapshot } from '../../../shared/discovery';

export interface DiscoverySession {
  seriesId: string;
  phase: 'preparing' | 'ready' | 'checking' | 'review' | 'error';
  capabilities: Capabilities | null;
  snapshot: DiscoverySnapshot | null;
  response: CheckResponse | null;
  error: string | null;
}
