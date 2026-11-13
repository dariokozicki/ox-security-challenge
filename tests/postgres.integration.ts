import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalSnapshotStore } from '../src/server/snapshots/local.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresStore } from '../src/server/postgres-store.js';
import { migrateDatabase } from '../src/server/db/migrate.js';
import { processNext } from '../src/server/worker.js';
import { buildApi } from '../src/server/api.js';
import { acquire } from '../src/server/acquire.js';
import { config } from '../src/server/config.js';
import { complete } from './helpers.js';
import { connect } from '../src/server/db/connection.js';
import { postgresApiLedger } from '../src/server/db/api-usage.js';

test('Postgres migrations, concurrent claims, fencing, partial recovery and shared admission', async () => {
  const url = process.env.TRACE_TEST_DATABASE_URL;
  assert.ok(url, 'Set TRACE_TEST_DATABASE_URL to a disposable local database');
  const admin = new Pool({ connectionString: url });
  const directory = await mkdtemp(join(tmpdir(), 'trace-pg-objects-'));
  const objects = new LocalSnapshotStore(directory);
  const schema = `trace_test_${randomUUID().replaceAll('-', '')}`;
  const migrations = `${schema}_migrations`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  let now = Date.now();
  const first = new PostgresStore(url, () => now, schema, objects);
  const second = new PostgresStore(url, () => now, schema, objects);
  try {
    await migrateDatabase(first.pool, migrations);
    await migrateDatabase(first.pool, migrations);
    await first.ready();
    const repeatableUrl = new URL(url);
    repeatableUrl.searchParams.set(
      'options',
      `-c default_transaction_isolation=repeatable\\ read -c search_path=${schema}`,
    );
    const ledgerA = postgresApiLedger(repeatableUrl.toString(), schema);
    const ledgerB = postgresApiLedger(repeatableUrl.toString(), schema);
    try {
      const attempts = await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) => (i % 2 ? ledgerA : ledgerB).reserve(3, 'test')),
      );
      assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 3);
      assert.equal((await ledgerA.entries()).length, 3);
    } finally {
      await ledgerA.close();
      await ledgerB.close();
    }
    const jobs = await Promise.all(
      Array.from({ length: 3 }, (_, i) => first.create('repo', 'demo', `job-${i}`)),
    );
    assert.equal((await second.create('repo', 'demo', 'job-0')).id, jobs[0].id);
    await assert.rejects(() => second.create('different', 'demo', 'job-0'), /different input/);
    const claims = await Promise.all([first.claim(), second.claim()]);
    assert.ok(claims[0] && claims[1]);
    assert.notEqual(claims[0].scan.id, claims[1].scan.id);
    const owned = claims[0];
    const pinned = await acquire('fixture://checkout-service', 'demo');
    await first.checkpoint(owned.scan.id, owned.fence, pinned);
    await first.stage(owned.scan.id, owned.fence, 'dependencies', complete());
    now += config.leaseMs + 1;
    await second.claim();
    now += 501;
    const recovered = await second.claim();
    assert.ok(recovered);
    assert.equal(await first.heartbeat(owned.scan.id, owned.fence), false);
    await assert.rejects(() => first.finish(owned.scan.id, owned.fence), /no longer owns/);
    const retained = await first.get(owned.scan.id);
    assert.equal(retained.analyzers.dependencies?.status, 'complete');
    assert.equal((await second.snapshot(owned.scan.id))?.revision, pinned.revision);
    await first.workerHeartbeat('test-worker');
    assert.equal(await second.workerReady(), true);
    const admissions = await Promise.all(
      Array.from({ length: 35 }, (_, i) =>
        (i % 2 ? first : second).admitMutation('shared-operator'),
      ),
    );
    assert.equal(admissions.filter(Boolean).length, 30);
    await first.removeWorker('test-worker');
    assert.equal(await second.workerReady(), false);
  } finally {
    await first.close();
    await second.close();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.query(`DROP SCHEMA IF EXISTS "${migrations}" CASCADE`);
    await admin.end();
    await rm(directory, { recursive: true, force: true });
  }
});

test('server timeouts cancel stalled transactions and release their locks after rollback', async () => {
  const url = process.env.TRACE_TEST_DATABASE_URL;
  assert.ok(url);
  const { pool } = connect(url);
  const client = await pool.connect();
  try {
    assert.equal((await client.query('SHOW statement_timeout')).rows[0].statement_timeout, '10s');
    assert.equal((await client.query('SHOW lock_timeout')).rows[0].lock_timeout, '5s');
    assert.equal(
      (await client.query('SHOW idle_in_transaction_session_timeout')).rows[0]
        .idle_in_transaction_session_timeout,
      '15s',
    );
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '100ms'");
    await client.query('SELECT pg_advisory_xact_lock(976112)');
    await assert.rejects(client.query('SELECT pg_sleep(10)'), /statement timeout/);
    await client.query('ROLLBACK');
    const second = await pool.connect();
    try {
      await second.query('BEGIN');
      assert.equal(
        (await second.query('SELECT pg_try_advisory_xact_lock(976112) AS acquired')).rows[0]
          .acquired,
        true,
      );
      await second.query('ROLLBACK');
    } finally {
      second.release();
    }
    assert.equal((await client.query('SELECT 1 AS usable')).rows[0].usable, 1);
  } finally {
    client.release();
    await pool.end();
  }
});

test('Postgres backs the real API and full demo worker, including pinned reassessment', async () => {
  const url = process.env.TRACE_TEST_DATABASE_URL;
  assert.ok(url);
  const admin = new Pool({ connectionString: url });
  const directory = await mkdtemp(join(tmpdir(), 'trace-pg-objects-'));
  const objects = new LocalSnapshotStore(directory);
  const schema = `trace_test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const store = new PostgresStore(url, undefined, schema, objects);
  const app = await buildApi(store, { static: false, token: '' });
  try {
    await migrateDatabase(store.pool, `${schema}_migrations`);
    const created = await app.inject({
      method: 'POST',
      url: '/api/scans',
      headers: { 'idempotency-key': 'demo-postgres' },
      payload: { mode: 'demo' },
    });
    assert.equal(created.statusCode, 202);
    const id = created.json().scan.id;
    await processNext(store);
    const scan = (await app.inject(`/api/scans/${id}`)).json().scan;
    assert.equal(scan.status, 'completed');
    assert.equal(scan.analyzers.source.findings.length, 3);
    assert.equal(scan.analyzers.research.findings.length, 1);
    const recheck = await app.inject({
      method: 'POST',
      url: `/api/scans/${id}/recheck`,
      headers: { 'idempotency-key': 'recheck-postgres' },
      payload: {},
    });
    assert.equal(recheck.statusCode, 202);
    assert.equal(recheck.json().scan.snapshot.revision, scan.snapshot.revision);
    assert.equal((await store.list()).length, 2);
  } finally {
    await app.close();
    await store.close();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}_migrations" CASCADE`);
    await admin.end();
    await rm(directory, { recursive: true, force: true });
  }
});
