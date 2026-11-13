import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityMessage, stageFinished } from '../src/shared/scan-messages.js';
import { testStore } from './database.js';
import { complete } from './helpers.js';
import { acquire } from '../src/server/acquire.js';
import { demoResearch } from '../src/server/demo-investigation.js';
import { inventoryFrom } from '../src/server/inventory.js';
import { runtimeForFinding } from '../src/web/presentation.js';
test('saved scan activity removes internals while keeping retry and failure information', () => {
  assert.equal(activityMessage('Scan queued durably.'), 'Scan queued.');
  assert.equal(activityMessage('Worker acquired attempt 1.'), 'Scan started.');
  assert.match(activityMessage('Worker acquired attempt 2.'), /Retrying scan/);
  assert.equal(
    activityMessage('Review completed. No findings is not proof of security.'),
    'Scan completed.',
  );
  assert.equal(
    activityMessage('source: complete. No live AI call or Semgrep run.'),
    'Source review completed.',
  );
  assert.match(
    activityMessage('research: partial. Search timed out.'),
    /check interrupted\. Search timed out/,
  );
  assert.equal(activityMessage('Failed to fetch repository.'), 'Failed to fetch repository.');
  assert.match(
    stageFinished('research', { ...complete(), status: 'failed', detail: 'Search timed out.' }),
    /failed\. Search timed out/,
  );
});
test('new activity reflects started, retrying, and partial results without hiding failures', async () => {
  let now = Date.now();
  const store = await testStore(() => now);
  try {
    const scan = await store.create('repo', 'demo', 'activity-test');
    const first = (await store.claim())!;
    assert.equal((await store.get(scan.id)).events[0].message, 'Scan queued.');
    assert.equal(first.scan.events.at(-1)?.message, 'Scan started.');
    await store.fail(scan.id, first.fence, 'Repository unavailable.', true);
    now += 4000;
    const retry = (await store.claim())!;
    assert.equal(retry.scan.events.at(-1)?.message, 'Retrying scan (attempt 2).');
    await store.stage(scan.id, retry.fence, 'source', complete());
    await store.finish(scan.id, retry.fence);
    const saved = await store.get(scan.id);
    assert.equal(saved.status, 'partial');
    assert.equal(saved.events.at(-1)?.message, 'Scan finished with coverage limits.');
    assert.ok(saved.events.some((e) => e.message.includes('Repository unavailable.')));
  } finally {
    await store.close();
  }
});
test('deployment guidance follows the runtime evidence instead of an unrelated component', async () => {
  const snapshot = await acquire('', 'demo');
  const inventory = inventoryFrom(snapshot);
  const finding = demoResearch(snapshot).findings[0];
  assert.equal(runtimeForFinding(finding, inventory)?.name, 'php');
  assert.equal(runtimeForFinding({ ...finding, category: 'dependency' }, inventory), undefined);
  assert.equal(
    runtimeForFinding({ ...finding, evidence: { ...finding.evidence, line: 999 } }, inventory),
    undefined,
  );
  assert.equal(runtimeForFinding(finding), undefined);
});
