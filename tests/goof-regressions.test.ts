import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acquire, sourceFile } from '../src/server/acquire.js';
import { verifiedLocation } from '../src/server/source-location.js';
import { sourceInput } from '../src/server/source-input.js';
import { packagesFrom } from '../src/server/lockfile.js';
import { processNext } from '../src/server/worker.js';
import { testStore } from './database.js';
import { snapshot, complete, jsonResponse } from './helpers.js';
test('worker does not inject a scan ID into optional fetcher or runner parameters', async () => {
  const store = await testStore();
  try {
    const scan = await store.create('repo', 'live', 'provider-arguments');
    const injectedDefault = async () => complete();
    const provider = async (_input: unknown, _signal?: AbortSignal, runner = injectedDefault) => {
      assert.equal(runner, injectedDefault);
      return runner();
    };
    await processNext(store, {
      acquire: async () => snapshot(),
      source: async (_input, _signal, id) => {
        assert.equal(id, scan.id);
        return complete();
      },
      dependencies: provider,
      research: provider,
    });
    assert.equal((await store.get(scan.id)).analyzers.dependencies?.status, 'complete');
    assert.equal((await store.get(scan.id)).analyzers.research?.status, 'complete');
  } finally {
    await store.close();
  }
});
test('intake acquires large lockfiles and templates while retaining source size limits', async () => {
  const sources: Record<string, string> = {
    'package-lock.json': ' '.repeat(777785),
    'views/admin.ejs': '<%- redirectPage %>',
    'views/profile.hbs': '{{name}}',
    'views/home.dust': '{name}',
    'huge.js': ' '.repeat(210000),
  };
  const result = await acquire(
    'https://github.com/owner/repo',
    'live',
    undefined,
    async (input) => {
      const url = String(input);
      if (url.endsWith('/repos/owner/repo'))
        return jsonResponse({ private: false, default_branch: 'main' });
      if (url.includes('/commits/'))
        return jsonResponse({ sha: 'a'.repeat(40), commit: { tree: { sha: 'b'.repeat(40) } } });
      if (url.includes('/git/trees/'))
        return jsonResponse({
          tree: Object.entries(sources).map(([path, content]) => ({
            path,
            size: content.length,
            type: 'blob',
            mode: '100644',
          })),
        });
      const path = Object.keys(sources).find((name) => url.endsWith('/' + name));
      assert.ok(path);
      return new Response(sources[path]);
    },
  );
  assert.equal(result.files.length, 4);
  assert.ok(result.files.some((file) => file.path === 'package-lock.json'));
  assert.ok(result.warnings.length);
});
test('citation recovery corrects unique full-line quotes and rejects ambiguity or altered code', () => {
  const input = {
    ...snapshot(),
    files: [sourceFile('route.js', 'header\n  exec(input);\nrepeat\nrepeat')],
  };
  const citation = { path: 'route.js', line: 99, endLine: 99, quote: '  exec(input);' };
  assert.equal(verifiedLocation(citation, input).line, 2);
  for (const quote of ['exec(input);', '  exec(safe);', 'repeat'])
    assert.throws(() => verifiedLocation({ ...citation, quote }, input));
  assert.throws(() => verifiedLocation({ ...citation, path: 'other.js' }, input));
});
test('direct npm packages survive a crowded lockfile budget with exact source locations', () => {
  const packages: Record<string, unknown> = { '': { dependencies: { zzz: '^1' } } };
  for (let i = 0; i < 110; i++) packages[`node_modules/aaa${i}`] = { version: '1.0.0' };
  packages['node_modules/zzz'] = { version: '1.2.3' };
  const input = {
    ...snapshot(),
    files: [
      sourceFile('package-lock.json', JSON.stringify({ lockfileVersion: 3, packages }, null, 2)),
    ],
  };
  const result = packagesFrom(input);
  assert.equal(result.packages.length, 100);
  assert.equal(result.packages[0].name, 'zzz');
  assert.equal(result.packages[0].version, '1.2.3');
  assert.ok(result.packages[0].line > 100);
  assert.match(result.warnings.join(' '), /100 of 111/);
});
test('numbered model input budgets escaped UTF-8 and prioritizes application source', () => {
  const input = {
    ...snapshot(),
    files: [
      sourceFile('exploits/example.sh', 'echo test'),
      sourceFile('routes/app.js', 'first\n  second'),
      sourceFile('views/app.ejs', '<%- value %>'),
      sourceFile('huge.js', '"🌍"\n'.repeat(20000)),
    ],
  };
  const result = sourceInput(input);
  assert.equal(result.input.files[0].path, 'routes/app.js');
  assert.deepEqual(result.input.files[0].lines[1], { line: 2, text: '  second' });
  assert.ok(result.files.some((file) => file.path.endsWith('.ejs')));
  assert.ok(!result.files.some((file) => file.path === 'huge.js'));
  assert.ok(Buffer.byteLength(JSON.stringify(JSON.stringify(result.input))) <= 80000);
});
