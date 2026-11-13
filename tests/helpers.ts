import { sourceFile } from '../src/server/acquire.js';
import type { Snapshot, AnalyzerResult } from '../src/shared/types.js';

export const snapshot = (): Snapshot => ({
  repository: 'https://github.com/example/repo',
  revision: 'a'.repeat(40),
  acquiredAt: '2026-11-11T12:00:00Z',
  fixture: false,
  warnings: [],
  files: [sourceFile('index.ts', 'export const value = 1;')],
});
export const complete = (): AnalyzerResult => ({
  status: 'complete',
  findings: [],
  detail: 'Controlled test analyzer',
  durationMs: 1,
  version: 'test',
});
export const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
