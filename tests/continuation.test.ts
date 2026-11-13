import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testStore } from './database.js';
import { buildApi } from '../src/server/api.js';
import { processNext } from '../src/server/worker.js';
import { sourceFile } from '../src/server/acquire.js';
import { scanDependencies } from '../src/server/dependency-scanner.js';
import { mergeDependencyBatch } from '../src/server/continuation.js';
import { snapshot, complete, jsonResponse } from './helpers.js';
const inventory = () => ({
  ...snapshot(),
  files: [
    sourceFile(
      'package-lock.json',
      JSON.stringify({
        lockfileVersion: 3,
        packages: Object.fromEntries(
          Array.from({ length: 105 }, (_, i) => [`node_modules/p${i}`, { version: '1.0.0' }]),
        ),
      }),
    ),
  ],
});
test('dependency continuation queries remaining packages, pins revision and makes zero AI calls', async () => {
  const store = await testStore();
  const app = await buildApi(store, { static: false, token: '' });
  const queried: string[] = [];
  const dependencies = async (input: ReturnType<typeof snapshot>) =>
    scanDependencies(input, undefined, async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      queried.push(
        ...body.queries.map(
          (q: {
            package: {
              name: string;
            };
          }) => q.package.name,
        ),
      );
      return jsonResponse({ results: body.queries.map(() => ({})) });
    });
  try {
    const first = await store.create('repo', 'live', randomUUID());
    await processNext(store, {
      acquire: async () => inventory(),
      source: async () => complete(),
      research: async () => complete(),
      dependencies,
    });
    assert.equal(queried.length, 100);
    const request = {
      method: 'POST' as const,
      url: `/api/scans/${first.id}/continue-dependencies`,
      headers: { 'idempotency-key': randomUUID() },
      payload: {},
    };
    const next = await app.inject(request);
    assert.equal(next.statusCode, 202);
    const id = next.json().scan.id;
    assert.equal((await app.inject(request)).json().scan.id, id);
    const forbidden = async () => {
      throw new Error('Unexpected acquisition or paid AI call');
    };
    await processNext(store, {
      acquire: forbidden,
      source: forbidden,
      research: forbidden,
      dependencies,
    });
    const result = await store.get(id);
    assert.equal(result.status, 'completed');
    assert.equal(result.snapshot?.revision, snapshot().revision);
    assert.equal(result.analyzers.dependencies?.packageCoverage?.checked, 105);
    assert.equal(result.analyzers.dependencies?.packageCoverage?.nextOffset, undefined);
    assert.equal(queried.length, 105);
    assert.equal(new Set(queried).size, 105);
    assert.match(result.analyzers.source!.detail, /Retained/);
    assert.equal(
      (
        await app.inject({
          ...request,
          url: `/api/scans/${id}/continue-dependencies`,
          headers: { 'idempotency-key': randomUUID() },
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (await app.inject(`/api/scans/${id}/actions`)).json().revision,
      snapshot().revision,
    );
    assert.equal((await store.get(first.id)).analyzers.dependencies?.packageCoverage?.checked, 100);
    const fresh = await app.inject({
      method: 'POST',
      url: `/api/scans/${id}/recheck`,
      headers: { 'idempotency-key': randomUUID() },
      payload: {},
    });
    assert.equal(fresh.statusCode, 202);
    assert.equal((await store.snapshot(fresh.json().scan.id))?.continuation, undefined);
  } finally {
    await app.close();
    await store.close();
  }
});
test('failed continuation retains prior evidence and cursor; unresolved advisory gaps persist', () => {
  const old = {
    ...complete(),
    status: 'partial' as const,
    packageCoverage: {
      checked: 100,
      total: 200,
      nextOffset: 100,
      issues: ['Advisory detail budget reached.'],
    },
  };
  const failed = mergeDependencyBatch(old, {
    ...complete(),
    status: 'failed',
    detail: 'Network unavailable',
  });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.packageCoverage?.nextOffset, 100);
  assert.equal(failed.packageCoverage?.batchCompleted, false);
  const misleading = mergeDependencyBatch(old, {
    ...complete(),
    status: 'failed',
    packageCoverage: { checked: 200, total: 200 },
  });
  assert.equal(misleading.packageCoverage?.nextOffset, 100);
  const next = mergeDependencyBatch(old, {
    ...complete(),
    packageCoverage: { checked: 200, total: 200, issues: [] },
  });
  assert.equal(next.status, 'partial');
  assert.match(next.detail, /Advisory detail budget/);
});
test('failed legacy continuation creates a structured retry cursor', () => {
  const legacy = {
    ...complete(),
    status: 'partial' as const,
    detail:
      '100 locked package entries checked; 0 advisory matches. Dependency budget: 100 of 105 package entries evaluated; direct npm dependencies prioritized.',
  };
  const result = mergeDependencyBatch(
    legacy,
    { ...complete(), status: 'failed' },
    {
      ...inventory(),
      continuation: { parentScanId: 'parent', packageOffset: 100 },
    },
  );
  assert.equal(result.packageCoverage?.nextOffset, 100);
  assert.equal(result.packageCoverage?.batchCompleted, false);
});
test('legacy package-budget warning clears after the final package batch', () => {
  const previous = {
    ...complete(),
    status: 'partial' as const,
    detail:
      '100 locked package entries checked; 0 advisory matches. Dependency budget: 100 of 105 package entries evaluated; direct npm dependencies prioritized.',
  };
  const result = mergeDependencyBatch(previous, {
    ...complete(),
    packageCoverage: { checked: 105, total: 105, issues: [] },
  });
  assert.equal(result.status, 'complete');
});
test('recovery keeps a completed bounded batch even when its coverage is limited', async () => {
  let now = 10000;
  const store = await testStore(() => now);
  try {
    const parent = await store.create('repo', 'live', randomUUID());
    const job = (await store.claim())!;
    await store.checkpoint(parent.id, job.fence, inventory());
    for (const name of ['source', 'research', 'dependencies'] as const)
      await store.stage(parent.id, job.fence, name, complete());
    await store.finish(parent.id, job.fence);
    const child = await store.create('repo', 'live', randomUUID(), parent.id, {
      ...inventory(),
      continuation: { parentScanId: parent.id, packageOffset: 100 },
    });
    const lease = (await store.claim())!;
    await store.stage(child.id, lease.fence, 'dependencies', {
      ...complete(),
      status: 'partial',
      packageCoverage: {
        checked: 105,
        total: 105,
        issues: ['Advisory detail unavailable'],
        batchCompleted: true,
      },
    });
    now += 40000;
    assert.equal(await store.claim(), null); // Recovery first schedules the expired attempt with backoff.
    now += 10000;
    const forbidden = async () => {
      throw new Error('Recovered batch must not repeat');
    };
    await processNext(store, {
      acquire: forbidden,
      source: forbidden,
      research: forbidden,
      dependencies: forbidden,
    });
    const result = await store.get(child.id);
    assert.equal(result.analyzers.dependencies?.packageCoverage?.checked, 105);
    assert.equal(result.status, 'partial');
    assert.doesNotMatch(result.analyzers.dependencies!.detail, /must not repeat/);
  } finally {
    await store.close();
  }
});
