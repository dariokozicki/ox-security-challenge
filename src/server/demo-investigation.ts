import type { AnalyzerResult, Snapshot } from '../shared/types.js';
import { sourceFinding, researchFinding } from './investigation-evidence.js';
import { inventoryFrom } from './inventory.js';
import type { SourceObservation } from './investigation-types.js';

export function demoSource(snapshot: Snapshot): AnalyzerResult {
  const file = snapshot.files.find((f) => f.path === 'routes.ts');
  if (!file) throw new Error('Demo fixture missing');
  const lines = file.content.replaceAll('\r\n', '\n').split('\n');
  const location = (line: number, endLine = line) => ({
    path: file.path,
    line,
    endLine,
    quote: lines.slice(line - 1, endLine).join('\n'),
  });
  const cases = [
    {
      title: 'Untrusted order ID enters SQL text',
      start: 5,
      end: 7,
      action:
        'Use a parameterized query, such as db.query("SELECT * FROM orders WHERE id = ?", [orderId]), with the driver-specific placeholder syntax.',
    },
    {
      title: 'Request filename enters a shell command',
      start: 11,
      end: 12,
      action:
        'Use execFile with a fixed executable and a separate argument array; validate the allowed filename and reject unexpected options.',
    },
    {
      title: 'Customer name enters an HTML response',
      start: 17,
      end: 18,
      action:
        'Render with a template that escapes HTML by default, or return JSON rather than concatenating untrusted HTML.',
    },
  ];
  const findings = cases.map((item) => {
    const observation: SourceObservation = {
      title: item.title,
      severity: 'high',
      summary:
        'This intentionally vulnerable fixture passes request input to a sensitive operation.',
      rationale:
        'The cited source shows the input and the operation without a visible protective transformation.',
      evidence: location(item.start, item.end),
      path: [
        {
          label: 'Request input',
          detail: 'Attacker control is a prerequisite.',
          evidence: location(item.start),
        },
        {
          label: 'Sensitive operation',
          detail: 'Potential flow in this fixture; no exploit was executed.',
          evidence: location(item.end),
        },
      ],
      prerequisites: [
        'The handler is reachable and the request input is controlled by an attacker.',
      ],
      limitations: ['Authored demonstration record, not a live model or scanner result.'],
      remediation: item.action,
    };
    return sourceFinding(observation, snapshot, 'Authored demo / source citations validated');
  });
  return {
    status: 'complete',
    findings,
    durationMs: 0,
    version: 'Authored demo v2',
    detail: 'Three demonstration findings linked to fixture source lines.',
  };
}
export function demoResearch(snapshot: Snapshot): AnalyzerResult {
  const component = inventoryFrom(snapshot).components.find((c) => c.name === 'php');
  const checkedAt = '2026-11-12T03:30:00Z';
  if (!component)
    return {
      status: 'skipped',
      findings: [],
      durationMs: 0,
      version: 'Authored demo v2',
      detail: 'No PHP fixture runtime found.',
    };
  const finding = researchFinding(
    {
      componentId: component.id,
      title: 'PHP: unauthenticated remote code execution risk',
      identifiers: ['CVE-2026-109618', 'CVE-2026-109619'],
      severity: 'critical',
      summary:
        'Crafted web requests can let an unauthenticated attacker execute code in an affected PHP worker. This fixture declares PHP 8.3.35, which the AWS bulletin lists as affected; deployed exposure is unverified.',
      rationale:
        'A Dockerfile declaration is evidence of build intent; deployment and configuration still need verification.',
      credibility: 'primary_report',
      applicability: 'potential',
      patch: 'available',
      publishedAt: '2026-10-21',
      affectedVersions: 'AWS lists PHP 8.3.0–8.3.35; first fixed version 8.3.36.',
      mitigation:
        'Upgrade the PHP 8.3 image to 8.3.36 or a later supported fixed release, rebuild and redeploy. Verify the running version.',
      prerequisites: ['An affected PHP build processes untrusted HTTP requests.'],
      limitations: [
        'Authored demo based on a bulletin checked 2026-11-12. This is not live research or a reconstruction of pre-patch reporting.',
      ],
      remediation:
        'Verify the deployed PHP build. For this upstream PHP 8.3 image, upgrade to 8.3.36 or a later supported fixed release, rebuild and redeploy. Confirm the running version and test the application.',
      sources: [
        {
          title: 'AWS PHP security bulletin',
          url: 'https://aws.amazon.com/security/security-bulletins/2026-143-aws/',
        },
      ],
    },
    component,
    'Authored demo / linked vendor bulletin',
    checkedAt,
    'model_reported',
  );
  finding.limitations = finding.limitations.filter((l) => !l.startsWith('Local Codex'));
  return {
    status: 'complete',
    findings: [finding],
    durationMs: 0,
    checkedAt,
    version: 'Authored demo v2',
    detail: 'Authored PHP advisory example with linked vendor guidance.',
  };
}
