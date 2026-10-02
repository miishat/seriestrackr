import { useEffect, useRef, useState } from 'react';
import type { CoverCandidate } from '../../../shared/covers';
import { CoverChoice } from '../../components/CoverChoice';
import { decodeCover, rankCovers, selectableCover } from '../../services/coverImages';

type Loaded = { requestId: string; items: CoverCandidate[]; dropped: number };

// Cover artwork from one check. Nothing is fetched until the user asks; a new check, a close or an unmount aborts decoding.
export function ReviewCovers({ requestId, candidates, incomplete, reasonFor, chosenId, onChoose, onDecoded }: {
  requestId: string; candidates: CoverCandidate[]; incomplete: boolean; onDecoded: (items: CoverCandidate[]) => void;
  reasonFor: (item: CoverCandidate) => string | null; chosenId: string | null; onChoose: (id: string | null) => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const cancel = () => { generation.current += 1; controller.current?.abort(); controller.current = null; };
  useEffect(() => { setLoaded(null); setLoading(false); return cancel; }, [requestId]);
  const load = async () => {
    cancel();
    const token = generation.current;
    const active = new AbortController();
    controller.current = active;
    setLoading(true);
    const decoded = await Promise.all(candidates.map(item => decodeCover(item, active.signal)));
    if (token !== generation.current || active.signal.aborted) return;
    const items = rankCovers(decoded.filter((item): item is CoverCandidate => item !== null));
    setLoaded({ requestId, items, dropped: candidates.length - items.length });
    onDecoded(items);
    setLoading(false);
  };
  const current = loaded?.requestId === requestId ? loaded : null;
  return <div className="review-covers">
    {candidates.length === 0 && <p>No cover artwork was offered by this check. You can still add a cover URL in the series form.</p>}
    {candidates.length > 0 && !current && <>
      <p>{candidates.length} named cover {candidates.length === 1 ? 'choice was' : 'choices were'} found. Images load only when you ask.</p>
      <button type="button" disabled={loading} onClick={() => void load()}>{loading ? 'Loading cover previews...' : 'Load cover previews'}</button></>}
    {incomplete && <p className="note warn">Some cover sources could not be fully checked. Covers shown come from the sources that responded.</p>}
    {current && current.items.length === 0 && <p>None of the offered covers could be verified as usable artwork.</p>}
    {current && current.dropped > 0 && current.items.length > 0 && <p className="small">{current.dropped} offered {current.dropped === 1 ? 'cover' : 'covers'} could not be loaded or were not book-shaped, and are hidden.</p>}
    {current && current.items.length > 0 && <div className="cover-options" role="group" aria-label="Cover choices">{current.items.map(item =>
      <CoverChoice key={item.id} item={item} chosen={chosenId === item.id}
        reason={selectableCover(item) ? reasonFor(item) : null}
        onChoose={() => onChoose(chosenId === item.id ? null : item.id)} />)}</div>}
    {current && chosenId && <button type="button" onClick={() => onChoose(null)}>Keep my current cover</button>}
  </div>;
}
