import { open, lstat } from 'node:fs/promises';
import { dirname, relative, isAbsolute, sep } from 'node:path';

export function insideDirectory(parent: string, target: string) {
  const path = relative(parent, target);
  return !path || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}
export async function rejectLinkedAncestors(directory: string) {
  for (let current = directory; ; current = dirname(current)) {
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error('Snapshot directory ancestors cannot be symbolic links or junctions.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (dirname(current) === current) break;
  }
}
export async function syncDirectory(directory: string) {
  // Node cannot fsync Windows directories. Windows local cache loss is reported explicitly;
  // the durable review remains in PostgreSQL. POSIX publication syncs directory metadata.
  if (process.platform === 'win32') return;
  const file = await open(directory, 'r');
  try {
    await file.sync();
  } finally {
    await file.close();
  }
}
export async function syncDirectoryChain(directory: string) {
  for (let current = directory; ; current = dirname(current)) {
    await syncDirectory(current);
    if (dirname(current) === current) break;
  }
}
