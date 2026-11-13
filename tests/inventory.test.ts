import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceFile } from '../src/server/acquire.js';
import { inventoryFrom } from '../src/server/inventory.js';
import { packagesFrom } from '../src/server/lockfile.js';
import { scanDependencies } from '../src/server/dependency-scanner.js';
import { snapshot, jsonResponse } from './helpers.js';

test('inventory routes exact versions from several ecosystems without resolving ranges', async () => {
  const input = {
    ...snapshot(),
    files: [
      sourceFile(
        'composer.lock',
        JSON.stringify({ packages: [{ name: 'vendor/library', version: 'v1.2.3' }] }),
      ),
      sourceFile('requirements.txt', 'Django==4.2.0\nrequests>=2\n-r extra.txt'),
      sourceFile('go.mod', 'module test\nrequire (\nexample.org/lib v1.2.3\n)'),
      sourceFile(
        'packages.lock.json',
        JSON.stringify({ dependencies: { net8: { Example: { resolved: '1.2.3' } } } }),
      ),
      sourceFile(
        'bom.json',
        JSON.stringify({
          bomFormat: 'CycloneDX',
          components: [
            { purl: 'pkg:maven/org.example/lib@1.2.3' },
            { purl: 'pkg:cargo/example@1.2.3' },
          ],
        }),
      ),
    ],
  };
  const result = packagesFrom(input);
  assert.deepEqual(
    result.packages.map((p) => p.ecosystem),
    ['Packagist', 'PyPI', 'Go', 'NuGet', 'Maven', 'crates.io'],
  );
  assert.equal(result.packages[0].version, '1.2.3');
  assert.ok(result.warnings.some((w) => w.includes('unresolved')));
  const scan = await scanDependencies(input, undefined, async (_url, init) => {
    const queries = JSON.parse(String(init?.body)).queries;
    assert.deepEqual(
      queries.map((q: { package: { ecosystem: string } }) => q.package.ecosystem),
      result.packages.map((p) => p.ecosystem),
    );
    return jsonResponse({ results: queries.map(() => ({})) });
  });
  assert.equal(scan.status, 'partial');
});

test('NuGet frameworks retain distinct advisory matches and actual declaration lines', async () => {
  const content = JSON.stringify(
    {
      dependencies: {
        net8: { Example: { resolved: '1.2.3' } },
        net9: { Example: { resolved: '1.2.4' } },
      },
    },
    null,
    2,
  );
  const input = { ...snapshot(), files: [sourceFile('packages.lock.json', content)] };
  const packages = packagesFrom(input).packages;
  assert.equal(packages.length, 2);
  assert.notEqual(packages[0].line, packages[1].line);
  for (const pkg of packages) assert.match(content.split('\n')[pkg.line - 1], /"Example"/);
  const result = await scanDependencies(input, undefined, async (url) =>
    String(url).endsWith('querybatch')
      ? jsonResponse({ results: packages.map(() => ({ vulns: [{ id: 'TEST-1' }] })) })
      : jsonResponse({
          id: 'TEST-1',
          affected: [{ package: { name: 'example', ecosystem: 'NuGet' } }],
        }),
  );
  assert.equal(result.findings.length, 2);
  assert.notEqual(result.findings[0].id, result.findings[1].id);
});

test('duplicate JSON keys cite the final declaration used by JSON.parse', () => {
  const content =
    '{"dependencies":{"net8":{\n"Example":{"resolved":"1.0.0"},\n"Example":{"resolved":"2.0.0"}\n}}}';
  const result = packagesFrom({
    ...snapshot(),
    files: [sourceFile('packages.lock.json', content)],
  });
  assert.equal(result.packages[0].version, '2.0.0');
  assert.equal(result.packages[0].line, 3);
});

test('Go replacement versions are never queried as the original module', () => {
  const result = packagesFrom({
    ...snapshot(),
    files: [
      sourceFile(
        'go.mod',
        'module example\nrequire example.org/lib v1.0.0\nreplace example.org/lib => ../local',
      ),
    ],
  });
  assert.equal(result.packages.length, 0);
  assert.ok(result.warnings.some((warning) => warning.includes('replace')));
});

test('runtime constraints cannot become installed versions and Docker evidence remains attributable', () => {
  const result = inventoryFrom({
    ...snapshot(),
    files: [
      sourceFile('composer.json', '{"require":{"php":">=8.2"}}'),
      sourceFile('Dockerfile', '# build intent only\nFROM php:8.3.35-fpm'),
    ],
  });
  assert.equal(result.components.length, 2);
  assert.equal(result.components[0].precision, 'constraint');
  assert.equal(result.components[1].precision, 'exact');
  assert.equal(result.components[1].evidence.line, 2);
  assert.ok(result.warnings.some((w) => w.includes('dependency inventory')));
  assert.ok(result.warnings.every((w) => !w.startsWith('Runtime declarations')));
});

test('unsupported inventories and malformed locks disclose missing coverage', () => {
  const result = packagesFrom({
    ...snapshot(),
    files: [sourceFile('Cargo.lock', '[package]'), sourceFile('composer.lock', '{broken')],
  });
  assert.equal(result.packages.length, 0);
  assert.ok(result.warnings.some((w) => w.includes('invalid')));
  assert.ok(result.warnings.some((w) => w.includes('not supported')));
});
