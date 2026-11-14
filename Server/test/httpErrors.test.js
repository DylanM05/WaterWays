// CORS and error responses: other sites get no CORS headers, and errors never include a stack trace.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cors = require('cors');
const { corsOptions } = require('../utilities/origins');
const { errorHandler } = require('../middleware/errorHandler');
const { serve } = require('./helpers');

let api;

before(async () => {
  console.error = () => {};
  const app = express();
  app.use(express.json());
  app.use(cors(corsOptions));
  app.get('/ok', (req, res) => res.json({ ok: true }));
  app.post('/echo', (req, res) => res.json(req.body));
  app.get('/broken', () => { throw new Error('secret internals'); });
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
