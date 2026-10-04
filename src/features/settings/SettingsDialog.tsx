import { useState, type FormEvent } from 'react';
import type { LibraryDocument } from '../library/model';
import { loadBrowserApiKeys, saveBrowserApiKeys, type ApiKeys } from '../../storage/apiKeys';

type Settings = LibraryDocument['settings'];
export function MarketSelect({ value, onChange, label = 'Default Market' }: { value: string; onChange: (value: string) => void; label?: string }) {
  const [other, setOther] = useState(!['','CA','US','GB'].includes(value) ? value : '');
  const [choice, setChoice] = useState(['','CA','US','GB'].includes(value) ? value : 'OTHER');
  return <><label>{label}<select required value={choice} onChange={(event) => { setChoice(event.target.value); onChange(event.target.value === 'OTHER' ? other : event.target.value); }}>
    <option value="">Choose your market</option><option value="CA">Canada</option><option value="US">United States</option><option value="GB">United Kingdom</option><option value="OTHER">Other country</option>
  </select></label>{choice === 'OTHER' && <label>Two-letter country code<input maxLength={2} value={other} onChange={(event) => { setOther(event.target.value); onChange(event.target.value.toUpperCase()); }} /></label>}</>;
}
export function SettingsDialog({ settings, onSave, onCancel, error }: { settings: Settings; onSave: (value: Settings) => void; onCancel: () => void; error?: string | null }) {
  const [value, setValue] = useState(settings);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ApiKeys>(loadBrowserApiKeys);
  const [typed, setTyped] = useState({ tavily: '', deepseek: '' });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.market || !/^[A-Z]{2}$/.test(value.market)) return setLocalError('Choose a two-letter country market.');
    const next: ApiKeys = { tavily: typed.tavily.trim() || saved.tavily, deepseek: typed.deepseek.trim() || saved.deepseek };
    if (next.tavily !== saved.tavily || next.deepseek !== saved.deepseek) {
      const stored = saveBrowserApiKeys(next);
      if (stored.ok === false) return setLocalError(stored.error);
      setSaved(next); setTyped({ tavily: '', deepseek: '' });
    }
    setLocalError(null); onSave(value);
  };
  const remove = (name: keyof ApiKeys) => {
    const next = { ...saved, [name]: null };
    const stored = saveBrowserApiKeys(next);
    if (stored.ok === false) return setLocalError(stored.error);
    setSaved(next); setLocalError(null);
  };
  const keyField = (name: keyof ApiKeys, label: string) => <div className="key-field">
    <label htmlFor={`settings-${name}-key`}>{label} Key</label>
    <div className="key-input-row"><input id={`settings-${name}-key`} type="password" autoComplete="off" spellCheck={false} value={typed[name]} placeholder={saved[name] ? 'Type to Replace' : 'Optional'} onChange={event => setTyped({ ...typed, [name]: event.target.value })} />
    {saved[name] && <button type="button" onClick={() => remove(name)}>Remove</button>}</div>
  </div>;
  return <form onSubmit={submit} noValidate><p>Active series are checked on opening when due after 7 days.</p>
    <div className="form-grid"><MarketSelect value={value.market ?? ''} onChange={(market) => setValue({ ...value, market: market || null })} />
      <label>Theme<select value={value.theme} onChange={(event) => setValue({ ...value, theme: event.target.value as Settings['theme'] })}><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <label>Default View<select value={value.view} onChange={(event) => setValue({ ...value, view: event.target.value as Settings['view'] })}><option value="grid">Grid</option><option value="compact">Compact</option><option value="list">Table</option></select></label>
      <label>Covers<select value={value.showCovers ? 'show' : 'hide'} onChange={(event) => setValue({ ...value, showCovers: event.target.value === 'show' })}><option value="show">Show</option><option value="hide">Hide</option></select></label>
    </div>
    <h3>API Keys (Optional)</h3>
    <p className="small">Tavily search and DeepSeek AI use your accounts when enabled. Keys stay in this browser, outside backups, and are sent only to the local discovery service.</p>
    <div className="form-grid">{keyField('tavily', 'Tavily')}{keyField('deepseek', 'DeepSeek')}</div>
    <p className="small">Track Book and Audiobook per series. Language: English.</p>
    {(localError || error) && <p role="alert" className="form-error">{localError || error}</p>}
    <div className="actions dialog-footer"><button type="button" onClick={onCancel}>Close</button><button className="primary" type="submit">Save</button></div>
  </form>;
}
