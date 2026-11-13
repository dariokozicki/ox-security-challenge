import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testStore } from './database.js';
import { processNext } from '../src/server/worker.js';
import { AppError } from '../src/server/config.js';
import { snapshot, complete } from './helpers.js';
test('scanner failure preserves successful analyzer result and reports partial', async () => {
  const store = await testStore();
  try {
    const scan = await store.create('repo', 'demo', 'partial-key');
    await processNext(store, {
      acquire: async () => snapshot(),
      source: async () => complete(),
      dependencies: async () => {
        throw new AppError('unavailable', 'OSV is unavailable.', 502);
      },
    });
    const result = await store.get(scan.id);
    assert.equal(result.status, 'partial');
    assert.equal(result.analyzers.source?.status, 'complete');
    assert.equal(result.analyzers.dependencies?.status, 'failed');
    assert.match(result.analyzers.dependencies?.detail || '', /unavailable/);
  } finally {
    await store.close();
  }
});
test('truncated repository coverage cannot become completed', async () => {
  const store = await testStore();
  try {
    const scan = await store.create('repo', 'demo', 'truncated-key');
    await processNext(store, {
      acquire: async () => ({ ...snapshot(), warnings: ['File limit reached.'] }),
      source: async () => complete(),
      dependencies: async () => complete(),
    });
    assert.equal((await store.get(scan.id)).status, 'partial');
  } finally {
    await store.close();
  }
});
test('transient acquisition failures back off and retry; permanent failures stop', async () => {
  let now = 10000;
  const store = await testStore(() => now);
  try {
    const scan = await store.create('repo', 'live', 'network-key');
    await processNext(store, {
      acquire: async () => {
        throw new AppError('network', 'Provider unavailable.', 502, true);
      },
      source: async () => complete(),
      dependencies: async () => complete(),
    });
    assert.equal((await store.get(scan.id)).status, 'queued');
    assert.equal(await store.claim(), null);
    now += 10000;
    await processNext(store, {
      acquire: async () => {
        throw new AppError('missing', 'Repository missing.', 404);
      },
      source: async () => complete(),
      dependencies: async () => complete(),
    });
    assert.equal((await store.get(scan.id)).status, 'failed');
    assert.equal((await store.get(scan.id)).attempt, 2);
  } finally {
    await store.close();
  }
});
