import { useState } from 'react';
import { useCoverSearch } from './useCoverSearch';
import { CoverChoice, providerNames } from './CoverChoice';
import type { CoverAttribution, Series } from '../features/library/model';

const outcomeText = { 'no-match': 'no match', quota: 'quota reached', failed: 'unavailable', ok: 'checked' } as const;
interface Previous { url: string | null; attribution: CoverAttribution | null }
// A pick session is only live while the form still holds the picked cover for the same series and author.
interface Session { previous: Previous; chosenId: string; seriesId: string; author: string; url: string }

export function CoverPicker({ series, market, onSelect, onUndo, onAuthorSuggestion }: {
  series: Series; market: string;
  onSelect: (url: string, attribution: CoverAttribution) => void;
  onUndo?: (url: string | null, attribution: CoverAttribution | null) => void;
  onAuthorSuggestion?: (author: string) => void;
}) {
  const { state, search, choose } = useCoverSearch(series, market);
  const [stored, setStored] = useState<Session | null>(null);
  const session = stored && stored.seriesId === series.id && stored.author === series.author && stored.url === series.coverUrl ? stored : null;
  const chosenId = session?.chosenId ?? null;
  const previous = session?.previous ?? null;
  const busy = state.phase === 'searching';
  const trouble = state.outcomes.filter(outcome => outcome.state !== 'ok');
  const incomplete = trouble.some(outcome => outcome.state !== 'no-match');
  const pick = (id: string) => {
    const picked = choose(id);
    if (!picked) return;
    setStored({ previous: session?.previous ?? { url: series.coverUrl, attribution: series.coverAttribution }, chosenId: id,
      seriesId: series.id, author: series.author, url: picked.url });
    onSelect(picked.url, picked.attribution);
  };
  const undo = () => {
    if (!previous || !onUndo) return;
    onUndo(previous.url, previous.attribution);
    setStored(null);
  };
  return <div className="cover-picker">
    <div className="cover-picker-bar">
      <button type="button" onClick={() => { setStored(current => current && { ...current, chosenId: '' }); void search(); }} disabled={busy}>{busy ? 'Searching...' : 'Find cover'}</button>
      <span className="small">Optional. Covers are only searched when you ask.</span>
    </div>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.phase === 'ready' && state.candidates.length === 0 && incomplete &&
      <p role="alert">Cover search incomplete. Some sources could not be checked. Try again or add a URL manually.</p>}
    {state.phase === 'ready' && state.candidates.length === 0 && !incomplete && <p>No covers found. You can still add a URL manually.</p>}
    {trouble.length > 0 && <p className="small" role="status">{trouble.map(outcome => `${providerNames[outcome.provider]}: ${outcomeText[outcome.state]}`).join('; ')}</p>}
    {state.authorSuggestions.length > 0 && onAuthorSuggestion && <ul className="author-suggestions" aria-label="Author spelling suggestions">
      {state.authorSuggestions.map(item => <li key={item.author} className="note">
        <span>Sources spell the author <strong>{item.author}</strong> for {item.title}. Your saved author is unchanged until you edit it here and save.</span>
        <button type="button" onClick={() => onAuthorSuggestion(item.author)}>Use {item.author} in the form</button></li>)}
    </ul>}
    {state.candidates.length > 0 && <div className="cover-options" role="group" aria-label="Cover choices">{state.candidates.map(item =>
      <CoverChoice key={item.id} item={item} chosen={chosenId === item.id} reason={item.format === 'audio' ? null : choose(item.id) ? null : 'Not a usable portrait book cover.'}
        onChoose={() => pick(item.id)} />)}</div>}
    {previous && onUndo && <button type="button" onClick={undo}>Undo cover choice</button>}
  </div>;
}
