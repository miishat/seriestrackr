import { useCoverSearch } from './useCoverSearch';
import type { CoverAttribution, Series } from '../features/library/model';

const formatNames = { ebook: 'book', print: 'book', audio: 'audio' } as const;

export function CoverPicker({ series, market, onSelect }: { series: Series; market: string; onSelect: (url: string, attribution: CoverAttribution) => void }) {
  const { state, search, choose } = useCoverSearch(series, market);
  const busy = state.phase === 'searching';
  const failed = state.outcomes.filter(outcome => outcome.state !== 'ok');
  return <div className="cover-picker"><button type="button" onClick={() => void search()} disabled={busy}>{busy ? 'Searching...' : 'Find cover'}</button>
    {state.error && <p role="alert">{state.error}</p>}
    {state.phase === 'ready' && state.candidates.length === 0 && failed.some(outcome => outcome.state !== 'no-match') &&
      <p role="alert">Cover search incomplete. Some sources could not be checked. Try again or add a URL manually.</p>}
    {state.phase === 'ready' && state.candidates.length === 0 && !failed.some(outcome => outcome.state !== 'no-match') && <p>No covers found. You can still add a URL manually.</p>}
    {failed.length > 0 && <p role="status">{failed.map(outcome => `${outcome.provider}: ${outcome.state === 'no-match' ? 'no match' : outcome.state === 'quota' ? 'quota reached' : 'unavailable'}`).join('; ')}</p>}
    {state.candidates.length > 0 && <div className="cover-options" aria-label="Cover choices">{state.candidates.map(item =>
      <button type="button" key={item.id} disabled={!choose(item.id)}
        aria-label={`Select cover: ${item.title} by ${item.author}, ${item.provider}, ${formatNames[item.format]}, ${item.role} book`}
        onClick={() => { const picked = choose(item.id); if (picked) onSelect(picked.url, picked.attribution); }}>
        <img src={item.imageUrl} alt="" /></button>)}</div>}
  </div>;
}
