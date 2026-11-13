import { scanStarted } from '../../shared/scan-messages.js';
import { createHash, randomUUID } from 'node:crypto';
import { and, eq, lte, sql, count, inArray } from 'drizzle-orm';
import { scans } from './schema.js';
import { databaseTime } from './connection.js';
import { AppError, config } from '../config.js';
import type { Database, Clock } from './types.js';
import type { Scan, Snapshot } from '../../shared/types.js';
import { inventoryFrom } from '../inventory.js';
import { persistSnapshot, snapshotLock, extendSnapshot } from '../snapshots/registry.js';
import type { SnapshotStore } from '../snapshots/types.js';

export function event(scan: Scan, message: string, now: number) {
  scan.updatedAt = new Date(now).toISOString();
  scan.events.push({ at: scan.updatedAt, message });
  scan.events = scan.events.slice(-60);
}
export async function createJob(
  db: Database,
  clock: Clock | undefined,
  repository: string,
  mode: 'live' | 'demo',
  key: string,
  retryOf?: string,
  pinned?: Snapshot,
  objects?: SnapshotStore,
) {
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        repository,
        mode,
        retryOf,
        pinned: pinned?.revision,
        continuation: pinned?.continuation,
      }),
    )
    .digest('hex');
  return db.transaction(async (tx) => {
    await snapshotLock(tx);
    // Serialize admission only; workers still claim different rows concurrently.
    await tx.execute(sql`select pg_advisory_xact_lock(81704102)`);
    const [existing] = await tx.select().from(scans).where(eq(scans.idempotency, key));
    if (existing) {
      if (existing.requestHash !== hash)
        throw new AppError(
          'idempotency_conflict',
          'This request key was already used with different input.',
          409,
        );
      return existing.doc;
    }
    const [{ active }] = await tx
      .select({ active: count() })
      .from(scans)
      .where(inArray(scans.status, ['queued', 'running']));
    if (active >= config.maxQueue)
      throw new AppError('capacity', 'Scan queue is full. Try again after a scan finishes.', 429);
    const [{ total }] = await tx.select({ total: count() }).from(scans);
    if (total >= config.maxHistory)
      throw new AppError(
        'retention_limit',
        'History limit reached. Archive old scan records before accepting more scans.',
        503,
      );
    const now = await databaseTime(tx, clock);
    if (retryOf) {
      const [parent] = await tx.select({ id: scans.id }).from(scans).where(eq(scans.id, retryOf));
      if (!parent)
        throw new AppError(
          'not_found',
          'The original review was deleted. Start a new review.',
          404,
        );
    }
    const at = new Date(now).toISOString();
    const scan: Scan = {
      id: randomUUID(),
      repository,
      mode,
      status: 'queued',
      phase: 'queued',
      attempt: 0,
      createdAt: at,
      updatedAt: at,
      retryOf,
      analyzers: {},
      events: [{ at, message: 'Scan queued.' }],
    };
    if (pinned) {
      const { files, ...meta } = pinned;
      scan.snapshot = { ...meta, fileCount: files.length };
      scan.inventory = inventoryFrom(pinned);
    }
    const manifest =
      pinned && objects ? await persistSnapshot(tx, objects, pinned, now) : undefined;
    await tx.insert(scans).values({
      id: scan.id,
      status: scan.status,
      created: now,
      available: now,
      idempotency: key,
      requestHash: hash,
      doc: scan,
      snapshot: manifest,
      snapshotKey: manifest?.key,
    });
    return scan;
  });
}
export async function claimJob(db: Database, clock?: Clock) {
  return db.transaction(async (tx) => {
    await snapshotLock(tx);
    const now = await databaseTime(tx, clock);
    const expired = await tx
      .select()
      .from(scans)
      .where(and(eq(scans.status, 'running'), lte(scans.lease, now)))
      .for('update', { skipLocked: true });
    for (const row of expired) {
      const scan = row.doc;
      scan.status = scan.attempt >= config.maxAttempts ? 'failed' : 'queued';
      scan.phase = scan.status;
      scan.error =
        scan.status === 'failed'
          ? 'Scan failed after three attempts. Results collected so far are available.'
          : undefined;
      if (scan.status === 'failed') scan.completedAt = new Date(now).toISOString();
      if (scan.status === 'failed') await extendSnapshot(tx, row.id, now);
      event(
        scan,
        scan.status === 'queued'
          ? 'Scan interrupted. Retry scheduled.'
          : 'Scan failed after repeated interruptions.',
        now,
      );
      await tx
        .update(scans)
        .set({ status: scan.status, doc: scan, fence: null, lease: 0, available: now + 500 })
        .where(eq(scans.id, row.id));
    }
    const [row] = await tx
      .select()
      .from(scans)
      .where(and(eq(scans.status, 'queued'), lte(scans.available, now)))
      .orderBy(scans.created, scans.id)
      .limit(1)
      .for('update', { skipLocked: true });
    if (!row) return null;
    const scan = row.doc;
    const fence = randomUUID();
    scan.status = 'running';
    scan.phase = 'acquiring';
    delete scan.activeAnalyzer;
    scan.attempt++;
    scan.error = undefined;
    event(scan, scanStarted(scan.attempt), now);
    await tx
      .update(scans)
      .set({
        status: scan.status,
        attempt: scan.attempt,
        doc: scan,
        fence,
        lease: now + config.leaseMs,
      })
      .where(eq(scans.id, scan.id));
    return { scan, fence };
  });
}
