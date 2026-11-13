import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PostgresStore } from '../src/server/postgres-store.js';
import { testDatabase, testStore } from './database.js';
import { config } from '../src/server/config.js';
import { snapshot, complete } from './helpers.js';

test('idempotent creation, conflicting reuse and bounded admission', async () => {
  const db = await testStore();
  try {
    const first = await db.create('repo', 'demo', 'same-key');
    assert.equal((await db.create('repo', 'demo', 'same-key')).id, first.id);
    await assert.rejects(db.create('different', 'demo', 'same-key'), /different input/);
    for (let i = 1; i < config.maxQueue; i++) await db.create('repo', 'demo', `key-${i}`);
    await assert.rejects(db.create('repo', 'demo', 'overflow'), /queue is full/);
    assert.equal((await db.create('repo', 'demo', 'same-key')).id, first.id);
  } finally {
    await db.close();
  }
});
test('reopened database recovers expired work and fences stale writers', async () => {
  const database = await testDatabase();
  let now = Date.now();
  const first = new PostgresStore(database.url, () => now, database.schema, database.objects);
  const scan = await first.create('repo', 'demo', 'recovery-key');
  const claim = await first.claim();
  assert.ok(claim);
  await first.checkpoint(scan.id, claim.fence, snapshot());
  await first.stage(scan.id, claim.fence, 'source', complete());
  await first.close();
  const second = new PostgresStore(database.url, () => now, database.schema, database.objects);
  try {
    now += config.leaseMs + 1;
    assert.equal(await second.claim(), null);
    now += 501;
    const recovered = await second.claim();
    assert.ok(recovered);
    assert.equal(recovered.scan.id, scan.id);
    assert.equal(recovered.scan.attempt, 2);
    assert.ok(await second.snapshot(scan.id));
    assert.equal((await second.get(scan.id)).analyzers.source?.status, 'complete');
    assert.equal(await second.heartbeat(scan.id, claim.fence), false);
    await assert.rejects(second.finish(scan.id, claim.fence), /no longer owns/);
    await second.stage(scan.id, recovered.fence, 'dependencies', complete());
    await second.stage(scan.id, recovered.fence, 'research', complete());
    await second.finish(scan.id, recovered.fence);
    assert.equal((await second.get(scan.id)).status, 'completed');
  } finally {
    await second.close();
    await database.cleanup();
  }
});
test('two database connections cannot claim the same job', async () => {
  const database = await testDatabase();
  const a = new PostgresStore(database.url, undefined, database.schema, database.objects);
  const b = new PostgresStore(database.url, undefined, database.schema, database.objects);
  try {
    await a.create('repo', 'demo', 'claim-key');
    const claims = await Promise.all([a.claim(), b.claim()]);
    assert.equal(claims.filter(Boolean).length, 1);
  } finally {
    await a.close();
    await b.close();
    await database.cleanup();
  }
});
test('repeated crashes exhaust retries without losing completed evidence', async () => {
  let now = Date.now();
  const db = await testStore(() => now);
  try {
    const scan = await db.create('repo', 'demo', 'exhaust-key');
    for (let attempt = 1; attempt <= 3; attempt++) {
      const claim = await db.claim();
      assert.ok(claim);
      await db.stage(scan.id, claim.fence, 'source', complete());
      now += config.leaseMs + 1;
      assert.equal(await db.claim(), null);
      now += 501;
    }
    assert.equal((await db.get(scan.id)).status, 'failed');
    assert.equal((await db.get(scan.id)).attempt, 3);
    assert.equal((await db.get(scan.id)).analyzers.source?.status, 'complete');
  } finally {
    await db.close();
  }
});
