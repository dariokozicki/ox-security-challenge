import type { Finding, Scan, Severity } from '../shared/types';
import { findingsOf } from '../shared/findings';
import type { Inventory } from '../shared/intelligence-types';
import { analysisStatus } from '../shared/analysis-status';

export function runtimeForFinding(finding: Finding, inventory?: Inventory) {
  if (finding.category !== 'emerging') return undefined;
  return inventory?.components.find(
    (component) =>
      component.kind === 'runtime' &&
      component.evidence.path === finding.evidence.path &&
      component.evidence.line === finding.evidence.line &&
      component.evidence.sha256 === finding.evidence.sha256,
  );
}

export const severityClasses: Record<Severity, string> = {
  critical: 'bg-red-50 text-red-700 border-red-100',
  high: 'bg-orange-50 text-orange-700 border-orange-100',
  medium: 'bg-amber-50 text-amber-700 border-amber-100',
  low: 'bg-blue-50 text-blue-700 border-blue-100',
  unknown: 'bg-slate-100 text-slate-600 border-slate-200',
};

export function categoryCounts(findings: Finding[]) {
  return {
    all: findings.length,
    code: findings.filter((f) => f.category === 'code').length,
    dependency: findings.filter((f) => f.category === 'dependency').length,
    emerging: findings.filter((f) => f.category === 'emerging').length,
  };
}

export function analyzerProgress(scan: Scan) {
  const results = Object.values(scan.analyzers).filter(Boolean);
  const labels = [
    ...new Set(results.filter((r) => r.status !== 'complete').map((r) => analysisStatus(r).label)),
  ];
  const counts = labels.map((label) => {
    const count = results.filter((result) => analysisStatus(result).label === label).length;
    return `${count} ${label.toLowerCase()}`;
  });
  return {
    finished: results.length,
    detail: counts.join(' · ') || 'Code + dependencies + disclosures',
  };
}

export function coverageNeedsAttention(scan: Scan) {
  return (
    scan.status === 'partial' ||
    scan.status === 'failed' ||
    Boolean(scan.snapshot?.warnings.length) ||
    Object.values(scan.analyzers).some((result) => result.status !== 'complete')
  );
}

export function reviewOutcome(scan: Scan) {
  const findings = findingsOf(scan);
  const count = findings.length;
  const highest = findings[0]?.severity;
  const attention = scan.status === 'partial' || scan.status === 'failed';
  const completeCoverage =
    scan.status === 'completed' &&
    Boolean(scan.snapshot) &&
    (['source', 'dependencies', 'research'] as const).every(
      (name) => scan.analyzers[name]?.status === 'complete',
    ) &&
    !scan.snapshot?.warnings.length;
  return {
    label: count
      ? `${count} finding${count === 1 ? '' : 's'} to review`
      : completeCoverage
        ? 'No findings in completed checks'
        : 'Coverage not complete',
    classes: count
      ? severityClasses[highest || 'unknown']
      : completeCoverage
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : attention
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-slate-200 bg-slate-50 text-slate-700',
  };
}
