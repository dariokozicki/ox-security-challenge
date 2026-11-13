import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testStore } from './database.js';
import { buildApi } from '../src/server/api.js';
import { processNext } from '../src/server/worker.js';
import { complete, snapshot } from './helpers.js';
test('reassessment preserves a pinned revision but re-runs current advisory research', async () => {
  const store = await testStore();
  const app = await buildApi(store, { static: false, token: '' });
  try {
    const original = await store.create('https://github.com/example/repo', 'live', 'first-scan');
    await processNext(store, {
      acquire: async () => snapshot(),
      source: async () => complete(),
      dependencies: async () => complete(),
      research: async () => complete(),
    });
    const recheck = () =>
      app.inject({
        method: 'POST',
        url: `/api/scans/${original.id}/recheck`,
        headers: { 'idempotency-key': 'recheck-scan' },
        payload: {},
      });
    const created = (await recheck()).json().scan;
    assert.notEqual(created.id, original.id);
    assert.equal((await recheck()).json().scan.id, created.id);
    let researched = false;
    await processNext(store, {
      acquire: async () => {
        throw new Error('Must not acquire a new commit');
      },
      source: async () => complete(),
      dependencies: async () => complete(),
      research: async () => {
        researched = true;
        return complete();
      },
    });
    assert.equal(researched, true);
    assert.equal((await store.get(created.id)).snapshot?.revision, snapshot().revision);
    assert.equal((await store.get(original.id)).status, 'completed');
  } finally {
    await app.close();
    await store.close();
  }
});
