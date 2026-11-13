import { createHash } from 'node:crypto';
import { z } from 'zod';
import { safeSourcePath } from '../acquire.js';
import { config, AppError } from '../config.js';
import type { Snapshot } from '../../shared/types.js';
import type { SnapshotManifest, SnapshotObject } from './types.js';

export const maxObjectBytes = 12_000_000; // JSON escaping can expand the 2 MB text limit.
export const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const schema = z
  .object({
    repository: z.string().max(300),
    revision: z.string().regex(/^[a-f0-9]{40,64}$/),
    files: z
      .array(
        z
          .object({
            path: z.string().refine(safeSourcePath),
            content: z.string(),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .max(config.maxFiles),
  })
  .strict();

export function decode(bytes: Buffer, key: string): SnapshotObject {
  if (bytes.length > maxObjectBytes || digest(bytes) !== key)
    throw new AppError('snapshot_integrity', 'Source snapshot failed its integrity check.', 409);
  const object = schema.parse(JSON.parse(bytes.toString('utf8')));
  if (
    new Set(object.files.map((f) => f.path)).size !== object.files.length ||
    object.files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0) >
      config.maxTotalBytes ||
    object.files.some((file) => digest(file.content) !== file.sha256)
  )
    throw new AppError('snapshot_integrity', 'Source snapshot failed its integrity check.', 409);
  return object;
}

export function encode(snapshot: Snapshot) {
  const { files: sourceFiles, ...metadata } = snapshot;
  const files = sourceFiles
    .map(({ path, content, sha256 }) => ({ path, content, sha256 }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const bytes = Buffer.from(
    JSON.stringify({
      repository: snapshot.repository,
      revision: snapshot.revision,
      files,
    }),
  );
  const key = digest(bytes);
  decode(bytes, key);
  const manifest: SnapshotManifest = {
    ...metadata,
    key,
    files: files.map(({ path, sha256 }) => ({ path, sha256 })),
  };
  return { key, bytes, manifest };
}

export function hydrate(manifest: SnapshotManifest, bytes: Buffer): Snapshot {
  const { key, ...metadata } = manifest;
  const object = decode(bytes, key);
  if (
    object.repository !== manifest.repository ||
    object.revision !== manifest.revision ||
    object.files.length !== manifest.files.length ||
    object.files.some(
      (file, i) => file.path !== manifest.files[i].path || file.sha256 !== manifest.files[i].sha256,
    )
  )
    throw new AppError('snapshot_integrity', 'Source snapshot metadata does not match.', 409);
  return { ...metadata, files: object.files };
}
