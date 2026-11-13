import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acquire, canonicalRepository, safeSourcePath } from '../src/server/acquire.js';
import { boundedFetch } from '../src/server/network.js';
import { jsonResponse } from './helpers.js';
import type { Fetcher } from '../src/server/types.js';
import { AppError } from '../src/server/config.js';

test('repository canonicalization refuses SSRF and ambiguous URLs', () => {
  assert.equal(
    canonicalRepository('https://github.com/Owner/Repo.git/'),
    'https://github.com/owner/repo',
  );
  for (const url of [
    'http://github.com/a/b',
    'https://github.com.evil/a/b',
    'https://a@github.com/a/b',
    'https://github.com/a/b?x=y',
    'https://github.com/a/b/tree/main',
    'https://127.0.0.1/a/b',
  ])
    assert.throws(() => canonicalRepository(url));
  for (const path of [
    '../secret.ts',
    '/root.ts',
    'a\\b.ts',
    'a/../../b.ts',
    'node_modules/a.ts',
    'NUL.ts',
    'x:/foo.ts',
  ])
    assert.equal(safeSourcePath(path), false, path);
  assert.equal(safeSourcePath('src/routes/checkout.ts'), true);
});

test('snapshot is commit pinned; symlinks excluded and omission disclosed', async () => {
  const calls: string[] = [];
  const fetcher: Fetcher = async (input, init) => {
    const url = String(input);
    calls.push(url);
    assert.equal(init?.redirect, 'error');
    if (url.endsWith('/repos/owner/repo'))
      return jsonResponse({ private: false, default_branch: 'main' });
    if (url.includes('/commits/'))
      return jsonResponse({ sha: 'a'.repeat(40), commit: { tree: { sha: 'b'.repeat(40) } } });
    if (url.includes('/git/trees/'))
      return jsonResponse({
        truncated: false,
        tree: [
          { path: 'index.ts', type: 'blob', mode: '100644', size: 10 },
          { path: 'link.ts', type: 'blob', mode: '120000', size: 10 },
        ],
      });
    return new Response('const x=1;');
  };
  const result = await acquire('https://github.com/owner/repo', 'live', undefined, fetcher);
  assert.equal(result.revision, 'a'.repeat(40));
  assert.equal(result.files.length, 1);
  assert.match(calls.at(-1) || '', new RegExp('a'.repeat(40)));
  assert.equal(result.warnings.length, 1);
  assert.equal(result.files[0].sha256.length, 64);
});

test('bounded transport rejects oversized content and retries only transient status', async () => {
  await assert.rejects(
    boundedFetch('https://api.osv.dev/test', {}, 3, async () => new Response('1234')),
    /size limit/,
  );
  await assert.rejects(
    boundedFetch(
      'https://api.osv.dev/test',
      {},
      100,
      async () => new Response('', { status: 429 }),
    ),
    /HTTP 429/,
  );
  const signal = AbortSignal.abort();
  await assert.rejects(
    boundedFetch('https://api.osv.dev/test', { signal }, 100, async () => {
      throw new Error('aborted');
    }),
    /timed out/,
  );
});

test('transient file failures retry a pinned revision and never checkpoint an incomplete snapshot', async () => {
  for (const recover of [true, false]) {
    const urls: string[] = [];
    const fetcher: Fetcher = async (input) => {
      const url = String(input);
      if (url.endsWith('/repos/owner/repo'))
        return jsonResponse({ private: false, default_branch: 'main' });
      if (url.includes('/commits/'))
        return jsonResponse({ sha: 'a'.repeat(40), commit: { tree: { sha: 'b'.repeat(40) } } });
      if (url.includes('/git/trees/'))
        return jsonResponse({
          tree: [{ path: 'index.php', type: 'blob', mode: '100644', size: 10 }],
        });
      urls.push(url);
      return recover && urls.length === 3
        ? new Response('<?php echo 1;')
        : new Response('', { status: 503 });
    };
    const pending = acquire('https://github.com/owner/repo', 'live', undefined, fetcher);
    if (recover) assert.equal((await pending).files.length, 1);
    else await assert.rejects(pending, (error) => error instanceof AppError && error.retryable);
    assert.equal(urls.length, 3);
    assert.equal(new Set(urls).size, 1);
    assert.ok(urls[0].includes('a'.repeat(40)));
  }
});
