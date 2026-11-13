import { ArrowUpRight, FileCode2, Fingerprint } from 'lucide-react';
import { cn } from './lib/utils';
import type { FindingDetailProps } from './types';
export function EvidencePanel({ finding: f, revision }: FindingDetailProps) {
  return (
    <div className={cn('pt-5 [&>p]:text-sm [&>p]:leading-6 [&>p]:text-slate-500')}>
      <div className={cn('mb-3 text-xs font-semibold tracking-wider text-slate-500')}>
        SOURCE EVIDENCE
      </div>
      <div
        className={cn(
          'overflow-hidden rounded-lg border border-slate-200 [&_pre]:overflow-x-auto [&_pre]:bg-slate-50',
          '[&_pre]:p-4 [&_pre]:text-xs [&_pre]:leading-6 [&_pre]:text-slate-600',
        )}
      >
        <div
          className={cn(
            'flex items-center gap-2 bg-slate-100 px-3 py-2 text-xs text-slate-500',
            '[&>span:nth-child(2)]:flex-1 [&>span:nth-child(2)]:break-all',
          )}
        >
          <FileCode2 size={15} />
          <span>{f.evidence.path}</span>
          <span>
            L{f.evidence.line}
            {f.evidence.column ? `:${f.evidence.column}` : ''}
          </span>
          {f.evidence.url && (
            <a
              href={f.evidence.url}
              target="_blank"
              rel="noreferrer"
              aria-label="Open pinned source on GitHub"
            >
              <ArrowUpRight size={16} />
            </a>
          )}
        </div>
        <pre>
          <code>{f.evidence.snippet}</code>
        </pre>
      </div>
      <div
        className={cn(
          'mt-5 flex gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-4 [&>svg]:shrink-0',
          '[&>svg]:text-slate-700/70 [&>div]:min-w-0 [&_strong]:text-xs [&_strong]:font-medium',
          '[&_strong]:text-slate-800 [&_dl]:mt-3 [&_dl]:grid [&_dl]:grid-cols-[100px_minmax(0,1fr)]',
          '[&_dl]:gap-2 [&_dl]:text-xs [&_dt]:text-slate-500 [&_dd]:break-all [&_dd]:text-slate-500',
        )}
      >
        <Fingerprint size={17} />
        <div>
          <strong>Traceable to the original evidence</strong>
          <dl>
            <dt>Detector</dt>
            <dd>{f.detector}</dd>
            <dt>Revision</dt>
            <dd>{revision || 'Pending'}</dd>
            <dt>File SHA-256</dt>
            <dd>{f.evidence.sha256}</dd>
            <dt>Detection confidence</dt>
            <dd>{f.confidence}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
