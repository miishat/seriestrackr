import { useId, useState, type FormEvent } from 'react';
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
  lastCheck: null, autoUpdate: null, coverUrl: null, coverAttribution: null, releases: { book: emptyRelease(), audio: emptyRelease() },
};
function numberOrNull(value: string): number | null { return value.trim() ? Number(value) : null; }

export function SeriesForm({ series, market, onCreate, onUpdate, onCancel, onDelete, error }: Props) {
  const tabId = useId();
  const [tab, setTab] = useState<'series' | 'releases' | 'cover'>('series');
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
  const update = (patch: Partial<Input>) => setValue((old) => ({ ...old, ...patch }));
  // A chosen automatic cover belongs to the title and author it was found for; a manual URL is kept.
  const dropAutomaticCover = (): Partial<Input> => value.coverAttribution ? { coverUrl: null, coverAttribution: null } : {};
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
  // The draft progress and override feed the cover search key, so editing them invalidates any pending or ready result.
  const draftLast = lastPosition && Number.isFinite(Number(lastPosition)) ? { position: Number(lastPosition), title: lastTitle.trim() } : null;
  const draftOverride = override.trim() && Number.isFinite(Number(override)) ? Number(override) : null;
  const effective: Series = { id: series?.id ?? '', ...value, lastFinished: draftLast, next: { ...value.next, positionOverride: draftOverride } };
  const coverMarket = value.marketOverride === 'XX' ? otherMarket.trim().toUpperCase() || market : value.marketOverride ?? market;
  const position = override ? override : String(nextPosition(effective));
  return <form className="series-editor" onSubmit={submit} noValidate>
    <div className="editor-tabs" role="tablist" aria-label="Series editor sections">
      {(['series', 'releases', 'cover'] as const).map((section, index) => <button key={section} type="button" role="tab" id={`${tabId}-${section}-tab`} aria-controls={`${tabId}-${section}`} aria-selected={tab === section} tabIndex={tab === section ? 0 : -1} onClick={() => setTab(section)} onKeyDown={(event) => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const sections = ['series', 'releases', 'cover'] as const;
          const target = event.key === 'Home' ? 'series' : event.key === 'End' ? 'cover' : sections[(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
          setTab(target); document.getElementById(`${tabId}-${target}-tab`)?.focus();
        }
      }}>{index === 0 ? 'Series & Progress' : index === 1 ? 'Next Book & Releases' : 'Cover & Notes'}</button>)}
    </div>
    <div className="editor-scroll">
    <section role="tabpanel" id={`${tabId}-series`} aria-labelledby={`${tabId}-series-tab`} hidden={tab !== 'series'}>
    <fieldset><legend>Series Details</legend>
    <div className="form-grid">
      <label>Name<input required value={value.name} onChange={(event) => update({ name: event.target.value })} /></label>
      <label>Author<input required value={value.author} onChange={(event) => update({ author: event.target.value, ...dropAutomaticCover() })} /></label>
      <label>Reading Status<select value={value.readingStatus} onChange={(event) => update({ readingStatus: event.target.value as ReadingStatus, ...(event.target.value === 'completed' ? { publicationRunComplete: true } : {}) })}>
        <option value="active">Active</option><option value="paused">Paused</option><option value="dropped">Dropped</option><option value="completed">Completed</option>
      </select></label>
      <label>Release Market<select value={value.marketOverride ?? ''} onChange={(event) => update({ marketOverride: event.target.value || null })}>
        <option value="">Use default: {market}</option><option value="CA">Canada</option><option value="US">United States</option><option value="GB">United Kingdom</option>{customMarket && <option value={customMarket}>Other country: {customMarket}</option>}<option value="XX">Other country</option>
      </select></label>
      {value.marketOverride === 'XX' && <label>Other market code<input maxLength={2} value={otherMarket} onChange={(event) => setOtherMarket(event.target.value)} /></label>}
    </div>
    </fieldset>
    <fieldset><legend>Last Finished</legend><div className="form-grid">
      <label>Book Number<input type="number" min="1" step="1" value={lastPosition} onChange={(event) => { setLastPosition(event.target.value); update(dropAutomaticCover()); }} /></label>
      <label>Title<input value={lastTitle} onChange={(event) => { setLastTitle(event.target.value); update(dropAutomaticCover()); }} /></label>
    </div></fieldset>
    <fieldset><legend>Optional Progress</legend><div className="form-grid">
      <label>Current Book Number<input type="number" min="1" step="any" value={currentPosition} onChange={(event) => setCurrentPosition(event.target.value)} /></label>
      <label>Current Book Title<input value={currentTitle} onChange={(event) => setCurrentTitle(event.target.value)} /></label>
    </div></fieldset>
    </section>
    <section role="tabpanel" id={`${tabId}-releases`} aria-labelledby={`${tabId}-releases-tab`} hidden={tab !== 'releases'}>
    <fieldset><legend>Next Unread</legend>
      <div className="form-grid editor-next-book"><label>Book Number<input type="number" value={position} readOnly /></label><label>Title<input value={value.next.title} onChange={(event) => update({ next: { ...value.next, title: event.target.value, attribution: event.target.value === value.next.title ? value.next.attribution : null }, ...(event.target.value === value.next.title ? {} : dropAutomaticCover()) })} placeholder="Title not entered" /></label>
      </div>
      <label className="editor-tracking">Tracking<select value={value.formats.book && value.formats.audio ? 'both' : value.formats.book ? 'book' : 'audio'} onChange={(event) => update({ formats: { book: event.target.value !== 'audio', audio: event.target.value !== 'book' } })}><option value="book">Book</option><option value="audio">Audiobook</option><option value="both">Both</option></select></label>
    </fieldset>
      <ReleaseFields format="book" value={value.releases.book} onChange={(book) => update({ releases: { ...value.releases, book: { ...book, provenance: null } } })} />
      <ReleaseFields format="audio" value={value.releases.audio} onChange={(audio) => update({ releases: { ...value.releases, audio: { ...audio, provenance: null } } })} />
    </section>
    <section role="tabpanel" id={`${tabId}-cover`} aria-labelledby={`${tabId}-cover-tab`} hidden={tab !== 'cover'}><fieldset><legend>Cover</legend>      <CoverPicker series={effective} market={coverMarket} onSelect={(url, attribution) => update({ coverUrl: url, coverAttribution: attribution })}
        onUndo={(url, attribution) => update({ coverUrl: url, coverAttribution: attribution })}
        onAuthorSuggestion={(author) => update({ author, ...dropAutomaticCover() })} urlField={<div className="editor-cover-url"><label>Cover URL<input type="url" value={value.coverUrl ?? ''} onChange={(event) => update({ coverUrl: event.target.value || null, coverAttribution: null })} placeholder="https://example.com/cover.jpg" /></label></div>} />

</fieldset><fieldset><legend>Notes</legend><label>Personal Notes<textarea rows={4} value={value.notes ?? ''} onChange={(event) => update({ notes: event.target.value })} placeholder="Anything you want to remember about this series." /></label></fieldset></section>
    </div>
    {(localError || error) && <p role="alert" className="form-error">{localError || error}</p>}
    <div className="actions">{series && <button type="button" className="danger-link" onClick={onDelete}>Delete</button>}<button type="button" onClick={onCancel}>Cancel</button><button className="primary" type="submit">Save</button></div>
  </form>;
}
