// Investigation only. Imports the unchanged production pipeline and saves fresh evidence.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDiscoveryConfig } from '../../../server/discovery/config';
import { createDiscoveryRuntime } from '../../../server/discovery/runtime';
import { runDiscovery } from '../../../server/discovery/runDiscovery';
import { nextPosition } from '../../../src/features/library/progress';
const fetchCoverImageUrls = async (..._args: string[]): Promise<string[]> => []; // cover mode unused in this probe
import type { LibraryDocument } from '../../../src/features/library/model';
import type { CheckRequest } from '../../../shared/discovery';

const root = process.cwd();
const output = resolve(root, 'docs/investigations/2026-10-03-next-book');
const library = JSON.parse(readFileSync(resolve(output, 'library-snapshot.json'), 'utf8')) as LibraryDocument;
const config = loadDiscoveryConfig(root);
const secrets = [config.tavilyKey, config.deepseekKey, config.googleBooksKey, config.hardcoverToken].filter(Boolean) as string[];
const names = ['The Bound and the Broken', 'Dungeon Crawler Carl', 'Book of the Dead', 'The Dark Profit Saga'];
const nativeFetch = globalThis.fetch;
const mode = process.argv[2] ?? 'release';
const save = (path: string, data: unknown) => {
  let body = JSON.stringify(data, null, 2);
  for (const key of secrets) body = body.split(key).join('[REDACTED]');
  writeFileSync(resolve(output, path), body);
};
for (const name of names) {
  const series = library.series.find(row => row.name === name)!;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (process.argv[3] && slug !== process.argv[3]) continue;
  mkdirSync(resolve(output, slug), { recursive: true });
  const calls: unknown[] = []; let sequence = 0;
  const tracedFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const safeUrl = new URL(url); safeUrl.searchParams.delete('key');
    const number = ++sequence;
    let query: unknown = null;
    if (typeof init?.body === 'string') {
      const body = JSON.parse(init.body); query = body.variables ?? body.query ?? null;
    }
    const record: Record<string, unknown> = { number, url: safeUrl.href, query, startedAt: new Date().toISOString() };
    calls.push(record);
    try {
      const response = await nativeFetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(20000) });
      record.status = response.status; record.mime = response.headers.get('content-type');
      const body = await response.clone().text(); record.bytes = Buffer.byteLength(body);
      const file = `${slug}/${mode}-${number}.${String(record.mime).includes('html') ? 'html' : 'json'}`;
      let sanitized = body;
      for (const key of secrets) sanitized = sanitized.split(key).join('[REDACTED]');
      writeFileSync(resolve(output, file), sanitized); record.bodyFile = file;
      return response;
    } catch (error) { record.error = error instanceof Error ? error.name : 'Error'; throw error; }
    finally { save(`${slug}/${mode}-calls.json`, calls); }
  };
  if (mode === 'release') {
    const request: CheckRequest = { requestId: `audit-${slug}`, seriesId: series.id,
      target: { series: series.name, author: series.author, position: nextPosition(series), title: series.next.title, orderNote: series.next.orderNote },
      preferredMarket: series.marketOverride ?? library.settings.market ?? 'US',
      formats: (['book', 'audio'] as const).filter(format => series.formats[format]), useAi: false };
    save(`${slug}/request.json`, request);
    const events: unknown[] = [];
    const runtime = createDiscoveryRuntime(config, tracedFetch, { onDiagnostic: event => events.push(event) });
    const collect = runtime.catalogs;
    runtime.catalogs = async (...args) => { const result = await collect(...args); save(`${slug}/catalog-before-allocation.json`, result); return result; };
    const search = runtime.search;
    let searches = 0;
    runtime.search = async (...args) => { const result = await search(...args); save(`${slug}/search-normalized-${++searches}.json`, result); return result; };
    const result = await runDiscovery(request, runtime, new AbortController().signal);
    save(`${slug}/result.json`, result); save(`${slug}/diagnostics.json`, events);
    console.log(JSON.stringify({ name, title: result.proposals.identity?.title, releases: Object.fromEntries(Object.entries(result.proposals.releases).map(([f,r])=>[f,r ? {title:r.title,date:r.date,market:r.provenance.sourceMarket}:null])), reasons: result.summary.reasons, usage: result.summary.usage }));
  } else if (mode === 'cover') {
    globalThis.fetch = tracedFetch;
    try { const urls = await fetchCoverImageUrls(series.name, series.author, series.lastFinished?.title ?? '', series.next.title); save(`${slug}/cover-result.json`, { urls }); console.log(JSON.stringify({ name, covers: urls.length, statuses: calls })); }
    catch (error) { save(`${slug}/cover-result.json`, { error: error instanceof Error ? error.message : 'Error' }); console.log(JSON.stringify({ name, error: error instanceof Error ? error.message : 'Error' })); }
    finally { globalThis.fetch = nativeFetch; }
  } else throw new Error('Expected release or cover');
}
