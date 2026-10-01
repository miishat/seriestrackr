import { useState, type FormEvent } from 'react';
import { CoverPicker } from '../../components/CoverPicker';
import { emptyRelease, type ReadingStatus, type Series } from './model';
import { nextPosition } from './progress';
import { ReleaseFields } from './ReleaseFields';

type Input = Omit<Series, 'id'>;
type Props = { series?: Series; market: string; onCreate: (value: Input) => void; onUpdate: (value: Series) => void; onCancel: () => void; onDelete?: () => void; error?: string | null };
const blank: Input = {
  name: '', author: '', readingStatus: 'active', lastFinished: null, currentBook: null,
  next: { positionOverride: null, title: '', orderNote: '', attribution: null }, publicationRunComplete: false,
  latestPublishedPosition: null, formats: { book: true, audio: true }, marketOverride: null,
  lastCheck: null, coverUrl: null, releases: { book: emptyRelease(), audio: emptyRelease() },
};
function numberOrNull(value: string): number | null { return value.trim() ? Number(value) : null; }

export function SeriesForm({ series, market, onCreate, onUpdate, onCancel, onDelete, error }: Props) {
  const [value, setValue] = useState<Series | Input>(series ?? blank);
  const [lastPosition, setLastPosition] = useState(series?.lastFinished?.position.toString() ?? '');
  const [lastTitle, setLastTitle] = useState(series?.lastFinished?.title ?? '');
  const [currentPosition, setCurrentPosition] = useState(series?.currentBook?.position.toString() ?? '');
  const [currentTitle, setCurrentTitle] = useState(series?.currentBook?.title ?? '');
  const [override, setOverride] = useState(series?.next.positionOverride?.toString() ?? '');
  const [latest, setLatest] = useState(series?.latestPublishedPosition?.toString() ?? '');
  const [otherMarket, setOtherMarket] = useState(series?.marketOverride && !['CA','US','GB'].includes(series.marketOverride) ? series.marketOverride : '');
  const [localError, setLocalError] = useState<string | null>(null);
  const customMarket = value.marketOverride && !['CA', 'US', 'GB', 'XX'].includes(value.marketOverride) ? value.marketOverride : null;
  const displayMarket = value.marketOverride === 'XX' ? otherMarket.trim().toUpperCase() || 'your chosen market' : value.marketOverride ?? market;
  const update = (patch: Partial<Input>) => setValue((old) => ({ ...old, ...patch }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = value.name.trim(), author = value.author.trim();
    if (!name) return setLocalError('Series name is required.');
    if (!author) return setLocalError('Author is required.');
    if (!!lastPosition !== !!lastTitle.trim()) return setLocalError('Last finished needs both book number and title.');
    if (!!currentPosition !== !!currentTitle.trim()) return setLocalError('Current book needs both book number and title.');
    if (!value.formats.book && !value.formats.audio) return setLocalError('Track at least one format.');
    if (value.readingStatus === 'completed' && !value.publicationRunComplete) return setLocalError('Confirm the publication run is complete before marking this series completed.');
    if (value.readingStatus === 'completed' && !lastPosition) return setLocalError('Last finished is required before marking this series completed.');
    if (value.readingStatus === 'completed' && latest && Number(lastPosition) < Number(latest)) return setLocalError('Last finished must reach the latest published book before marking this series completed.');
    const marketOverride = value.marketOverride === 'XX' ? otherMarket.trim().toUpperCase() : value.marketOverride;
    if (marketOverride && !/^[A-Z]{2}$/.test(marketOverride)) return setLocalError('Market must be a two-letter country code.');
    const changed = {
      ...value, name, author, marketOverride,
      lastFinished: lastPosition ? { position: Number(lastPosition), title: lastTitle.trim() } : null,
      currentBook: currentPosition ? { position: Number(currentPosition), title: currentTitle.trim() } : null,
      next: { ...value.next, positionOverride: numberOrNull(override) },
      latestPublishedPosition: numberOrNull(latest),
    };
    setLocalError(null);
    if (series) onUpdate(changed as Series); else onCreate(changed as Input);
  };
  const effective: Series = { id: series?.id ?? '', ...value };
  const position = override ? override : String(nextPosition(effective));
  return <form onSubmit={submit} noValidate>
    <p>Keep your place. Release dates refer to your preferred country, {displayMarket}, when supported. Each English format can use another country when no supported preferred-country date is found. Manual details stay yours to edit.</p>
    <div className="form-grid">
      <label>Series name<input required value={value.name} onChange={(event) => update({ name: event.target.value })} /></label>
      <label>Author<input required value={value.author} onChange={(event) => update({ author: event.target.value })} /></label>
      <label>Reading status<select value={value.readingStatus} onChange={(event) => update({ readingStatus: event.target.value as ReadingStatus })}>
        <option value="active">Active</option><option value="paused">Paused</option><option value="dropped">Dropped</option><option value="completed">Completed</option>
      </select></label>
      <label>Release market<select value={value.marketOverride ?? ''} onChange={(event) => update({ marketOverride: event.target.value || null })}>
        <option value="">Use default: {market}</option><option value="CA">Canada</option><option value="US">United States</option><option value="GB">United Kingdom</option>{customMarket && <option value={customMarket}>Other country: {customMarket}</option>}<option value="XX">Other country</option>
      </select></label>
      {value.marketOverride === 'XX' && <label>Other market code<input maxLength={2} value={otherMarket} onChange={(event) => setOtherMarket(event.target.value)} /></label>}
    </div>
    <fieldset><legend>Last finished</legend><div className="form-grid">
      <label>Last finished book number<input type="number" min="1" step="1" value={lastPosition} onChange={(event) => setLastPosition(event.target.value)} /></label>
      <label>Last finished title<input value={lastTitle} onChange={(event) => setLastTitle(event.target.value)} /></label>
    </div><p className="small">Leave both blank if you have not finished a book. Finishing either format counts.</p></fieldset>
    <fieldset><legend>Next unread · Book {position}</legend>
      <div className="form-grid"><label>Next book title<input value={value.next.title} onChange={(event) => update({ next: { ...value.next, title: event.target.value, attribution: event.target.value === value.next.title ? value.next.attribution : null } })} placeholder="Title not entered" /></label>
        <label>Cover URL<input type="url" value={value.coverUrl ?? ''} onChange={(event) => update({ coverUrl: event.target.value || null })} placeholder="https://example.com/cover.jpg" /></label>
      </div>
      <CoverPicker series={effective} onSelect={(url) => update({ coverUrl: url })} />
      <div className="checkbox-row"><label><input type="checkbox" checked={value.formats.book} onChange={(event) => update({ formats: { ...value.formats, book: event.target.checked } })} /> Track book</label>
        <label><input type="checkbox" checked={value.formats.audio} onChange={(event) => update({ formats: { ...value.formats, audio: event.target.checked } })} /> Track audiobook</label></div>
      <ReleaseFields format="book" value={value.releases.book} onChange={(book) => update({ releases: { ...value.releases, book: { ...book, provenance: null } } })} />
      <ReleaseFields format="audio" value={value.releases.audio} onChange={(audio) => update({ releases: { ...value.releases, audio: { ...audio, provenance: null } } })} />
    </fieldset>
    <details><summary>Optional progress and series details</summary><div className="form-grid">
      <label>Current book number<input type="number" min="1" step="any" value={currentPosition} onChange={(event) => setCurrentPosition(event.target.value)} /></label>
      <label>Current book title<input value={currentTitle} onChange={(event) => setCurrentTitle(event.target.value)} /></label>
      <label>Next position override<input type="number" min="0.1" step="any" value={override} onChange={(event) => setOverride(event.target.value)} /></label>
      <label>Next order note<input value={value.next.orderNote} onChange={(event) => update({ next: { ...value.next, orderNote: event.target.value } })} /></label>
      <label>Latest published book number<input type="number" min="1" step="any" value={latest} onChange={(event) => setLatest(event.target.value)} /></label>
      <label className="checkbox-label"><input type="checkbox" checked={value.publicationRunComplete} onChange={(event) => update({ publicationRunComplete: event.target.checked })} /> Publication run complete</label>
    </div></details>
    {(localError || error) && <p role="alert" className="form-error">{localError || error}</p>}
    <div className="actions">{series && <button type="button" className="danger-link" onClick={onDelete}>Delete series</button>}<span className="spacer" /><button type="button" onClick={onCancel}>Cancel</button><button className="primary" type="submit">Save series</button></div>
  </form>;
}
