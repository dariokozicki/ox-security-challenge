import type { AnalyzerResult, Scan, Status } from './types.js';
import { analysisStatus } from './analysis-status.js';

export const scanStarted = (attempt: number) =>
  attempt > 1 ? `Retrying scan (attempt ${attempt}).` : 'Scan started.';

export function scanFinished(status: Status) {
  return status === 'completed'
    ? 'Scan completed.'
    : status === 'partial'
      ? 'Scan finished with coverage limits.'
      : 'Scan failed.';
}

export function stageFinished(name: keyof Scan['analyzers'], result: AnalyzerResult) {
  const label = {
    source: 'Source review',
    dependencies: 'Dependency check',
    research: 'Disclosure research',
  }[name];
  const status = {
    complete: 'completed',
    partial: `finished · ${analysisStatus(result).label.toLowerCase()}`,
    failed: 'failed',
    skipped: 'skipped',
  }[result.status];
  return `${label} ${status}.` + (result.status === 'complete' ? '' : ` ${result.detail}`);
}

// Adapt saved activity from older versions without rewriting the original records.
export function activityMessage(message: string) {
  if (message === 'Scan finished with partial results.')
    return 'Scan finished with coverage limits.';
  if (message === 'Scan queued durably.') return 'Scan queued.';
  const attempt = /^Worker acquired attempt (\d+)\.$/.exec(message);
  if (attempt) return scanStarted(Number(attempt[1]));
  const finished =
    /^Review (completed|partial|failed)\. No findings is not proof of security\.$/.exec(message);
  if (finished) return scanFinished(finished[1] as Status);
  const stage =
    /^(source|dependencies|research): (complete|partial|failed|skipped)\.\s*([\s\S]*)$/.exec(
      message,
    );
  if (stage)
    return stageFinished(stage[1] as keyof Scan['analyzers'], {
      status: stage[2] as AnalyzerResult['status'],
      detail: stage[3],
      findings: [],
      durationMs: 0,
      version: '',
    });
  if (message === 'Worker lease expired; scheduled recovery.')
    return 'Scan interrupted. Retry scheduled.';
  if (message === 'Worker lease expired; recovery budget exhausted.')
    return 'Scan failed after repeated interruptions.';
  return message
    .replace(' Retrying with backoff.', ' Retrying shortly.')
    .replace('finished with partial results', 'finished with coverage limits');
}
