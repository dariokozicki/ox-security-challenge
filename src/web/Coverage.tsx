import { activityMessage } from '../shared/scan-messages';
import { Card } from './components/ui/card';
import { cn } from './lib/utils';
import { CheckCircle2, Circle, TriangleAlert } from 'lucide-react';
import type { CoverageProps } from './types';
import { severityClasses } from './presentation';
import { analysisStatus, currentAnalyzer } from '../shared/analysis-status';
import { RunningIndicator } from './RunningIndicator';
import { Button } from './components/ui/button';

export function Coverage({ scan, continueDependencies, busy }: CoverageProps) {
  return (
    <Card
      className={cn(
        'mt-6 rounded-xl border border-slate-200 bg-white p-6 [&_h2]:mb-2 [&_h2]:text-base',
        '[&_h2]:font-semibold [&>p]:text-sm [&_details]:border-t [&_details]:border-slate-200',
        '[&_details]:pt-4 [&_summary]:cursor-pointer [&_summary]:text-xs [&_summary]:text-slate-500',
      )}
    >
      <h2>Coverage & activity</h2>
      <p className={cn('text-slate-500')}>Analyzer results and scan activity.</p>
      {scan.analyzers.dependencies?.packageCoverage && (
        <p className="mt-3 font-medium text-slate-700">
          {scan.analyzers.dependencies.packageCoverage.checked} of{' '}
          {scan.analyzers.dependencies.packageCoverage.total} package entries queried
        </p>
      )}
      {(scan.analyzers.dependencies?.packageCoverage?.nextOffset !== undefined ||
        (!scan.snapshot?.continuation &&
          /Dependency budget: \d+ of [\d,]+/.test(scan.analyzers.dependencies?.detail || ''))) && (
        <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm">
          <p>
            Review the next batch of up to 100 packages from this saved revision. Existing findings
            are retained; this uses advisory lookups with no AI calls.
          </p>
          <Button
            className="mt-3"
            variant="outline"
            disabled={busy || ['queued', 'running'].includes(scan.status)}
            onClick={continueDependencies}
          >
            Continue dependency coverage
          </Button>
        </div>
      )}
      <div className={cn('my-5 grid gap-6 xl:grid-cols-2')}>
        {(['source', 'dependencies', 'research'] as const).map((name) => {
          const result = scan.analyzers[name];
          const running = currentAnalyzer(scan) === name;
          return (
            <div
              className={cn(
                'flex gap-3 [&>svg]:shrink-0 [&_h3]:mb-2 [&_h3]:flex [&_h3]:flex-wrap [&_h3]:items-center',
                '[&_h3]:gap-2 [&_h3]:text-sm [&_h3]:font-semibold [&_p]:text-xs [&_p]:leading-5',
                '[&_p]:text-slate-500 [&_small]:mt-2 [&_small]:block [&_small]:break-all [&_small]:text-xs',
                '[&_small]:text-slate-500',
              )}
              key={name}
            >
              {result?.status === 'complete' ? (
                <CheckCircle2 size={21} className="text-slate-500" />
              ) : result ? (
                <TriangleAlert size={21} className={cn('text-amber-600')} />
              ) : (
                <Circle size={21} />
              )}
              <div>
                <h3>
                  {name === 'source'
                    ? 'AI source investigation'
                    : name === 'research'
                      ? 'Emerging threat research'
                      : 'Dependency advisories'}
                  <span
                    className={cn(
                      'inline-block rounded px-1.5 py-1 text-xs font-semibold uppercase tracking-wider bg-slate-100',
                      'text-slate-500',
                    )}
                  >
                    {running ? <RunningIndicator compact /> : analysisStatus(result).label}
                  </span>
                  {result && (
                    <span
                      className={cn(
                        'rounded px-1.5 py-1 text-xs font-medium',
                        result.findings.length
                          ? severityClasses[
                              result.findings.some((f) => f.severity === 'critical')
                                ? 'critical'
                                : result.findings.some((f) => f.severity === 'high')
                                  ? 'high'
                                  : 'unknown'
                            ]
                          : result.status === 'complete'
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-slate-100 text-slate-600',
                      )}
                    >
                      {result.findings.length}{' '}
                      {result.findings.length === 1 ? 'finding' : 'findings'}
                      {scan.status === 'running' ? ' so far' : ''}
                    </span>
                  )}
                </h3>
                <p>
                  {scan.mode === 'demo' && result?.status === 'complete'
                    ? name === 'source'
                      ? 'Demonstration findings linked to fixture source lines.'
                      : name === 'dependencies'
                        ? 'Cached OSV advisory checked against fixture dependencies.'
                        : 'Authored PHP advisory example with linked vendor guidance.'
                    : result?.detail || 'Waiting for this analyzer to finish.'}
                </p>
                <small>
                  {result
                    ? `${result.version} · ${(result.durationMs / 1000).toFixed(1)}s`
                    : name === 'source'
                      ? 'AI review · source citations checked'
                      : name === 'research'
                        ? 'Targeted web research'
                        : 'OSV · multiple package ecosystems'}
                </small>
                {result?.assessments?.map((a, i) => (
                  <details key={i} className="mt-3">
                    <summary>AI assessed as not affected: {a.title}</summary>
                    <p>{a.reason}</p>
                    {a.sources.map((s) => (
                      <a
                        key={s.url}
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mr-3 text-sm text-emerald-700 underline"
                      >
                        {s.title}
                      </a>
                    ))}
                  </details>
                ))}
                {result?.sourceRejections?.map((decision) => (
                  <details key={decision.findingId} className="mt-3">
                    <summary>Withdrawn after AI review: {decision.title}</summary>
                    <p>{decision.reason}</p>
                    <p>
                      {decision.evidence.path}:{decision.evidence.line}
                    </p>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs">
                      {decision.evidence.snippet}
                    </pre>
                  </details>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {scan.snapshot?.warnings.map((w) => (
        <p className={cn('mb-3 flex gap-2 text-amber-700')} key={w}>
          <TriangleAlert size={15} />
          {w}
        </p>
      ))}
      <details>
        <summary>Scan activity</summary>
        <ol
          className={cn(
            'mt-4 space-y-3 [&_li]:flex [&_li]:gap-4 [&_li]:text-xs [&_li]:text-slate-500',
            '[&_time]:whitespace-nowrap [&_time]:text-slate-500',
          )}
        >
          {scan.events.map((e, i) => (
            <li key={i}>
              <time>{new Date(e.at).toLocaleTimeString()}</time>
              <span>{activityMessage(e.message)}</span>
            </li>
          ))}
        </ol>
      </details>
    </Card>
  );
}
