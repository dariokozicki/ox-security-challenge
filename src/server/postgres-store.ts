import { scanFinished, stageFinished } from '../shared/scan-messages.js';
import { desc, eq, gt, lt, sql } from 'drizzle-orm';
import { connect, databaseTime } from './db/connection.js';
import { scans, workers, rateLimits } from './db/schema.js';
import { createJob, claimJob, event } from './db/queue.js';
import { AppError, config } from './config.js';
import type { Clock, Transaction } from './db/types.js';
import type { Scan, Snapshot, AnalyzerResult } from '../shared/types.js';
import { checkpointSnapshot } from './db/checkpoint.js';
import { LocalSnapshotStore } from './snapshots/local.js';
import type { SnapshotStore } from './snapshots/types.js';
import {
  loadSnapshot,
  cleanupSnapshots,
  deleteReview,
  snapshotLock,
  extendSnapshot,
} from './snapshots/registry.js';

export class PostgresStore {
  readonly pool;
  readonly db;
  constructor(
    url: string,
    readonly clock?: Clock,
    searchPath?: string,
    readonly objects: SnapshotStore = new LocalSnapshotStore(config.snapshotDirectory),
  ) {
    const connection = connect(url, searchPath);
    this.pool = connection.pool;
    this.db = connection.db;
  }
  async close() {
    await this.pool.end();
  }
  async ready() {
    await this.db.execute(sql`select 1 from scans limit 1`);
    const legacy = await this.db.execute(
      sql`select 1 from scans where snapshot is not null and snapshot_key is null limit 1`,
    );
    if (legacy.rows.length)
      throw new Error('Run npm run db:migrate to externalize legacy snapshots.');
  }
  async get(id: string): Promise<Scan> {
    const [row] = await this.db.select({ doc: scans.doc }).from(scans).where(eq(scans.id, id));
    if (!row) throw new AppError('not_found', 'Scan not found.', 404);
    return row.doc;
  }
  async list(): Promise<Scan[]> {
    return (
      await this.db
        .select({ doc: scans.doc })
        .from(scans)
        .orderBy(desc(scans.created), desc(scans.id))
        .limit(50)
    ).map((row) => row.doc);
  }
  create(
    repository: string,
    mode: 'live' | 'demo',
    key: string,
    retryOf?: string,
    pinned?: Snapshot,
  ) {
    return createJob(this.db, this.clock, repository, mode, key, retryOf, pinned, this.objects);
  }
  claim() {
    return claimJob(this.db, this.clock);
  }
  private async mutate(
    id: string,
    fence: string,
    change: (scan: Scan, now: number, tx: Transaction) => Promise<void> | void,
  ) {
    await this.db.transaction(async (tx) => {
      await snapshotLock(tx);
      const [row] = await tx.select().from(scans).where(eq(scans.id, id)).for('update');
      const now = await databaseTime(tx, this.clock);
      if (!row || row.fence !== fence || row.status !== 'running' || row.lease <= now)
        throw new AppError('lease_lost', 'Worker lease no longer owns this scan.', 409);
      await change(row.doc, now, tx);
      await tx
        .update(scans)
        .set({ status: row.doc.status, attempt: row.doc.attempt, doc: row.doc })
        .where(eq(scans.id, id));
    });
  }
  async heartbeat(id: string, fence: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(scans).where(eq(scans.id, id)).for('update');
      const now = await databaseTime(tx, this.clock);
      if (!row || row.fence !== fence || row.status !== 'running' || row.lease <= now) return false;
      await tx
        .update(scans)
        .set({ lease: now + config.leaseMs })
        .where(eq(scans.id, id));
      return true;
    });
  }
  async workerHeartbeat(id: string) {
    const now = await databaseTime(this.db, this.clock);
    await this.db
      .insert(workers)
      .values({ id, heartbeat: now })
      .onConflictDoUpdate({ target: workers.id, set: { heartbeat: now } });
    await this.db.delete(workers).where(lt(workers.heartbeat, now - 120000));
  }
  async removeWorker(id: string) {
    await this.db.delete(workers).where(eq(workers.id, id));
  }
  async workerReady(): Promise<boolean> {
    const now = await databaseTime(this.db, this.clock);
    return (
      (
        await this.db
          .select()
          .from(workers)
          .where(gt(workers.heartbeat, now - 15000))
          .limit(1)
      ).length > 0
    );
  }
  async admitMutation(key: string): Promise<boolean> {
    const now = await databaseTime(this.db, this.clock);
    const [row] = await this.db
      .insert(rateLimits)
      .values({ key, count: 1, until: now + 60000 })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          count: sql`case when ${rateLimits.until} <= ${now} then 1 else ${rateLimits.count} + 1 end`,
          until: sql`case when ${rateLimits.until} <= ${now} then ${now + 60000} else ${rateLimits.until} end`,
        },
      })
      .returning();
    await this.db.delete(rateLimits).where(lt(rateLimits.until, now - 60000));
    return row.count <= 30;
  }
  async snapshot(id: string): Promise<Snapshot | undefined> {
    return loadSnapshot(this.db, this.objects, id);
  }
  cleanupSnapshots() {
    return cleanupSnapshots(this.db, this.objects);
  }
  delete(id: string) {
    return deleteReview(this.db, this.objects, id);
  }
  checkpoint(id: string, fence: string, snapshot: Snapshot) {
    return checkpointSnapshot(this.db, this.objects, this.clock, id, fence, snapshot);
  }
  beginStage(id: string, fence: string, name: keyof Scan['analyzers']) {
    return this.mutate(id, fence, (scan) => {
      scan.activeAnalyzer = name;
      scan.phase = name;
    });
  }
  stage(id: string, fence: string, name: keyof Scan['analyzers'], result: AnalyzerResult) {
    return this.mutate(id, fence, (scan, now) => {
      const previous = scan.analyzers[name];
      if (previous?.findings.length && result.status !== 'complete')
        result = {
          ...result,
          status: 'partial',
          findings: [
            ...previous.findings.filter((f) => !result.findings.some((n) => n.id === f.id)),
            ...result.findings,
          ],
          detail: `${result.detail} Earlier evidence from this pinned snapshot is retained.`,
        };
      scan.analyzers[name] = result;
      delete scan.activeAnalyzer;
      scan.phase = name;
      event(scan, stageFinished(name, result), now);
    });
  }
  finish(id: string, fence: string) {
    return this.mutate(id, fence, async (scan, now, tx) => {
      const results = Object.values(scan.analyzers);
      scan.status =
        results.length === 3 &&
        results.every((r) => r.status === 'complete') &&
        !scan.snapshot?.warnings.length
          ? 'completed'
          : results.some(
                (r) => r.status === 'complete' || r.status === 'partial' || r.findings.length,
              )
            ? 'partial'
            : 'failed';
      scan.phase = 'complete';
      scan.completedAt = new Date(now).toISOString();
      event(scan, scanFinished(scan.status), now);
      await extendSnapshot(tx, id, now);
      await tx.update(scans).set({ fence: null, lease: 0 }).where(eq(scans.id, id));
    });
  }
  fail(id: string, fence: string, message: string, retryable: boolean) {
    return this.mutate(id, fence, async (scan, now, tx) => {
      scan.status = retryable && scan.attempt < config.maxAttempts ? 'queued' : 'failed';
      scan.phase = scan.status;
      scan.error = message;
      if (scan.status === 'failed') scan.completedAt = new Date(now).toISOString();
      await extendSnapshot(tx, id, now);
      event(scan, message + (scan.status === 'queued' ? ' Retrying shortly.' : ''), now);
      await tx
        .update(scans)
        .set({ fence: null, lease: 0, available: now + Math.min(30000, 1000 * 2 ** scan.attempt) })
        .where(eq(scans.id, id));
    });
  }
}
