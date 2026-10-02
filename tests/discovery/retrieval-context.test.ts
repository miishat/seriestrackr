// @vitest-environment node
import { expect, test } from 'vitest';
import { createRetrievalContext } from '../../server/discovery/retrievalContext';

test('one ledger cannot spend a second Hardcover request or a third Google request', () => {
  const ctx = createRetrievalContext();
  expect(ctx.claim('hardcover')).toBe(true);
  expect(ctx.claim('hardcover')).toBe(false);
  expect(ctx.claim('googlebooks')).toBe(true);
  expect(ctx.claim('googlebooks')).toBe(true);
  expect(ctx.claim('googlebooks')).toBe(false);
});

test('Apple shares 12 starts across API and HTML with at most 6 HTML starts', () => {
  const ctx = createRetrievalContext();
  for (let i = 0; i < 6; i++) expect(ctx.claim('apple', true)).toBe(true);
  expect(ctx.claim('apple', true)).toBe(false);
  expect(ctx.canClaim('apple', true)).toBe(false);
  for (let i = 0; i < 6; i++) expect(ctx.claim('apple')).toBe(true);
  expect(ctx.claim('apple')).toBe(false);
  expect(ctx.snapshot().apple).toBe(12);
});

test('HTML starts are Apple only, and other ceilings are fixed', () => {
  const ctx = createRetrievalContext();
  expect(ctx.claim('openlibrary', true)).toBe(false);
  expect(ctx.snapshot().openlibrary).toBe(0);
  for (let i = 0; i < 3; i++) expect(ctx.claim('openlibrary')).toBe(true);
  expect(ctx.claim('openlibrary')).toBe(false);
  for (let i = 0; i < 3; i++) expect(ctx.claim('tavily')).toBe(true);
  expect(ctx.claim('tavily')).toBe(false);
  expect(ctx.claim('deepseek')).toBe(true);
  expect(ctx.claim('deepseek')).toBe(false);
});

test('snapshots are copies and contexts never share counters', () => {
  const ctx = createRetrievalContext();
  ctx.claim('hardcover');
  const snapshot = ctx.snapshot();
  snapshot.hardcover = 0;
  expect(ctx.snapshot().hardcover).toBe(1);
  expect(createRetrievalContext().snapshot().hardcover).toBe(0);
});
