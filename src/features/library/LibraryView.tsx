import { useEffect, useRef, useState } from 'react';
import type { LibraryDocument, ReadingStatus, ReleaseState, Series } from './model';
import { displaySeriesRelease } from './releases';
import { SeriesCard } from './SeriesCard';
import { SeriesTable } from './SeriesTable';

const states: [ReleaseState, string][] = [['not-checked','Not checked'],['not-found','Not Found'],['catalogued','Listed'],['announced','Announced'],['scheduled','Scheduled'],['released','Available']];
function FilterMenu<T extends string>({ label, allLabel, options, selected, onChange }: {
  label: string; allLabel: string; options: readonly (readonly [T, string])[]; selected: T[]; onChange: (values: T[]) => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (menu.current?.open && event.target instanceof Node && !menu.current.contains(event.target)) {
        menu.current.open = false;
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  const toggle = (value: T, checked: boolean) => onChange(checked ? [...selected, value] : selected.filter((item) => item !== value));
  return <details ref={menu} className="filter-menu" name="library-status-filter" onKeyDown={event => {
    if (event.key === 'Escape' && menu.current?.open) {
      event.preventDefault();
      menu.current.open = false;
      menu.current.querySelector('summary')?.focus();
    }
  }}><summary>{selected.length ? `${label}: ${selected.length} selected` : allLabel}</summary>
    <div className="filter-panel" role="group" aria-label={label}>{options.map(([value, text]) => <label key={value}><input type="checkbox" aria-label={`${label}: ${text}`} checked={selected.includes(value)} onChange={(event) => toggle(value, event.target.checked)} />{text}</label>)}</div>
  </details>;
}
export function LibraryView({ doc, today, onEdit, onFinish, onCheck, checkingSeriesId = null, onAdd, onView, onCheckAll, batchRunning = false, summaryFilter, onUndoAuto }: {
  summaryFilter?: { kind: 'all' | 'book' | 'audio'; sequence: number } | null;
  onCheckAll?: (seriesIds: string[]) => void; onUndoAuto?: (series: Series) => void; batchRunning?: boolean;
  doc: LibraryDocument; today: string; onEdit: (series: Series) => void; onFinish: (series: Series) => void; onCheck?: (series: Series) => void; checkingSeriesId?: string | null; onAdd: () => void; onView: (view: LibraryDocument['settings']['view']) => void;
}) {
  const [query, setQuery] = useState('');
  const [reading, setReading] = useState<ReadingStatus[]>([]);
  const [book, setBook] = useState<ReleaseState[]>([]);
  const [audio, setAudio] = useState<ReleaseState[]>([]);
  useEffect(() => {
    if (!summaryFilter) return;
    setQuery(''); setReading([]);
    setBook(summaryFilter.kind === 'book' ? ['released'] : []);
    setAudio(summaryFilter.kind === 'audio' ? ['released'] : []);
  }, [summaryFilter]);
  const filtered = doc.series.filter((s) => {
    if ((book.length > 0 || audio.length > 0) && s.readingStatus === 'completed') return false;
    const matchQuery = `${s.name} ${s.author}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    const matchReading = !reading.length || reading.includes(s.readingStatus);
    const matchBook = !book.length || (s.formats.book && book.includes(displaySeriesRelease(s, 'book', today)));
    const matchAudio = !audio.length || (s.formats.audio && audio.includes(displaySeriesRelease(s, 'audio', today)));
    return matchQuery && matchReading && matchBook && matchAudio;
  });
  return <main>
    <div className="library-tools">
      <div className="library-search-row">
        <label className="visually-hidden" htmlFor="library-search">Search series or author</label><input id="library-search" type="search" placeholder="Search series or author" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button className="primary" onClick={onAdd}>Add series</button>
      </div>
      <div className="library-options-row">
        <div className="library-filter-group" role="group" aria-labelledby="library-filters-label">
          <span className="visually-hidden" id="library-filters-label">Filters</span>
          <div className="library-filters">
      <FilterMenu<ReadingStatus> label="Reading status" allLabel="All reading statuses" options={['active','paused','dropped','completed'].map((item) => [item as ReadingStatus, item[0].toUpperCase() + item.slice(1)] as const)} selected={reading} onChange={setReading} />
      <FilterMenu label="Book availability" allLabel="All book statuses" options={states} selected={book} onChange={setBook} />
      <FilterMenu label="Audiobook availability" allLabel="All audiobook statuses" options={states} selected={audio} onChange={setAudio} />
          </div>
        </div>
        <div className="library-view-group">
        {onCheckAll && <button disabled={batchRunning || !filtered.some(s => s.readingStatus === 'active')} onClick={() => onCheckAll(filtered.filter(s => s.readingStatus === 'active').map(s => s.id))}>Check visible releases</button>}
          <span className="visually-hidden" id="library-view-label">View</span>
          <div className="view-switch" role="group" aria-labelledby="library-view-label">{(['grid','compact','list'] as const).map((view) => <button key={view} aria-pressed={doc.settings.view === view} onClick={() => onView(view)}>{view === 'list' ? 'Table' : view[0].toUpperCase() + view.slice(1)}</button>)}</div>
        </div>
      </div>
    </div>
    {doc.series.length === 0 ? <div className="empty"><div className="eyebrow">A fresh start</div><h2>Your bookshelf is empty</h2><p>Add a series, then keep its next book and audiobook releases in one place.</p><button className="primary" onClick={onAdd}>Add your first series</button></div>
      : filtered.length === 0 ? <div className="empty"><h2>No matching series</h2><p>Try another search or filter.</p></div>
      : doc.settings.view === 'list' ? <SeriesTable series={filtered} today={today} market={doc.settings.market ?? ''} onEdit={onEdit} onFinish={onFinish} onCheck={onCheck} onUndoAuto={onUndoAuto} checkingSeriesId={checkingSeriesId} checkDisabled={batchRunning} showCovers={doc.settings.showCovers} />
      : <div className={`cards ${doc.settings.view === 'compact' ? 'compact-cards' : ''}`}>{filtered.map((s) => <SeriesCard key={s.id} series={s} today={today} market={doc.settings.market ?? ''} showCovers={doc.settings.showCovers} compact={doc.settings.view === 'compact'} onEdit={() => onEdit(s)} onFinish={() => onFinish(s)} onCheck={onCheck ? () => onCheck(s) : undefined} onUndoAuto={onUndoAuto ? () => onUndoAuto(s) : undefined} checking={checkingSeriesId === s.id} checkDisabled={batchRunning} />)}</div>}
    <p className="library-note"><span>English releases</span><span>Preferred country: {doc.settings.market ?? 'Market not selected'} unless overridden</span><span>Source countries shown with supported details</span></p>
  </main>;
}
