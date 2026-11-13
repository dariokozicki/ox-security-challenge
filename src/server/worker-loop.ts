import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { processNext, providers } from './worker.js';
import type { StorePort } from './store-types.js';
import { writeFile, rm } from 'node:fs/promises';

export async function workerLoop(store: StorePort, signal: AbortSignal) {
  const concurrency =
    process.env.TRACE_AI_PROVIDER === 'codex-local' ? 1 : config.workerConcurrency;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
    throw new Error('TRACE_WORKER_CONCURRENCY must be an integer between 1 and 8.');
  const id = randomUUID();
  const healthFile = process.env.TRACE_WORKER_HEALTH_FILE;
  let beating = false;
  const beat = async () => {
    if (beating) return;
    beating = true;
    try {
      await store.workerHeartbeat(id);
      if (healthFile) await writeFile(healthFile, String(Date.now()));
    } finally {
      beating = false;
    }
  };
  await beat();
  await Promise.resolve(store.cleanupSnapshots()).catch(() => {
    console.error('Source cache cleanup failed at startup; it will retry.');
  });
  let cleaning = false;
  const cleanup = setInterval(() => {
    if (cleaning) return;
    cleaning = true;
    void Promise.resolve(store.cleanupSnapshots())
      .catch(() => {
        console.error('Source cache cleanup failed; it will retry.');
      })
      .finally(() => {
        cleaning = false;
      });
  }, 60000);
  const heartbeat = setInterval(() => {
    void beat().catch(() => {});
  }, 3000);
  const slot = async () => {
    while (!signal.aborted) {
      try {
        if (await processNext(store, providers, signal)) continue;
      } catch {
        console.error(
          'Worker could not access the queue; retrying. Existing leases will expire safely.',
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  };
  try {
    await Promise.all(Array.from({ length: concurrency }, slot));
  } finally {
    clearInterval(heartbeat);
    clearInterval(cleanup);
    await Promise.resolve(store.removeWorker(id)).catch(() => {});
    if (healthFile) await rm(healthFile, { force: true });
  }
}
