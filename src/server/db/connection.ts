import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema.js';
import type { Connection, Clock } from './types.js';

export function connect(databaseUrl: string, searchPath?: string) {
  if (searchPath && !/^[a-z][a-z0-9_]{0,62}$/.test(searchPath))
    throw new Error('Invalid database schema');
  const url = new URL(databaseUrl);
  if (
    ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert'].some((key) => url.searchParams.has(key))
  )
    throw new Error('Use DATABASE_SSL and DATABASE_CA_FILE for verified database TLS.');
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
    lock_timeout: 5000,
    idle_in_transaction_session_timeout: 15000,
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? {
            rejectUnauthorized: true,
            ...(process.env.DATABASE_CA_FILE
              ? { ca: readFileSync(process.env.DATABASE_CA_FILE, 'utf8') }
              : {}),
          }
        : undefined,
    ...(searchPath ? { options: `-c search_path=${searchPath}` } : {}),
  });
  pool.on('error', () => console.error('Idle PostgreSQL connection failed; pool will reconnect.'));
  return { pool, db: drizzle(pool, { schema }) };
}
export async function databaseTime(db: Connection, clock?: Clock): Promise<number> {
  if (clock) return clock();
  const result = await db.execute<{ now: string }>(
    sql`select floor(extract(epoch from clock_timestamp()) * 1000)::text as now`,
  );
  return Number(result.rows[0].now);
}
