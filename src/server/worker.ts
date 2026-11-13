import type { StorePort } from './store-types.js';
import { acquire } from './acquire.js';
import { investigateSource } from './ai-source.js';
import { researchThreats } from './threat-research.js';
import { scanDependencies } from './dependency-scanner.js';
import { AppError, publicError } from './config.js';
import type { AnalyzerResult } from '../shared/types.js';
import type { Providers } from './types.js';
import { mergeDependencyBatch } from './continuation.js';
export const providers: Providers = {
  acquire,
  source: (snapshot, signal) => investigateSource(snapshot, signal),
  dependencies: scanDependencies,
  research: researchThreats,
};
export async function processNext(
  store: StorePort,
  p: Providers = providers,
  shutdown?: AbortSignal,
): Promise<boolean> {
  const job = await store.claim();
  if (!job) return false;
  const controller = new AbortController();
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(600_000),
    ...(shutdown ? [shutdown] : []),
  ]);
  let beating = false;
  const beat = setInterval(async () => {
    if (beating) return;
    beating = true;
    try {
      if (!(await store.heartbeat(job.scan.id, job.fence))) controller.abort();
    } catch {
      controller.abort();
    } finally {
      beating = false;
    }
  }, 5000);
  try {
    let snapshot = await store.snapshot(job.scan.id);
    if (!snapshot) {
      snapshot = await p.acquire(job.scan.repository, job.scan.mode, signal);
      await store.checkpoint(job.scan.id, job.fence, snapshot);
    }
    for (const name of ['dependencies', 'source', 'research'] as const) {
      if (signal.aborted)
        throw new AppError(
          'interrupted',
          'Scan was interrupted or exceeded its overall time limit.',
          503,
          true,
        );
      const saved = (await store.get(job.scan.id)).analyzers[name];
      if (
        saved?.status === 'complete' ||
        (snapshot.continuation &&
          saved &&
          (name === 'dependencies'
            ? saved.packageCoverage?.batchCompleted
            : saved.status !== 'failed'))
      )
        continue;
      const start = Date.now();
      let result: AnalyzerResult;
      try {
        const previous = snapshot.continuation
          ? await store.get(snapshot.continuation.parentScanId)
          : undefined;
        const provider = p[name];
        if (!previous || name === 'dependencies')
          await store.beginStage(job.scan.id, job.fence, name);
        result =
          previous && name !== 'dependencies'
            ? {
                ...(previous.analyzers[name] || {
                  status: 'skipped',
                  findings: [],
                  durationMs: 0,
                  version: 'unavailable',
                }),
                detail: `Retained from the original revision review. ${previous.analyzers[name]?.detail || 'No result available.'}`,
              }
            : provider
              ? name === 'source'
                ? await p.source(snapshot, signal, job.scan.id)
                : await provider(snapshot, signal)
              : {
                  status: 'skipped',
                  findings: [],
                  detail: 'Research provider not supplied.',
                  version: 'unconfigured',
                  durationMs: 0,
                };
        if (previous && name === 'dependencies')
          result = mergeDependencyBatch(previous.analyzers.dependencies, result, snapshot);
      } catch (e) {
        result = {
          status: 'failed',
          detail: publicError(e),
          findings: [],
          durationMs: Date.now() - start,
          version: name === 'dependencies' ? 'OSV API v1' : 'AI investigation v1',
        };
        if (snapshot.continuation && name === 'dependencies') {
          const previous = await store.get(snapshot.continuation.parentScanId);
          result = mergeDependencyBatch(previous.analyzers.dependencies, result, snapshot);
        }
      }
      await store.stage(job.scan.id, job.fence, name, result);
      if (signal.aborted)
        throw new AppError(
          'interrupted',
          'Scan was interrupted or exceeded its overall time limit.',
          503,
          true,
        );
    }
    await store.finish(job.scan.id, job.fence);
  } catch (e) {
    if (e instanceof AppError && e.code === 'lease_lost') return true;
    try {
      await store.fail(
        job.scan.id,
        job.fence,
        publicError(e),
        e instanceof AppError && e.retryable,
      );
    } catch (lease) {
      if (!(lease instanceof AppError && lease.code === 'lease_lost')) throw lease;
    }
  } finally {
    clearInterval(beat);
  }
  return true;
}
export { workerLoop } from './worker-loop.js';
