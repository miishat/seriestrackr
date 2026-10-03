import { isApiKey } from '../../shared/apiKey';
import type { Result } from '../features/library/model';

// The person's own Tavily and DeepSeek keys. They live only in this browser, apart from the library
// document, so backups never carry them, and they are sent only to the local discovery service.
export interface ApiKeys { tavily: string | null; deepseek: string | null }
const KEY = 'seriestrackr:apiKeys';
const none = (): ApiKeys => ({ tavily: null, deepseek: null });

export function loadApiKeys(storage: Storage): ApiKeys {
  try {
    const raw = storage.getItem(KEY);
    if (raw === null) return none();
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== 'object') return none();
    const stored = value as Record<string, unknown>;
    return { tavily: isApiKey(stored.tavily) ? stored.tavily : null, deepseek: isApiKey(stored.deepseek) ? stored.deepseek : null };
  } catch { return none(); }
}

export function saveApiKeys(storage: Storage, keys: ApiKeys): Result<void> {
  for (const value of [keys.tavily, keys.deepseek]) if (value !== null && !isApiKey(value)) return { ok: false, error: 'That key does not look right. Paste it again without spaces.' };
  try {
    if (keys.tavily === null && keys.deepseek === null) storage.removeItem(KEY);
    else storage.setItem(KEY, JSON.stringify(keys));
    return { ok: true, value: undefined };
  } catch { return { ok: false, error: 'Keys could not be saved in this browser.' }; }
}

export function clearApiKeys(storage: Storage): void { saveApiKeys(storage, none()); }

export function loadBrowserApiKeys(): ApiKeys {
  try { return loadApiKeys(window.localStorage); } catch { return none(); }
}
export function saveBrowserApiKeys(keys: ApiKeys): Result<void> {
  try { return saveApiKeys(window.localStorage, keys); } catch { return { ok: false, error: 'Keys could not be saved in this browser.' }; }
}
