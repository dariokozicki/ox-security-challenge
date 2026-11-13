import type { Finding, Severity } from './types.js';

export type ActionKind =
  'dependencies' | 'access' | 'input' | 'files' | 'configuration' | 'disclosures' | 'review';
export type ActionGroup = {
  id: ActionKind;
  title: string;
  reason: string;
  severity: Severity;
  findings: Finding[];
  packages: { name: string; ecosystem: string; versions: string[] }[];
  checks: string[];
};
