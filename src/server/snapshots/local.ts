import { constants } from 'node:fs';
import { mkdir, open, lstat, readdir, unlink, link } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import {
  insideDirectory,
  rejectLinkedAncestors,
  syncDirectory,
  syncDirectoryChain,
} from './filesystem.js';
import { AppError } from '../config.js';
import { maxObjectBytes, decode } from './codec.js';
import type { SnapshotStore } from './types.js';

export class LocalSnapshotStore implements SnapshotStore {
  readonly root: string;
  constructor(directory: string) {
    this.root = resolve(directory);
    const webRoot = resolve('dist/web');
    if (insideDirectory(webRoot, this.root))
      throw new Error('Snapshot storage must be outside the web root.');
  }
  private path(key: string, generation?: string) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid snapshot key');
    if (generation && !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(generation))
      throw new Error('Invalid snapshot generation');
    return join(this.root, `${key}${generation ? `.${generation}` : ''}.json`);
  }
  private async ready() {
    await rejectLinkedAncestors(this.root);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await rejectLinkedAncestors(this.root);
  }
  async get(key: string, generation?: string): Promise<Buffer> {
    const path = this.path(key, generation);
    try {
      await this.ready();
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxObjectBytes)
        throw new Error('Invalid object');
      const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      try {
        const data = Buffer.alloc(maxObjectBytes + 1);
        let length = 0;
        while (length < data.length) {
          const { bytesRead } = await file.read(data, length, data.length - length, null);
          if (!bytesRead) break;
          length += bytesRead;
        }
        const bytes = data.subarray(0, length);
        decode(bytes, key);
        return bytes;
      } finally {
        await file.close();
      }
    } catch {
      throw new AppError(
        'snapshot_unavailable',
        'Source snapshot is missing, blocked or damaged. Saved findings remain available. Check local storage and security software before retrying.',
        409,
      );
    }
  }
  async put(key: string, bytes: Buffer, generation?: string) {
    decode(bytes, key);
    await this.ready();
    const path = this.path(key, generation);
    const temporary = join(this.root, `${key}.${randomUUID()}.tmp`);
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      // Atomic publication, without replacing an existing object or following its link.
      await link(temporary, path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await this.get(key, generation);
    } finally {
      await unlink(temporary);
    }
    await syncDirectoryChain(this.root);
  }
  async remove(key: string, generation?: string) {
    await this.ready();
    try {
      await unlink(this.path(key, generation));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    // An earlier unlink may have succeeded before its directory sync failed.
    await syncDirectory(this.root);
  }
  async list() {
    await this.ready();
    const objects: { key: string; generation?: string; modified: number }[] = [];
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      try {
        if (/^[a-f0-9]{64}\.[a-f0-9-]{36}\.tmp$/.test(entry.name) && entry.isFile()) {
          const path = join(this.root, entry.name);
          if ((await lstat(path)).mtimeMs + 86400000 < Date.now()) await unlink(path);
        }
        const match =
          /^([a-f0-9]{64})(?:\.([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}))?\.json$/.exec(
            entry.name,
          );
        if (!match || !entry.isFile()) continue;
        const stat = await lstat(join(this.root, entry.name));
        objects.push({ key: match[1], generation: match[2], modified: stat.mtimeMs });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return objects;
  }
}
