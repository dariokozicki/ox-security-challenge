import type { AnalyzerResult, Scan } from './types.js';

export function analysisStatus(result?: AnalyzerResult) {
  if (!result) return { label: 'Waiting', reason: 'Waiting for this check to start.' };
  if (result.status === 'failed') return { label: 'Check failed', reason: result.detail };
  if (result.status === 'skipped') return { label: 'Unavailable', reason: result.detail };
  if (result.status === 'complete') return { label: 'Finished', reason: result.detail };
  if (
    /did not finish|interrupted|timed? ?out|could not retrieve|exceeded.*time/i.test(result.detail)
  )
    return { label: 'Check interrupted', reason: result.detail };
  if (
    result.packageCoverage?.nextOffset !== undefined ||
    /budget|allowance|(?:file|component|time) limit reached|only \d/i.test(result.detail)
  )
    return { label: 'Budget-limited', reason: result.detail };
  if (/reject|citations? could not|evidence.*needs review|reference.*validat/i.test(result.detail))
    return { label: 'Needs verification', reason: result.detail };
  return { label: 'Limited coverage', reason: result.detail };
}

export function currentAnalyzer(scan: Scan) {
  return scan.status === 'running' ? scan.activeAnalyzer : undefined;
}
export const reviewStatusLabel = (scan: Scan) =>
  ({
    queued: 'Queued',
    running: 'Running',
    completed: 'Finished',
    partial: 'Finished with coverage limits',
    failed: 'Failed',
  })[scan.status];
