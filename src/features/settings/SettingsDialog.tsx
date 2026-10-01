import { useState, type FormEvent } from 'react';
import type { LibraryDocument } from '../library/model';

type Settings = LibraryDocument['settings'];
export function MarketSelect({ value, onChange, label = 'Default market' }: { value: string; onChange: (value: string) => void; label?: string }) {
  const [other, setOther] = useState(!['','CA','US','GB'].includes(value) ? value : '');
  const [choice, setChoice] = useState(['','CA','US','GB'].includes(value) ? value : 'OTHER');
  return <><label>{label}<select required value={choice} onChange={(event) => { setChoice(event.target.value); onChange(event.target.value === 'OTHER' ? other : event.target.value); }}>
    <option value="">Choose your market</option><option value="CA">Canada</option><option value="US">United States</option><option value="GB">United Kingdom</option><option value="OTHER">Other country</option>
  </select></label>{choice === 'OTHER' && <label>Two-letter country code<input maxLength={2} value={other} onChange={(event) => { setOther(event.target.value); onChange(event.target.value.toUpperCase()); }} /></label>}</>;
}
export function SettingsDialog({ settings, onSave, onCancel, error }: { settings: Settings; onSave: (value: Settings) => void; onCancel: () => void; error?: string | null }) {
  const [value, setValue] = useState(settings);
  const [localError, setLocalError] = useState<string | null>(null);
  const submit = (event: FormEvent) => { event.preventDefault(); if (!value.market || !/^[A-Z]{2}$/.test(value.market)) return setLocalError('Choose a two-letter country market.'); setLocalError(null); onSave(value); };
  return <form onSubmit={submit} noValidate><p>The selected country is preferred for English releases. Each format can use another country when no supported preferred-country date is found. A series can override this preference. Manual tracking works independently.</p>
    <div className="form-grid"><MarketSelect value={value.market ?? ''} onChange={(market) => setValue({ ...value, market: market || null })} />
      <label>Theme<select value={value.theme} onChange={(event) => setValue({ ...value, theme: event.target.value as Settings['theme'] })}><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <label>Default view<select value={value.view} onChange={(event) => setValue({ ...value, view: event.target.value as Settings['view'] })}><option value="grid">Bookshelf cards</option><option value="compact">Compact cards</option><option value="list">Release table</option></select></label>
      <label className="checkbox-label"><input type="checkbox" checked={value.showCovers} onChange={(event) => setValue({ ...value, showCovers: event.target.checked })} /> Show covers</label>
    </div><p className="small">Language: English. Book and audiobook tracking can be set for each series.</p>
    {(localError || error) && <p role="alert" className="form-error">{localError || error}</p>}
    <div className="actions"><button type="button" onClick={onCancel}>Cancel</button><button className="primary" type="submit">Save settings</button></div>
  </form>;
}
