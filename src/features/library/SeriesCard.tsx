import { useState } from 'react';
import type { Format, Release, ReleaseState, Series } from './model';
import { isCaughtUp, nextPosition } from './progress';
import { displayRelease } from './releases';

export const releaseLabels: Record<ReleaseState, string> = {
  'not-checked': 'Not checked', 'not-found': 'No announcement found', announced: 'Announced, date unknown',
  scheduled: 'Scheduled', released: 'Available',
};
function Cover({ url, title }: { url: string | null; title: string }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) return <div className="cover-placeholder">No cover available</div>;
  return <img className="cover-image" src={url} alt={`Cover for ${title || 'next unread book'}`} onError={() => setBroken(true)} />;
}
export function ReleaseSummary({ format, release, today }: { format: Format; release: Release; today: string }) {
  const state = displayRelease(release, today);
  return <div className="release-summary"><span className="small label-upper">{format === 'book' ? 'Book' : 'Audiobook'}</span>
    <span className={`badge ${state}`}>{releaseLabels[state]}</span>
    <span className="sub">{release.date ? release.date : state === 'not-checked' ? 'No check recorded' : state === 'announced' ? 'Date unknown' : 'Manual entry'}</span>
    {release.source && /^https?:\/\//i.test(release.source.url) && <a href={release.source.url} target="_blank" rel="noreferrer">{release.source.title}</a>}
  </div>;
}
export function SeriesCard({ series, today, market, showCovers, compact = false, onEdit, onFinish }: {
  series: Series; today: string; market: string; showCovers: boolean; compact?: boolean; onEdit: () => void; onFinish: () => void;
}) {
  const finished = series.lastFinished ? `Book ${series.lastFinished.position}: ${series.lastFinished.title}` : 'None yet';
  return <article className={`series-card ${compact ? 'compact' : ''}`}>
    <div className="card-header">
      {showCovers && series.readingStatus !== 'completed' && <div className="cover-frame"><Cover key={series.coverUrl ?? ''} url={series.coverUrl} title={series.next.title} /></div>}
      <div><h2>{series.name}</h2><div className="sub">{series.author}</div><div className="sub">{series.readingStatus[0].toUpperCase() + series.readingStatus.slice(1)} · {series.marketOverride ?? market}</div>
        {series.readingStatus !== 'completed' && <div className="sub">Next unread: Book {nextPosition(series)}</div>}
      </div>
    </div>
    <div className="card-next"><div className="small">Last finished: {finished}</div>
      {series.readingStatus === 'completed' ? <strong>Series completed</strong> : <><div className="position">Next unread · Book {nextPosition(series)}</div><strong>{series.next.title || 'Title not entered'}</strong>{series.next.orderNote && <div className="sub">{series.next.orderNote}</div>}</>}
      {isCaughtUp(series) && <div className="sub">Caught up with known published books</div>}
    </div>
    {series.readingStatus !== 'completed' && <div className="release-pair">
      {series.formats.book && <ReleaseSummary format="book" release={series.releases.book} today={today} />}
      {series.formats.audio && <ReleaseSummary format="audio" release={series.releases.audio} today={today} />}
    </div>}
    <div className="card-footer"><button onClick={onEdit}>Edit details</button>{series.readingStatus !== 'completed' && <button onClick={onFinish}>Mark finished</button>}</div>
  </article>;
}
