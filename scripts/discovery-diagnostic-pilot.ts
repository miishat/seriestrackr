import { existsSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { emitDiagnostic, type DiagnosticEvent } from '../server/discovery/diagnostics';
import { estimatedMaxAiUsd } from '../server/discovery/deepseek';
import { readPilotCases, runPilot } from './discovery-pilot';

const caps = { googlebooks: 2, apple: 12, openlibrary: 3, tavily: 3, deepseek: 1 } as const;
type Counts = Record<keyof typeof caps, number>;
const zeroCounts = (): Counts => ({ googlebooks: 0, apple: 0, openlibrary: 0, tavily: 0, deepseek: 0 });
const origins: Record<string, keyof Counts> = {
  'https://www.googleapis.com': 'googlebooks', 'https://itunes.apple.com': 'apple',
  'https://openlibrary.org': 'openlibrary', 'https://api.tavily.com': 'tavily', 'https://api.deepseek.com': 'deepseek',
};
const workspaceParts = ['.superpowers', 'sdd', '2026-09-30-discovery-retrieval-diagnostics'];

export function createDiagnosticSink() {
  const events: DiagnosticEvent[] = []; let droppedEvents = 0;
  return {
    observe(event: unknown): void {
      if (!event || typeof event !== 'object' || Array.isArray(event)) return;
      emitDiagnostic(safe => {
        if (events.length < 128) events.push(safe); else droppedEvents = Math.min(1000000, droppedEvents + 1);
      }, event as DiagnosticEvent);
    },
    snapshot: () => ({ events: [...events], droppedEvents }),
  };
}

export function createDiagnosticFetch(fetcher: typeof fetch, counts: Counts, onCounts: () => void): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const provider = origins[url.origin];
    if (!provider || url.username || url.password) throw new Error('diagnostic-origin');
    if (counts[provider] >= caps[provider]) throw new Error('diagnostic-budget');
    counts[provider]++; onCounts();
    const response = await fetcher(input, { ...init, redirect: 'error' });
    if (response.redirected || (response.status >= 300 && response.status < 400)) {
      void response.body?.cancel().catch(() => {});
      throw new Error('diagnostic-redirect');
    }
    return response;
  };
}

function reserve(root: string, name: string): string {
  let ancestor = realpathSync(root);
  for (const part of workspaceParts) {
    const next = resolve(ancestor, part);
    if (existsSync(next)) {
      if (lstatSync(next).isSymbolicLink() || !lstatSync(next).isDirectory() || realpathSync(next).toLowerCase() !== next.toLowerCase()) throw new Error('invalid-output');
    } else mkdirSync(next);
    ancestor = next;
  }
  const output = resolve(ancestor, name);
  if (existsSync(output)) throw new Error('output-already-reserved');
  try { mkdirSync(output); } catch { throw new Error('output-already-reserved'); }
  return output;
}

export async function runDiagnosticPilot(args: string[], options: {
  root?: string; fetcher?: typeof fetch; print?: (value: string) => void;
} = {}): Promise<void> {
  let live = false; let dry = false; let caseId: string | null = null; let name: string | null = null;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) throw new Error('invalid-flags'); seen.add(flag);
    if (flag === '--run') live = true;
    else if (flag === '--dry-run') dry = true;
    else if (flag === '--case' || flag === '--output') {
      const value = args[++index]; if (!value || value.startsWith('--')) throw new Error('invalid-flags');
      if (flag === '--case') caseId = value; else name = value;
    } else throw new Error('invalid-flags');
  }
  if (!caseId || (live && dry) || (live && !name) || (name && !/^[a-z0-9][a-z0-9-]{0,69}$/.test(name))) throw new Error('invalid-flags');
  const root = options.root ?? process.cwd(); const print = options.print ?? console.log;
  const cases = readPilotCases(root);
  if (!Object.hasOwn(cases, caseId)) throw new Error('unknown-case');
  if (!live) {
    print(JSON.stringify({ mode: 'dry-run', caseId, requestsMade: 0, caps,
      aiEstimate: estimatedMaxAiUsd(), keyPresence: 'not-read', retries: 0 }, null, 2));
    return;
  }
  const output = reserve(root, name!); const counts = zeroCounts();
  const sink = createDiagnosticSink(); let complete = false;
  writeFileSync(resolve(output, 'reservation.json'), JSON.stringify({ caseId, caps, retries: 0 }), { flag: 'wx' });
  const saveCounts = () => writeFileSync(resolve(output, 'counts.json'), JSON.stringify(counts, null, 2));
  saveCounts();
  try {
    await runPilot(['--run', '--case', caseId, '--ai'], {
      root, fetcher: createDiagnosticFetch(options.fetcher ?? fetch, counts, saveCounts),
      onDiagnostic: sink.observe,
      print: result => { writeFileSync(resolve(output, 'result.json'), result, { flag: 'wx' }); print(result); },
    });
    complete = true;
  } catch { throw new Error('diagnostic-pilot-failed'); }
  finally {
    const report = { caseId, complete, caps, counts, ...sink.snapshot() };
    try {
      writeFileSync(resolve(output, 'diagnostics.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
      print(JSON.stringify(report, null, 2));
    } catch { throw new Error('diagnostic-pilot-failed'); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runDiagnosticPilot(process.argv.slice(2)).catch(() => { console.error('diagnostic-pilot-failed'); process.exitCode = 1; });
}
