import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { PostgresStore } from '../src/server/postgres-store.js';
import { testDatabase } from './database.js';
import { buildApi } from '../src/server/api.js';

test('killed worker recovers on a real lease while API and prior evidence remain available', async () => {
  const database = await testDatabase();
  const scoped = new URL(database.url);
  scoped.searchParams.set('options', '-c search_path=' + database.schema);
  const environment = {
    ...process.env,
    DATABASE_URL: scoped.toString(),
    TRACE_SNAPSHOT_DIR: database.objects.root,
  };
  const store = new PostgresStore(database.url, undefined, database.schema, database.objects);
  const api = await buildApi(store, { static: false, token: '' });
  const scan = await store.create('fixture://checkout-service', 'demo', 'fault-drill');
  const holder = spawn(process.execPath, ['--import', 'tsx', 'tests/lease-holder.ts'], {
    windowsHide: true,
    env: environment,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let worker: ReturnType<typeof spawn> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Worker checkpoint timed out')), 10000);
      holder.stdout.on('data', (data) => {
        if (String(data).includes('CHECKPOINT_READY')) {
          clearTimeout(timer);
          resolve();
        }
      });
      holder.on('error', reject);
    });
    const before = (await store.get(scan.id)).analyzers.dependencies;
    assert.equal(before?.findings.length, 1);
    const exited = once(holder, 'exit');
    holder.kill('SIGKILL');
    await exited;
    assert.equal((await api.inject('/health/live')).statusCode, 200);
    assert.equal((await api.inject(`/api/scans/${scan.id}`)).statusCode, 200);
    worker = spawn(process.execPath, ['dist/server/server/worker-main.js'], {
      env: environment,
      windowsHide: true,
      stdio: 'ignore',
    });
    const deadline = Date.now() + 100000;
    while (Date.now() < deadline) {
      const current = await store.get(scan.id);
      if (!['running', 'queued'].includes(current.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const result = await store.get(scan.id);
    assert.equal(result.status, 'completed');
    assert.equal(result.attempt, 2);
    assert.deepEqual(result.analyzers.dependencies, before);
    assert.equal(result.analyzers.source?.findings.length, 3);
    assert.ok(result.events.some((event) => event.message.includes('Retry scheduled')));
  } finally {
    if (holder.exitCode === null) holder.kill();
    if (worker && worker.exitCode === null) {
      const stopped = once(worker, 'exit');
      worker.kill();
      await stopped;
    }
    await api.close();
    await store.close();
    await database.cleanup();
  }
});
