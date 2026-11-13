import { eq, sql } from 'drizzle-orm';
import { scans } from './schema.js';
import { persistSnapshot, snapshotLock } from '../snapshots/registry.js';
import type { Database } from './types.js';
import type { SnapshotStore } from '../snapshots/types.js';
import type { Snapshot } from '../../shared/types.js';
import { databaseTime } from './connection.js';

// Upgrade older PostgreSQL installations before starting API/worker processes.
export async function externalizeSnapshots(db: Database, objects: SnapshotStore) {
  for (;;) {
    const rows = await db
      .select({ id: scans.id })
      .from(scans)
      .where(sql`snapshot is not null and snapshot_key is null`)
      .limit(20);
    if (!rows.length) return;
    for (const row of rows) {
      await db.transaction(async (tx) => {
        await snapshotLock(tx);
        const [current] = await tx.select().from(scans).where(eq(scans.id, row.id)).for('update');
        if (!current?.snapshot || current.snapshotKey) return;
        const manifest = await persistSnapshot(
          tx,
          objects,
          current.snapshot as unknown as Snapshot,
          await databaseTime(tx),
        );
        await tx
          .update(scans)
          .set({ snapshot: manifest, snapshotKey: manifest.key })
          .where(eq(scans.id, row.id));
      });
    }
  }
}
