import type { Finding, Scan } from '../shared/types';
import type { Component } from '../shared/intelligence-types';

export type CreateScanInput = {
  mode: 'live' | 'demo';
  repository?: string;
  retryOf?: string;
  recheck?: boolean;
  continuation?: boolean;
  key: string;
};

export type ServiceStatus = { worker: boolean; mode: string; explanation: string };
export type SidebarProps = {
  scans: Scan[];
  selected: string | null;
  select: (id: string | null) => void;
  worker: boolean;
};
export type ReviewHistoryProps = Pick<SidebarProps, 'scans' | 'selected' | 'select'>;
export type NewScanProps = {
  busy: boolean;
  onStart: (mode: 'live' | 'demo', repository?: string) => Promise<void>;
};
export type ScanHeaderProps = {
  scan: Scan;
  retry: () => void;
  recheck: () => void;
  download: () => void;
  busy: boolean;
  remove: () => void;
};
export type DeleteReviewProps = { disabled: boolean; remove: () => void };
export type FindingDetailProps = { finding: Finding; revision?: string; runtime?: Component };
export type ScanViewProps = ScanHeaderProps & { continueDependencies: () => void };
export type ActionSummaryProps = { scan: Scan; select: (id: string) => void };
export type RunningIndicatorProps = { label?: string; compact?: boolean };
export type CoverageProps = { scan: Scan; continueDependencies: () => void; busy: boolean };
