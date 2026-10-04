import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import type { Series } from './model';
import { nextPosition } from './progress';
import { Cover, ReleaseSummary, ReleaseEvidence } from './SeriesCard';
import { DiscoverySummary } from '../discovery/DiscoverySummary';

export function SeriesTable({ series, today, market, onEdit, onFinish, onCheck, onUndoAuto, checkingSeriesId = null, checkDisabled = false, showCovers = true }: { series: Series[]; today: string; market: string; onEdit: (s: Series) => void; onFinish: (s: Series) => void; onCheck?: (series: Series) => void; onUndoAuto?: (series: Series) => void; checkingSeriesId?: string | null; checkDisabled?: boolean; showCovers?: boolean }) {
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const detailsSeries = series.find(item => item.id === detailsId);
  return <><div className="table-wrap" role="region" aria-label="Release table" tabIndex={0}><table><thead><tr><th>Series</th><th>Last finished</th><th>Next unread</th><th>Book</th><th>Audiobook</th><th>Actions</th></tr></thead>
    <tbody>{series.map((s) => <tr key={s.id}><td><div className="table-series">{showCovers && <div className="table-cover"><Cover key={s.coverUrl ?? ''} url={s.coverUrl} title={s.next.title || s.name} /></div>}<div><strong>{s.name}</strong><span className="sub">{s.author}</span>{s.autoUpdate && <span className="sub auto-updated">Updated automatically{onUndoAuto && <> <button type="button" onClick={() => onUndoAuto(s)} aria-label={`Undo automatic update for ${s.name}`}>Undo</button></>}</span>}<span className="sub">{s.readingStatus} · {s.marketOverride ?? market}</span></div></div></td>
      <td>{s.lastFinished ? <>Book {s.lastFinished.position}<span className="sub">{s.lastFinished.title}</span></> : 'None yet'}</td>
      <td>{s.readingStatus === 'completed' ? 'Series completed' : <>Book {nextPosition(s)}<span className="sub">{s.next.title || 'Title not entered'}</span></>}{(s.lastCheck || Object.values(s.releases).some(release => release.provenance)) && <button className="table-check-details" onClick={() => setDetailsId(s.id)}><span aria-hidden="true">▸ </span>Check details</button>}</td>
      <td>{s.readingStatus !== 'completed' && s.formats.book && <ReleaseSummary series={s} format="book" release={s.releases.book} today={today} onReview={onCheck ? () => onCheck(s) : undefined} reviewDisabled={checkDisabled || checkingSeriesId === s.id} />}</td>
      <td>{s.readingStatus !== 'completed' && s.formats.audio && <ReleaseSummary series={s} format="audio" release={s.releases.audio} today={today} onReview={onCheck ? () => onCheck(s) : undefined} reviewDisabled={checkDisabled || checkingSeriesId === s.id} />}</td>
      <td><div className="table-actions"><button onClick={() => onEdit(s)}>Edit details</button>{s.readingStatus !== 'completed' && <><button onClick={() => onFinish(s)}>Mark finished</button>{onCheck && <button onClick={() => onCheck(s)} disabled={checkDisabled || checkingSeriesId === s.id}>{checkingSeriesId === s.id ? 'Checking…' : 'Check releases'}</button>}</>}</div></td>
    </tr>)}</tbody></table></div>
    <Dialog open={!!detailsSeries} title={`Check details: ${detailsSeries?.name ?? ""}`} onClose={() => setDetailsId(null)}>{detailsSeries && <><ReleaseEvidence series={detailsSeries} /><DiscoverySummary summary={detailsSeries.lastCheck} /></>}</Dialog>
  </>;
}
