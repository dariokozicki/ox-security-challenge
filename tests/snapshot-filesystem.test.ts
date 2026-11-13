import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { LocalSnapshotStore } from '../src/server/snapshots/local.js';
import { encode, hydrate } from '../src/server/snapshots/codec.js';
import { snapshot } from './helpers.js';

test('JSONB descriptor property order does not affect integrity', () => {
  const { manifest, bytes } = encode(snapshot());
  manifest.files = manifest.files.map((f) => ({ sha256: f.sha256, path: f.path }));
  assert.deepEqual(hydrate(manifest, bytes).files, snapshot().files);
});
test('web-root children starting with dots cannot store source', () => {
  assert.throws(
    () => new LocalSnapshotStore(resolve('dist/web/..snapshots')),
    /outside the web root/,
  );
});
test('linked ancestors cannot redirect source storage', async () => {
  const root = await mkdtemp(join(tmpdir(), 'trace-symlink-'));
  const destination = join(root, 'destination');
  const alias = join(root, 'alias');
  try {
    await mkdir(destination);
    await symlink(destination, alias, process.platform === 'win32' ? 'junction' : 'dir');
    const store = new LocalSnapshotStore(join(alias, 'objects'));
    const { key, bytes } = encode(snapshot());
    await assert.rejects(store.put(key, bytes), /ancestors/);
    await assert.rejects(access(join(destination, 'objects')));
  } finally {
    await rm(alias, { force: true });
    await rm(destination, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});
