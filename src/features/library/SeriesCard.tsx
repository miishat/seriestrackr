import { useState } from 'react';
import type { Format, Release, Series } from './model';
import { isCaughtUp, nextPosition } from './progress';
import { displayRelease, displaySeriesRelease, hasOldAnnouncementEvidence, releaseLabels } from './releases';
import { DiscoverySummary } from '../discovery/DiscoverySummary';

export { releaseLabels };
export function Cover({ url, title }: { url: string | null; title: string }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) return <div className="cover-placeholder">No cover available</div>;
  return <img className="cover-image" src={url} alt={`Cover for ${title || 'next unread book'}`} onError={() => setBroken(true)} />;
}
const unverifiedCover = (series: Series, showCovers: boolean) => showCovers && series.readingStatus !== 'completed' && !!series.coverUrl && !series.coverAttribution;
export function ReleaseSummary({ format, release, today, compact = false, bookTitle, series, onReview, reviewDisabled = false }: { format: Format; release: Release; today: string; compact?: boolean; bookTitle?: string; series?: Series; onReview?: () => void; reviewDisabled?: boolean }) {
  const state = series ? displaySeriesRelease(series, format, today) : displayRelease(release, today);
  const oldEvidence = hasOldAnnouncementEvidence(release, today);
  return <div className="release-summary"><span className="small label-upper">{format === 'book' ? 'Book' : 'Audiobook'}</span>
    <span className={`badge ${state}`}>{releaseLabels[state]}</span>
    <span className="sub">{release.date ? release.date : state === 'not-checked' ? 'No check recorded' : state === 'announced' || state === 'catalogued' ? 'Date Unknown' : state === 'not-found' ? 'No supported result' : 'Manual entry'}</span>
    {oldEvidence && <span className="sub evidence-old">Evidence is old{onReview && !compact && <> <button type="button" onClick={onReview} disabled={reviewDisabled} aria-label={`Review ${format === 'book' ? 'book' : 'audiobook'} announcement again${series ? ` for ${series.name}` : ''}`}>Review again</button></>}</span>}
    {compact && bookTitle?.trim() && !release.source && <span className="sub release-title">{bookTitle}</span>}
    {release.source && /^https?:\/\//i.test(release.source.url) && <a className="release-title" href={release.source.url} title={release.source.title} target="_blank" rel="noreferrer">{bookTitle?.trim() || series?.next.title.trim() || release.source.title}</a>}

  </div>;
}
export function ReleaseEvidence({ series }: { series: Series }) {
  return <>{(['book', 'audio'] as const).map(format => {
    const release = series.releases[format];
    const provenance = release.provenance;
    if (!series.formats[format] || !provenance) return null;
    return <div className="small release-evidence" key={format}>
      <strong>{format === 'book' ? 'Book' : 'Audiobook'}</strong>
      <div>English {provenance.editionFormat === 'audio' ? 'audiobook' : provenance.editionFormat} · Source country: {provenance.sourceMarket ?? 'unspecified'}</div>
      {release.date && <div>Earliest date found in checked sources.</div>}
      {release.date && provenance.sourceMarket !== provenance.preferredMarket && <div>No verified {provenance.preferredMarket} date found; using {provenance.sourceMarket ?? 'another country'}.</div>}
    </div>;
  })}</>;
}
export function SeriesCard({ series, today, market, showCovers, compact = false, onEdit, onFinish, onCheck, onUndoAuto, checking = false, checkDisabled = false }: {
  series: Series; today: string; market: string; showCovers: boolean; compact?: boolean; onEdit: () => void; onFinish: () => void; onCheck?: () => void; onUndoAuto?: () => void; checking?: boolean; checkDisabled?: boolean;
}) {
  const finished = series.lastFinished ? `Book ${series.lastFinished.position}: ${series.lastFinished.title}` : 'None yet';
  if (compact) return <article className="series-card compact">
    <div className="compact-series-heading"><h2 title={series.name}>{series.name}</h2></div>
    <div className="card-header">
      {showCovers && series.readingStatus !== 'completed' && <div className="cover-frame"><Cover key={series.coverUrl ?? ''} url={series.coverUrl} title={series.next.title} /></div>}
      <div>
        <div className="sub" title={series.author}>{series.author}</div>
        {unverifiedCover(series, showCovers) && <div className="sub cover-unverified">Cover unverified</div>}{series.autoUpdate && <div className="sub auto-updated">Updated automatically{onUndoAuto && <> <button type="button" onClick={onUndoAuto} aria-label={`Undo automatic update for ${series.name}`}>Undo</button></>}</div>}
        <div className="sub compact-last-read" title={finished}>{series.lastFinished ? `Book ${series.lastFinished.position}: ${series.lastFinished.title}` : "No books finished"}</div>
        <div className="position">{series.readingStatus === 'completed' ? 'Series completed' : `Next unread · Book ${nextPosition(series)}`}</div>
      </div>
    </div>
    <div className="release-pair compact-release-pair">
      {series.readingStatus !== 'completed' && <>
        {series.formats.book && <ReleaseSummary series={series} format="book" release={series.releases.book} today={today} compact bookTitle={series.next.title} />}
        {series.formats.audio && <ReleaseSummary series={series} format="audio" release={series.releases.audio} today={today} compact bookTitle={series.next.title} />}
      </>}
    </div>
    <details className="compact-details"><summary>Release details{series.lastCheck && series.lastCheck.status !== 'complete' ? ' · Check needs attention' : ''}</summary>
      {series.next.orderNote && <p className="small">{series.next.orderNote}</p>}
      {isCaughtUp(series) && <p className="small">Caught up with known published books</p>}
      <ReleaseEvidence series={series} /><DiscoverySummary summary={series.lastCheck} />
    </details>
    <div className="card-footer"><button onClick={onEdit}>Edit Details</button>{series.readingStatus !== 'completed' && <><button onClick={onFinish}>Mark Finished</button>{onCheck && <button onClick={onCheck} disabled={checking || checkDisabled}>{checking ? 'Checking…' : 'Check Releases'}</button>}</>}</div>
  </article>;
  return <article className={`series-card ${compact ? 'compact' : ''}`}>
    <div className="card-header">
      {showCovers && series.readingStatus !== 'completed' && <div className="cover-frame"><Cover key={series.coverUrl ?? ''} url={series.coverUrl} title={series.next.title} /></div>}
      <div><h2>{series.name}</h2><div className="sub">{series.author}</div>{unverifiedCover(series, showCovers) && <div className="sub cover-unverified">Cover unverified</div>}{series.autoUpdate && <div className="sub auto-updated">Updated automatically{onUndoAuto && <> <button type="button" onClick={onUndoAuto} aria-label={`Undo automatic update for ${series.name}`}>Undo</button></>}</div>}<div className="sub">{series.readingStatus[0].toUpperCase() + series.readingStatus.slice(1)} · {series.marketOverride ?? market}</div>
      </div>
    </div>
    <div className="card-progress"><span className="small">Last finished: {finished}</span></div>
    <div className="card-next">
      {series.readingStatus === 'completed' ? <strong>Series completed</strong> : <><div className="position">Next unread · Book {nextPosition(series)}</div><strong>{series.next.title || 'Title not entered'}</strong>{series.next.orderNote && <div className="sub">{series.next.orderNote}</div>}</>}
      {isCaughtUp(series) && <div className="sub">Caught up with known published books</div>}
    </div>
    {series.readingStatus !== 'completed' && <div className="release-pair">
      {series.formats.book && <ReleaseSummary series={series} format="book" release={series.releases.book} today={today} onReview={onCheck} reviewDisabled={checking || checkDisabled} />}
      {series.formats.audio && <ReleaseSummary series={series} format="audio" release={series.releases.audio} today={today} onReview={onCheck} reviewDisabled={checking || checkDisabled} />}
    </div>}
    {(series.lastCheck || Object.values(series.releases).some(release => release.provenance)) && <details className="compact-details"><summary>Check details</summary><ReleaseEvidence series={series} /><DiscoverySummary summary={series.lastCheck} /></details>}
    <div className="card-footer"><button onClick={onEdit}>Edit Details</button>{series.readingStatus !== 'completed' && <><button onClick={onFinish}>Mark Finished</button>{onCheck && <button onClick={onCheck} disabled={checking || checkDisabled}>{checking ? 'Checking…' : 'Check Releases'}</button>}</>}</div>
  </article>;
}
