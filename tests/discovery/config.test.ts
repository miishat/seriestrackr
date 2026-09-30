// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { loadDiscoveryConfig } from '../../server/discovery/config';

const roots: string[] = [];
const root = () => { const path = mkdtempSync(join(tmpdir(), 'discovery-config-')); roots.push(path); return path; };
const write = (path: string, file: string, text: string) => writeFileSync(join(path, file), text);
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); });

test('missing service files yield null keys and the approved model', () => {
  expect(loadDiscoveryConfig(root())).toEqual({ tavilyKey: null, deepseekKey: null, googleBooksKey: null, model: 'deepseek-flash' });
});

test('reads only the three service files without mutating the process environment', () => {
  const path = root();
  const before = { ...process.env };
  write(path, '.env', 'TAVILY_API_KEY=wrong\nDEEPSEEK_API_KEY=wrong');
  write(path, '.env.local', 'TAVILY_API_KEY=wrong\nVITE_DEEPSEEK_API_KEY=wrong');
  write(path, '.env.discovery.local', '# service key\nexport TAVILY_API_KEY="test-tavily=#value"\nDEEPSEEK_API_KEY=wrong');
  write(path, '.env.deepseek.local', 'DEEPSEEK_API_KEY=\'test-deepseek=#value\'\nDEEPSEEK_MODEL=deepseek-flash\nTAVILY_API_KEY=wrong');
  write(path, '.env.google-books.local', 'export GOOGLE_BOOKS_API_KEY=" fake-google-secret=#value " # comment\nTAVILY_API_KEY=wrong\nDEEPSEEK_API_KEY=wrong');
  expect(loadDiscoveryConfig(path)).toEqual({ tavilyKey: 'test-tavily=#value', deepseekKey: 'test-deepseek=#value', googleBooksKey: 'fake-google-secret=#value', model: 'deepseek-flash' });
  expect(process.env).toEqual(before);
});

test('blank keys and model use safe defaults', () => {
  const path = root();
  write(path, '.env.discovery.local', 'TAVILY_API_KEY=');
  write(path, '.env.deepseek.local', 'DEEPSEEK_API_KEY=" "\nDEEPSEEK_MODEL=');
  write(path, '.env.google-books.local', 'GOOGLE_BOOKS_API_KEY=" "');
  expect(loadDiscoveryConfig(path)).toEqual({ tavilyKey: null, deepseekKey: null, googleBooksKey: null, model: 'deepseek-flash' });
});

test('rejects a nonblank model other than deepseek-flash with a sanitized error', () => {
  const path = root();
  write(path, '.env.deepseek.local', 'DEEPSEEK_API_KEY=test-secret\nDEEPSEEK_MODEL=test-secret');
  expect(() => loadDiscoveryConfig(path)).toThrow(/^invalid-config$/);
});

test.each([
  'TAVILY_API_KEY=test-secret\nTAVILY_API_KEY=second-secret',
  'TAVILY_API_KEY=test-secret\nexport TAVILY_API_KEY=second-secret',
  'TAVILY_API_KEY=test-secret\nmalformed test-secret',
  'TAVILY_API_KEY="test-secret',
  'TAVILY_API_KEY=\'test-secret',
  'TAVILY_API_KEY="test-secret" trailing-secret',
  '1INVALID=test-secret',
])('rejects malformed or duplicate environment assignments without echoing input %#', (text) => {
  const path = root();
  write(path, '.env.discovery.local', text);
  expect(() => loadDiscoveryConfig(path)).toThrow(/^invalid-config$/);
});

test('accepts comments and native quoted multiline environment values', () => {
  const path = root();
  write(path, '.env.discovery.local', ' # comment\nTAVILY_API_KEY="test\nvalue" # trailing comment\n');
  expect(loadDiscoveryConfig(path).tavilyKey).toBe('test\nvalue');
});

test('filesystem failures are sanitized', () => {
  const path = root();
  mkdirSync(join(path, '.env.discovery.local'));
  expect(() => loadDiscoveryConfig(path)).toThrow(/^invalid-config$/);
});

test('ignores Google keys in every other environment file', () => {
  const path = root();
  for (const file of ['.env', '.env.local', '.env.discovery.local', '.env.deepseek.local']) {
    write(path, file, 'GOOGLE_BOOKS_API_KEY=fake-google-secret');
  }
  expect(loadDiscoveryConfig(path).googleBooksKey).toBeNull();
});

test('Google retains quoted multiline parsing and trims whitespace', () => {
  const path = root(); const before = { ...process.env };
  write(path, '.env.google-books.local', '# comment\nGOOGLE_BOOKS_API_KEY=\' fake\nvalue \'');
  expect(loadDiscoveryConfig(path).googleBooksKey).toBe('fake\nvalue');
  expect(process.env).toEqual(before);
});

test.each([
  'GOOGLE_BOOKS_API_KEY=fake-google-secret\nGOOGLE_BOOKS_API_KEY=second-secret',
  'GOOGLE_BOOKS_API_KEY=fake-google-secret\nexport GOOGLE_BOOKS_API_KEY=second-secret',
  'GOOGLE_BOOKS_API_KEY=fake-google-secret\nmalformed fake-google-secret',
  'GOOGLE_BOOKS_API_KEY="fake-google-secret',
  'GOOGLE_BOOKS_API_KEY=\'fake-google-secret',
  'GOOGLE_BOOKS_API_KEY="fake-google-secret" trailing-secret',
  '1INVALID=fake-google-secret',
])('Google malformed or duplicate assignments are sanitized %#', text => {
  const path = root(); write(path, '.env.google-books.local', text);
  expect(() => loadDiscoveryConfig(path)).toThrow(/^invalid-config$/);
});

test('Google filesystem failures are sanitized', () => {
  const path = root(); mkdirSync(join(path, '.env.google-books.local'));
  expect(() => loadDiscoveryConfig(path)).toThrow(/^invalid-config$/);
});
