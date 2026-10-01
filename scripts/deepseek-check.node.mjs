import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequest, validateOutput, runCheck, redact } from './discovery-deepseek-check.mjs';

const key = 'synthetic-secret-for-tests';
const correct = () => JSON.stringify({ cases: [
  { id: 'earliest', bookDate: '2026-10-01', bookSourceId: 'S1', audioDate: null, audioSourceId: null },
  { id: 'market-language', bookDate: null, bookSourceId: null, audioDate: null, audioSourceId: null },
  { id: 'partial-date', bookDate: null, bookSourceId: null, audioDate: '2026-11-01', audioSourceId: 'S7' },
  { id: 'conflict', bookDate: null, bookSourceId: null, audioDate: null, audioSourceId: null },
  { id: 'source-instruction', bookDate: '2026-12-01', bookSourceId: 'S10', audioDate: null, audioSourceId: null },
] });

test('one extraction uses capped output, disabled thinking and no tools', () => {
  const request = createRequest();
  assert.equal(request.model, 'deepseek-flash');
  assert.equal(request.max_tokens, 2048);
  assert.deepEqual(request.thinking, { type: 'disabled' });
  assert.equal(request.tools, undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(request.messages)) <= 16000);
});

test('validation requires exact evidence-derived results for every case', () => {
  assert.equal(validateOutput(correct()).passed, true);
  const wrong = JSON.parse(correct());
  wrong.cases[0].bookSourceId = 'invented';
  assert.equal(validateOutput(JSON.stringify(wrong)).passed, false);
  assert.equal(validateOutput('{}').passed, false);
  assert.equal(validateOutput('broken').passed, false);
});

test('dry run sends no network request', async () => {
  let calls = 0;
  const report = await runCheck({ key, execute: false, fetchImpl: async () => { calls++; } });
  assert.equal(report.status, 'dry-run');
  assert.equal(calls, 0);
});

test('missing key prevents a paid call', async () => {
  let calls = 0;
  await assert.rejects(runCheck({ key: '', execute: true, fetchImpl: async () => { calls++; } }), /key/i);
  assert.equal(calls, 0);
});

test('provider error is sanitized and never retried', async () => {
  let calls = 0;
  const report = await runCheck({ key, execute: true, fetchImpl: async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    assert.equal(init.headers.Authorization, `Bearer ${key}`);
    assert.equal(init.redirect, 'error');
    return new Response(JSON.stringify({ error: { message: key } }), { status: 503 });
  } });
  assert.equal(calls, 1);
  assert.equal(report.status, 'provider-error');
  assert.ok(!JSON.stringify(report).includes(key));
});

test('successful response records validation without raw provider content', async () => {
  const report = await runCheck({ key, execute: true, fetchImpl: async () => new Response(JSON.stringify({
    choices: [{ finish_reason: 'stop', message: { content: correct() } }],
    usage: { prompt_tokens: 1000, completion_tokens: 200 },
    secretEcho: key,
  })) });
  assert.equal(report.validation.passed, true);
  assert.equal(report.status, 'completed');
  assert.ok(!JSON.stringify(report).includes(key));
});

test('truncated output is not a passing extraction', async () => {
  const report = await runCheck({ key, execute: true, fetchImpl: async () => new Response(JSON.stringify({
    choices: [{ finish_reason: 'length', message: { content: correct() } }],
  })) });
  assert.equal(report.validation.passed, false);
});

test('redaction removes literal keys and bearer credentials', () => {
  assert.ok(!redact(`Echo ${key}; Authorization: Bearer other-secret`, key).includes(key));
  assert.ok(!redact('Bearer other-secret', key).includes('other-secret'));
});

test('a real-evidence suite sends its own request and uses its own validator', async () => {
  const request = { ...createRequest(), messages: [{ role: 'user', content: 'Real evidence suite in JSON' }] };
  let sentBody;
  const report = await runCheck({ key, execute: true, request, testName: 'real evidence', validator: content => ({ passed: content === '{"real":true}' }),
    fetchImpl: async (_url, init) => {
      sentBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"real":true}' } }] }));
    } });
  assert.deepEqual(sentBody.messages, request.messages);
  assert.equal(report.test, 'real evidence');
  assert.equal(report.validation.passed, true);
});
