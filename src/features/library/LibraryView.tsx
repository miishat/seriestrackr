import { useState } from 'react';
import type { LibraryDocument, ReadingStatus, ReleaseState, Series } from './model';
import { displayRelease } from './releases';
import { SeriesCard } from './SeriesCard';
import { SeriesTable } from './SeriesTable';

const states: [ReleaseState, string][] = [['not-checked','Not checked'],['not-found','No announcement found'],['announced','Announced'],['scheduled','Scheduled'],['released','Available']];
function FilterMenu<T extends string>({ label, allLabel, options, selected, onChange }: {
  label: string; allLabel: string; options: readonly (readonly [T, string])[]; selected: T[]; onChange: (values: T[]) => void;
}) {
  const toggle = (value: T, checked: boolean) => onChange(checked ? [...selected, value] : selected.filter((item) => item !== value));
  return <details className="filter-menu"><summary>{selected.length ? `${label}: ${selected.length} selected` : allLabel}</summary>
    <div className="filter-panel" role="group" aria-label={label}>{options.map(([value, text]) => <label key={value}><input type="checkbox" aria-label={`${label}: ${text}`} checked={selected.includes(value)} onChange={(event) => toggle(value, event.target.checked)} />{text}</label>)}</div>
  </details>;
}
export function LibraryView({ doc, today, onEdit, onFinish, onCheck, checkingSeriesId = null, onAdd, onView }: {
  doc: LibraryDocument; today: string; onEdit: (series: Series) => void; onFinish: (series: Series) => void; onCheck?: (series: Series) => void; checkingSeriesId?: string | null; onAdd: () => void; onView: (view: LibraryDocument['settings']['view']) => void;
}) {
  const [query, setQuery] = useState('');
  const [reading, setReading] = useState<ReadingStatus[]>([]);
  const [book, setBook] = useState<ReleaseState[]>([]);
  const [audio, setAudio] = useState<ReleaseState[]>([]);
  const filtered = doc.series.filter((s) => {
    if ((book.length > 0 || audio.length > 0) && s.readingStatus === 'completed') return false;
    const matchQuery = `${s.name} ${s.author}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    const matchReading = !reading.length || reading.includes(s.readingStatus);
    const matchBook = !book.length || (s.formats.book && book.includes(displayRelease(s.releases.book, today)));
    const matchAudio = !audio.length || (s.formats.audio && audio.includes(displayRelease(s.releases.audio, today)));
    return matchQuery && matchReading && matchBook && matchAudio;
  });
  return <main>
    <div className="library-tools">
      <label className="visually-hidden" htmlFor="library-search">Search series or author</label><input id="library-search" type="search" placeholder="Search series or author" value={query} onChange={(event) => setQuery(event.target.value)} />
      <FilterMenu<ReadingStatus> label="Reading status" allLabel="All reading statuses" options={['active','paused','dropped','completed'].map((item) => [item as ReadingStatus, item[0].toUpperCase() + item.slice(1)] as const)} selected={reading} onChange={setReading} />
      <FilterMenu label="Book availability" allLabel="All book statuses" options={states} selected={book} onChange={setBook} />
      <FilterMenu label="Audiobook availability" allLabel="All audiobook statuses" options={states} selected={audio} onChange={setAudio} />
      <div className="spacer" /><div className="view-switch" aria-label="Library view">{(['grid','compact','list'] as const).map((view) => <button key={view} aria-pressed={doc.settings.view === view} onClick={() => onView(view)}>{view === 'list' ? 'Table' : view[0].toUpperCase() + view.slice(1)}</button>)}</div>
      <button className="primary" onClick={onAdd}>Add series</button>
    </div>
    {doc.series.length === 0 ? <div className="empty"><div className="eyebrow">A fresh start</div><h2>Your bookshelf is empty</h2><p>Add a series, then keep its next book and audiobook releases in one place.</p><button className="primary" onClick={onAdd}>Add your first series</button></div>
      : filtered.length === 0 ? <div className="empty"><h2>No matching series</h2><p>Try another search or filter.</p></div>
      : doc.settings.view === 'list' ? <SeriesTable series={filtered} today={today} market={doc.settings.market ?? ''} onEdit={onEdit} onFinish={onFinish} onCheck={onCheck} checkingSeriesId={checkingSeriesId} />
      : <div className={`cards ${doc.settings.view === 'compact' ? 'compact-cards' : ''}`}>{filtered.map((s) => <SeriesCard key={s.id} series={s} today={today} market={doc.settings.market ?? ''} showCovers={doc.settings.showCovers} compact={doc.settings.view === 'compact'} onEdit={() => onEdit(s)} onFinish={() => onFinish(s)} onCheck={onCheck ? () => onCheck(s) : undefined} checking={checkingSeriesId === s.id} />)}</div>}
    <p className="library-note">English releases · Preferred country: {doc.settings.market ?? 'Market not selected'} unless overridden · Source countries shown with supported details</p>
  </main>;
}
