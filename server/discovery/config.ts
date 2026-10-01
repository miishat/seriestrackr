import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

export interface DiscoveryConfig {
  tavilyKey: string | null;
  deepseekKey: string | null;
  googleBooksKey?: string | null;
  hardcoverToken?: string | null;
  model: 'deepseek-flash';
}

const invalidConfig = () => new Error('invalid-config');

// parseEnv silently skips malformed lines and overwrites duplicates. Validate
// assignment boundaries first, then let Node parse the supported env syntax.
function validateAssignments(text: string): void {
  const names = new Set<string>();
  let rest = text.replace(/^\uFEFF/, '');
  while (rest.length) {
    rest = rest.replace(/^[\t \r\n]+/, '');
    if (!rest) break;
    if (rest.startsWith('#')) {
      rest = rest.slice(rest.indexOf('\n') < 0 ? rest.length : rest.indexOf('\n') + 1);
      continue;
    }
    const assignment = /^(?:export[\t ]+)?([A-Za-z_][A-Za-z0-9_]*)[\t ]*=[\t ]*/.exec(rest);
    if (!assignment || names.has(assignment[1])) throw invalidConfig();
    names.add(assignment[1]);
    rest = rest.slice(assignment[0].length);
    const quote = rest[0];
    if (quote === '"' || quote === "'" || quote === '`') {
      const end = rest.indexOf(quote, 1);
      if (end < 0) throw invalidConfig();
      rest = rest.slice(end + 1);
      const lineEnd = rest.indexOf('\n');
      const suffix = rest.slice(0, lineEnd < 0 ? rest.length : lineEnd);
      if (!/^[\t \r]*(?:#.*)?$/.test(suffix)) throw invalidConfig();
      rest = lineEnd < 0 ? '' : rest.slice(lineEnd + 1);
    } else {
      const lineEnd = rest.indexOf('\n');
      rest = lineEnd < 0 ? '' : rest.slice(lineEnd + 1);
    }
  }
}

function readEnv(root: string, filename: string): Record<string, string> {
  let text: string;
  try {
    text = readFileSync(join(root, filename), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw invalidConfig();
  }
  try {
    validateAssignments(text);
    return parseEnv(text);
  } catch {
    throw invalidConfig();
  }
}

const key = (value: string | undefined): string | null => value?.trim() ? value.trim() : null;

export function loadDiscoveryConfig(root: string): DiscoveryConfig {
  const search = readEnv(root, '.env.discovery.local');
  const ai = readEnv(root, '.env.deepseek.local');
  const google = readEnv(root, '.env.google-books.local');
  const hardcover = readEnv(root, '.env.hardcover.local');
  const model = ai.DEEPSEEK_MODEL?.trim() || 'deepseek-flash';
  if (model !== 'deepseek-flash') throw invalidConfig();
  return { tavilyKey: key(search.TAVILY_API_KEY), deepseekKey: key(ai.DEEPSEEK_API_KEY),
    googleBooksKey: key(google.GOOGLE_BOOKS_API_KEY), hardcoverToken: key(hardcover.HARDCOVER_API_TOKEN), model };
}
