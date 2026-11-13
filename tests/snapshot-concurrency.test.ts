import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { testStore } from './database.js';
import { snapshot } from './helpers.js';
import { externalizeSnapshots } from '../src/server/db/externalize.js';
import { acquire } from '../src/server/acquire.js';
import { processNext } from '../src/server/worker.js';
import { snapshotObjects } from '../src/server/db/schema.js';

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('heartbeats can renew a lease during snapshot publication', async () => {
  const store = await testStore();
  const entered = gate();
  const released = gate();
  const put = store.objects.put.bind(store.objects);
  let checkpoint: Promise<void> | undefined;
  try {
    const scan = await store.create('repo', 'demo', 'slow-publication');
    const job = await store.claim();
    assert.ok(job);
    store.objects.put = async (key, bytes, generation) => {
      entered.resolve();
      await released.promise;
      await put(key, bytes, generation);
    };
    checkpoint = store.checkpoint(scan.id, job.fence, snapshot());
    await entered.promise;
    assert.equal(await store.heartbeat(scan.id, job.fence), true);
    released.resolve();
    await checkpoint;
    assert.equal((await store.snapshot(scan.id))?.revision, snapshot().revision);
  } finally {
    released.resolve();
    await checkpoint?.catch(() => {});
    await store.close();
  }
});

test('slow cache enumeration does not block queue admission', async () => {
  const store = await testStore();
  const entered = gate();
  const released = gate();
  let cleanup: Promise<number> | undefined;
  try {
    store.objects.list = async () => {
      entered.resolve();
      await released.promise;
      return [];
    };
    cleanup = store.cleanupSnapshots();
    await entered.promise;
    const scan = await store.create('repo', 'demo', 'during-enumeration');
    assert.equal(scan.status, 'queued');
  } finally {
    released.resolve();
    await cleanup;
    await store.close();
  }
});

test('legacy PostgreSQL inline snapshots migrate across bounded batches', async () => {
  const store = await testStore();
  try {
    for (let index = 0; index < 23; index++) {
      const scan = await store.create('repo', 'demo', `legacy-${index}`);
      await store.db.execute(sql`update scans set status = 'completed',
        snapshot = ${JSON.stringify(snapshot())}::jsonb where id = ${scan.id}`);
    }
    await externalizeSnapshots(store.db, store.objects);
    const rows = await store.db.execute(sql`select snapshot, snapshot_key from scans`);
    assert.equal(rows.rows.length, 23);
    for (const row of rows.rows) {
      assert.equal(typeof row.snapshot_key, 'string');
      assert.ok(!JSON.stringify(row.snapshot).includes('export const'));
    }
    assert.equal((await store.objects.list()).length, 1);
    await externalizeSnapshots(store.db, store.objects);
  } finally {
    await store.close();
  }
});

test('a delayed retired-object deletion cannot delete a newly reacquired snapshot', async () => {
  const store = await testStore();
  const release = gate();
  let delayed: Promise<void> | undefined;
  try {
    const data = await acquire('', 'demo');
    const scan = await store.create(
      'fixture://checkout-service',
      'demo',
      'retired-generation',
      undefined,
      data,
    );
    await processNext(store);
    const [original] = await store.db.select().from(snapshotObjects);
    // Model deletion still in flight after its database transaction lost the lock.
    await store.db.update(snapshotObjects).set({ purged: 2, expires: 0 });
    delayed = release.promise.then(() =>
      store.objects.remove(original.key, original.generation ?? undefined),
    );
    assert.equal((await store.snapshot(scan.id))?.revision, data.revision);
    const [restored] = await store.db.select().from(snapshotObjects);
    assert.notEqual(restored.generation, original.generation);
    release.resolve();
    await delayed;
    assert.equal((await store.snapshot(scan.id))?.revision, data.revision);
    assert.equal((await store.objects.list()).length, 1);
  } finally {
    release.resolve();
    await delayed;
    await store.close();
  }
});
