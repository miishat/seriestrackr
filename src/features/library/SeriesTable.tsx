import type { Series } from './model';
import { nextPosition } from './progress';
import { ReleaseSummary } from './SeriesCard';

export function SeriesTable({ series, today, market, onEdit, onFinish }: { series: Series[]; today: string; market: string; onEdit: (s: Series) => void; onFinish: (s: Series) => void }) {
  return <div className="table-wrap" role="region" aria-label="Release table" tabIndex={0}><table><thead><tr><th>Series</th><th>Last finished</th><th>Next unread</th><th>Book</th><th>Audiobook</th><th>Actions</th></tr></thead>
    <tbody>{series.map((s) => <tr key={s.id}><td><strong>{s.name}</strong><span className="sub">{s.author}</span><span className="sub">{s.readingStatus} · {s.marketOverride ?? market}</span></td>
      <td>{s.lastFinished ? `Book ${s.lastFinished.position}: ${s.lastFinished.title}` : 'None yet'}</td>
      <td>{s.readingStatus === 'completed' ? 'Series completed' : <>Book {nextPosition(s)}<span className="sub">{s.next.title || 'Title not entered'}</span></>}</td>
      <td>{s.readingStatus !== 'completed' && s.formats.book && <ReleaseSummary format="book" release={s.releases.book} today={today} />}</td>
      <td>{s.readingStatus !== 'completed' && s.formats.audio && <ReleaseSummary format="audio" release={s.releases.audio} today={today} />}</td>
      <td><button onClick={() => onEdit(s)}>Edit details</button>{s.readingStatus !== 'completed' && <button onClick={() => onFinish(s)}>Mark finished</button>}</td>
    </tr>)}</tbody></table></div>;
}
