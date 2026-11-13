import { pgTable, uuid, text, bigint, integer, jsonb, index } from 'drizzle-orm/pg-core';
import type { Scan } from '../../shared/types.js';
import type { SnapshotManifest } from '../snapshots/types.js';
import type { ApiUsage } from '../api-usage-types.js';

export const scans = pgTable(
  'scans',
  {
    id: uuid('id').primaryKey(),
    status: text('status').notNull(),
    created: bigint('created', { mode: 'number' }).notNull(),
    available: bigint('available', { mode: 'number' }).notNull(),
    attempt: integer('attempt').notNull().default(0),
    fence: uuid('fence'),
    lease: bigint('lease', { mode: 'number' }).notNull().default(0),
    idempotency: text('idempotency').notNull().unique(),
    requestHash: text('request_hash').notNull(),
    doc: jsonb('doc').$type<Scan>().notNull(),
    snapshot: jsonb('snapshot').$type<SnapshotManifest>(),
    snapshotKey: text('snapshot_key'),
  },
  (table) => [
    index('scan_queue').on(table.status, table.available, table.created),
    index('scan_snapshot').on(table.snapshotKey),
  ],
);
export const snapshotObjects = pgTable('snapshot_objects', {
  key: text('key').primaryKey(),
  generation: text('generation'),
  expires: bigint('expires', { mode: 'number' }).notNull(),
  purged: integer('purged').notNull().default(0),
});
export const workers = pgTable('workers', {
  id: text('id').primaryKey(),
  heartbeat: bigint('heartbeat', { mode: 'number' }).notNull(),
});
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  until: bigint('until', { mode: 'number' }).notNull(),
});
export const apiRequests = pgTable('api_requests', {
  id: uuid('id').primaryKey(),
  created: bigint('created', { mode: 'number' }).notNull(),
  model: text('model').notNull(),
  usage: jsonb('usage').$type<ApiUsage>(),
});
