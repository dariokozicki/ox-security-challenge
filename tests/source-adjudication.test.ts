import { test } from 'node:test';
import assert from 'node:assert/strict';
import { investigateSource } from '../src/server/ai-source.js';
import { sourceFile } from '../src/server/acquire.js';
import { sourceInput } from '../src/server/source-input.js';
import { sourceTargets } from '../src/server/source-targets.js';
import { snapshot } from './helpers.js';

const evidence = { path: 'view.dust', line: 1, endLine: 1, quote: '<p>{name}</p>' };
const candidate = {
  title: 'Unescaped HTML',
  severity: 'high',
  summary: 'Unsafe name',
  rationale: 'Raw output',
  evidence,
  path: [],
  prerequisites: [],
  limitations: [],
  remediation: 'Escape name',
};
const source = () => ({ ...snapshot(), files: [sourceFile(evidence.path, evidence.quote)] });

for (const variant of [
  'valid',
  'invented quote',
  'unknown id',
  'malformed response',
  'contradiction',
]) {
  test(`source adjudication handles ${variant} without silently losing evidence`, async () => {
    let calls = 0;
    const result = await investigateSource(source(), undefined, async (request) => {
      calls++;
      const prior = request.input as { priorCandidates: { id: string }[] };
      const rejection =
        calls === 2
          ? {
              findingId: variant === 'unknown id' ? 'unknown' : prior.priorCandidates[0].id,
              reason: 'Dust escapes ordinary references in HTML text by default.',
              evidence: {
                ...evidence,
                quote: variant === 'invented quote' ? 'invented' : evidence.quote,
              },
            }
          : undefined;
      return {
        data:
          variant === 'malformed response' && calls === 2
            ? {}
            : {
                findings: calls === 1 || variant === 'contradiction' ? [candidate] : [],
                limitations: [],
                rejections: rejection ? [rejection] : [],
              },
        provider: 'controlled',
        searched: false,
        urls: [],
        referenceProvenance: 'provider_retrieved',
      };
    });
    assert.equal(calls, 2);
    assert.equal(result.findings.length, variant === 'valid' ? 0 : 1);
    assert.equal(result.sourceRejections?.length, variant === 'valid' ? 1 : 0);
    if (variant === 'valid') {
      assert.equal(result.sourceRejections?.[0].evidence.snippet, evidence.quote);
      assert.match(result.sourceRejections?.[0].reason || '', /escapes/);
    } else assert.equal(result.status, 'partial');
  });
}

test('source review receives exact package versions without sending a large lockfile', () => {
  const input = source();
  input.files.push(
    sourceFile(
      'package-lock.json',
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': { dependencies: { 'dustjs-helpers': '^1.5.0' } },
          'node_modules/dustjs-helpers': { version: '1.5.0' },
        },
      }),
    ),
  );
  const review = sourceInput(input);
  assert.equal(review.input.packageVersions[0].version, '1.5.0');
  assert.equal(review.input.packageVersions[0].inventory, 'package-lock.json');
  assert.equal(review.input.packageVersions[0].location, '/packages/node_modules~1dustjs-helpers');
  assert.equal(review.input.files.length, 1);
});

test('review targets point to source boundaries without claiming vulnerabilities', () => {
  const targets = sourceTargets([
    sourceFile(
      'app.js',
      'User.find({ password: req.body.password });\nres.render("profile", input);',
    ),
    sourceFile('view.ejs', '<%- input %>'),
    sourceFile('tests/example.js', 'res.render("safe", input);'),
  ]);
  assert.deepEqual(
    targets.map((item) => [item.kind, item.path, item.line]),
    [
      ['query-input-types', 'app.js', 1],
      ['render-options', 'app.js', 2],
      ['template-output', 'view.ejs', 1],
    ],
  );
  assert.ok(targets.every((item) => !('severity' in item)));
});
