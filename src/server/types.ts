import type { AnalyzerResult, Snapshot, SourceFile } from '../shared/types.js';

export type Fetcher = typeof fetch;
export type CommandResult = { stdout: string; stderr: string; code: number | null };
export type TraceLocation = { line: number; content: string };
export type LockedPackage = { name: string; version: string; file: SourceFile; location: string };
export type RuleGuidance = {
  title: string;
  severity: 'high' | 'medium';
  summary: string;
  remediation: string;
  preconditions: string[];
  cwe: string;
};
export type ScanRow = {
  id: string;
  doc: string;
  snapshot: string | null;
  fence: string | null;
  lease: number;
  attempt: number;
  request_hash: string;
};
export type Providers = {
  acquire: (repository: string, mode: 'live' | 'demo', signal?: AbortSignal) => Promise<Snapshot>;
  source: (snapshot: Snapshot, signal?: AbortSignal, scanId?: string) => Promise<AnalyzerResult>;
  dependencies: (snapshot: Snapshot, signal?: AbortSignal) => Promise<AnalyzerResult>;
  research?: (snapshot: Snapshot, signal?: AbortSignal) => Promise<AnalyzerResult>;
};
export type ScanWorkspace = { directory: string; name: string };
export type ScanResource = { scanId?: string; expiresAt: number };
export type ApiOptions = {
  token?: string;
  static?: boolean;
  logger?: boolean;
  publicOrigin?: string;
};
