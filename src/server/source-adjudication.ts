import type { Finding, Snapshot } from '../shared/types.js';
import type { SourceCollection } from './investigation-types.js';
import type { z } from 'zod';
import type { SourceFollowup } from './investigation-schemas.js';
import { verifiedLocation } from './source-location.js';
import { sameSourceFinding } from './source-results.js';

export function adjudicateSource(
  rejections: z.infer<typeof SourceFollowup>['rejections'],
  suppliedIds: Set<string>,
  snapshot: Snapshot,
  collected: SourceCollection,
  additions: Finding[] = [],
) {
  const decisions = [];
  for (const rejection of rejections) {
    const finding = collected.findings.find((item) => item.id === rejection.findingId);
    try {
      if (!finding || !suppliedIds.has(finding.id)) throw new Error('Unknown candidate');
      if (additions.some((item) => sameSourceFinding(item, finding))) {
        collected.warnings.push(
          'The follow-up both retained and rejected a candidate; it was retained for review.',
        );
        continue;
      }
      const evidence = verifiedLocation(rejection.evidence, snapshot);
      decisions.push({
        findingId: finding.id,
        title: finding.title,
        reason: rejection.reason,
        evidence,
      });
      collected.findings = collected.findings.filter((item) => item.id !== finding.id);
      collected.pathWarnings.delete(finding.id);
    } catch {
      collected.warnings.push(
        'A source-review rejection lacked a known candidate or exact citation; the candidate was retained.',
      );
    }
  }
  return decisions;
}
