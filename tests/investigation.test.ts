import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceFile } from '../src/server/acquire.js';
import { inventoryFrom } from '../src/server/inventory.js';
import { investigateSource } from '../src/server/ai-source.js';
import { researchThreats } from '../src/server/threat-research.js';
import { publicReference, sourceFinding } from '../src/server/investigation-evidence.js';
import type { AgentResponse } from '../src/server/agent-types.js';
import type { ResearchObservation } from '../src/server/investigation-types.js';
import { snapshot } from './helpers.js';

const response = (data: unknown): AgentResponse => ({
  data,
  searched: true,
  provider: 'controlled test',
  referenceProvenance: 'model_reported',
  urls: [],
});

test('empty local research stays partial and an unknown runtime cannot be cleared', async () => {
  const input = php('FROM php:8');
  const empty = await researchThreats(input, undefined, async () =>
    response({ limitations: [], reports: [] }),
  );
  assert.equal(empty.status, 'partial');
  const item = report(inventoryFrom(input).components[0].id);
  const result = await researchThreats(input, undefined, async () =>
    response({ limitations: [], reports: [{ ...item, applicability: 'not_affected' }] }),
  );
  assert.equal(result.assessments?.length, 0);
  assert.equal(result.findings[0].intelligence?.applicability, 'unknown');
});

test('cross-file path evidence retains its source and only CRLF is normalized', () => {
  const input = {
    ...snapshot(),
    files: [
      sourceFile('a.php', '<?php\r\necho $value;\r\n'),
      sourceFile('b.php', '$value = $_GET["x"];'),
    ],
  };
  const observation = {
    title: 'Output',
    severity: 'high' as const,
    summary: 'Output',
    rationale: 'Flow',
    evidence: { path: 'a.php', line: 2, endLine: 2, quote: 'echo $value;' },
    path: [
      {
        label: 'input',
        detail: 'User input',
        evidence: {
          path: 'b.php',
          line: 1,
          endLine: 1,
          quote: '$value = $_GET["x"];',
        },
      },
    ],
    prerequisites: [],
    limitations: [],
    remediation: 'Escape output',
  };
  assert.equal(sourceFinding(observation, input, 'test').path[0].evidence?.path, 'b.php');
  assert.throws(
    () =>
      sourceFinding(
        {
          ...observation,
          evidence: {
            ...observation.evidence,
            quote: 'echo\r $value;',
          },
        },
        input,
        'test',
      ),
    /Quote does not match/,
  );
});
const php = (content = 'FROM php:8.3.35-fpm') => ({
  ...snapshot(),
  files: [sourceFile('Dockerfile', content)],
});
const report = (componentId: string): ResearchObservation => ({
  componentId,
  title: 'Controlled pre-patch disclosure',
  identifiers: ['TEST-2026-1'],
  severity: 'critical',
  summary: 'Controlled fixture, not a historical disclosure.',
  rationale: 'The declared runtime needs verification.',
  credibility: 'primary_report',
  applicability: 'potential',
  patch: 'unavailable',
  publishedAt: '2026-10-20',
  affectedVersions: 'Test range',
  mitigation: 'Review the test mitigation.',
  prerequisites: ['Untrusted requests reach the affected runtime.'],
  limitations: ['Deployment not observed.'],
  remediation: 'Apply the documented mitigation until a fixed release is available.',
  sources: [{ title: 'Test source', url: 'https://www.php.net/security/' }],
});

test('pre-patch report, unknown runtime and disconfirmed fixed build remain distinct', async () => {
  const affected = php();
  const item = report(inventoryFrom(affected).components[0].id);
  const first = await researchThreats(affected, undefined, async () =>
    response({ limitations: [], reports: [item] }),
  );
  assert.equal(first.findings[0].intelligence?.patch, 'unavailable');
  assert.equal(first.findings[0].intelligence?.applicability, 'potential');
  assert.equal(first.findings[0].path.length, 0);
  const unknown = php('FROM php:8');
  const second = await researchThreats(unknown, undefined, async () =>
    response({
      limitations: [],
      reports: [{ ...item, componentId: inventoryFrom(unknown).components[0].id }],
    }),
  );
  assert.equal(second.findings[0].intelligence?.applicability, 'unknown');
  const fixed = php('FROM php:8.3.36-fpm');
  const third = await researchThreats(fixed, undefined, async () =>
    response({
      limitations: [],
      reports: [
        {
          ...item,
          componentId: inventoryFrom(fixed).components[0].id,
          applicability: 'not_affected',
          rationale: 'Fixed per controlled source.',
        },
      ],
    }),
  );
  assert.equal(third.findings.length, 0);
  assert.equal(third.assessments?.length, 1);
});

test('missing searches and invented component references cannot create current-threat findings', async () => {
  await assert.rejects(
    () =>
      researchThreats(php(), undefined, async () => ({
        ...response({ limitations: [], reports: [] }),
        searched: false,
      })),
    /did not record a web search/,
  );
  const result = await researchThreats(php(), undefined, async () =>
    response({ limitations: [], reports: [report('invented')] }),
  );
  assert.equal(result.status, 'partial');
  assert.equal(result.findings.length, 0);
  assert.equal(publicReference('javascript:alert(1)'), false);
  assert.equal(publicReference('https://127.0.0.1/'), false);
});

test('API citations must belong to provider-retrieved sources, not just the model report', async () => {
  const input = php();
  const item = report(inventoryFrom(input).components[0].id);
  for (const allowed of [false, true]) {
    const result = await researchThreats(input, undefined, async () => ({
      ...response({ limitations: [], reports: [item] }),
      referenceProvenance: 'provider_retrieved',
      urls: allowed ? item.sources.map((source) => source.url) : ['https://example.org/unrelated'],
    }));
    assert.equal(result.findings.length, allowed ? 1 : 0);
    if (!allowed) assert.match(result.detail, /references could not be validated/);
  }
});

test('code hypotheses require exact citations, and invented paths are rejected', async () => {
  const input = { ...snapshot(), files: [sourceFile('handler.php', '<?php\necho $_GET["name"];')] };
  const evidence = { path: 'handler.php', line: 2, endLine: 2, quote: 'echo $_GET["name"];' };
  const finding = {
    title: 'Unescaped output',
    severity: 'high',
    summary: 'Input enters output.',
    rationale: 'No escaping is visible.',
    evidence,
    path: [],
    prerequisites: [],
    limitations: [],
    remediation: 'Escape HTML.',
  };
  const valid = await investigateSource(input, undefined, async () =>
    response({ limitations: [], findings: [finding] }),
  );
  assert.equal(valid.findings.length, 1);
  const invalid = await investigateSource(input, undefined, async () =>
    response({
      limitations: [],
      findings: [
        { ...finding, evidence: { ...evidence, quote: 'invented' } },
        {
          ...finding,
          path: [
            { label: 'sink', detail: 'invented', evidence: { ...evidence, path: 'missing.php' } },
          ],
        },
      ],
    }),
  );
  assert.equal(invalid.findings.length, 1);
  assert.equal(invalid.findings[0].path.length, 0);
  assert.equal(invalid.findings[0].evidence.snippet, evidence.quote);
  assert.equal(invalid.status, 'partial');
});
