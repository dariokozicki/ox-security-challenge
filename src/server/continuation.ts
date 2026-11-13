import type { Scan, Snapshot, AnalyzerResult } from '../shared/types.js';
import { packagesFrom } from './lockfile.js';
import { AppError } from './config.js';

export function continuationSnapshot(previous: Scan, snapshot: Snapshot): Snapshot {
  const result = previous.analyzers.dependencies;
  const legacy = result && /^(\d+) locked package entries checked;/.exec(result.detail);
  const total = packagesFrom(snapshot).total;
  const offset =
    result?.packageCoverage?.nextOffset ??
    (!result?.packageCoverage && !snapshot.continuation && legacy ? Number(legacy[1]) : undefined);
  if (offset === undefined || offset >= total || !Number.isInteger(offset) || offset <= 0)
    throw new AppError(
      'no_continuation',
      'No remaining package batch is available. Review coverage details or retry the check.',
      409,
    );
  return { ...snapshot, continuation: { parentScanId: previous.id, packageOffset: offset } };
}

export function mergeDependencyBatch(
  previous: AnalyzerResult | undefined,
  batch: AnalyzerResult,
  snapshot?: Snapshot,
): AnalyzerResult {
  if (!previous) return batch;
  const findings = new Map(previous.findings.map((finding) => [finding.id, finding]));
  for (const finding of batch.findings) findings.set(finding.id, finding);
  const failed = batch.status === 'failed' || batch.status === 'skipped';
  const coverage =
    (!failed ? batch.packageCoverage : undefined) ||
    previous.packageCoverage ||
    (snapshot?.continuation
      ? {
          checked: snapshot.continuation.packageOffset,
          total: packagesFrom(snapshot).total,
          nextOffset: snapshot.continuation.packageOffset,
        }
      : undefined);
  const legacyIssues = previous.detail
    .replace(/^\d+ locked package entries checked; \d+ advisory matches\.\s*/, '')
    .replace(
      /Dependency budget: \d+ of [\d,]+ package entries evaluated; direct npm dependencies prioritized\./g,
      '',
    )
    .trim();
  const earlierIssues =
    previous.packageCoverage?.issues ??
    (previous.status === 'complete' || !legacyIssues
      ? []
      : [`Earlier coverage: ${legacyIssues.slice(0, 1800)}`]);
  const issues = [...new Set([...earlierIssues, ...(batch.packageCoverage?.issues || [])])];
  return {
    ...batch,
    findings: [...findings.values()],
    ...(coverage ? { packageCoverage: { ...coverage, issues, batchCompleted: !failed } } : {}),
    status: failed
      ? 'failed'
      : issues.length || coverage?.nextOffset !== undefined
        ? 'partial'
        : batch.status,
    detail: failed
      ? `Dependency continuation did not finish. ${batch.detail} Earlier findings retained.`
      : `${coverage?.checked ?? 0} of ${coverage?.total ?? 0} package entries queried across batches. ${issues.join(' ')}`,
  };
}
