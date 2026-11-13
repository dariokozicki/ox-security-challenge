import { resolve } from 'node:path';
import { homedir } from 'node:os';
export const config = {
  port: Number(process.env.PORT || 4310),
  host: process.env.HOST || '127.0.0.1',
  token: process.env.TRACE_TOKEN || '',
  publicOrigin: process.env.TRACE_PUBLIC_ORIGIN
    ? new URL(process.env.TRACE_PUBLIC_ORIGIN).origin
    : '',
  databaseUrl:
    process.env.DATABASE_URL ||
    (process.env.NODE_ENV === 'production'
      ? ''
      : 'postgres://trace:trace-local@127.0.0.1:54329/trace'),
  snapshotDirectory: resolve(
    process.env.TRACE_SNAPSHOT_DIR || resolve(homedir(), '.trace-data', 'snapshots'),
  ),
  snapshotRetentionMs: 24 * 60 * 60 * 1000,
  workerConcurrency: Number(process.env.TRACE_WORKER_CONCURRENCY || 2),
  semgrepImage: 'semgrep/semgrep:1.145.0',
  maxFiles: 60,
  maxFileBytes: 200_000,
  maxTotalBytes: 2_000_000,
  maxPackages: 100,
  leaseMs: 30_000,
  maxAttempts: 3,
  maxQueue: 20,
  maxHistory: 500,
};
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 400,
    public retryable = false,
  ) {
    super(message);
  }
}
export function publicError(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))
    return 'Operation exceeded its time limit.';
  return 'An internal operation failed. Check the local worker logs.';
}
