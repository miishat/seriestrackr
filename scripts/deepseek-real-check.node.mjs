import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealRequest, validateRealOutput } from './discovery-deepseek-real-check.mjs';

test('real request excludes the independent expected answers', () => {
  const request = createRealRequest();
  const user = JSON.parse(request.messages[1].content);
  assert.equal(user.cases.length, 10);
  assert.equal(user.expected, undefined);
  assert.equal(user.cases[0].nextTitle, undefined);
  assert.equal(request.thinking.type, 'disabled');
});

test('real validator accepts foreign market fallback only when preferred evidence is absent', () => {
  const report = validateRealOutput(JSON.stringify({ cases: [{ id: 'ana-din-fallback', nextTitle: 'A Trade of Blood', nextPosition: 3, nextSourceId: 'P4',
    book: { date: '2026-08-04', sourceId: 'P12', market: 'US' }, audio: { date: '2026-08-04', sourceId: 'P12', market: 'US' } }] }));
  assert.equal(report.cases.find(c => c.id === 'ana-din-fallback').passed, true);
  assert.equal(report.passed, false);
});

test('real validator catches a Canadian label attached to a US source', () => {
  const report = validateRealOutput(JSON.stringify({ cases: [{ id: 'ana-din-fallback', nextTitle: 'A Trade of Blood', nextPosition: 3, nextSourceId: 'P4',
    book: { date: '2026-08-04', sourceId: 'P12', market: 'CA' }, audio: null }] }));
  assert.equal(report.cases.find(c => c.id === 'ana-din-fallback').bookPassed, false);
});

test('real validator rejects an unsupported date and invented source', () => {
  const report = validateRealOutput(JSON.stringify({ cases: [{ id: 'bound-broken', nextTitle: 'Of Empires and Dust', nextPosition: 4, nextSourceId: 'P5',
    book: { date: '2025-03-31', sourceId: 'FAKE', market: 'CA' }, audio: null }] }));
  assert.equal(report.cases.find(c => c.id === 'bound-broken').bookPassed, false);
});
