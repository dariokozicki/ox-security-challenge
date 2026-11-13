import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testStore } from './database.js';
import { acquire } from '../src/server/acquire.js';
import { processNext } from '../src/server/worker.js';
import { snapshotObjects } from '../src/server/db/schema.js';

test('cleanup interrupted after unlink can recover the exact source without losing findings', async () => {
  const store = await testStore();
  try {
    const data = await acquire('', 'demo');
    const scan = await store.create(
      'fixture://checkout-service',
      'demo',
      'cleanup-crash',
      undefined,
      data,
    );
    await processNext(store);
    await store.db.update(snapshotObjects).set({ expires: 0 });
    const remove = store.objects.remove.bind(store.objects);
    store.objects.remove = async (key, generation) => {
      await remove(key, generation);
      throw new Error('Simulated crash after unlink');
    };
    await store.cleanupSnapshots();
    const [pending] = await store.db.select().from(snapshotObjects);
    assert.equal(pending.purged, 2);
    assert.equal((await store.get(scan.id)).status, 'completed');
    store.objects.remove = remove;
    assert.equal((await store.snapshot(scan.id))?.revision, data.revision);
    await store.cleanupSnapshots();
    assert.equal((await store.objects.list()).length, 1);
  } finally {
    await store.close();
  }
});

test('deletion commits evidence removal and retries failed source cleanup', async () => {
  const store = await testStore();
  try {
    const data = await acquire('', 'demo');
    const scan = await store.create(
      'fixture://checkout-service',
      'demo',
      'delete-crash',
      undefined,
      data,
    );
    await processNext(store);
    const remove = store.objects.remove.bind(store.objects);
    store.objects.remove = async () => {
      throw new Error('Simulated access denied');
    };
    await store.delete(scan.id);
    await assert.rejects(store.get(scan.id), /not found/);
    assert.equal((await store.objects.list()).length, 1);
    store.objects.remove = remove;
    await store.db.update(snapshotObjects).set({ expires: 0 });
    await store.cleanupSnapshots();
    assert.equal((await store.objects.list()).length, 0);
    await assert.rejects(
      store.create('repo', 'demo', 'orphan-child', scan.id, data),
      /original review was deleted/,
    );
  } finally {
    await store.close();
  }
});
