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

describe('Compile validation', () => {
  it('POST /api/compile without body returns 400', async () => {
    const res = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
    assert.ok(body.details);
  });

  it('POST /api/compile without code returns 400', async () => {
    const res = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'JavaScript' }),
    });
    assert.strictEqual(res.status, 400);
  });

  it('POST /api/compile without language returns 400', async () => {
    const res = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'console.log(1)' }),
    });
    assert.strictEqual(res.status, 400);
  });

  it('POST /api/compile with invalid language returns 400', async () => {
    const res = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'x', language: 'Python' }),
    });
    assert.strictEqual(res.status, 400);
  });
});
