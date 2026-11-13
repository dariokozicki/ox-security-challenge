import { createHash } from 'node:crypto';
import type { Snapshot, SourceFile, Evidence } from '../shared/types.js';
import type { Component, Inventory } from '../shared/intelligence-types.js';
import { packagesFrom } from './lockfile.js';

export function fileEvidence(
  snapshot: Snapshot,
  file: SourceFile,
  line: number,
  endLine = line,
): Evidence {
  return {
    path: file.path,
    line,
    endLine,
    sha256: file.sha256,
    snippet: file.content
      .replaceAll('\r\n', '\n')
      .split('\n')
      .slice(line - 1, endLine)
      .join('\n'),
    ...(!snapshot.fixture
      ? {
          url: `${snapshot.repository}/blob/${snapshot.revision}/${file.path.split('/').map(encodeURIComponent).join('/')}#L${line}`,
        }
      : {}),
  };
}
export function inventoryFrom(snapshot: Snapshot): Inventory {
  const { packages, warnings } = packagesFrom(snapshot);
  const components: Component[] = [];
  const add = (item: Omit<Component, 'id'>) => {
    const id = createHash('sha256').update(JSON.stringify(item)).digest('hex').slice(0, 16);
    if (!components.some((c) => c.id === id)) components.push({ id, ...item });
  };
  for (const pkg of packages)
    add({
      kind: 'package',
      name: pkg.name,
      ecosystem: pkg.ecosystem,
      version: pkg.version,
      precision: 'exact',
      evidence: fileEvidence(snapshot, pkg.file, pkg.line),
    });
  for (const file of snapshot.files) {
    if (/(^|\/)(?:Dockerfile[^/]*|[^/]*\.Dockerfile)$/.test(file.path)) {
      for (const [index, line] of file.content.split('\n').entries()) {
        const from = /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)/i.exec(line)?.[1];
        const image = from?.replace(/^docker\.io\/(?:library\/)?/, '');
        const match = /^(php|node|python|ruby|openjdk|eclipse-temurin)(?::([^@]+))?(?:@.+)?$/i.exec(
          image || '',
        );
        if (match)
          add({
            kind: 'runtime',
            name: match[1].toLowerCase(),
            version: match[2] || 'unspecified',
            precision: /^\d+\.\d+\.\d+(?:-|$)/.test(match[2] || '') ? 'exact' : 'unknown',
            evidence: fileEvidence(snapshot, file, index + 1),
          });
      }
    }
    if (/(^|\/)(?:composer|package)\.json$/.test(file.path)) {
      try {
        const raw = JSON.parse(file.content);
        const values = file.path.endsWith('composer.json')
          ? { php: raw.require?.php }
          : raw.engines || {};
        for (const [name, version] of Object.entries(values)) {
          if (typeof version !== 'string' || !['php', 'node'].includes(name)) continue;
          const line = Math.max(
            1,
            file.content.split('\n').findIndex((l) => l.includes(`"${name}"`)) + 1,
          );
          add({
            kind: 'runtime',
            name,
            version,
            precision: 'constraint',
            evidence: fileEvidence(snapshot, file, line),
          });
        }
      } catch {
        warnings.push(`${file.path}: runtime constraints could not be read.`);
      }
    }
  }
  return { components, warnings: [...new Set(warnings)] };
}
