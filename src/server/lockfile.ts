import { config } from './config.js';
import type { Snapshot } from '../shared/types.js';
import type { PackageEntry } from '../shared/intelligence-types.js';
import { jsonPackages } from './inventory-json.js';
import { textPackages } from './inventory-text.js';

export function packagesFrom(
  snapshot: Snapshot,
  offset = 0,
): { packages: PackageEntry[]; warnings: string[]; total: number } {
  const packages: PackageEntry[] = [];
  const warnings: string[] = [];
  const supported = new Set([
    'package-lock.json',
    'composer.lock',
    'packages.lock.json',
    'go.mod',
    'bom.json',
  ]);
  const locks = snapshot.files.filter((f) => {
    const name = f.path.split('/').at(-1) || '';
    return (
      supported.has(name) || /^requirements[^/]*\.txt$/.test(name) || name.endsWith('.cdx.json')
    );
  });
  for (const file of locks) {
    try {
      packages.push(
        ...(file.path.endsWith('.txt') || file.path.endsWith('go.mod')
          ? textPackages(file, warnings)
          : jsonPackages(file, warnings)),
      );
    } catch {
      warnings.push(`${file.path}: invalid inventory file could not be analyzed.`);
    }
  }
  const unsupported = snapshot.files.filter((f) =>
    /(?:Cargo\.lock|Gemfile\.lock|poetry\.lock|uv\.lock|yarn\.lock|pnpm-lock\.yaml|pom\.xml)$/.test(
      f.path,
    ),
  );
  for (const file of unsupported)
    warnings.push(
      `${file.path}: native dependency parsing is not supported; provide a CycloneDX JSON SBOM for exact-version matching.`,
    );
  if (!locks.length)
    warnings.push(
      'No supported exact-version dependency inventory was acquired; manifest ranges are not resolved.',
    );
  if (packages.length > offset + config.maxPackages)
    warnings.push(
      `Dependency budget: ${config.maxPackages} of ${packages.length} package entries evaluated; direct npm dependencies prioritized.`,
    );
  return {
    packages: packages
      .sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2))
      .slice(offset, offset + config.maxPackages),
    total: packages.length,
    warnings: [...new Set(warnings)].slice(0, 30),
  };
}
