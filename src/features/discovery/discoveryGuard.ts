import type { DiscoverySnapshot } from '../../../shared/discovery';

export interface DiscoveryGuard {
  begin(seriesId: string, requestId: string): DiscoverySnapshot;
  isCurrent(snapshot: DiscoverySnapshot): boolean;
  touch(seriesId: string): void;
  replace(): void;
  cancel(seriesId: string): void;
}

export function createDiscoveryGuard(): DiscoveryGuard {
  let epoch = 0;
  const revisions = new Map<string, number>();
  const requests = new Map<string, string>();
  return {
    begin(seriesId, requestId) {
      requests.set(seriesId, requestId);
      return { seriesId, requestId, epoch, revision: revisions.get(seriesId) ?? 0 };
    },
    isCurrent(snapshot) {
      return snapshot.epoch === epoch && snapshot.revision === (revisions.get(snapshot.seriesId) ?? 0)
        && requests.get(snapshot.seriesId) === snapshot.requestId;
    },
    touch(seriesId) { revisions.set(seriesId, (revisions.get(seriesId) ?? 0) + 1); },
    replace() { epoch += 1; requests.clear(); },
    cancel(seriesId) { requests.delete(seriesId); },
  };
}
