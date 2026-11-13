import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { NodePgTransaction } from 'drizzle-orm/node-postgres';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type * as schema from './schema.js';
export type Database = NodePgDatabase<typeof schema>;
export type Transaction = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
export type Connection = Database | Transaction;
export type Clock = () => number;
