import type { PackageEntry } from '../shared/intelligence-types.js';
import type { SourceFile } from '../shared/types.js';
import { jsonLocator } from './json-location.js';

export function jsonPackages(file: SourceFile, warnings: string[]): PackageEntry[] {
  const entries: PackageEntry[] = [];
  const locate = jsonLocator(file);
  const add = (
    name: unknown,
    version: unknown,
    ecosystem: string,
    segments: (string | number)[],
    priority?: number,
  ) => {
    if (
      typeof name !== 'string' ||
      typeof version !== 'string' ||
      !/^[\w@./:+-]{1,200}$/.test(name) ||
      !/^v?\d[\w.+!-]{0,100}$/.test(version) ||
      (ecosystem === 'npm' && !/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version))
    ) {
      warnings.push(`${file.path}: non-exact or unsupported package identity omitted.`);
      return;
    }
    const line = locate(segments);
    const location =
      '/' + segments.map((s) => String(s).replaceAll('~', '~0').replaceAll('/', '~1')).join('/');
    entries.push({ name, version, ecosystem, file, location, line, priority });
  };
  const raw = JSON.parse(file.content);
  if (file.path.endsWith('package-lock.json')) {
    if (
      ![2, 3].includes(raw.lockfileVersion) ||
      !raw.packages ||
      typeof raw.packages !== 'object'
    ) {
      warnings.push(`${file.path}: only npm lockfile v2/v3 is supported.`);
      return entries;
    }
    const root = raw.packages[''] || {};
    const direct = new Set(Object.keys({ ...root.dependencies, ...root.optionalDependencies }));
    const development = new Set(Object.keys(root.devDependencies || {}));
    const priority = (location: string) => {
      const name = location.replace(/^node_modules\//, '');
      return direct.has(name)
        ? 0
        : development.has(name)
          ? 1
          : location.split('node_modules/').length;
    };
    const ordered = Object.entries(raw.packages).sort(([a], [b]) => priority(a) - priority(b));
    for (const [location, value] of ordered) {
      if (!location.includes('node_modules/')) continue;
      const item = value as { name?: string; version?: string; link?: boolean };
      if (item?.link) continue;
      add(
        item?.name || location.slice(location.lastIndexOf('node_modules/') + 13),
        item?.version,
        'npm',
        ['packages', location],
        priority(location),
      );
    }
  } else if (file.path.endsWith('composer.lock')) {
    for (const section of ['packages', 'packages-dev'])
      for (const [index, item] of (raw[section] || []).entries())
        add(item.name, item.version?.replace(/^v(?=\d)/, ''), 'Packagist', [section, index]);
  } else if (file.path.endsWith('packages.lock.json')) {
    for (const [framework, dependencies] of Object.entries(raw.dependencies || {}))
      for (const [name, item] of Object.entries(dependencies as object)) {
        const dependency = item as { resolved?: string; type?: string };
        if (dependency.type === 'Project') continue;
        add(name, dependency.resolved, 'NuGet', ['dependencies', framework, name]);
      }
  } else if (raw.bomFormat === 'CycloneDX') {
    const ecosystems: Record<string, string> = {
      npm: 'npm',
      composer: 'Packagist',
      pypi: 'PyPI',
      golang: 'Go',
      maven: 'Maven',
      nuget: 'NuGet',
      cargo: 'crates.io',
      gem: 'RubyGems',
    };
    for (const [index, item] of (raw.components || []).entries()) {
      if (item.components?.length)
        warnings.push(`${file.path}: nested SBOM components are not traversed.`);
      const match = /^pkg:([^/]+)\/([^?#]+)@([^?#]+)(?:[?#].*)?$/.exec(item.purl || '');
      if (!match || !ecosystems[match[1]]) {
        warnings.push(`${file.path}: component without a supported versioned package URL omitted.`);
        continue;
      }
      const name = decodeURIComponent(match[2]);
      add(
        match[1] === 'maven' ? name.replace('/', ':') : name,
        decodeURIComponent(match[3]),
        ecosystems[match[1]],
        ['components', index],
      );
    }
  }
  return entries;
}
