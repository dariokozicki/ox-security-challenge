import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { acquire, sourceFile } from '../src/server/acquire.js';
import { scanSource } from '../src/server/source-scanner.js';
import { scanDependencies } from '../src/server/dependency-scanner.js';

test('real Semgrep detects the vulnerable corpus and rejects safe counterparts', async () => {
  const input = await acquire('fixture://checkout-service', 'demo');
  const result = await scanSource(input);
  assert.equal(result.status, 'complete', result.detail);
  assert.equal(result.findings.length, 3);
  assert.equal(new Set(result.findings.map((f) => f.rule)).size, 3);
  for (const finding of result.findings) {
    assert.equal(finding.assurance, 'potential');
    assert.ok(finding.evidence.sha256);
    assert.ok(finding.path.length >= 2, finding.title);
  }
  const safe = {
    ...input,
    files: [sourceFile('routes.ts', await readFile('fixtures/safe/routes.ts', 'utf8'))],
  };
  const negative = await scanSource(safe);
  assert.equal(negative.status, 'complete', negative.detail);
  assert.equal(negative.findings.length, 0);
  assert.equal((await scanDependencies(input)).findings.length, 1);
});
