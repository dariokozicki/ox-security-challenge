import type { Evidence, SourceFile } from './types.js';

export type Component = {
  id: string;
  kind: 'package' | 'runtime';
  name: string;
  ecosystem?: string;
  version: string;
  precision: 'exact' | 'constraint' | 'unknown';
  evidence: Evidence;
};
export type Inventory = { components: Component[]; warnings: string[] };
export type PackageEntry = {
  name: string;
  version: string;
  ecosystem: string;
  file: SourceFile;
  location: string;
  line: number;
  priority?: number;
};
export type Intelligence = {
  credibility: 'primary_report' | 'corroborated' | 'unverified';
  applicability: 'potential' | 'unknown';
  patch: 'available' | 'unavailable' | 'unknown';
  publishedAt: string | null;
  checkedAt: string;
  affectedVersions: string;
  mitigation: string;
  sources: { title: string; url: string }[];
};
