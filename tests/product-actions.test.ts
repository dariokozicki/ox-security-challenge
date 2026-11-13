import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionPlan } from '../src/shared/action-plan.js';
import { analysisStatus } from '../src/shared/analysis-status.js';
import { testStore } from './database.js';
import { sourceFinding } from '../src/server/investigation-evidence.js';
import { snapshot, complete } from './helpers.js';
test('action groups cover every finding and count packages across versions and lockfiles', async () => {
  const store = await testStore();
  try {
    const scan = await store.create('repo', 'live', 'action-group-test');
    const base = sourceFinding(
      {
        title: 'Unsafe input',
        severity: 'high',
        summary: 'Injection',
        rationale: 'Flow',
        evidence: { path: 'index.ts', line: 1, endLine: 1, quote: snapshot().files[0].content },
        path: [],
        prerequisites: [],
        limitations: [],
        remediation: 'Use safe APIs',
      },
      snapshot(),
      'test',
    );
    const deps = Array.from({ length: 90 }, (_, i) => ({
      ...base,
      id: String(i),
      category: 'dependency' as const,
      package: { name: `package-${i % 10}`, version: String(i), advisory: `test-${i}` },
      evidence: { ...base.evidence, path: i % 2 ? 'a/package-lock.json' : 'b/package-lock.json' },
    }));
    scan.analyzers = {
      dependencies: { ...complete(), findings: deps },
      source: {
        ...complete(),
        findings: [
          { ...base, id: 'code' },
          { ...base, id: 'access', title: 'Authentication bypass' },
        ],
      },
    };
    const plan = actionPlan(scan);
    const grouped = plan.flatMap((group) => group.findings);
    assert.equal(grouped.length, 92);
    assert.equal(new Set(grouped.map((item) => item.id)).size, 92);
    const dependencies = plan.find((group) => group.id === 'dependencies')!;
    assert.match(dependencies.title, /10 vulnerable dependencies/);
    assert.equal(dependencies.packages.length, 10);
    assert.equal(dependencies.packages[0].versions.length, 9);
    deps.push({
      ...deps[0],
      id: 'other',
      package: { ...deps[0].package, ecosystem: 'PyPI' },
    } as (typeof deps)[number]);
    assert.equal(
      actionPlan(scan).find((group) => group.id === 'dependencies')!.packages.length,
      11,
    );
  } finally {
    await store.close();
  }
});
test('coverage labels distinguish scope, budget, interruption and rejected evidence', () => {
  const label = (detail: string) =>
    analysisStatus({ ...complete(), status: 'partial', detail }).label;
  assert.equal(
    label('Analysis limited to acquired text; runtime configuration unavailable.'),
    'Limited coverage',
  );
  assert.equal(label('Dependency budget: 100 of 300 package entries evaluated.'), 'Budget-limited');
  assert.equal(
    label('Follow-up source review did not finish. Request timed out.'),
    'Check interrupted',
  );
  assert.equal(label('Rejected source citation at app.js:1.'), 'Needs verification');
  assert.equal(analysisStatus({ ...complete(), status: 'failed' }).label, 'Check failed');
});
