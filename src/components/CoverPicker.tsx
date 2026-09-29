import { useState } from 'react';
import { fetchCoverImageUrls } from '../services/covers';
import type { Series } from '../features/library/model';

export function CoverPicker({ series, onSelect }: { series: Series; onSelect: (url: string) => void }) {
  const [urls, setUrls] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const find = async () => {
    setBusy(true); setError(null);
    try { setUrls(await fetchCoverImageUrls(series.name, series.author, series.lastFinished?.title ?? '', series.next.title)); }
    catch { setError('Cover search failed. Check your connection and try again.'); }
    finally { setBusy(false); }
  };
  return <div className="cover-picker"><button type="button" onClick={find} disabled={busy}>{busy ? 'Searching...' : 'Find cover'}</button>
    {error && <p role="alert">{error}</p>}
    {urls?.length === 0 && <p>No covers found. You can still add a URL manually.</p>}
    {urls && urls.length > 0 && <div className="cover-options" aria-label="Cover choices">{urls.map((url) => <button type="button" key={url} onClick={() => onSelect(url)} aria-label="Select cover"><img src={url} alt="Possible book cover" /></button>)}</div>}
  </div>;
}
