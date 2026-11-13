import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { AppError, config } from './config.js';
import { boundedFetch } from './network.js';
import type { Fetcher } from './types.js';
import type { Snapshot, SourceFile } from '../shared/types.js';
import { z } from 'zod';
import { selectedFile, isMetadata, intakeLimit, sourcePriority } from './file-selection.js';
import { acquireFile } from './acquire-file.js';

export function canonicalRepository(input: string): string {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    throw new AppError(
      'repository',
      'Enter a GitHub repository URL, such as https://github.com/owner/repository.',
    );
  }
  if (
    u.protocol !== 'https:' ||
    u.hostname !== 'github.com' ||
    u.port ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw new AppError(
      'repository',
      'Only public https://github.com/owner/repository URLs are accepted.',
    );
  const match = /^\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100})\/?$/.exec(u.pathname);
  if (!match)
    throw new AppError(
      'repository',
      'Use the repository root URL, without a branch, query, or file path.',
    );
  const repo = match[2].replace(/\.git$/, '');
  if (!repo || repo === '.' || repo === '..')
    throw new AppError('repository', 'Invalid repository name.');
  return `https://github.com/${match[1].toLowerCase()}/${repo.toLowerCase()}`;
}
export function safeSourcePath(path: string): boolean {
  return (
    path.length <= 220 &&
    path
      .split('/')
      .every(
        (s) =>
          !!s &&
          s !== '.' &&
          s !== '..' &&
          /^[a-zA-Z0-9_.@ ()-]+$/.test(s) &&
          !/[. ]$/.test(s) &&
          !/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(s),
      ) &&
    !path.split('/').some((s) => ['node_modules', '.git', 'dist', 'build', 'vendor'].includes(s))
  );
}
export const sourceFile = (path: string, content: string): SourceFile => ({
  path,
  content,
  sha256: createHash('sha256').update(content).digest('hex'),
});
const Tree = z.object({
  truncated: z.boolean().optional(),
  tree: z.array(
    z.object({ path: z.string(), type: z.string(), mode: z.string(), size: z.number().optional() }),
  ),
});
export async function acquire(
  repository: string,
  mode: 'live' | 'demo',
  signal?: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<Snapshot> {
  if (mode === 'demo') {
    const dir = resolve('fixtures/vulnerable');
    const files: SourceFile[] = [];
    async function walk(path: string) {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const full = resolve(path, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile())
          files.push(
            sourceFile(relative(dir, full).replaceAll('\\', '/'), await readFile(full, 'utf8')),
          );
      }
    }
    await walk(dir);
    files.sort((a, b) => a.path.localeCompare(b.path));
    return {
      repository: 'fixture://checkout-service',
      revision: createHash('sha256').update(JSON.stringify(files)).digest('hex'),
      files,
      warnings: [],
      acquiredAt: new Date().toISOString(),
      fixture: true,
    };
  }
  const canonical = canonicalRepository(repository);
  const slug = canonical.slice('https://github.com/'.length);
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Trace-Security-Review',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const request = async (path: string) =>
    JSON.parse(
      await boundedFetch(
        `https://api.github.com/repos/${slug}${path}`,
        { headers, signal },
        5_000_000,
        fetcher,
      ),
    );
  const repo = z
    .object({ private: z.boolean(), default_branch: z.string() })
    .parse(await request(''));
  if (repo.private)
    throw new AppError(
      'private_repository',
      'This submission supports public repositories only.',
      422,
    );
  const commit = z
    .object({
      sha: z.string().regex(/^[a-f0-9]{40}$/),
      commit: z.object({ tree: z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/) }) }),
    })
    .parse(await request(`/commits/${encodeURIComponent(repo.default_branch)}`));
  const tree = Tree.parse(await request(`/git/trees/${commit.commit.tree.sha}?recursive=1`));
  const warnings: string[] = [];
  if (tree.truncated)
    warnings.push('GitHub truncated the repository tree; coverage is incomplete.');
  const all = tree.tree.filter((f) => f.type === 'blob' && selectedFile(f.path));
  const allowed = all
    .filter(
      (f) =>
        ['100644', '100755'].includes(f.mode) &&
        safeSourcePath(f.path) &&
        typeof f.size === 'number' &&
        f.size <= intakeLimit(f.path),
    )
    .sort(
      (a, b) =>
        Number(isMetadata(b.path)) - Number(isMetadata(a.path)) ||
        sourcePriority(a.path) - sourcePriority(b.path) ||
        a.path.localeCompare(b.path),
    );
  if (allowed.length < all.length)
    warnings.push(
      `${all.length - allowed.length} candidate files excluded by path, file-type, directory, or size limits.`,
    );
  const candidates = allowed.slice(0, config.maxFiles);
  if (allowed.length > candidates.length)
    warnings.push(`Only ${config.maxFiles} of ${allowed.length} eligible files were selected.`);
  let total = 0;
  const files: SourceFile[] = [];
  // Sequential bounded intake avoids overshooting the global byte budget under concurrent downloads.
  for (const item of candidates) {
    if (total + (item.size ?? 0) > config.maxTotalBytes) {
      warnings.push(`Skipped ${item.path}: it exceeds the remaining repository byte budget.`);
      continue;
    }
    try {
      const content = await acquireFile(
        `https://raw.githubusercontent.com/${slug}/${commit.sha}/${item.path.split('/').map(encodeURIComponent).join('/')}`,
        Math.min(intakeLimit(item.path), config.maxTotalBytes - total),
        fetcher,
        signal,
      );
      total += Buffer.byteLength(content);
      if (total > config.maxTotalBytes) {
        warnings.push('Repository intake reached its 2 MB limit.');
        break;
      }
      files.push(sourceFile(item.path, content));
    } catch (e) {
      if (signal?.aborted) throw e;
      if (e instanceof AppError && e.retryable) throw e;
      warnings.push(`Could not acquire ${item.path}; coverage is incomplete.`);
    }
  }
  if (!files.length)
    throw new AppError(
      'unsupported',
      'No supported text source, deployment, or dependency inventory files could be acquired.',
      422,
    );
  return {
    repository: canonical,
    revision: commit.sha,
    files,
    warnings,
    acquiredAt: new Date().toISOString(),
    fixture: false,
  };
}
