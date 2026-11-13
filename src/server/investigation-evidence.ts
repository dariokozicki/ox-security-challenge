import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type { Snapshot, Finding } from '../shared/types.js';
import type { Component } from '../shared/intelligence-types.js';
import type { SourceObservation, ResearchObservation } from './investigation-types.js';
import { verifiedLocation } from './source-location.js';

export function publicReference(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.hostname.includes('.') &&
      !isIP(url.hostname) &&
      !url.hostname.startsWith('[') &&
      !/(?:^|\.)(?:localhost|local|internal)$/.test(url.hostname)
    );
  } catch {
    return false;
  }
}
export function sourceFinding(
  item: SourceObservation,
  snapshot: Snapshot,
  detector: string,
): Finding {
  const evidence = verifiedLocation(item.evidence, snapshot);
  const path = item.path.map((step) => {
    const location = verifiedLocation(step.evidence, snapshot);
    return {
      label: step.label,
      detail: `${step.detail}\n${location.path}:${location.line}\n${location.snippet}`,
      line: location.line,
      evidence: location,
    };
  });
  return {
    ...item,
    evidence,
    path,
    id: createHash('sha256')
      .update(`${evidence.path}:${evidence.line}:${item.title}`)
      .digest('hex')
      .slice(0, 16),
    category: 'code',
    rule: 'ai-source-review/v1',
    detector,
    confidence: 'medium',
    assurance: 'potential',
    limitations: [
      ...item.limitations,
      'AI-generated hypothesis; exact citations are checked, but dataflow and exploitability are not independently proven.',
    ],
    references: [],
  };
}
export function researchFinding(
  item: ResearchObservation,
  component: Component,
  detector: string,
  checkedAt: string,
  provenance: string,
): Finding {
  if (item.applicability === 'not_affected')
    throw new Error('Disconfirmed reports are not findings');
  if (!item.sources.every((s) => publicReference(s.url))) throw new Error('Unsafe reference');
  return {
    id: createHash('sha256')
      .update(`${component.id}:${item.identifiers.join(',')}:${item.title}`)
      .digest('hex')
      .slice(0, 16),
    title: item.title,
    severity: item.severity,
    category: 'emerging',
    rule: item.identifiers.join(', ') || 'emerging-disclosure',
    detector,
    confidence: 'medium',
    assurance: 'potential',
    summary: item.summary,
    rationale: item.rationale,
    evidence: component.evidence,
    path: [],
    prerequisites: item.prerequisites,
    limitations: [
      ...item.limitations,
      'Applicability, credibility and patch status are AI assessments, not exploit validation.',
      provenance === 'model_reported'
        ? 'Local Codex reports these source URLs; this adapter verifies a search occurred but cannot independently verify the retrieved page contents.'
        : 'Source URLs were returned by the search provider; claim entailment still requires review.',
    ],
    remediation: item.remediation,
    references: item.sources,
    intelligence: {
      credibility: item.credibility,
      applicability: component.precision !== 'exact' ? 'unknown' : item.applicability,
      patch: item.patch,
      publishedAt: item.publishedAt,
      checkedAt,
      affectedVersions: item.affectedVersions,
      mitigation: item.mitigation,
      sources: item.sources,
    },
  };
}
