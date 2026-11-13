import { mkdir, readdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { runCommand } from './process.js';
import type { ScanWorkspace, ScanResource } from './types.js';

const ownedName = /^trace-scan-[a-f0-9-]{36}$/;
const root = resolve(tmpdir());

export async function removeScanWorkspace(workspace: ScanWorkspace): Promise<void> {
  const target = resolve(workspace.directory);
  if (
    dirname(target) !== root ||
    !ownedName.test(basename(target)) ||
    basename(target) !== workspace.name
  )
    throw new Error('Invalid scanner cleanup path');
  const result = await runCommand(
    'docker',
    ['rm', '-f', workspace.name],
    AbortSignal.timeout(5000),
  ).catch(() => undefined);
  // Retain the manifest for a later sweep if the daemon is temporarily unavailable.
  if (!result || (result.code !== 0 && !result.stderr.includes('No such container'))) return;
  await rm(target, { recursive: true, force: true }).catch(() => {});
}

export async function sweepScanResources(scanId?: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !ownedName.test(entry.name)) continue;
    const directory = join(root, entry.name);
    try {
      const modified = (await stat(directory)).mtimeMs;
      let resource: ScanResource = { expiresAt: modified + 120000 };
      try {
        const parsed: unknown = JSON.parse(
          await readFile(join(directory, '.trace-resource.json'), 'utf8'),
        );
        if (
          parsed &&
          typeof parsed === 'object' &&
          'expiresAt' in parsed &&
          typeof parsed.expiresAt === 'number' &&
          Number.isFinite(parsed.expiresAt)
        ) {
          resource = {
            expiresAt: parsed.expiresAt,
            scanId:
              'scanId' in parsed && typeof parsed.scanId === 'string' ? parsed.scanId : undefined,
          };
        }
      } catch {
        /* A crash before the manifest write leaves an age-bounded directory. */
      }
      if (resource.expiresAt <= Date.now() || (scanId && resource.scanId === scanId))
        await removeScanWorkspace({ directory, name: entry.name });
    } catch {
      /* Another worker may have already removed this workspace. */
    }
  }
}

export async function createScanWorkspace(scanId?: string): Promise<ScanWorkspace> {
  await sweepScanResources(scanId);
  const name = `trace-scan-${randomUUID()}`;
  const directory = join(root, name);
  await mkdir(directory);
  const resource: ScanResource = { scanId, expiresAt: Date.now() + 120000 };
  await writeFile(join(directory, '.trace-resource.json'), JSON.stringify(resource));
  return { directory, name };
}
