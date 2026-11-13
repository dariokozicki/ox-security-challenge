import type { Scan, Finding, Severity } from './types.js';

export const findingsOf = (scan: Scan): Finding[] => {
  const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };
  return Object.values(scan.analyzers)
    .flatMap((a) => a?.findings ?? [])
    .sort((a, b) => order[a.severity] - order[b.severity] || a.id.localeCompare(b.id));
};
