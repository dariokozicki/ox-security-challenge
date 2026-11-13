import type { PackageEntry } from '../shared/intelligence-types.js';
import type { SourceFile } from '../shared/types.js';

export function textPackages(file: SourceFile, warnings: string[]): PackageEntry[] {
  const entries: PackageEntry[] = [];
  const python = /(^|\/)requirements[^/]*\.txt$/.test(file.path);
  if (!python && /^\s*replace\b/m.test(file.content)) {
    warnings.push(
      `${file.path}: Go replacements are unresolved; original module versions are not treated as installed dependencies.`,
    );
    return entries;
  }
  let block = false;
  for (const [index, raw] of file.content.split('\n').entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    if (python) {
      const match =
        /^([A-Za-z0-9_.-]+)(?:\[[\w,.-]+\])?==([0-9][\w.!+-]*)(?:\s*(?:;|#|\\|--hash=).*)?$/.exec(
          line,
        );
      if (match)
        entries.push({
          name: match[1].toLowerCase().replace(/[-_.]+/g, '-'),
          version: match[2],
          ecosystem: 'PyPI',
          file,
          location: match[1],
          line: index + 1,
        });
      else if (!line.startsWith('--hash='))
        warnings.push(
          `${file.path}:${index + 1}: only exact == requirements are matched; includes and ranges are unresolved.`,
        );
    } else {
      if (/^replace\b/.test(line))
        warnings.push(
          `${file.path}: Go replacements need manual review; original module matches may not describe the deployed code.`,
        );
      if (/^require\s*\(/.test(line)) {
        block = true;
        continue;
      }
      if (line === ')') {
        block = false;
        continue;
      }
      const candidate = block ? line : line.replace(/^require\s+/, '');
      if (!block && candidate === line) continue;
      const match = /^(\S+)\s+(v\d[\w.+-]*)(?:\s*\/\/.*)?$/.exec(candidate);
      if (match)
        entries.push({
          name: match[1],
          version: match[2],
          ecosystem: 'Go',
          file,
          location: match[1],
          line: index + 1,
        });
      else warnings.push(`${file.path}:${index + 1}: unresolved Go requirement.`);
    }
  }
  if (python)
    warnings.push(
      `${file.path}: environment markers are not evaluated; transitive completeness is unknown.`,
    );
  return entries;
}
