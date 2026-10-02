import { emitDiagnostic, type DiagnosticObserver } from './diagnostics';
import type { Provider, Reason } from '../../shared/discovery';

const bases = {
  apple: 'https://itunes.apple.com', openlibrary: 'https://openlibrary.org',
  googlebooks: 'https://www.googleapis.com',
  hardcover: 'https://api.hardcover.app', tavily: 'https://api.tavily.com', deepseek: 'https://api.deepseek.com',
} as const;

export class ProviderError extends Error {
  constructor(public readonly provider: Provider, public readonly reason: Reason) {
    super(reason);
    this.name = 'ProviderError';
  }
}

function endpoint(provider: Provider, path: string): URL {
  const queryStart = path.indexOf('?');
  const pathname = queryStart < 0 ? path : path.slice(0, queryStart);
  const allowed = provider === 'apple' ? pathname === '/search' || pathname === '/lookup'
    : provider === 'hardcover' ? pathname === '/v1/graphql' && queryStart < 0
    : provider === 'tavily' ? pathname === '/search'
      : provider === 'deepseek' ? pathname === '/chat/completions'
        : provider === 'googlebooks' ? pathname === '/books/v1/volumes'
          : provider === 'openlibrary' && (pathname === '/search.json' || /^\/books\/OL[0-9]+M\.json$/.test(pathname));
  if (!allowed || path.includes('#')) throw new ProviderError(provider, 'provider-error');
  const params = new URLSearchParams(queryStart < 0 ? '' : path.slice(queryStart + 1));
  if (provider === 'apple' && [...params.keys()].some((key) => key.toLowerCase() === 'callback')) {
    throw new ProviderError(provider, 'provider-error');
  }
  const url = new URL(bases[provider]);
  url.pathname = pathname;
  url.search = params.toString();
  return url;
}

function mime(headers: Headers): string {
  return (headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}

export async function fetchProviderJson(
  provider: Provider, path: string, init: RequestInit, signal: AbortSignal, fetcher: typeof fetch = fetch, onDiagnostic?: DiagnosticObserver,
): Promise<unknown> {
  let combined: AbortSignal | undefined;
  let res: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if (signal.aborted) throw new ProviderError(provider, 'cancelled');
    const url = endpoint(provider, path);
    if (init.body != null) {
      if (typeof init.body !== 'string' || mime(new Headers(init.headers)) !== 'application/json') {
        throw new ProviderError(provider, 'provider-error');
      }
      JSON.parse(init.body);
    }
    combined = AbortSignal.any([signal, AbortSignal.timeout(provider === 'deepseek' ? 45000 : 20000)]);
    combined.throwIfAborted();
    res = await abortable(fetcher(url, { ...init, signal: combined, redirect: 'error' }), combined);
    emitTransport(onDiagnostic, provider, res);
    if (res.redirected || (res.url && new URL(res.url).origin !== url.origin)) {
      throw new ProviderError(provider, 'provider-error');
    }
    if (res.status === 429) throw new ProviderError(provider, 'quota');
    if (!res.ok) throw new ProviderError(provider, 'provider-error');
    const type = mime(res.headers);
    if (type !== 'application/json' && !(provider === 'apple' && type === 'text/javascript')) {
      throw new ProviderError(provider, 'provider-error');
    }
    if (!res.body) throw new ProviderError(provider, 'provider-error');
    reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      combined.throwIfAborted();
      const part = await abortable(reader.read(), combined);
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 1048576) throw new ProviderError(provider, 'budget');
      chunks.push(part.value);
    }
    const joined = new Uint8Array(bytes);
    let offset = 0;
    for (const part of chunks) { joined.set(part, offset); offset += part.byteLength; }
    return JSON.parse(new TextDecoder().decode(joined));
  } catch (error) {
    if (signal.aborted) throw new ProviderError(provider, 'cancelled');
    if (combined?.aborted) throw new ProviderError(provider, 'timeout');
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(provider, 'provider-error');
  } finally {
    // Cleanup cannot expose upstream errors or hold a bounded request open.
    if (reader) {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    } else if (res?.body) {
      void res.body.cancel().catch(() => {});
    }
  }
}

export async function fetchAppleProductText(url: string, signal: AbortSignal, fetcher: typeof fetch = fetch, onDiagnostic?: DiagnosticObserver): Promise<string> {
  let combined: AbortSignal | undefined;
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if (signal.aborted) throw new ProviderError('apple', 'cancelled');
    const parsed = new URL(url);
    if (!/^https:\/\/books\.apple\.com\//.test(url) || parsed.hostname !== 'books.apple.com' || parsed.username || parsed.password || parsed.port || parsed.hash ||
      !/^\/[a-z]{2}\/(?:book|audiobook)\/[^/]+\/id[1-9]\d*$/.test(parsed.pathname)) throw new ProviderError('apple', 'provider-error');
    combined = AbortSignal.any([signal, AbortSignal.timeout(20000)]);
    response = await abortable(fetcher(parsed, { signal: combined, redirect: 'error', credentials: 'omit', headers: { accept: 'text/html' } }), combined);
    emitTransport(onDiagnostic, 'apple', response);
    if (response.redirected || (response.url && response.url !== parsed.href)) throw new ProviderError('apple', 'provider-error');
    if (response.status === 429) throw new ProviderError('apple', 'quota');
    if (!response.ok || mime(response.headers) !== 'text/html' || !response.body) throw new ProviderError('apple', 'provider-error');
    if (Number(response.headers.get('content-length')) > 1048576) throw new ProviderError('apple', 'budget');
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      combined.throwIfAborted();
      const part = await abortable(reader.read(), combined);
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 1048576) throw new ProviderError('apple', 'budget');
      chunks.push(part.value);
    }
    const joined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(joined);
  } catch (error) {
    if (signal.aborted) throw new ProviderError('apple', 'cancelled');
    if (combined?.aborted) throw new ProviderError('apple', 'timeout');
    if (error instanceof ProviderError) throw error;
    throw new ProviderError('apple', 'provider-error');
  } finally {
    if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); }
    else if (response?.body) void response.body.cancel().catch(() => {});
  }
}


function emitTransport(observer: DiagnosticObserver | undefined, provider: Provider, response: Response): void {
  emitDiagnostic(observer, { stage: 'transport', category: response.ok ? 'accepted' : 'shape',
    sources: 0, identities: 0, editions: 0, provider, httpStatus: response.status,
    ...(response.ok ? {} : { rule: response.status === 429 ? 'http-quota' : 'http-failure' }) });
}
