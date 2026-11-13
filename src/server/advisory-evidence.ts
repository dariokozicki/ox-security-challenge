import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Snapshot, Finding, Severity } from '../shared/types.js';
import type { PackageEntry } from '../shared/intelligence-types.js';
const Advisory = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]+$/),
    summary: z.string().optional(),
    details: z.string().optional(),
    modified: z.string().optional(),
    withdrawn: z.string().optional(),
    database_specific: z.object({ severity: z.string().optional() }).passthrough().optional(),
    affected: z
      .array(
        z
          .object({
            package: z.object({ name: z.string(), ecosystem: z.string() }),
            ranges: z
              .array(
                z
                  .object({
                    events: z.array(z.object({ fixed: z.string().optional() }).passthrough()),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();
export function findingFor(
  pkg: PackageEntry,
  raw: unknown,
  snapshot: Snapshot,
): Finding | undefined {
  const advisory = Advisory.parse(raw);
  if (advisory.withdrawn) return;
  const affected = advisory.affected?.find(
    (p) =>
      p.package.ecosystem === pkg.ecosystem &&
      (pkg.ecosystem === 'NuGet'
        ? p.package.name.toLowerCase() === pkg.name.toLowerCase()
        : p.package.name === pkg.name),
  );
  const fixed = [
    ...new Set(
      affected?.ranges?.flatMap((r) => r.events.flatMap((e) => (e.fixed ? [e.fixed] : []))) ?? [],
    ),
  ];
  const reportedSeverity = advisory.database_specific?.severity?.toLowerCase();
  const candidate = reportedSeverity === 'moderate' ? 'medium' : reportedSeverity;
  const severity: Severity = ['critical', 'high', 'medium', 'low'].includes(candidate || '')
    ? (candidate as Severity)
    : 'unknown';
  if (!affected) throw new Error('Advisory does not identify the queried package and ecosystem');
  const line = pkg.line;
  return {
    id: createHash('sha256')
      .update(`${pkg.file.path}:${pkg.ecosystem}:${pkg.location}:${pkg.version}:${advisory.id}`)
      .digest('hex')
      .slice(0, 16),
    title: advisory.summary || `${pkg.name}: ${advisory.id}`,
    severity,
    category: 'dependency',
    rule: advisory.id,
    detector: snapshot.fixture
      ? 'OSV advisory fixture (captured 2026-11-11)'
      : 'OSV.dev exact-version query',
    confidence: 'high',
    assurance: 'detected',
    summary: `${pkg.name}@${pkg.version} matches ${advisory.id}. ${(advisory.details || '').slice(0, 800)}`,
    rationale:
      'An exact locked version matches an advisory. Severity is reported by the advisory; dependency ' +
      'reachability and production exposure have not been established.',
    evidence: {
      path: pkg.file.path,
      line,
      endLine: line,
      snippet: `${pkg.location}\npackage: ${pkg.name}\nlocked version: ${pkg.version}\nadvisory modified: ${advisory.modified || 'not supplied'}`,
      sha256: pkg.file.sha256,
      ...(!snapshot.fixture
        ? {
            url: `${snapshot.repository}/blob/${snapshot.revision}/${pkg.file.path.split('/').map(encodeURIComponent).join('/')}#L${line}`,
          }
        : {}),
    },
    path: [],
    prerequisites: [
      'The vulnerable functionality is used by the application.',
      'Attacker control satisfies the advisory-specific preconditions.',
    ],
    limitations: [
      'Presence in a lockfile is not proof of a reachable exploit path.',
      'Transitive installation and deployed runtime behavior have not been verified.',
      ...(snapshot.fixture
        ? ['Demo uses one pinned advisory; this is not a current complete OSV lookup.']
        : []),
    ],
    remediation: fixed.length
      ? `Review advisory-fixed release(s): ${fixed.join(', ')}. Select the appropriate supported version, update the lockfile, and run compatibility and security tests.`
      : 'Review the linked advisory for an available fix or mitigation. Do not assume a safe upgrade version.',
    references: [{ title: advisory.id, url: `https://osv.dev/vulnerability/${advisory.id}` }],
    package: {
      name: pkg.name,
      version: pkg.version,
      advisory: advisory.id,
      ecosystem: pkg.ecosystem,
      fixedVersions: fixed,
    },
  };
}
