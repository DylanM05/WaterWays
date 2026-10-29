const { test } = require('node:test');
const assert = require('node:assert/strict');
const { connectWithRetry } = require('../utilities/database');

test('keeps retrying the first connection until it succeeds, then starts the scheduler once', async () => {
  console.log = () => {};
  console.error = () => {};
  let attempts = 0;
  let started = 0;
  const waits = [];
  const connected = await connectWithRetry('mongodb://example', {
    connect: async () => {
      attempts++;
      if (attempts < 4) throw new Error('connection refused');
    },
    onConnected: () => { started++; },
    wait: async ms => { waits.push(ms); }
  });
  assert.equal(connected, 4);
  assert.equal(started, 1);
  assert.deepEqual(waits, [5000, 10000, 15000]);
});

test('waits at most 30 seconds between attempts', async () => {
  const waits = [];
  let attempts = 0;
  await connectWithRetry('mongodb://example', {
    connect: async () => { if (++attempts < 10) throw new Error('down'); },
    wait: async ms => { waits.push(ms); }
  });
  assert.equal(Math.max(...waits), 30000);
});
