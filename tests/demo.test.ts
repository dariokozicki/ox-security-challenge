import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sourceFile } from '../src/server/acquire.js';
import { investigateSource } from '../src/server/ai-source.js';
import { snapshot } from './helpers.js';

for (const [name, newline] of [
  ['LF', '\n'],
  ['CRLF', '\r\n'],
] as const) {
  test(`demo source findings retain exact evidence with ${name} checkout line endings`, async () => {
    const text = await readFile('fixtures/vulnerable/routes.ts', 'utf8');
    const content = text.replaceAll('\r\n', '\n').replaceAll('\n', newline);
    const file = sourceFile('routes.ts', content);
    const input = { ...snapshot(), fixture: true, files: [file] };
    const result = await investigateSource(input, undefined, async () => {
      assert.fail('The demo must not invoke an AI provider');
    });

    assert.equal(result.status, 'complete');
    assert.equal(result.findings.length, 3);
    assert.deepEqual(
      result.findings.map((finding) => finding.evidence.line),
      [5, 11, 17],
    );
    for (const finding of result.findings) {
      assert.equal(finding.evidence.sha256, file.sha256);
      assert.equal(finding.path.length, 2);
      for (const evidence of [finding.evidence, ...finding.path.map((step) => step.evidence!)]) {
        assert.equal(evidence.path, 'routes.ts');
        assert.equal(
          evidence.snippet.replaceAll('\r\n', '\n'),
          content
            .replaceAll('\r\n', '\n')
            .split('\n')
            .slice(evidence.line - 1, evidence.endLine)
            .join('\n'),
        );
      }
    }
    assert.equal(file.content, content);
  });
}
