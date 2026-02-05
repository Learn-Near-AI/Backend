import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import app from '../src/app.js';

let server;
let baseUrl;

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('Contract call/view validation', () => {
  it('POST /api/contract/call without required fields returns 400', async () => {
    const res = await fetch(`${baseUrl}/api/contract/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(res.status, 400);
  });

  it('POST /api/contract/view without required fields returns 400', async () => {
    const res = await fetch(`${baseUrl}/api/contract/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(res.status, 400);
  });
});
