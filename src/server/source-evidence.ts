import { reconstructLocalPath } from './local-path.js';
import { createHash } from 'node:crypto';
import type { Snapshot, AnalyzerResult, Finding } from '../shared/types.js';
import type { TraceLocation } from './types.js';
import { rules } from './rule-guidance.js';
import { SemgrepResult, TraceLocationSchema } from './scanner-schemas.js';
function traceLocations(value: unknown, acc: TraceLocation[] = []): TraceLocation[] {
  if (!value || typeof value !== 'object') return acc;
  if (Array.isArray(value)) {
    for (const item of value) traceLocations(item, acc);
    return acc;
  }
  const v = value as Record<string, unknown>;
  const location = TraceLocationSchema.safeParse(v);
  if (location.success)
    acc.push({ line: location.data.location.start.line, content: location.data.content });
  for (const [key, child] of Object.entries(v)) if (key !== 'location') traceLocations(child, acc);
  return acc;
}
export function normalizeSemgrep(
  input: unknown,
  snapshot: Snapshot,
  durationMs: number,
  ruleDigest: string,
): AnalyzerResult {
  const raw = SemgrepResult.parse(input);
  const findings: Finding[] = [];
  let rejected = 0;
  const normalizePath = (path: string) => path.replace(/^\/src\//, '').replace(/^\.\//, '');
  for (const [index, hit] of raw.results.entries()) {
    const rule = Object.keys(rules).find((k) => String(hit.check_id).endsWith(k));
    if (!rule) {
      rejected++;
      continue;
    }
    const meta = rules[rule];
    const path = String(hit.path)
      .replace(/^\/src\//, '')
      .replace(/^\.\//, '');
    const file = snapshot.files.find((f) => f.path === path);
    if (!file) {
      rejected++;
      continue;
    }
    const line = Number(hit.start?.line);
    const endLine = Number(hit.end?.line);
    const lines = file.content.split('\n');
    if (line < 1 || endLine < line || endLine > lines.length) {
      rejected++;
      continue;
    }
    const snippet = lines
      .slice(Math.max(0, line - 3), Math.min(lines.length, endLine + 2))
      .map((s, i) => `${Math.max(1, line - 2) + i}  ${s}`)
      .join('\n')
      .slice(0, 3000);
    const reported = traceLocations(hit.extra?.dataflow_trace);
    const trace = reported.length ? reported : reconstructLocalPath(file.content, path, line);
    const unique = trace
      .filter((v, i) => trace.findIndex((t) => t.line === v.line && t.content === v.content) === i)
      .slice(0, 8);
    findings.push({
      id: createHash('sha256')
        .update(
          [rule, path, line, hit.start.column ?? index, endLine, hit.end.column ?? index].join(':'),
        )
        .digest('hex')
        .slice(0, 16),
      title: meta.title,
      severity: meta.severity,
      category: 'code',
      rule,
      detector: `Semgrep ${raw.version || 'unknown'} / trace rules ${ruleDigest.slice(0, 12)}`,
      confidence: 'medium',
      assurance: 'potential',
      summary: meta.summary,
      rationale:
        'Prioritized because static analysis connects a request-shaped input to a security-sensitive ' +
        'operation. Endpoint reachability and runtime behavior have not been verified.',
      evidence: {
        path,
        line,
        endLine,
        column: hit.start.column,
        endColumn: hit.end.column,
        snippet,
        sha256: file.sha256,
        ...(!snapshot.fixture
          ? {
              url: `${snapshot.repository}/blob/${snapshot.revision}/${path.split('/').map(encodeURIComponent).join('/')}#L${line}`,
            }
          : {}),
      },
      path: unique.length
        ? unique
            .map((v, i) => ({
              label: reported.length
                ? i === 0
                  ? 'Scanner-reported input'
                  : 'Scanner-reported flow'
                : i === 0
                  ? 'Request-shaped input · local reconstruction'
                  : 'Local variable propagation',
              detail: v.content.slice(0, 500),
              line: v.line,
            }))
            .concat([
              { label: 'Sensitive operation', detail: lines[line - 1]?.trim() || rule, line },
            ])
        : [{ label: 'Sensitive operation', detail: lines[line - 1]?.trim() || rule, line }],
      prerequisites: meta.preconditions,
      limitations: [
        'Potential static path, not a validated exploit.',
        'Focused intraprocedural rules; cross-file flows, framework semantics and custom sanitizers are not fully modeled.',
        ...(reported.length
          ? []
          : [
              'Path steps are conservatively reconstructed from local syntax, not supplied by the scanner.',
            ]),
        ...(unique.length ? [] : ['An unambiguous intermediate path could not be established.']),
      ],
      remediation: meta.remediation,
      references: [
        {
          title: `CWE-${meta.cwe}`,
          url: `https://cwe.mitre.org/data/definitions/${meta.cwe}.html`,
        },
      ],
    });
  }
  const errors = raw.errors.length;
  const scanned = Array.isArray(raw.paths?.scanned) ? raw.paths.scanned.length : undefined;
  const omitted = snapshot.files.filter(
    (f) =>
      /\.(?:[cm]?js|jsx|ts|tsx)$/.test(f.path) &&
      !raw.paths?.scanned?.some((path) => normalizePath(path) === f.path),
  ).length;
  const incomplete = errors + rejected + omitted;
  return {
    status: incomplete ? 'partial' : 'complete',
    detail: [
      `${findings.length} findings across ${scanned ?? 'unreported'} source files.`,
      `${errors} scanner errors; ${rejected} unmappable findings; ${omitted} unconfirmed files.`,
      'Three focused JS/TS rules; broader vulnerability classes are not covered.',
    ].join(' '),
    findings,
    durationMs,
    version: `Semgrep ${raw.version || 'unknown'}; rules sha256:${ruleDigest}`,
  };
}
