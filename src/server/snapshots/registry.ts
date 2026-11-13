import { cleanupSnapshots } from './cleanup.js';
export { cleanupSnapshots } from './cleanup.js';
import { snapshotLock } from './locking.js';
export { snapshotLock } from './locking.js';
import { eq, sql } from 'drizzle-orm';
import { scans, snapshotObjects } from '../db/schema.js';
import type { Database, Transaction } from '../db/types.js';
import type { Snapshot } from '../../shared/types.js';
import type { SnapshotStore } from './types.js';
import { encode, hydrate } from './codec.js';
import { AppError } from '../config.js';
import { reacquire } from './reacquire.js';
import { databaseTime } from '../db/connection.js';
import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';

export function retentionMs() {
  const hours = Number(process.env.TRACE_SNAPSHOT_TTL_HOURS || 24);
  if (!Number.isFinite(hours) || hours < 1 || hours > 168)
    throw new Error('TRACE_SNAPSHOT_TTL_HOURS must be from 1 to 168.');
  return hours * 3600000;
}
export async function persistSnapshot(
  tx: Transaction,
  objects: SnapshotStore,
  snapshot: Snapshot,
  now: number,
) {
  await snapshotLock(tx);
  const { key, bytes, manifest } = encode(snapshot);
  const [existing] = await tx.select().from(snapshotObjects).where(eq(snapshotObjects.key, key));
  // Never reuse a retired filename: an old unlink may still be pending after lock loss.
  const generation = existing && !existing.purged ? existing.generation : randomUUID();
  if (existing && !existing.purged) await objects.get(key, generation ?? undefined);
  else await objects.put(key, bytes, generation ?? undefined);
  await tx
    .insert(snapshotObjects)
    .values({ key, generation, expires: now + retentionMs(), purged: 0 })
    .onConflictDoUpdate({
      target: snapshotObjects.key,
      set: { generation, expires: now + retentionMs(), purged: 0 },
    });
  return manifest;
}
export async function loadSnapshot(
  db: Database,
  objects: SnapshotStore,
  id: string,
): Promise<Snapshot | undefined> {
  const result = await db.transaction(async (tx) => {
    await snapshotLock(tx);
    const [row] = await tx.select().from(scans).where(eq(scans.id, id));
    if (!row?.snapshot) return undefined;
    if (!row.snapshot.key)
      throw new AppError(
        'snapshot_migration',
        'Run the snapshot migration before reassessing this review.',
        409,
      );
    const [object] = await tx
      .select()
      .from(snapshotObjects)
      .where(eq(snapshotObjects.key, row.snapshot.key));
    if (!object)
      throw new AppError('snapshot_unavailable', 'Source snapshot metadata is unavailable.', 409);
    if (object.purged) return { manifest: row.snapshot };
    return {
      snapshot: hydrate(
        row.snapshot,
        await objects.get(row.snapshot.key, object.generation ?? undefined),
      ),
    };
  });
  if (!result) return undefined;
  if (result.snapshot) return result.snapshot;
  // Only an explicitly expired object is reacquired. Unexpected missing files fail closed.
  const restored = await reacquire(result.manifest!);
  await db.transaction(async (tx) => {
    await snapshotLock(tx);
    const [row] = await tx.select().from(scans).where(eq(scans.id, id));
    if (!row) throw new AppError('not_found', 'Scan not found.', 404);
    if (!isDeepStrictEqual(row.snapshot, result.manifest))
      throw new AppError(
        'snapshot_changed',
        'Source snapshot changed during retrieval. Retry this request.',
        409,
      );
    await persistSnapshot(tx, objects, restored, await databaseTime(tx));
  });
  return restored;
}
export async function extendSnapshot(tx: Transaction, scanId: string, now: number) {
  await snapshotLock(tx);
  await tx.execute(sql`update snapshot_objects set expires = greatest(expires, ${now + retentionMs()})
    where key = (select snapshot_key from scans where id = ${scanId})`);
}
export async function deleteReview(db: Database, objects: SnapshotStore, id: string) {
  await db.transaction(async (tx) => {
    await snapshotLock(tx);
    const [row] = await tx.select().from(scans).where(eq(scans.id, id)).for('update');
    if (!row) throw new AppError('not_found', 'Scan not found.', 404);
    const children = await tx.execute(
      sql`select 1 from scans where status in ('queued','running') and doc->>'retryOf' = ${id} limit 1`,
    );
    if (['queued', 'running'].includes(row.status) || children.rows.length)
      throw new AppError(
        'active',
        'Wait for this review and its continuations to finish before deleting it.',
        409,
      );
    await tx.delete(scans).where(eq(scans.id, id));
    if (!row.snapshotKey) return;
    const [reference] = await tx
      .select({ id: scans.id })
      .from(scans)
      .where(eq(scans.snapshotKey, row.snapshotKey))
      .limit(1);
    if (!reference) {
      await tx
        .update(snapshotObjects)
        .set({ purged: 2, expires: 0 })
        .where(eq(snapshotObjects.key, row.snapshotKey));
    }
  });
  await cleanupSnapshots(db, objects).catch(() => {
    console.error('Review deleted; source-object cleanup remains pending and will retry.');
  });
}
