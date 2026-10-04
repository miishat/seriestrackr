import { useId, useState } from 'react';
import type { Format, Series } from './model';
import { DiscoverySummary, formatCheckTime } from '../discovery/DiscoverySummary';
import { isCaughtUp } from './progress';
import { ReleaseEvidence } from './SeriesCard';


export function GridReleaseDetails({ series, compact = false }: {
  series: Series; compact?: boolean;
}) {
  const id = useId();
  const formats = (['book', 'audio'] as const).filter(format => series.formats[format]);
  const [selected, setSelected] = useState<Format>('book');
  const active = formats.includes(selected) ? selected : formats[0];
  if (!active) return null;
  return <details className={`grid-release-details ${compact ? 'compact-details' : ''}`}>
    <summary>{compact ? 'Release details' : 'Release Details'}{series.lastCheck && series.lastCheck.status !== 'complete' ? ' · Check needs attention' : ''}<span>{formats.map(format => format === 'book' ? 'Book' : 'Audiobook').join(' & ')}</span></summary>
    <div role="tablist" aria-label={`Release formats for ${series.name}`} className="grid-release-tabs">
      {formats.map((format, index) => <button key={format} id={`${id}-${format}`} type="button" role="tab"
        aria-selected={active === format} aria-controls={`${id}-panel`} tabIndex={active === format ? 0 : -1}
        onClick={() => setSelected(format)} onKeyDown={event => {
          let target: number;
          if (event.key === 'ArrowRight') target = (index + 1) % formats.length;
          else if (event.key === 'ArrowLeft') target = (index + formats.length - 1) % formats.length;
          else if (event.key === 'Home') target = 0;
          else if (event.key === 'End') target = formats.length - 1;
          else return;
          event.preventDefault(); setSelected(formats[target]);
          document.getElementById(`${id}-${formats[target]}`)?.focus();
        }}>{format === 'book' ? 'Book' : 'Audiobook'}</button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${active}`} tabIndex={0}>
      
      {compact && series.next.orderNote && <p className="small">{series.next.orderNote}</p>}
      {compact && isCaughtUp(series) && <p className="small">Caught up with known published books</p>}
      <ReleaseEvidence series={series} format={active} />
      {series.releases[active].source && /^https?:\/\//i.test(series.releases[active].source!.url) && <p className="small"><a href={series.releases[active].source!.url} title={series.releases[active].source!.title} target="_blank" rel="noreferrer">{series.next.title.trim() || series.releases[active].source!.title}</a></p>}
      {!series.releases[active].provenance && <p className="small">No saved source metadata for this format.</p>}
      {series.releases[active].lastCheckedAt && <p className="small">Format checked <time dateTime={series.releases[active].lastCheckedAt!}>{formatCheckTime(series.releases[active].lastCheckedAt!)}</time>.</p>}
      {series.releases[active].provenance?.sources.filter(source => /^https?:\/\//i.test(source.url)).map(source => <p className="small" key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></p>)}
      {series.lastCheck && <div className="grid-check-summary"><p className="small">Latest discovery check across requested formats</p><DiscoverySummary summary={series.lastCheck} /></div>}
    </div>
  </details>;
}



