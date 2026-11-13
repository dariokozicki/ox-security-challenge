// One-time, read-only importer. SQLite is never used by the application or its tests.
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { existsSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { PostgresStore } from '../src/server/postgres-store.js';
import { config } from '../src/server/config.js';
import { scans, apiRequests } from '../src/server/db/schema.js';
import { migrateDatabase } from '../src/server/db/migrate.js';
import { persistSnapshot, snapshotLock } from '../src/server/snapshots/registry.js';
import type { Scan, Snapshot } from '../src/shared/types.js';
import type { ApiUsage } from '../src/server/api-usage-types.js';

const source = resolve(process.argv[2] || '.trace/trace.db');
if (!existsSync(source)) throw new Error('SQLite source does not exist.');
const db = new DatabaseSync(source, { readOnly: true });
const store = new PostgresStore(config.databaseUrl);
try {
  await migrateDatabase(store.pool);
  const rows = db.prepare('SELECT * FROM scans').all();
  if (rows.some((row) => ['queued', 'running'].includes(String(row.status))))
    throw new Error('Finish the existing scans and stop the old API/worker before importing.');
  let imported = 0;
  await store.db.transaction(async (tx) => {
    await snapshotLock(tx);
    for (const row of rows) {
      const doc = JSON.parse(String(row.doc)) as Scan;
      const [existing] = await tx.select().from(scans).where(eq(scans.id, doc.id));
      if (existing) {
        if (existing.requestHash !== row.request_hash || !isDeepStrictEqual(existing.doc, doc))
          throw new Error(
            'Existing PostgreSQL review differs; import stopped without overwriting it.',
          );
        continue;
      }
      const snapshot = row.snapshot ? (JSON.parse(String(row.snapshot)) as Snapshot) : undefined;
      const manifest = snapshot
        ? await persistSnapshot(tx, store.objects, snapshot, Date.now())
        : null;
      await tx.insert(scans).values({
        id: doc.id,
        status: doc.status,
        created: Number(row.created),
        available: Number(row.available),
        attempt: Number(row.attempt),
        fence: null,
        lease: 0,
        idempotency: String(row.idempotency),
        requestHash: String(row.request_hash),
        doc,
        snapshot: manifest,
        snapshotKey: manifest?.key,
      });
      imported++;
    }
  });
  const usagePath = `${source}.api-usage`;
  if (existsSync(usagePath)) {
    const usageDb = new DatabaseSync(usagePath, { readOnly: true });
    try {
      for (const row of usageDb.prepare('SELECT * FROM api_requests').all()) {
        await store.db
          .insert(apiRequests)
          .values({
            id: String(row.id),
            created: Number(row.created),
            model: String(row.model),
            usage: row.usage ? (JSON.parse(String(row.usage)) as ApiUsage) : null,
          })
          .onConflictDoNothing();
      }
    } finally {
      usageDb.close();
    }
  }
  console.log(
    `Imported ${imported} scans and preserved the API usage ledger. Original SQLite files are unchanged.`,
  );
} finally {
  db.close();
  await store.close();
}
