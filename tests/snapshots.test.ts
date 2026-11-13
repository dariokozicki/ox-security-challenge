import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unlink, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { testStore } from './database.js';
import { snapshot, complete, jsonResponse } from './helpers.js';
import { encode } from '../src/server/snapshots/codec.js';
import type { LocalSnapshotStore } from '../src/server/snapshots/local.js';
import { snapshotObjects, scans } from '../src/server/db/schema.js';
import { reacquire } from '../src/server/snapshots/reacquire.js';
import { buildApi } from '../src/server/api.js';
import { processNext } from '../src/server/worker.js';
import { acquire } from '../src/server/acquire.js';

test('snapshots are deduplicated, kept out of PostgreSQL, and protected by active references', async () => {
  const store = await testStore();
  try {
    const one = await store.create('repo', 'demo', 'snapshot-one', undefined, snapshot());
    const two = await store.create('repo', 'demo', 'snapshot-two', undefined, {
      ...snapshot(),
      acquiredAt: new Date().toISOString(),
    });
    const rows = await store.db.select().from(scans);
    assert.equal(rows[0].snapshotKey, rows[1].snapshotKey);
    assert.ok(!JSON.stringify(rows).includes('export const value'));
    assert.equal((await store.objects.list()).length, 1);
    await store.db.update(snapshotObjects).set({ expires: 0 });
    assert.equal(await store.cleanupSnapshots(), 0);
    const job = await store.claim();
    assert.ok(job);
    await store.fail(job.scan.id, job.fence, 'Test failure', false);
    await store.delete(job.scan.id);
    assert.equal((await store.objects.list()).length, 1);
    const remaining = job.scan.id === one.id ? two.id : one.id;
    assert.ok(await store.snapshot(remaining));
    await assert.rejects(store.delete(remaining), /Wait/);
    const next = await store.claim();
    assert.ok(next);
    await store.fail(next.scan.id, next.fence, 'Test failure', false);
    await store.delete(next.scan.id);
    assert.equal((await store.objects.list()).length, 0);
  } finally {
    await store.close();
  }
});

test('expiry preserves evidence and exact revision can be reacquired', async () => {
  const store = await testStore();
  try {
    const data = await acquire('', 'demo');
    const created = await store.create(
      'fixture://checkout-service',
      'demo',
      'expire-test',
      undefined,
      data,
    );
    await processNext(store);
    const before = await store.get(created.id);
    assert.equal(before.status, 'completed');
    await store.db.update(snapshotObjects).set({ expires: 0 });
    assert.equal(await store.cleanupSnapshots(), 1);
    assert.equal((await store.objects.list()).length, 0);
    assert.deepEqual((await store.get(created.id)).analyzers, before.analyzers);
    const restored = await store.snapshot(created.id);
    assert.equal(restored?.revision, data.revision);
    assert.equal((await store.objects.list()).length, 1);
  } finally {
    await store.close();
  }
});

test('missing or corrupted objects fail closed without reacquiring and preserve findings', async () => {
  const store = await testStore();
  const objects = store.objects as LocalSnapshotStore;
  try {
    const created = await store.create('repo', 'demo', 'quarantine-test', undefined, snapshot());
    const job = await store.claim();
    assert.ok(job);
    await store.stage(created.id, job.fence, 'source', complete());
    await store.finish(created.id, job.fence);
    const { key } = encode(snapshot());
    const [stored] = await store.db.select().from(snapshotObjects);
    const objectPath = join(objects.root, `${key}.${stored.generation}.json`);
    await writeFile(objectPath, 'corrupted');
    await assert.rejects(store.snapshot(created.id), /missing, blocked or damaged/);
    await unlink(objectPath);
    await assert.rejects(store.snapshot(created.id), /missing, blocked or damaged/);
    assert.equal((await store.get(created.id)).analyzers.source?.status, 'complete');
    const app = await buildApi(store, { static: false, token: '' });
    try {
      const recheck = await app.inject({
        method: 'POST',
        url: `/api/scans/${created.id}/recheck`,
        headers: { 'idempotency-key': 'quarantine-retry' },
        payload: {},
      });
      assert.equal(recheck.statusCode, 409);
      assert.equal(recheck.json().error.code, 'snapshot_unavailable');
      assert.equal(
        (await app.inject({ method: 'DELETE', url: `/api/scans/${created.id}` })).statusCode,
        200,
      );
    } finally {
      await app.close();
    }
  } finally {
    await store.close();
  }
});

test('source paths cannot choose object filenames; malicious text remains inert data', async () => {
  const store = await testStore();
  const objects = store.objects as LocalSnapshotStore;
  try {
    await assert.rejects(objects.get('../outside'), /Invalid snapshot key/);
    const data = snapshot();
    data.files[0].path = '../../escape.js';
    assert.throws(() => encode(data));
    const { key, bytes } = encode(snapshot());
    await objects.put(key, bytes);
    assert.deepEqual(await readFile(join(objects.root, `${key}.json`)), bytes);
    assert.deepEqual(
      (await objects.list()).map((x) => x.key),
      [key],
    );
  } finally {
    await store.close();
  }
});

test('reacquisition uses the saved commit and rejects changed bytes', async () => {
  const data = snapshot();
  const { manifest } = encode(data);
  const fetcher = (async (url: string | URL | Request) => {
    assert.ok(String(url).includes(`/${data.revision}/index.ts`));
    return new Response(data.files[0].content);
  }) as typeof fetch;
  assert.deepEqual((await reacquire(manifest, fetcher)).files, data.files);
  await assert.rejects(
    reacquire(manifest, async () => jsonResponse({ altered: true })),
    /could not be verified/,
  );
});

test('late worker cannot publish a snapshot; retention extends after completion', async () => {
  let now = Date.now();
  const store = await testStore(() => now);
  try {
    const created = await store.create('repo', 'demo', 'stale-snapshot');
    const job = await store.claim();
    assert.ok(job);
    now += 31000;
    await assert.rejects(store.checkpoint(created.id, job.fence, snapshot()), /no longer owns/);
    assert.equal((await store.objects.list()).length, 0);
    await store.claim();
    now += 1000;
    const recovered = await store.claim();
    assert.ok(recovered);
    await store.checkpoint(created.id, recovered.fence, snapshot());
    now += 5000;
    await store.finish(created.id, recovered.fence);
    const [object] = await store.db
      .select()
      .from(snapshotObjects)
      .where(eq(snapshotObjects.key, encode(snapshot()).key));
    assert.ok(object.expires >= now + 86400000);
  } finally {
    await store.close();
  }
});
