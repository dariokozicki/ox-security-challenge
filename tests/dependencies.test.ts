import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sourceFile } from '../src/server/acquire.js';
import { scanDependencies } from '../src/server/dependency-scanner.js';
import { packagesFrom } from '../src/server/lockfile.js';
import { snapshot, jsonResponse } from './helpers.js';

async function lockedSnapshot() {
  return {
    ...snapshot(),
    files: [
      sourceFile(
        'package-lock.json',
        await readFile('fixtures/vulnerable/package-lock.json', 'utf8'),
      ),
    ],
  };
}

test('exact OSV lookup preserves evidence when another advisory fails', async () => {
  const input = await lockedSnapshot();
  const advisory = JSON.parse(
    await readFile('fixtures/advisories/GHSA-35jh-r3h4-6jhm.json', 'utf8'),
  );
  const result = await scanDependencies(input, undefined, async (url, options) => {
    if (String(url).endsWith('querybatch')) {
      const query = JSON.parse(String(options?.body)).queries[0];
      assert.equal(query.version, '4.17.20');
      assert.deepEqual(query.package, { name: 'lodash', ecosystem: 'npm' });
      return jsonResponse({ results: [{ vulns: [{ id: advisory.id }, { id: 'missing' }] }] });
    }
    return String(url).endsWith('missing') ? jsonResponse({}, 503) : jsonResponse(advisory);
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].assurance, 'detected');
  assert.equal(result.findings[0].path.length, 0);
  assert.match(result.findings[0].evidence.url || '', /\/blob\/a{40}\//);
});

test('unavailable OSV is failed, unsupported lockfile is skipped, never clean', async () => {
  const result = await scanDependencies(await lockedSnapshot(), undefined, async () =>
    jsonResponse({}, 503),
  );
  assert.equal(result.status, 'failed');
  const unsupported = {
    ...snapshot(),
    files: [
      sourceFile(
        'package-lock.json',
        JSON.stringify({ lockfileVersion: 1, dependencies: { lodash: { version: '4.17.20' } } }),
      ),
    ],
  };
  assert.equal((await scanDependencies(unsupported)).status, 'skipped');
  assert.match(packagesFrom(unsupported).warnings[0], /v2\/v3/);
});

test('pagination limits disclose incomplete results', async () => {
  let calls = 0;
  const result = await scanDependencies(await lockedSnapshot(), undefined, async () => {
    calls++;
    return jsonResponse({ results: [{ next_page_token: 'more' }] });
  });
  assert.equal(calls, 3);
  assert.equal(result.status, 'partial');
  assert.match(result.detail, /pagination/);
});

test('OSV MODERATE preserves medium severity in normalized evidence', async () => {
  const advisory = JSON.parse(
    await readFile('fixtures/advisories/GHSA-35jh-r3h4-6jhm.json', 'utf8'),
  );
  advisory.database_specific.severity = 'MODERATE';
  const result = await scanDependencies(await lockedSnapshot(), undefined, async (url) =>
    String(url).endsWith('querybatch')
      ? jsonResponse({ results: [{ vulns: [{ id: advisory.id }] }] })
      : jsonResponse(advisory),
  );
  assert.equal(result.findings[0].severity, 'medium');
});

test('advisory budget gives later packages a turn and reuses fetched IDs', async () => {
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
            'node_modules/other/node_modules/first': { version: '1.0.0' },
          },
        }),
      ),
    ],
  };
  const details: string[] = [];
  const result = await scanDependencies(input, undefined, async (url) => {
    if (String(url).endsWith('querybatch'))
      return jsonResponse({
        results: [
          { vulns: Array.from({ length: 90 }, (_, i) => ({ id: `FIRST-${i}` })) },
          { vulns: [{ id: 'SECOND-1' }] },
          { vulns: [{ id: 'FIRST-0' }] },
        ],
      });
    const id = String(url).split('/').at(-1)!;
    details.push(id);
    return jsonResponse({
      id,
      summary: id,
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
  assert.equal(details.length, 80);
  assert.equal(details[1], 'SECOND-1');
  assert.equal(details.filter((id) => id === 'FIRST-0').length, 1);
  assert.ok(result.findings.some((finding) => finding.rule === 'SECOND-1'));
  assert.equal(result.findings.filter((finding) => finding.rule === 'FIRST-0').length, 2);
  assert.equal(result.status, 'partial');
});
