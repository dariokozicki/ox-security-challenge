import type { Snapshot, SourceFile } from '../../shared/types.js';

export type SnapshotManifest = Omit<Snapshot, 'files'> & {
  key: string;
  files: Pick<SourceFile, 'path' | 'sha256'>[];
};
export type SnapshotObject = Pick<Snapshot, 'repository' | 'revision' | 'files'>;
export interface SnapshotStore {
  put(key: string, bytes: Buffer, generation?: string): Promise<void>;
  get(key: string, generation?: string): Promise<Buffer>;
  remove(key: string, generation?: string): Promise<void>;
  list(): Promise<{ key: string; generation?: string; modified: number }[]>;
}
