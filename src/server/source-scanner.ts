import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { config, AppError } from './config.js';
import { safeSourcePath } from './acquire.js';
import type { Snapshot, AnalyzerResult } from '../shared/types.js';
import { runCommand } from './process.js';
import { normalizeSemgrep } from './source-evidence.js';
import { assertDistinctPaths } from './materialization.js';
import { createScanWorkspace, removeScanWorkspace } from './scan-resources.js';
export async function scanSource(
  snapshot: Snapshot,
  signal?: AbortSignal,
  scanId?: string,
): Promise<AnalyzerResult> {
  const start = Date.now();
  const source = snapshot.files.filter((f) => /\.(?:[cm]?js|jsx|ts|tsx)$/.test(f.path));
  if (!source.length)
    return {
      status: 'skipped',
      detail: 'No supported JavaScript/TypeScript source files.',
      findings: [],
      durationMs: 0,
      version: 'Semgrep 1.145.0',
    };
  assertDistinctPaths(source);
  const workspace = await createScanWorkspace(scanId);
  const { directory, name } = workspace;
  const timer = AbortSignal.timeout(90_000);
  const combined = signal ? AbortSignal.any([signal, timer]) : timer;
  try {
    for (const file of source) {
      if (!safeSourcePath(file.path))
        throw new AppError('unsafe_path', 'Unsafe source file path rejected.', 422);
      const target = resolve(directory, file.path);
      if (!target.startsWith(directory + requireSeparator()))
        throw new AppError('unsafe_path', 'Unsafe source file path rejected.', 422);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content);
    }
    const rulePath = resolve('rules');
    const digest = createHash('sha256')
      .update(await readFile(join(rulePath, 'trace.yml')))
      .digest('hex');
    const result = await runCommand(
      'docker',
      [
        'run',
        '--init',
        '--rm',
        '--name',
        name,
        '--network=none',
        '--read-only',
        '--cap-drop=ALL',
        '--security-opt=no-new-privileges',
        '--pids-limit=128',
        '--memory=768m',
        '--cpus=1',
        '--tmpfs',
        '/tmp:rw,noexec,nosuid,size=128m',
        '-e',
        'HOME=/tmp',
        '-e',
        'SEMGREP_SEND_METRICS=off',
        '-v',
        `${directory}:/src:ro`,
        '-v',
        `${rulePath}:/rules:ro`,
        '--entrypoint',
        'timeout',
        config.semgrepImage,
        '-k',
        '5',
        '85',
        'semgrep',
        'scan',
        '--config',
        '/rules/trace.yml',
        '--json',
        '--dataflow-traces',
        '--metrics=off',
        '--disable-version-check',
        '--no-git-ignore',
        '--timeout',
        '10',
        '--max-memory',
        '512',
        '--jobs',
        '1',
        '/src',
      ],
      combined,
    );
    if (result.code !== 0)
      throw new AppError(
        'scanner_failed',
        `Source scanner failed (exit ${result.code}); check Docker availability and the pinned image.`,
        502,
      );
    return normalizeSemgrep(JSON.parse(result.stdout), snapshot, Date.now() - start, digest);
  } finally {
    await removeScanWorkspace(workspace);
  }
}
function requireSeparator() {
  return process.platform === 'win32' ? '\\' : '/';
}
