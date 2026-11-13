import { randomUUID } from 'node:crypto';
import { count, eq, sql } from 'drizzle-orm';
import { connect } from './connection.js';
import { apiRequests } from './schema.js';
import { exhausted } from '../api-usage.js';
import type { ApiLedger } from '../api-usage-types.js';

export function postgresApiLedger(url: string, searchPath?: string): ApiLedger {
  const { db, pool } = connect(url, searchPath);
  return {
    reserve: (limit, model) =>
      db.transaction(
        async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(81704102)`);
          const [row] = await tx.select({ count: count() }).from(apiRequests);
          if (row.count >= limit) throw exhausted();
          const id = randomUUID();
          await tx.insert(apiRequests).values({ id, created: Date.now(), model });
          return id;
        },
        { isolationLevel: 'read committed' },
      ),
    async record(id, usage) {
      await db.update(apiRequests).set({ usage }).where(eq(apiRequests.id, id));
    },
    entries: () => db.select({ usage: apiRequests.usage }).from(apiRequests),
    close: () => pool.end(),
  };
}
