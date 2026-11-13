import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acquire } from '../src/server/acquire.js';
import { scanDependencies } from '../src/server/dependency-scanner.js';

test('live OSV evaluates a controlled lodash lockfile through the real provider', async () => {
  const input = await acquire('fixture://checkout-service', 'demo');
  const result = await scanDependencies({ ...input, fixture: false });
  assert.equal(result.status, 'complete', result.detail);
  assert.ok(result.findings.some((finding) => finding.rule === 'GHSA-35jh-r3h4-6jhm'));
  console.log(`Live OSV: ${result.findings.length} advisory matches; ${result.detail}`);
});
