import { AppError } from './config.js';
import type { SourceFile } from '../shared/types.js';

// Reject case aliases on every OS so the same snapshot has portable semantics.
export function assertDistinctPaths(files: SourceFile[]) {
  const spelling = new Map<string, string>();
  const filePaths = new Set(files.map((file) => file.path.toLowerCase()));
  for (const file of files) {
    const parts = file.path.split('/');
    for (let length = 1; length <= parts.length; length++) {
      const prefix = parts.slice(0, length).join('/');
      const key = prefix.toLowerCase();
      if (
        (spelling.has(key) && spelling.get(key) !== prefix) ||
        (length < parts.length && filePaths.has(key))
      ) {
        throw new AppError(
          'path_collision',
          'Source paths collide on case-insensitive filesystems; source analysis was not run.',
          422,
        );
      }
      spelling.set(key, prefix);
    }
  }
  if (filePaths.size !== files.length)
    throw new AppError('path_collision', 'Duplicate source paths rejected.', 422);
}
