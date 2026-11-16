// CORS and error responses: other sites get no CORS headers, and errors never include a stack trace.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { corsMiddleware } = require('../utilities/origins');
const { errorHandler, notFound } = require('../middleware/errorHandler');
const { strictLimiter, inviteLimiter } = require('../utilities/ratelimiter');
const { serve } = require('./helpers');

let api;

before(async () => {
  console.error = () => {};
  // The same order as server.js.
  const app = express();
  app.use(corsMiddleware);
  app.use(express.json());
  app.get('/ok', (req, res) => res.json({ ok: true }));
  app.post('/echo', (req, res) => res.json(req.body));
  app.get('/broken', () => { throw new Error('secret internals'); });
  app.get('/strict', strictLimiter, (req, res) => res.json({ ok: true }));
  app.get('/invite', inviteLimiter, (req, res) => res.json({ ok: true }));
  app.use(notFound);
  app.use(errorHandler);
  api = await serve(app);
});

after(() => api.close());

test('the website gets CORS headers with credentials', async () => {
  const response = await api.request('/ok', { headers: { Origin: 'https://water-ways.ca' } });
  assert.equal(response.headers['access-control-allow-origin'], 'https://water-ways.ca');
  assert.equal(response.headers['access-control-allow-credentials'], 'true');
});

test('another site gets no CORS headers and no error page', async () => {
  for (const method of ['GET', 'OPTIONS']) {
    const response = await api.request('/ok', { method, headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' } });
    assert.notEqual(response.status, 500, method);
    assert.equal(response.headers['access-control-allow-origin'], undefined, method);
    assert.equal(response.headers['access-control-allow-credentials'], undefined, method);
    assert.equal(response.text.includes('Error'), false, method);
  }
});

test('the iOS app (no Origin header) is not affected by CORS', async () => {
  const response = await api.request('/ok');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true });
});

test('malformed JSON answers a plain 400', async () => {
  const response = await api.request('/echo', { method: 'POST', body: '{"broken": ' });
  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: 'Bad Request' });
});

test('an unhandled error answers a plain 500 without the stack trace', async () => {
  const response = await api.request('/broken');
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: 'Internal Server Error' });
  assert.equal(response.text.includes('secret internals'), false);
});

test('every response varies by Origin, so a shared cache can\'t serve one site\'s version to another', async () => {
  for (const Origin of ['https://water-ways.ca', 'https://evil.example']) {
    const response = await api.request('/ok', { headers: { Origin } });
    assert.match(response.headers.vary || '', /Origin/, Origin);
  }
  assert.match((await api.request('/ok')).headers.vary || '', /Origin/, 'no Origin (iOS)');
});

test('the website can read a 400 for malformed JSON, not just a CORS error', async () => {
  const response = await api.request('/echo', {
    method: 'POST', headers: { Origin: 'https://water-ways.ca', 'Content-Type': 'application/json' }, body: '{"bad"'
  });
  assert.equal(response.status, 400);
  assert.equal(response.headers['access-control-allow-origin'], 'https://water-ways.ca');
});

test('an unknown address gets a JSON 404', async () => {
  const response = await api.request('/no/such/route');
  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: 'Not Found' });
});

test('rate limits answer in JSON, and invites are counted apart from checkout', async () => {
  let last;
  for (let i = 0; i < 31; i++) last = await api.request('/strict');
  assert.equal(last.status, 429);
  assert.match(last.body.error, /Too many requests/);
  assert.equal((await api.request('/invite')).status, 200, 'a separate count');
});
