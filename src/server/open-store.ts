import { config } from './config.js';
import type { StorePort } from './store-types.js';

export async function openStore(): Promise<StorePort> {
  if (process.env.NODE_ENV === 'production' && !process.env.TRACE_SNAPSHOT_DIR)
    throw new Error(
      'Production requires TRACE_SNAPSHOT_DIR on storage shared by API and workers. S3 is not implemented.',
    );
  if (config.databaseUrl) {
    const { PostgresStore } = await import('./postgres-store.js');
    const store = new PostgresStore(config.databaseUrl);
    try {
      await store.ready();
    } catch (error) {
      await store.close();
      throw error;
    }
    return store;
  }
  throw new Error('PostgreSQL requires DATABASE_URL and applied migrations.');
}
