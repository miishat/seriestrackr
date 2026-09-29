import type { Format, Release, ReleaseState } from './model';

const states: [ReleaseState, string][] = [
  ['not-checked', 'Not checked'], ['not-found', 'No announcement found'], ['announced', 'Announced, date unknown'],
  ['scheduled', 'Scheduled'], ['released', 'Available'],
];

export function ReleaseFields({ format, value, onChange }: { format: Format; value: Release; onChange: (value: Release) => void }) {
  const label = format === 'book' ? 'Book' : 'Audiobook';
  const change = (patch: Partial<Release>) => onChange({ ...value, ...patch, origin: 'manual', lastCheckedAt: null });
  return <fieldset className="release-fields"><legend>{label} release</legend>
    <div className="form-grid">
      <label>{label} status<select value={value.state} onChange={(event) => {
        const state = event.target.value as ReleaseState;
        change({ state, date: state === 'scheduled' || state === 'released' ? value.date : null });
      }}>{states.map(([code, name]) => <option value={code} key={code}>{name}</option>)}</select></label>
      {(value.state === 'scheduled' || value.state === 'released') && <label>{label} release date<input type="date" required={value.state === 'scheduled'} value={value.date ?? ''} onChange={(event) => change({ date: event.target.value || null })} /></label>}
      <label>Source title<input value={value.source?.title ?? ''} onChange={(event) => change({ source: event.target.value || value.source?.url ? { title: event.target.value, url: value.source?.url ?? '' } : null })} /></label>
      <label>Source URL<input type="url" value={value.source?.url ?? ''} onChange={(event) => change({ source: event.target.value || value.source?.title ? { title: value.source?.title ?? '', url: event.target.value } : null })} placeholder="https://publisher.example/book" /></label>
    </div>
    <p className="small">Manual entry. A release date is not a discovery check.</p>
  </fieldset>;
}
