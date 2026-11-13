import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApi } from '../src/server/api.js';
import { testStore } from './database.js';
import { processNext } from '../src/server/worker.js';
import { snapshot, complete } from './helpers.js';
test('API validates, deduplicates, tracks, exports and retries a durable scan', async () => {
  const store = await testStore();
  const app = await buildApi(store, { static: false, token: '' });
  const headers = { 'idempotency-key': randomUUID() };
  try {
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/scans',
      headers,
      payload: { repository: 'http://localhost/secrets' },
    });
    assert.equal(invalid.statusCode, 400);
    const create = () =>
      app.inject({
        method: 'POST',
        url: '/api/scans',
        headers,
        payload: { repository: 'https://github.com/example/repo' },
      });
    const first = await create();
    assert.equal(first.statusCode, 202);
    const id = first.json().scan.id;
    assert.equal((await create()).json().scan.id, id);
    assert.equal((await app.inject('/health/ready')).statusCode, 503);
    await store.workerHeartbeat('worker');
    assert.equal((await app.inject('/health/ready')).statusCode, 200);
    await processNext(store, {
      acquire: async () => snapshot(),
      source: async () => complete(),
      dependencies: async () => complete(),
      research: async () => complete(),
    });
    assert.equal((await app.inject(`/api/scans/${id}`)).json().scan.status, 'completed');
    const exported = await app.inject(`/api/scans/${id}/export`);
    assert.equal(exported.json().schemaVersion, 1);
    assert.match(exported.json().notice, /not proof/);
    const retry = await app.inject({
      method: 'POST',
      url: `/api/scans/${id}/retry`,
      headers: { 'idempotency-key': randomUUID() },
      payload: {},
    });
    assert.equal(retry.statusCode, 202);
    assert.equal(retry.json().scan.retryOf, id);
    assert.notEqual(retry.json().scan.id, id);
    assert.equal((await app.inject('/api/scans/not-a-uuid')).statusCode, 400);
    assert.equal((await app.inject(`/api/scans/${randomUUID()}`)).statusCode, 404);
  } finally {
    await app.close();
    await store.close();
  }
});
test('API blocks unauthorized, cross-origin, rebound-host and non-JSON access', async () => {
  const store = await testStore();
  const token = 'x'.repeat(40);
  const app = await buildApi(store, { static: false, token });
  const local = await buildApi(store, { static: false, token: '' });
  try {
    assert.equal((await app.inject('/api/scans')).statusCode, 401);
    assert.equal(
      (await app.inject({ url: '/api/scans', headers: { authorization: `Bearer ${token}` } }))
        .statusCode,
      200,
    );
    assert.equal(
      (await local.inject({ url: '/api/scans', headers: { origin: 'https://attacker.example' } }))
        .statusCode,
      403,
    );
    assert.equal(
      (await local.inject({ url: '/api/scans', headers: { host: 'attacker.example' } })).statusCode,
      403,
    );
    assert.equal(
      (
        await local.inject({
          method: 'POST',
          url: '/api/scans',
          headers: { 'content-type': 'text/plain' },
          payload: '{}',
        })
      ).statusCode,
      415,
    );
  } finally {
    await app.close();
    await local.close();
    await store.close();
  }
});
