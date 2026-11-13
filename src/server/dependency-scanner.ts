import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { publicError } from './config.js';
import { boundedFetch } from './network.js';
import type { Fetcher } from './types.js';
import type { Snapshot, Finding, AnalyzerResult } from '../shared/types.js';
import { packagesFrom } from './lockfile.js';
import { findingFor } from './advisory-evidence.js';
const Batch = z.object({
  results: z.array(
    z.object({
      vulns: z.array(z.object({ id: z.string().regex(/^[A-Za-z0-9_-]+$/) })).optional(),
      next_page_token: z.string().optional(),
    }),
  ),
});
export async function scanDependencies(
  snapshot: Snapshot,
  signal?: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<AnalyzerResult> {
  const start = Date.now();
  const offset = snapshot.continuation?.packageOffset || 0;
  const { packages, warnings, total } = packagesFrom(snapshot, offset);
  const findings: Finding[] = [];
  const version = snapshot.fixture ? 'OSV fixture / 2026-11-11' : 'OSV API v1';
  if (!packages.length)
    return {
      status: 'skipped',
      detail: warnings.join(' ') || 'No installed package entries in the supported lockfiles.',
      findings,
      durationMs: Date.now() - start,
      version,
    };
  if (snapshot.fixture) {
    for (const pkg of packages)
      if (pkg.name === 'lodash' && pkg.version === '4.17.20') {
        const finding = findingFor(
          pkg,
          JSON.parse(await readFile('fixtures/advisories/GHSA-35jh-r3h4-6jhm.json', 'utf8')),
          snapshot,
        );
        if (finding) findings.push(finding);
      }
    return {
      status: 'complete',
      detail:
        'Demo: 1 pinned OSV advisory evaluated against the fixture; no live dependency lookup.',
      findings,
      durationMs: Date.now() - start,
      version,
    };
  }
  try {
    let pending = packages.map((pkg) => ({ pkg, token: undefined as string | undefined }));
    const cache = new Map<string, unknown>();
    const attempted = new Set<string>();
    const matches: { pkg: (typeof packages)[number]; id: string; rank: number }[] = [];
    const ranks = new Map<(typeof packages)[number], number>();
    for (let page = 0; pending.length && page < 3; page++) {
      try {
        const batch = Batch.parse(
          JSON.parse(
            await boundedFetch(
              'https://api.osv.dev/v1/querybatch',
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  queries: pending.map(({ pkg, token }) => ({
                    package: { name: pkg.name, ecosystem: pkg.ecosystem },
                    version: pkg.version,
                    ...(token ? { page_token: token } : {}),
                  })),
                }),
                signal,
              },
              2_000_000,
              fetcher,
            ),
          ),
        );
        if (batch.results.length !== pending.length) throw new Error('Invalid OSV result count');
        const next: typeof pending = [];
        for (let i = 0; i < pending.length; i++) {
          const result = batch.results[i];
          const { pkg } = pending[i];
          const offset = ranks.get(pkg) || 0;
          (result.vulns || []).forEach(({ id }, rank) =>
            matches.push({ pkg, id, rank: offset + rank }),
          );
          ranks.set(pkg, offset + (result.vulns?.length || 0));
          if (result.next_page_token) next.push({ pkg, token: result.next_page_token });
        }
        pending = next;
      } catch (error) {
        if (!matches.length) throw error;
        warnings.push(`OSV pagination interrupted. ${publicError(error)}`);
        break;
      }
    }
    if (pending.length) warnings.push('OSV pagination incomplete; results are incomplete.');
    // Give each package a first advisory before spending the budget on its remaining ones.
    matches.sort((a, b) => a.rank - b.rank);
    for (const { pkg, id } of matches) {
      if (!attempted.has(id) && attempted.size >= 80) {
        warnings.push('Advisory detail budget reached; results are incomplete.');
        continue;
      }
      try {
        if (!attempted.has(id)) {
          attempted.add(id);
          cache.set(
            id,
            JSON.parse(
              await boundedFetch(
                `https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`,
                { signal },
                500_000,
                fetcher,
              ),
            ),
          );
        }
        if (!cache.has(id)) continue;
        const f = findingFor(pkg, cache.get(id), snapshot);
        if (f && !findings.some((x) => x.id === f.id)) findings.push(f);
      } catch (e) {
        warnings.push(`Could not retrieve or validate advisory ${id}. ${publicError(e)}`);
      }
    }
  } catch (e) {
    warnings.push(publicError(e));
    return {
      status: findings.length ? 'partial' : 'failed',
      detail: warnings.join(' '),
      findings,
      durationMs: Date.now() - start,
      version,
    };
  }
  return {
    status: warnings.length ? 'partial' : 'complete',
    packageCoverage: {
      checked: offset + packages.length,
      batchCompleted: true,
      total,
      issues: [...new Set(warnings.filter((warning) => !warning.startsWith('Dependency budget:')))],
      ...(offset + packages.length < total ? { nextOffset: offset + packages.length } : {}),
    },
    detail: `${packages.length} locked package entries checked; ${findings.length} advisory matches. ${[...new Set(warnings)].join(' ')}`,
    findings,
    durationMs: Date.now() - start,
    version,
  };
}
