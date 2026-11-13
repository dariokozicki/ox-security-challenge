import { and, eq, lte, sql } from 'drizzle-orm';
import { snapshotObjects } from '../db/schema.js';
import type { Database } from '../db/types.js';
import type { SnapshotStore } from './types.js';
import { databaseTime } from '../db/connection.js';
import { config } from '../config.js';
import { snapshotLock } from './locking.js';

export async function cleanupSnapshots(db: Database, objects: SnapshotStore) {
  // Commit tombstones before unlinking; a filesystem operation cannot roll back.
  await db.transaction(async (tx) => {
    await snapshotLock(tx);
    const now = await databaseTime(tx);
    await tx.execute(sql`update snapshot_objects set purged = 2 where key in (
      select key from snapshot_objects o where purged = 0 and expires <= ${now}
      and not exists (select 1 from scans s where s.snapshot_key = o.key and s.status in ('queued','running'))
      limit 20)`);
  });
  const now = await databaseTime(db);
  const pending = await db
    .select()
    .from(snapshotObjects)
    .where(and(eq(snapshotObjects.purged, 2), lte(snapshotObjects.expires, now)))
    .limit(20);
  let removed = 0;
  for (const object of pending) {
    try {
      const deleted = await db.transaction(async (tx) => {
        await snapshotLock(tx);
        const [current] = await tx
          .select()
          .from(snapshotObjects)
          .where(eq(snapshotObjects.key, object.key));
        if (current?.purged !== 2 || current.expires > (await databaseTime(tx))) return false;
        await objects.remove(object.key, current.generation ?? undefined);
        await tx
          .update(snapshotObjects)
          .set({ purged: 1 })
          .where(eq(snapshotObjects.key, object.key));
        return true;
      });
      if (deleted) removed++;
    } catch {
      // Successful deletions stay committed. Delay this object so it cannot starve others.
      await db.transaction(async (tx) => {
        await snapshotLock(tx);
        await tx
          .update(snapshotObjects)
          .set({ expires: (await databaseTime(tx)) + 60000 })
          .where(and(eq(snapshotObjects.key, object.key), eq(snapshotObjects.purged, 2)));
      });
      console.error('A source object could not be removed; cleanup will retry.');
    }
  }
  // Directory enumeration can be slow; only lock the per-object recheck and deletion.
  for (const file of await objects.list()) {
    if (file.modified + config.snapshotRetentionMs >= now) continue;
    await db
      .transaction(async (tx) => {
        await snapshotLock(tx);
        const [known] = await tx
          .select()
          .from(snapshotObjects)
          .where(eq(snapshotObjects.key, file.key));
        if (!known || (known.generation ?? undefined) !== file.generation)
          await objects.remove(file.key, file.generation);
      })
      .catch(() => {
        console.error('Abandoned source-object cleanup will retry.');
      });
  }
  return removed;
}
