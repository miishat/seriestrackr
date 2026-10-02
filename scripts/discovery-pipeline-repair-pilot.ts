import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CheckRequest, CheckResponse } from '../shared/discovery';
import { parseCheckRequest } from '../shared/discoveryValidation';
import { loadDiscoveryConfig } from '../server/discovery/config';
import { runDiscovery } from '../server/discovery/runDiscovery';
import { createDiscoveryRuntime } from '../server/discovery/runtime';
import { createDiagnosticFetch, createDiagnosticSink, reserve } from './discovery-diagnostic-pilot';

// One bounded live recheck of one recorded library entry. Dry run is the default and makes no request.
// Only the user's captured input fields are fed to providers; researched titles live in test assertions only.
export const ceilings = { hardcover: 1, googlebooks: 2, apple: 12, openlibrary: 3, tavily: 3, deepseek: 0 } as const;
export const caseIds = ['ana-and-din-mysteries', 'book-of-the-dead', 'novels-of-the-malazan-empire', 'path-to-ascendancy', 'the-band',
  'the-blacktongue-thief', 'the-dark-profit-saga', 'the-devils', 'the-last-horizon', 'the-sun-eater', 'the-tale-of-witness'] as const;
export const titleModes = {
  'saved-title': 'Recheck of the title already saved in the library: the saved title is verified and its dates are looked up. It does not test identity discovery.',
  'blank-title': 'Autonomous discovery: the saved title is cleared so the pipeline must find the next work itself. A blank result is a valid outcome.',
} as const;
type TitleMode = keyof typeof titleModes;
const workspaceParts = ['.superpowers', 'sdd', '2026-10-02-release-pipeline-repair-pilot'];

export function readCase(root: string, caseId: string, mode: TitleMode): CheckRequest {
  if (!(caseIds as readonly string[]).includes(caseId)) throw new Error('unknown-case');
  const saved = JSON.parse(readFileSync(resolve(root, 'tests/discovery/data/pipeline-repair', `${caseId}-replay.json`), 'utf8')).request;
  const target = saved.target;
  const parsed = parseCheckRequest({ requestId: `pilot-${caseId}`, seriesId: `pilot-${caseId}`,
    target: { series: target.series, author: target.author, position: target.position, title: mode === 'blank-title' ? '' : target.title, orderNote: '' },
    preferredMarket: saved.preferredMarket, formats: saved.formats, useAi: false });
  if (!parsed.ok) throw new Error('invalid-cases');
  return parsed.value;
}

export function sanitizeResult(result: CheckResponse) {
  const { identity, releases, related } = result.proposals;
  const unknowns = [...(result.summary.reasons.includes('unknown-identity') ? ['identity'] : []),
    ...(['book', 'audio'] as const).filter(format => result.summary.formats[format] === 'unknown')];
  return { status: result.summary.status, reasons: result.summary.reasons, usage: result.summary.usage, formats: result.summary.formats,
    decisions: {
      identity: identity ? { title: identity.title, position: identity.position } : null,
      releases: Object.fromEntries(Object.entries(releases).map(([format, release]) => [format, release ? { title: release.title, state: release.state, date: release.date,
        sourceMarket: release.provenance.sourceMarket, editionFormat: release.provenance.editionFormat, datePrecision: release.provenance.datePrecision } : null])),
      related: related.map(item => ({ title: item.title, relationship: item.relationship })),
    },
    supportedSources: result.sources.length,
    candidateRoles: (result.coverCandidates ?? []).map(item => ({ role: item.role, format: item.format, provider: item.provider })),
    remainingUnknowns: unknowns };
}

// Provider quota failures are kept apart from honest no-match outcomes.
export function summarizeEvents(events: readonly { provider?: string; rule?: string }[]) {
  const rejectedRules: Record<string, number> = {};
  const providers: Record<string, { quota: number; failure: number; noMatch: number }> = {};
  for (const event of events) {
    if (!event.rule) continue;
    rejectedRules[event.rule] = (rejectedRules[event.rule] ?? 0) + 1;
    if (!event.provider) continue;
    const entry = providers[event.provider] ??= { quota: 0, failure: 0, noMatch: 0 };
    if (event.rule === 'http-quota') entry.quota++; else if (event.rule === 'http-failure') entry.failure++; else if (event.rule === 'no-match') entry.noMatch++;
  }
  return { rejectedRules, providers };
}

export async function runRepairPilot(args: string[], options: {
  root?: string; fetcher?: typeof fetch; print?: (value: string) => void; now?: () => string;
} = {}): Promise<void> {
  let live = false; let dry = false; let caseId: string | null = null; let name: string | null = null; let mode: string | null = null;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) throw new Error('invalid-flags'); seen.add(flag);
    if (flag === '--run') live = true;
    else if (flag === '--dry-run') dry = true;
    else if (flag === '--case' || flag === '--output' || flag === '--mode') {
      const value = args[++index]; if (!value || value.startsWith('--')) throw new Error('invalid-flags');
      if (flag === '--case') caseId = value; else if (flag === '--output') name = value; else mode = value;
    } else throw new Error('invalid-flags');
  }
  if (!caseId || (live && dry) || (live && (!name || !mode)) || (!live && name) || (name && !/^[a-z0-9][a-z0-9-]{0,69}$/.test(name)) ||
    (mode !== null && !Object.hasOwn(titleModes, mode))) throw new Error('invalid-flags');
  const root = options.root ?? process.cwd(); const print = options.print ?? console.log;
  const titleMode = (mode ?? 'saved-title') as TitleMode;
  const request = readCase(root, caseId, titleMode);
  if (!live) {
    print(JSON.stringify({ mode: 'dry-run', caseId, titleMode, titleModeMeaning: titleModes[titleMode], otherMode: titleMode === 'saved-title' ? 'blank-title' : 'saved-title',
      target: { series: request.target.series, author: request.target.author, position: request.target.position, title: request.target.title },
      preferredMarket: request.preferredMarket, formats: request.formats, requestsMade: 0, ceilings, ai: 'disabled', keyPresence: 'not-read', retries: 0,
      automaticRerun: false }, null, 2));
    return;
  }
  // Reserve before reading keys or making any request: a repeated output name stops here.
  const output = reserve(root, name!, workspaceParts);
  const counts = { hardcover: 0, googlebooks: 0, apple: 0, openlibrary: 0, tavily: 0, deepseek: 0 };
  const sink = createDiagnosticSink(); let complete = false; let result: ReturnType<typeof sanitizeResult> | null = null;
  const saveCounts = () => writeFileSync(resolve(output, 'counts.json'), JSON.stringify({ ceilings, starts: counts }, null, 2));
  try {
    writeFileSync(resolve(output, 'reservation.json'), JSON.stringify({ caseId, titleMode, ceilings, retries: 0, ai: 'disabled' }), { flag: 'wx' });
    saveCounts();
    // AI is disabled twice over: no key is loaded into the runtime and the request says so.
    const config = { ...loadDiscoveryConfig(root), deepseekKey: null };
    const runtime = createDiscoveryRuntime(config, createDiagnosticFetch(options.fetcher ?? fetch, counts, saveCounts), { onDiagnostic: sink.observe });
    if (options.now) runtime.now = options.now;
    const response = await runDiscovery({ ...request, useAi: false }, runtime, new AbortController().signal);
    result = sanitizeResult(response);
    writeFileSync(resolve(output, 'result.json'), JSON.stringify({ caseId, titleMode, ...result }, null, 2), { flag: 'wx' });
    complete = true;
  } catch { throw new Error('repair-pilot-failed'); }
  finally {
    const snapshot = sink.snapshot();
    const report = { caseId, titleMode, complete, ceilings, starts: counts, ...summarizeEvents(snapshot.events), events: snapshot.events, droppedEvents: snapshot.droppedEvents };
    try {
      writeFileSync(resolve(output, 'diagnostics.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
      print(JSON.stringify({ ...report, result }, null, 2));
    } catch { throw new Error('repair-pilot-failed'); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runRepairPilot(process.argv.slice(2)).catch(error => { console.error(error instanceof Error && /^(invalid-flags|unknown-case|invalid-cases|invalid-output|output-already-reserved|repair-pilot-failed)$/.test(error.message) ? error.message : 'repair-pilot-failed'); process.exitCode = 1; });
}
