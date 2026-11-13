import type { Finding, Scan, Severity } from './types.js';
import type { ActionGroup, ActionKind } from './action-types.js';
import { findingsOf } from './findings.js';

const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };
export function actionKind(finding: Finding): ActionKind {
  if (finding.category === 'dependency') return 'dependencies';
  if (finding.category === 'emerging') return 'disclosures';
  const text = `${finding.title} ${finding.summary}`;
  if (
    /credential|password|authentication|authorization|permission|account takeover|session/i.test(
      text,
    )
  )
    return 'access';
  if (/archive|zip|traversal|file write|extraction/i.test(text)) return 'files';
  if (/injection|scripting|template|render|shell|query|code execution|redirect/i.test(text))
    return 'input';
  if (/secret|configuration|debug/i.test(text)) return 'configuration';
  return 'review';
}
export function verificationChecks(finding: Finding): string[] {
  const common =
    'Review the patch and rerun the affected application tests and security checks on the updated revision.';
  const checks: Record<ActionKind, string[]> = {
    dependencies: [
      'Choose supported releases that address every linked advisory for each package; review transitive dependencies and compatibility.',
      'Regenerate the lockfile, verify the resolved versions, and confirm the selected advisories no longer match.',
    ],
    access: [
      'Test missing credentials, invalid credentials and a user with insufficient permissions against each affected route.',
      'Confirm permitted users retain access and inspect the actual middleware and authorization checks.',
    ],
    input: [
      'Add a regression for the cited input-to-operation path and confirm untrusted values remain data in that context.',
      'Check object-shaped query values, template encoding or render-option allowlists where relevant; include a valid-input control.',
    ],
    files: [
      'Verify normalized output paths stay inside the intended directory, including archive entries and symbolic links.',
      'Add traversal and normal-file regression cases using an isolated test fixture.',
    ],
    configuration: [
      'Remove or rotate exposed secrets and verify the deployed configuration and secret source.',
    ],
    disclosures: [
      'Check the deployed component version and configuration against the linked primary advisory.',
      'Apply a supported fix or documented mitigation, then verify that the affected exposure is addressed.',
    ],
    review: [
      'Turn the cited prerequisite and affected operation into a focused regression case with a safe-input control.',
    ],
  };
  return [...checks[actionKind(finding)], common];
}

export function actionPlan(scan: Scan): ActionGroup[] {
  const groups = new Map<ActionKind, Finding[]>();
  for (const finding of findingsOf(scan)) {
    const kind = actionKind(finding);
    groups.set(kind, [...(groups.get(kind) || []), finding]);
  }
  return [...groups]
    .map(([id, findings]) => {
      const packages = new Map<string, ActionGroup['packages'][number]>();
      for (const finding of findings) {
        if (!finding.package) continue;
        const { name, version, ecosystem } = finding.package;
        const scope = ecosystem || inferredEcosystem(finding.evidence.path);
        const key = `${scope}:${name}`;
        const item = packages.get(key) || { name, ecosystem: ecosystem || scope, versions: [] };
        if (!item.versions.includes(version)) item.versions.push(version);
        packages.set(key, item);
      }
      const titles: Record<ActionKind, string> = {
        dependencies: `Update or mitigate ${packages.size || findings.length} vulnerable ${packages.size === 1 ? 'dependency' : 'dependencies'}`,
        access: 'Strengthen account and permission checks',
        input: 'Fix unsafe input and template handling',
        files: 'Constrain file and archive operations',
        configuration: 'Correct security configuration',
        disclosures: 'Check deployed exposure to public disclosures',
        review: 'Investigate the remaining code risks',
      };
      return {
        id,
        title: titles[id],
        findings,
        packages: [...packages.values()],
        severity: findings.reduce(
          (value, item) => (rank[item.severity] < rank[value] ? item.severity : value),
          'unknown' as Severity,
        ),
        reason:
          id === 'dependencies'
            ? `${findings.length} advisory matches grouped by package. Review all affected versions together.`
            : `${findings.length} related ${findings.length === 1 ? 'finding belongs to' : 'findings share'} this remediation work.`,
        checks: [...new Set(findings.flatMap(verificationChecks))],
      };
    })
    .sort(
      (a, b) =>
        rank[a.severity] - rank[b.severity] ||
        b.findings.length - a.findings.length ||
        a.id.localeCompare(b.id),
    );
}

function inferredEcosystem(path: string) {
  if (path.endsWith('package-lock.json')) return 'npm';
  if (path.endsWith('composer.lock')) return 'Packagist';
  if (path.endsWith('packages.lock.json')) return 'NuGet';
  if (path.endsWith('go.mod')) return 'Go';
  if (/requirements[^/]*\.txt$/.test(path)) return 'PyPI';
  return path;
}
