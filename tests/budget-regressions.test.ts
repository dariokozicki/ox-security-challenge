import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acquire, sourceFile } from '../src/server/acquire.js';
import { packagesFrom } from '../src/server/lockfile.js';
import { scanDependencies } from '../src/server/dependency-scanner.js';
import { snapshot, jsonResponse } from './helpers.js';

test('an oversized remaining metadata file does not starve smaller source files', async () => {
  const files: Record<string, string> = {
    'a/package-lock.json': ' '.repeat(1_400_000),
    'b/package-lock.json': ' '.repeat(700_000),
    'route.js': 'handle(request);',
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
          tree: Object.entries(files).map(([path, content]) => ({
            path,
            size: content.length,
            type: 'blob',
            mode: '100644',
          })),
        });
      const path = Object.keys(files).find((name) => url.endsWith('/' + name))!;
      return new Response(files[path]);
    },
  );
  assert.deepEqual(
    result.files.map((file) => file.path),
    ['a/package-lock.json', 'route.js'],
  );
  assert.match(result.warnings.join(' '), /b\/package-lock.json/);
});

test('direct package priority applies globally across lockfiles including optional and dev dependencies', () => {
  const first: Record<string, unknown> = {};
  for (let i = 0; i < 110; i++) first[`node_modules/transitive${i}`] = { version: '1.0.0' };
  const second = {
    '': {
      dependencies: { prod: '*' },
      optionalDependencies: { optional: '*' },
      devDependencies: { dev: '*' },
    },
    'node_modules/prod': { version: '1.0.0' },
    'node_modules/optional': { version: '1.0.0' },
    'node_modules/dev': { version: '1.0.0' },
  };
  const result = packagesFrom({
    ...snapshot(),
    files: [
      sourceFile('a/package-lock.json', JSON.stringify({ lockfileVersion: 3, packages: first })),
      sourceFile('b/package-lock.json', JSON.stringify({ lockfileVersion: 3, packages: second })),
    ],
  });
  assert.deepEqual(
    result.packages.slice(0, 3).map((pkg) => pkg.name),
    ['prod', 'optional', 'dev'],
  );
});

test('later OSV pages receive fair detail allocation and pagination failure preserves first-page matches', async () => {
  const input = {
    ...snapshot(),
    files: [
      sourceFile(
        'package-lock.json',
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            'node_modules/first': { version: '1.0.0' },
            'node_modules/second': { version: '1.0.0' },
          },
        }),
      ),
    ],
  };
  for (const failSecondPage of [false, true]) {
    let batches = 0;
    const fetched: string[] = [];
    const result = await scanDependencies(input, undefined, async (url) => {
      if (String(url).endsWith('querybatch')) {
        batches++;
        if (batches === 1)
          return jsonResponse({
            results: [
              { vulns: Array.from({ length: 85 }, (_, i) => ({ id: `FIRST-${i}` })) },
              { next_page_token: 'next' },
            ],
          });
        if (failSecondPage) return jsonResponse({}, 503);
        return jsonResponse({ results: [{ vulns: [{ id: 'SECOND-1' }] }] });
      }
      const id = String(url).split('/').at(-1)!;
      fetched.push(id);
      return jsonResponse({
        id,
        affected: [
          {
            package: {
              name: id.startsWith('FIRST') ? 'first' : 'second',
              ecosystem: 'npm',
            },
          },
        ],
      });
    });
    assert.equal(fetched.length, 80);
    assert.equal(result.status, 'partial');
    assert.ok(result.findings.some((finding) => finding.rule === 'FIRST-0'));
    if (!failSecondPage) assert.equal(fetched[1], 'SECOND-1');
    else assert.match(result.detail, /pagination interrupted/);
  }
});

test('an earlier SBOM cannot crowd out a declared direct development dependency', () => {
  const components = Array.from({ length: 105 }, (_, i) => ({
    purl: `pkg:npm/transitive${i}@1.0.0`,
  }));
  const result = packagesFrom({
    ...snapshot(),
    files: [
      sourceFile('bom.json', JSON.stringify({ bomFormat: 'CycloneDX', components })),
      sourceFile(
        'app/package-lock.json',
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            '': { devDependencies: { testkit: '*' } },
            'node_modules/testkit': { version: '1.0.0' },
          },
        }),
      ),
    ],
  });
  assert.equal(result.packages[0].name, 'testkit');
});
