import { eq } from 'drizzle-orm';
import type { Database, Clock } from './types.js';
import type { Snapshot } from '../../shared/types.js';
import type { SnapshotStore } from '../snapshots/types.js';
import { scans } from './schema.js';
import { databaseTime } from './connection.js';
import { persistSnapshot, snapshotLock } from '../snapshots/registry.js';
import { inventoryFrom } from '../inventory.js';
import { event } from './queue.js';
import { AppError } from '../config.js';

export async function checkpointSnapshot(
  db: Database,
  objects: SnapshotStore,
  clock: Clock | undefined,
  id: string,
  fence: string,
  snapshot: Snapshot,
) {
  await db.transaction(async (tx) => {
    await snapshotLock(tx);
    const [before] = await tx.select().from(scans).where(eq(scans.id, id));
    const now = await databaseTime(tx, clock);
    if (!before || before.fence !== fence || before.status !== 'running' || before.lease <= now)
      throw new AppError('lease_lost', 'Worker lease no longer owns this scan.', 409);
    // Leave the scan row unlocked during filesystem I/O so heartbeats can renew its lease.
    const manifest = await persistSnapshot(tx, objects, snapshot, now);
    const [row] = await tx.select().from(scans).where(eq(scans.id, id)).for('update');
    const completed = await databaseTime(tx, clock);
    if (!row || row.fence !== fence || row.status !== 'running' || row.lease <= completed)
      throw new AppError('lease_lost', 'Worker lease no longer owns this scan.', 409);
    const { files, ...meta } = snapshot;
    row.doc.snapshot = { ...meta, fileCount: files.length };
    row.doc.phase = 'analyzing';
    row.doc.inventory = inventoryFrom(snapshot);
    event(row.doc, `Pinned ${files.length} files to ${snapshot.revision.slice(0, 12)}.`, completed);
    await tx
      .update(scans)
      .set({
        doc: row.doc,
        snapshot: manifest,
        snapshotKey: manifest.key,
      })
      .where(eq(scans.id, id));
  });
}
