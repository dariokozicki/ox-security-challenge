import { sql } from 'drizzle-orm';
import type { Transaction } from '../db/types.js';

export async function snapshotLock(tx: Transaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(81704103)`);
}
