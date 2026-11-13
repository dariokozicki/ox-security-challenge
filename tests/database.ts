import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { PostgresStore } from '../src/server/postgres-store.js';
import { migrateDatabase } from '../src/server/db/migrate.js';
import { LocalSnapshotStore } from '../src/server/snapshots/local.js';

export async function testDatabase() {
  const url =
    process.env.TRACE_TEST_DATABASE_URL || 'postgres://trace:trace-local@127.0.0.1:54329/trace';
  const admin = new Pool({ connectionString: url, max: 1 });
  const schema = `trace_test_${randomUUID().replaceAll('-', '')}`;
  const directory = await mkdtemp(join(tmpdir(), 'trace-objects-'));
  const objects = new LocalSnapshotStore(directory);
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const setup = new PostgresStore(url, undefined, schema, objects);
  await migrateDatabase(setup.pool, `${schema}_migrations`);
  await setup.close();
  return {
    url,
    schema,
    objects,
    async cleanup() {
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.query(`DROP SCHEMA "${schema}_migrations" CASCADE`);
      await admin.end();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
export async function testStore(clock?: () => number) {
  const database = await testDatabase();
  const store = new PostgresStore(database.url, clock, database.schema, database.objects);
  const close = store.close.bind(store);
  let closed = false;
  store.close = async () => {
    if (closed) return;
    closed = true;
    await close();
    await database.cleanup();
  };
  return store;
}
