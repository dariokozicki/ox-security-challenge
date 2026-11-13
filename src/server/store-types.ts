import type { Scan, Snapshot, AnalyzerResult } from '../shared/types.js';
type MaybePromise<T> = T | Promise<T>;
export type StorePort = {
  close(): MaybePromise<void>;
  ready(): MaybePromise<void>;
  get(id: string): MaybePromise<Scan>;
  list(): MaybePromise<Scan[]>;
  create(
    repository: string,
    mode: 'live' | 'demo',
    key: string,
    retryOf?: string,
    pinned?: Snapshot,
  ): MaybePromise<Scan>;
  claim(): MaybePromise<{ scan: Scan; fence: string } | null>;
  snapshot(id: string): MaybePromise<Snapshot | undefined>;
  checkpoint(id: string, fence: string, snapshot: Snapshot): MaybePromise<void>;
  beginStage(id: string, fence: string, name: keyof Scan['analyzers']): MaybePromise<void>;
  stage(
    id: string,
    fence: string,
    name: keyof Scan['analyzers'],
    result: AnalyzerResult,
  ): MaybePromise<void>;
  finish(id: string, fence: string): MaybePromise<void>;
  fail(id: string, fence: string, message: string, retryable: boolean): MaybePromise<void>;
  heartbeat(id: string, fence: string): MaybePromise<boolean>;
  workerHeartbeat(id: string): MaybePromise<void>;
  removeWorker(id: string): MaybePromise<void>;
  workerReady(): MaybePromise<boolean>;
  admitMutation(key: string): MaybePromise<boolean>;
  cleanupSnapshots(): MaybePromise<number>;
  delete(id: string): MaybePromise<void>;
};
