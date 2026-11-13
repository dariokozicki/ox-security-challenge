import type { Finding, Snapshot } from '../shared/types.js';
import type { SourceCollection, SourceObservation } from './investigation-types.js';
import { sourceFinding } from './investigation-evidence.js';

export function sameSourceFinding(a: Finding, b: Finding) {
  return (
    a.id === b.id ||
    (a.title.trim().toLowerCase() === b.title.trim().toLowerCase() &&
      a.evidence.path === b.evidence.path &&
      a.evidence.line <= b.evidence.endLine &&
      b.evidence.line <= a.evidence.endLine)
  );
}

export function collectSourceFindings(
  items: SourceObservation[],
  snapshot: Snapshot,
  provider: string,
  result: SourceCollection,
) {
  for (const item of items) {
    try {
      const finding = sourceFinding({ ...item, path: [] }, snapshot, provider);
      let pathWarning: string | undefined;
      try {
        finding.path = sourceFinding(item, snapshot, provider).path;
      } catch {
        pathWarning = `Path evidence for ${item.evidence.path}:${finding.evidence.line} needs review; the primary citation was verified.`;
        finding.limitations.push(
          'Path citations could not be verified. Inspect the primary evidence and prerequisites.',
        );
      }
      const index = result.findings.findIndex((existing) => sameSourceFinding(existing, finding));
      if (index < 0) {
        result.findings.push(finding);
        if (pathWarning) result.pathWarnings.set(finding.id, pathWarning);
      } else if (finding.path.length && !result.findings[index].path.length) {
        const previousId = result.findings[index].id;
        finding.id = previousId;
        result.findings[index] = finding;
        result.pathWarnings.delete(previousId);
      }
    } catch (error) {
      result.warnings.push(
        `Rejected source citation at ${item.evidence.path}:${item.evidence.line}: ` +
          `${error instanceof Error ? error.message : 'invalid citation'}.`,
      );
    }
  }
}
