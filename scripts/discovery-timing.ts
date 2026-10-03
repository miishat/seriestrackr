// Live timing of the production discovery pipeline over a library snapshot. Prints no keys or bodies.
// Usage: npx tsx scripts/discovery-timing.ts [snapshot.json] [concurrency]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDiscoveryConfig } from '../server/discovery/config';
import { createDiscoveryRuntime } from '../server/discovery/runtime';
import { runDiscovery } from '../server/discovery/runDiscovery';
import { nextPosition } from '../src/features/library/progress';
import type { LibraryDocument } from '../src/features/library/model';
import type { CheckRequest } from '../shared/discovery';

const snapshot = resolve(process.cwd(), process.argv[2] ?? 'docs/investigations/2026-10-01-release-pipeline/library-snapshot.json');
const concurrency = Number(process.argv[3] ?? 1);
const library = JSON.parse(readFileSync(snapshot, 'utf8')) as LibraryDocument;
const config = loadDiscoveryConfig(process.cwd());
const nativeFetch = globalThis.fetch;
const host = (url: string) => new URL(url).hostname.replace(/^www\./, '');

type Row = { name: string; ms: number; status: string; calls: Record<string, { n: number; ms: number }> };
const rows: Row[] = [];

async function check(series: LibraryDocument['series'][number]): Promise<void> {
  const calls: Row['calls'] = {};
  const timed: typeof fetch = async (input, init) => {
    const key = host(input instanceof Request ? input.url : String(input));
    const began = performance.now();
    try { return await nativeFetch(input, init); }
    finally { const entry = calls[key] ??= { n: 0, ms: 0 }; entry.n++; entry.ms += performance.now() - began; }
  };
  const request: CheckRequest = { requestId: `timing-${series.id}`, seriesId: series.id,
    target: { series: series.name, author: series.author, position: nextPosition(series), title: series.next.title, orderNote: series.next.orderNote },
    preferredMarket: series.marketOverride ?? library.settings.market ?? 'US',
    formats: (['book', 'audio'] as const).filter(format => series.formats[format]), useAi: false };
  const began = performance.now();
  const result = await runDiscovery(request, createDiscoveryRuntime(config, timed), new AbortController().signal);
  rows.push({ name: series.name, ms: performance.now() - began, status: result.summary.status, calls });
}

const queue = library.series.filter(series => series.readingStatus === 'active');
const total = performance.now();
await Promise.all(Array.from({ length: concurrency }, async () => { for (let next = queue.shift(); next; next = queue.shift()) await check(next); }));
const wall = performance.now() - total;
for (const row of rows) {
  const detail = Object.entries(row.calls).map(([key, value]) => `${key} ${value.n}x/${(value.ms / 1000).toFixed(1)}s`).join(', ');
  console.log(`${(row.ms / 1000).toFixed(1).padStart(6)}s  ${row.status.padEnd(9)} ${row.name}  [${detail}]`);
}
const sorted = rows.map(row => row.ms).sort((a, b) => a - b);
console.log(`series ${rows.length}  concurrency ${concurrency}  wall ${(wall / 1000).toFixed(1)}s  median ${(sorted[Math.floor(sorted.length / 2)] / 1000).toFixed(1)}s  max ${(sorted.at(-1)! / 1000).toFixed(1)}s`);
