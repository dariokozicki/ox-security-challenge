import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

export async function migrateDatabase(pool: Pool, migrationSchema = 'drizzle') {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(81704101)');
    await migrate(drizzle(client), {
      migrationsFolder: 'migrations',
      migrationsSchema: migrationSchema,
    });
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock(81704101)');
    } finally {
      client.release();
    }
  }
}
