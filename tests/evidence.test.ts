import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconstructLocalPath } from '../src/server/local-path.js';
import { normalizeSemgrep } from '../src/server/source-evidence.js';
import { snapshot } from './helpers.js';

test('local explanation refuses reassignment, sanitizer calls and ambiguous call sites', () => {
  const code = ['function handler(req, db) {', 'const q = req.query.q;', 'db.query(q);', '}'].join(
    '\n',
  );
  assert.equal(reconstructLocalPath(code, 'index.ts', 3).length, 2);
  assert.equal(
    reconstructLocalPath(
      code.replace('const q', 'let q').replace('db.query(q);', 'q = "safe"; db.query(q);'),
      'index.ts',
      3,
    ).length,
    0,
  );
  assert.equal(
    reconstructLocalPath(code.replace('req.query.q', 'escape(req.query.q)'), 'index.ts', 3).length,
    0,
  );
  assert.equal(
    reconstructLocalPath(code.replace('db.query(q);', 'log(q); db.query(q);'), 'index.ts', 3)
      .length,
    0,
  );
});

test('missing scanner coverage and unmappable findings are partial', () => {
  const raw = { results: [], errors: [], paths: { scanned: [] } };
  assert.equal(normalizeSemgrep(raw, snapshot(), 1, 'digest').status, 'partial');
  const unknown = {
    ...raw,
    paths: { scanned: ['index.ts'] },
    results: [
      {
        check_id: 'unknown-rule',
        path: 'index.ts',
        start: { line: 99 },
        end: { line: 99 },
      },
    ],
  };
  assert.equal(normalizeSemgrep(unknown, snapshot(), 1, 'digest').status, 'partial');
});
