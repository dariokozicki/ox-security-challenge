import type { Snapshot } from '../shared/types.js';
import { isSource, sourcePriority, isMetadata } from './file-selection.js';
import { packagesFrom } from './lockfile.js';
import { routeContexts } from './route-context.js';

export function sourceInput(snapshot: Snapshot) {
  const candidates = snapshot.files
    .filter((file) => isSource(file.path))
    .sort((a, b) => sourcePriority(a.path) - sourcePriority(b.path));
  const context = snapshot.files
    .filter(
      (file) =>
        isMetadata(file.path) &&
        /(?:^|\/)(?:package\.json|Dockerfile[^/]*|composer\.json)$/.test(file.path) &&
        file.content.length <= 6000,
    )
    .slice(0, 4)
    .map((file) => ({ path: file.path, content: file.content }));
  const input = {
    context,
    routeContext: routeContexts(snapshot)
      .slice(0, 12)
      .map((route) => ({
        method: route.method,
        route: route.route.slice(0, 200),
        handler: route.handler,
        middleware: route.middleware.slice(0, 6).map((name) => name.slice(0, 120)),
        registration: {
          path: route.registration.path,
          line: route.registration.line,
          snippet: route.registration.snippet.slice(0, 600),
        },
        sessionChecks: route.sessionChecks.slice(0, 3).map((check) => ({
          path: check.path,
          line: check.line,
          snippet: check.snippet.slice(0, 600),
        })),
      })),
    packageVersions: packagesFrom(snapshot)
      .packages.filter(
        (item) =>
          item.name.length <= 160 &&
          item.version.length <= 80 &&
          item.ecosystem.length <= 40 &&
          item.location.length <= 512 &&
          item.file.path.length <= 220,
      )
      .slice(0, 40)
      .map((item) => ({
        name: item.name,
        version: item.version,
        ecosystem: item.ecosystem,
        inventory: item.file.path,
        location: item.location,
      })),
    files: [] as { path: string; lines: { line: number; text: string }[] }[],
  };
  const files: Snapshot['files'] = [];
  for (const file of candidates) {
    const numbered = {
      path: file.path,
      lines: file.content
        .replaceAll('\r\n', '\n')
        .split('\n')
        .map((text, index) => ({ line: index + 1, text })),
    };
    input.files.push(numbered);
    // Account for Unicode, line labels and JSON escaping inside the API request body.
    if (Buffer.byteLength(JSON.stringify(JSON.stringify(input))) > 80_000) input.files.pop();
    else files.push(file);
  }
  return { input, files, candidateCount: candidates.length };
}
