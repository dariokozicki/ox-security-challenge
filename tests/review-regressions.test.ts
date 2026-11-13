import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApi } from '../src/server/api.js';
import { testStore } from './database.js';
import { processNext } from '../src/server/worker.js';
import { scanDependencies } from '../src/server/dependency-scanner.js';
import { acquire, sourceFile } from '../src/server/acquire.js';
import { assertDistinctPaths } from '../src/server/materialization.js';
import { normalizeSemgrep } from '../src/server/source-evidence.js';
import { snapshot, complete } from './helpers.js';
test('encoded API routes cannot bypass auth and explicit HTTPS origin is accepted', async () => {
  const store = await testStore();
  const token = 'x'.repeat(40);
  const app = await buildApi(store, {
    token,
    static: false,
    publicOrigin: 'https://trace.example',
  });
  try {
    for (const url of ['/api/scans', '/%61pi/scans', '/api/%73cans']) {
      assert.equal((await app.inject(url)).statusCode, 401, url);
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url,
            payload: { mode: 'demo' },
            headers: { 'idempotency-key': randomUUID() },
          })
        ).statusCode,
        401,
        url,
      );
    }
    const allowed = await app.inject({
      method: 'POST',
      url: '/api/scans',
      payload: { mode: 'demo' },
      headers: {
        authorization: `Bearer ${token}`,
        origin: 'https://trace.example',
        'idempotency-key': randomUUID(),
      },
    });
    assert.equal(allowed.statusCode, 202);
    assert.equal(
      (
        await app.inject({
          url: '/%61pi/scans',
          headers: {
            authorization: `Bearer ${token}`,
            origin: 'https://attacker.example',
          },
        })
      ).statusCode,
      403,
    );
  } finally {
    await app.close();
    await store.close();
  }
});
test('interrupted analyzer evidence survives recovery and a subsequent failure', async () => {
  let now = 10000;
  const store = await testStore(() => now);
  const controller = new AbortController();
  const input = await acquire('fixture://checkout-service', 'demo');
  const partial = { ...(await scanDependencies(input)), status: 'partial' as const };
  try {
    const scan = await store.create(input.repository, 'demo', 'abort-evidence');
    await processNext(
      store,
      {
        acquire: async () => input,
        source: async () => complete(),
        dependencies: async () => {
          controller.abort();
          return partial;
        },
      },
      controller.signal,
    );
    assert.equal((await store.get(scan.id)).status, 'queued');
    assert.equal((await store.get(scan.id)).analyzers.dependencies?.findings.length, 1);
    now += 10000;
    await processNext(store, {
      acquire: async () => input,
      source: async () => complete(),
      dependencies: async () => {
        throw new Error('Provider failed');
      },
    });
    assert.equal((await store.get(scan.id)).status, 'partial');
    assert.equal((await store.get(scan.id)).analyzers.dependencies?.findings.length, 1);
  } finally {
    await store.close();
  }
});
test('case aliases, duplicate paths and file-directory collisions are rejected', () => {
  for (const paths of [
    ['A.ts', 'a.ts'],
    ['Dir/a.ts', 'dir/b.ts'],
    ['a.ts', 'A.ts/b.ts'],
    ['a.ts', 'a.ts'],
  ]) {
    assert.throws(
      () => assertDistinctPaths(paths.map((path) => sourceFile(path, ''))),
      /[Cc]ollid|[Cc]ollision|Duplicate/,
    );
  }
  assert.doesNotThrow(() =>
    assertDistinctPaths(['a/x.ts', 'a/y.ts'].map((p) => sourceFile(p, ''))),
  );
});
test('same-line source matches retain distinct column identities', () => {
  const input = { ...snapshot(), files: [sourceFile('index.ts', 'db.query(a); db.query(b);')] };
  const raw = {
    results: [1, 14].map((column) => ({
      check_id: 'trace.sql-injection',
      path: 'index.ts',
      start: { line: 1, column },
      end: { line: 1, column: column + 10 },
    })),
    errors: [],
    paths: { scanned: ['index.ts'] },
  };
  const result = normalizeSemgrep(raw, input, 1, 'digest');
  assert.equal(result.findings.length, 2);
  assert.notEqual(result.findings[0].id, result.findings[1].id);
  assert.deepEqual(
    result.findings.map((f) => f.evidence.column),
    [1, 14],
  );
});
