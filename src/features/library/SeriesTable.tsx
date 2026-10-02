import type { Series } from './model';
import { nextPosition } from './progress';
import { ReleaseSummary } from './SeriesCard';
import { DiscoverySummary } from '../discovery/DiscoverySummary';

export function SeriesTable({ series, today, market, onEdit, onFinish, onCheck, checkingSeriesId = null, checkDisabled = false }: { series: Series[]; today: string; market: string; onEdit: (s: Series) => void; onFinish: (s: Series) => void; onCheck?: (series: Series) => void; checkingSeriesId?: string | null; checkDisabled?: boolean }) {
  return <div className="table-wrap" role="region" aria-label="Release table" tabIndex={0}><table><thead><tr><th>Series</th><th>Last finished</th><th>Next unread</th><th>Book</th><th>Audiobook</th><th>Actions</th></tr></thead>
    <tbody>{series.map((s) => <tr key={s.id}><td><strong>{s.name}</strong><span className="sub">{s.author}</span><span className="sub">{s.readingStatus} · {s.marketOverride ?? market}</span></td>
      <td>{s.lastFinished ? `Book ${s.lastFinished.position}: ${s.lastFinished.title}` : 'None yet'}</td>
      <td>{s.readingStatus === 'completed' ? 'Series completed' : <>Book {nextPosition(s)}<span className="sub">{s.next.title || 'Title not entered'}</span></>}</td>
      <td>{s.readingStatus !== 'completed' && s.formats.book && <ReleaseSummary series={s} format="book" release={s.releases.book} today={today} />}</td>
      <td>{s.readingStatus !== 'completed' && s.formats.audio && <ReleaseSummary series={s} format="audio" release={s.releases.audio} today={today} />}</td>
      <td><DiscoverySummary summary={s.lastCheck} /><button onClick={() => onEdit(s)}>Edit details</button>{s.readingStatus !== 'completed' && <><button onClick={() => onFinish(s)}>Mark finished</button>{onCheck && <button onClick={() => onCheck(s)} disabled={checkDisabled || checkingSeriesId === s.id}>{checkingSeriesId === s.id ? 'Checking…' : 'Check releases'}</button>}</>}</td>
    </tr>)}</tbody></table></div>;
}
