import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CheckRequest, CheckResponse } from '../shared/discovery';
import { parseCheckRequest } from '../shared/discoveryValidation';
import { loadDiscoveryConfig } from '../server/discovery/config';
import { estimatedMaxAiUsd } from '../server/discovery/deepseek';
import { runDiscovery, type DiscoveryDependencies } from '../server/discovery/runDiscovery';
import { createDiscoveryRuntime } from '../server/discovery/runtime';

export interface PilotArgs { run: boolean; caseId: string | null; ai: boolean }
export function parsePilotArgs(input: string[]): PilotArgs {
  const args = input.filter(item => item !== '--');
  let run = false; let dry = false; let ai = false; let caseId: string | null = null;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) throw new Error('invalid-flags');
    seen.add(flag);
    if (flag === '--run') run = true;
    else if (flag === '--dry-run') dry = true;
    else if (flag === '--ai') ai = true;
    else if (flag === '--case') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error('invalid-case');
      caseId = value;
    } else throw new Error('invalid-flags');
  }
  if (run && dry) throw new Error('invalid-flags');
  if (run && !caseId) throw new Error('single-case-required');
  return { run, caseId, ai };
}
export function readPilotCases(root: string): Record<string, CheckRequest> {
  // This is the only evaluation data loaded by the executable. Manually
  // researched assertions are deliberately outside the provider input path.
  const raw: unknown = JSON.parse(readFileSync(resolve(root, 'tests/discovery/data/pilot-cases.json'), 'utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid-cases');
  const result: Record<string, CheckRequest> = {};
  for (const [caseId, value] of Object.entries(raw)) {
    if (!/^[a-z0-9-]{1,70}$/.test(caseId) || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid-cases');
    const item = value as Record<string, unknown>;
    if (Object.keys(item).sort().join(',') !== 'author,formats,position,preferredMarket,series,title' || item.title !== '') throw new Error('invalid-cases');
    const parsed = parseCheckRequest({ requestId: `pilot-${caseId}`, seriesId: `pilot-${caseId}`,
      target: { series: item.series, author: item.author, position: item.position, title: item.title, orderNote: '' },
      preferredMarket: item.preferredMarket, formats: item.formats, useAi: false });
    if (!parsed.ok) throw new Error('invalid-cases');
    result[caseId] = parsed.value;
  }
  if (!Object.keys(result).length) throw new Error('invalid-cases');
  return result;
}
function sanitized(result: CheckResponse, caseId: string, latencyMs: number) {
  const { identity, identityAttribution, releases, conflicts } = result.proposals;
  return { caseId, latencyMs, summary: result.summary,
    proposals: { identity: identity ? { title: identity.title, author: identity.author, position: identity.position, attribution: identityAttribution } : null,
      releases: Object.fromEntries(Object.entries(releases).map(([format, release]) => [format, release ? {
        title: release.title, position: release.position, state: release.state, date: release.date, provenance: release.provenance,
      } : null])), conflicts }, sources: result.sources };
}
export async function runPilot(args: string[], options: {
  root?: string; fetcher?: typeof fetch; runtime?: DiscoveryDependencies; print?: (value: string) => void;
} = {}): Promise<void> {
  const flags = parsePilotArgs(args);
  const root = options.root ?? process.cwd();
  const print = options.print ?? console.log;
  const cases = readPilotCases(root);
  if (flags.caseId && !Object.hasOwn(cases, flags.caseId)) throw new Error('unknown-case');
  const config = loadDiscoveryConfig(root);
  if (!flags.run) {
    const selected = flags.caseId ? [flags.caseId] : Object.keys(cases);
    print(JSON.stringify({ mode: 'dry-run', requestsMade: 0, liveGate: 'pending',
      keyPresence: { search: Boolean(config.tavilyKey), ai: Boolean(config.deepseekKey), googleBooks: Boolean(config.googleBooksKey?.trim()) },
      plan: selected.map(caseId => ({ caseId, markets: [...new Set([cases[caseId].preferredMarket, 'US', 'GB', 'CA'])],
        queries: { appleMax: 12, openlibraryMax: 3, googleBooksMax: config.googleBooksKey?.trim() ? 2 : 0, tavilyMax: 3, deepseekMax: flags.ai ? 1 : 0 },
        aiInputBytesMax: 20000, aiOutputTokensMax: 2048, deadlineMs: 180000 })),
      aiEstimatePerCase: flags.ai ? estimatedMaxAiUsd() : null,
      aiConsent: flags.ai ? 'Pending explicit authorization for the concrete batch. Dry run makes no calls.' : 'AI disabled',
    }, null, 2));
    return;
  }
  const request = { ...cases[flags.caseId!], useAi: flags.ai };
  const runtime = options.runtime ?? createDiscoveryRuntime(config, options.fetcher);
  const start = performance.now();
  const result = await runDiscovery(request, runtime, new AbortController().signal);
  print(JSON.stringify(sanitized(result, flags.caseId!, Math.round(performance.now() - start)), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runPilot(process.argv.slice(2)).catch(() => { console.error('discovery-pilot-failed'); process.exitCode = 1; });
}
