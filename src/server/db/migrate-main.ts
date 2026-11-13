import { connect } from './connection.js';
import { migrateDatabase } from './migrate.js';
import { config } from '../config.js';
import { LocalSnapshotStore } from '../snapshots/local.js';
import { externalizeSnapshots } from './externalize.js';
const { pool, db } = connect(config.databaseUrl);
try {
  if (process.env.NODE_ENV === 'production' && !process.env.TRACE_SNAPSHOT_DIR)
    throw new Error('Set TRACE_SNAPSHOT_DIR to the shared object directory before migrating.');
  await migrateDatabase(pool);
  await externalizeSnapshots(db, new LocalSnapshotStore(config.snapshotDirectory));
  console.log('Database migrations complete.');
} finally {
  await pool.end();
}
