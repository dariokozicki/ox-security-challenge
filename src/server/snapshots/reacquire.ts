import { acquire, canonicalRepository, sourceFile, safeSourcePath } from '../acquire.js';
import { acquireFile } from '../acquire-file.js';
import { config, AppError } from '../config.js';
import { encode } from './codec.js';
import type { SnapshotManifest } from './types.js';
import type { Snapshot } from '../../shared/types.js';
import type { Fetcher } from '../types.js';

export async function reacquire(
  manifest: SnapshotManifest,
  fetcher: Fetcher = fetch,
): Promise<Snapshot> {
  const signal = AbortSignal.timeout(60000);
  const { key, ...metadata } = manifest;
  if (manifest.fixture) {
    const demo = await acquire(manifest.repository, 'demo');
    if (encode(demo).key !== key) throw unavailable();
    return { ...metadata, files: demo.files };
  }
  const repository = canonicalRepository(manifest.repository);
  if (!/^[a-f0-9]{40}$/.test(manifest.revision) || manifest.files.length > config.maxFiles)
    throw unavailable();
  let remaining = config.maxTotalBytes;
  const files = [];
  for (const file of manifest.files) {
    if (!safeSourcePath(file.path)) throw unavailable();
    const url = `https://raw.githubusercontent.com/${repository.slice('https://github.com/'.length)}/${manifest.revision}/${file.path.split('/').map(encodeURIComponent).join('/')}`;
    const content = await acquireFile(url, remaining, fetcher, signal).catch(() => {
      throw unavailable();
    });
    remaining -= Buffer.byteLength(content);
    const acquired = sourceFile(file.path, content);
    if (acquired.sha256 !== file.sha256) throw unavailable();
    files.push(acquired);
  }
  const snapshot = { ...metadata, files };
  if (encode(snapshot).key !== key) throw unavailable();
  return snapshot;
}
function unavailable() {
  return new AppError(
    'snapshot_expired',
    'The source cache expired and the original files could not be verified at the saved commit. Start a new review.',
    409,
  );
}
