import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzerProgress,
  categoryCounts,
  coverageNeedsAttention,
  reviewOutcome,
} from '../src/web/presentation.js';
import { demoResearch, demoSource } from '../src/server/demo-investigation.js';
import { acquire } from '../src/server/acquire.js';
import type { Scan } from '../src/shared/types.js';
import { complete, snapshot } from './helpers.js';

function scan(): Scan {
  return {
    id: 'test',
    repository: 'fixture://test',
    mode: 'demo',
    status: 'completed',
    phase: 'complete',
    attempt: 1,
    createdAt: '',
    updatedAt: '',
    events: [],
    snapshot: { ...snapshot(), fileCount: 1 },
    analyzers: { source: complete(), dependencies: complete(), research: complete() },
  };
}

test('finished checks distinguish partial coverage, failure and skipped work', () => {
  const review = scan();
  for (const result of Object.values(review.analyzers)) result.status = 'partial';
  assert.deepEqual(analyzerProgress(review), { finished: 3, detail: '3 limited coverage' });
  review.analyzers.source!.status = 'failed';
  review.analyzers.research!.status = 'skipped';
  assert.equal(
    analyzerProgress(review).detail,
    '1 check failed · 1 limited coverage · 1 unavailable',
  );
  review.analyzers = {};
  assert.equal(analyzerProgress(review).finished, 0);
});

test('completed execution with a critical finding remains a risk outcome', async () => {
  const fixture = await acquire('', 'demo');
  const review = scan();
  review.analyzers.research = demoResearch(fixture);
  assert.match(reviewOutcome(review).classes, /text-red/);
  assert.equal(reviewOutcome(review).label, '1 finding to review');
  review.status = 'partial';
  assert.match(reviewOutcome(review).classes, /text-red/);
  assert.doesNotMatch(reviewOutcome(review).classes, /emerald/);
  review.status = 'completed';
  review.snapshot!.warnings = ['Some files omitted'];
  assert.equal(coverageNeedsAttention(review), true);
});

test('zero findings only receive a green outcome with completed coverage', () => {
  const review = scan();
  assert.match(reviewOutcome(review).classes, /emerald/);
  for (const status of ['queued', 'running', 'partial', 'failed'] as const) {
    assert.doesNotMatch(reviewOutcome({ ...review, status }).classes, /emerald/);
  }
  review.analyzers.research = { ...complete(), status: 'skipped' };
  assert.doesNotMatch(reviewOutcome(review).classes, /emerald/);
  review.analyzers.research = complete();
  review.snapshot!.warnings = ['Some files were omitted'];
  assert.doesNotMatch(reviewOutcome(review).classes, /emerald/);
  review.snapshot = undefined;
  assert.doesNotMatch(reviewOutcome(review).classes, /emerald/);
});

test('category totals include every finding and keep empty categories visible', async () => {
  const fixture = await acquire('', 'demo');
  const findings = [...demoSource(fixture).findings, ...demoResearch(fixture).findings];
  assert.deepEqual(categoryCounts(findings), { all: 4, code: 3, dependency: 0, emerging: 1 });
  assert.deepEqual(categoryCounts([]), { all: 0, code: 0, dependency: 0, emerging: 0 });
});

test('PHP demo leads with reported RCE while preserving exposure uncertainty', async () => {
  const finding = demoResearch(await acquire('', 'demo')).findings[0];
  assert.match(finding.title, /unauthenticated remote code execution/i);
  assert.match(finding.summary, /deployed exposure is unverified/i);
  assert.equal(finding.assurance, 'potential');
  assert.equal(finding.path.length, 0);
  assert.match(finding.remediation, /8\.3\.36/);
});
