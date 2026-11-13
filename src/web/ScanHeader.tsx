import { Button } from './components/ui/button';
import { cn } from './lib/utils';
import { Download, GitBranch, RotateCw } from 'lucide-react';
import { findingsOf } from '../shared/findings';
import type { ScanHeaderProps } from './types';
import { reviewOutcome, analyzerProgress, coverageNeedsAttention } from './presentation';
import { RunningIndicator } from './RunningIndicator';
import { DeleteReview } from './DeleteReview';

export function ScanHeader({ scan, retry, recheck, download, busy, remove }: ScanHeaderProps) {
  const findings = findingsOf(scan);
  const outcome = reviewOutcome(scan);
  const progress = analyzerProgress(scan);
  const coverageGap = coverageNeedsAttention(scan);
  const active = ['queued', 'running'].includes(scan.status);
  const potential = findings.filter((f) => f.category === 'code' && f.path.length > 0).length;
  return (
    <>
      <div
        className={cn(
          'mb-6 flex flex-col items-start justify-between gap-5 xl:flex-row [&_h1]:my-3 [&_h1]:break-all [&_h1]:text-2xl',
          '[&_h1]:font-semibold [&_h1]:tracking-tight',
        )}
      >
        <div>
          <div
            className={cn(
              'flex items-center gap-2 text-xs font-semibold tracking-widest text-slate-600',
            )}
          >
            <GitBranch size={14} />
            {scan.mode === 'demo' ? 'DEMO FIXTURE' : 'PUBLIC REPOSITORY REVIEW'}
          </div>
          <h1>
            {scan.mode === 'demo'
              ? 'checkout-service'
              : scan.repository.split('/').slice(-2).join('/')}
          </h1>
          <p className={cn('flex flex-wrap items-center gap-2 text-xs text-slate-500')}>
            {new Date(scan.createdAt).toLocaleString()}
            <span>·</span>
            {scan.snapshot
              ? `${scan.snapshot.fileCount} files acquired`
              : 'Awaiting repository snapshot'}
            <span>·</span>
            <code>{scan.snapshot?.revision.slice(0, 12) || 'Revision pending'}</code>
          </p>
        </div>
        <div className={cn('flex flex-wrap gap-2')}>
          <DeleteReview disabled={busy || active} remove={remove} />
          <Button variant="outline" onClick={recheck} disabled={busy || active || !scan.snapshot}>
            Reassess saved revision
          </Button>
          <Button
            variant="ghost"
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3',
              'py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50',
            )}
            onClick={download}
          >
            <Download size={16} /> Evidence
          </Button>
          <Button
            variant="ghost"
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3',
              'py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50',
            )}
            onClick={retry}
            disabled={busy || active}
          >
            <RotateCw size={16} /> Run again
          </Button>
        </div>
      </div>
      <div
        className={cn(
          'mb-6 flex flex-wrap items-center gap-2.5 rounded-lg border border-slate-200',
          'bg-slate-50 px-4 py-3 text-sm text-slate-700 [&>span:last-child]:text-xs',
          '[&>span:last-child]:text-slate-500 xl:[&>span:last-child]:ml-auto',
          coverageGap ? 'border-amber-200 bg-amber-50 text-amber-800' : '',
        )}
      >
        {active ? (
          <RunningIndicator label={scan.status === 'queued' ? 'Queued' : 'Analysis running'} />
        ) : (
          <span
            className={cn(
              'inline-block size-1.5 shrink-0 rounded-full',
              active
                ? 'animate-pulse motion-reduce:animate-none bg-slate-500'
                : scan.status === 'completed'
                  ? 'bg-slate-400'
                  : 'bg-amber-500',
            )}
          />
        )}
        <strong>
          {active
            ? `Review in progress · ${scan.phase}`
            : scan.status === 'failed'
              ? 'Review could not complete'
              : coverageGap
                ? 'Review finished · coverage needs attention'
                : 'Review complete'}
        </strong>
        <span>{active ? 'You can leave this page. The scan continues.' : scan.error}</span>
      </div>
      <div
        className={cn('mb-5 rounded-lg border px-4 py-3 text-base font-semibold', outcome.classes)}
      >
        {outcome.label}
        <p className="mt-1 text-sm font-normal">
          {findings.length
            ? 'Review findings by severity and plan the next action.'
            : 'See coverage and activity below.'}
        </p>
      </div>
      <div
        className={cn(
          'mb-8 grid grid-cols-2 gap-y-5 rounded-xl border border-slate-200 bg-white py-5 lg:grid-cols-4',
          '[&>div]:border-r [&>div]:border-slate-100 [&>div]:px-5 [&>div:last-child]:border-0',
          '[&_span]:block [&_span]:text-xs [&_span]:font-semibold [&_span]:tracking-widest',
          '[&_span]:text-slate-500 [&_strong]:my-2 [&_strong]:block [&_strong]:text-3xl',
          '[&_strong]:font-medium [&_em]:text-xl [&_em]:not-italic [&_em]:text-slate-300',
          '[&_small]:text-xs [&_small]:text-slate-500',
        )}
      >
        <div>
          <span>FINDINGS TO REVIEW</span>
          <strong>{findings.length.toString().padStart(2, '0')}</strong>
          <small>Evidence-backed observations</small>
        </div>
        <div>
          <span>HIGH / CRITICAL SEVERITY</span>
          <strong className={cn('text-orange-700')}>
            {findings
              .filter((f) => ['critical', 'high'].includes(f.severity))
              .length.toString()
              .padStart(2, '0')}
          </strong>
          <small>Review context and prerequisites</small>
        </div>
        <div>
          <span>POTENTIAL CODE PATHS</span>
          <strong>{potential.toString().padStart(2, '0')}</strong>
          <small>Source-to-operation paths</small>
        </div>
        <div>
          <span>CHECKS FINISHED</span>
          <strong>
            {progress.finished}
            <em> / 3</em>
          </strong>
          <small>{progress.detail}</small>
        </div>
      </div>
    </>
  );
}
