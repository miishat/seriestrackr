import type { CoverCandidate, CoverRequest, CoverResult } from '../../shared/covers';
import { isPortrait, parseCoverResult } from '../../shared/coverValidation';

export { isPortrait };

// Loaded pixels, not provider metadata, decide whether an image is a usable cover.
export function decodeCover(candidate: CoverCandidate, signal: AbortSignal): Promise<CoverCandidate | null> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(null); return; }
    const image = new Image();
    let done = false;
    const finish = (value: CoverCandidate | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      image.onload = null;
      image.onerror = null;
      if (!value) image.src = '';
      resolve(value);
    };
    const abort = () => finish(null);
    const timer = setTimeout(abort, 10000);
    signal.addEventListener('abort', abort, { once: true });
    image.onerror = abort;
    image.onload = () => {
      const width = image.naturalWidth, height = image.naturalHeight;
      const audioSquare = candidate.format === 'audio' && width > 0 && width === height;
      finish(isPortrait(width, height) || audioSquare ? { ...candidate, width, height } : null);
    };
    image.src = candidate.imageUrl;
  });
}

// Next-book covers precede previous-book alternatives; then portrait books before audio art, then larger images.
export function rankCovers(candidates: CoverCandidate[]): CoverCandidate[] {
  const area = (item: CoverCandidate) => (item.width ?? 0) * (item.height ?? 0);
  return [...candidates].sort((left, right) => Number(left.role === 'previous') - Number(right.role === 'previous') ||
    Number(left.format === 'audio') - Number(right.format === 'audio') || area(right) - area(left));
}

// Square audio art is reviewable only; the portrait book card may select decoded portrait covers.
export const selectableCover = (candidate: CoverCandidate): boolean =>
  candidate.format !== 'audio' && candidate.width !== null && candidate.height !== null && isPortrait(candidate.width, candidate.height);

export async function fetchCoverCandidates(request: CoverRequest, signal: AbortSignal): Promise<CoverResult> {
  if (signal.aborted) throw new DOMException('Cover search cancelled.', 'AbortError');
  let reply: Response;
  try {
    reply = await fetch('/api/discovery/covers', { method: 'POST', signal, mode: 'same-origin', credentials: 'same-origin', redirect: 'error', cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
  } catch (error) {
    if (signal.aborted) throw new DOMException('Cover search cancelled.', 'AbortError');
    throw new Error('Cover service is unavailable. Start the local discovery service and try again.');
  }
  if (!reply.ok) throw new Error(reply.status === 409 ? 'Discovery is busy. Try again when the current check finishes.' : 'Cover search failed.');
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(reply.headers.get('Content-Type') ?? '')) throw new Error('Cover service returned an invalid response.');
  let body: unknown;
  try { body = await reply.json(); } catch { throw new Error('Cover service returned an invalid response.'); }
  const parsed = parseCoverResult(body);
  if (!parsed.ok || parsed.value.requestId !== request.requestId || parsed.value.seriesId !== request.seriesId) throw new Error('Cover service returned an invalid response.');
  return parsed.value;
}
