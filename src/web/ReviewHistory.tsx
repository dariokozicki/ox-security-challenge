import { FolderGit2 } from 'lucide-react';
import { Button } from './components/ui/button';
import { cn } from './lib/utils';
import type { ReviewHistoryProps } from './types';
import { reviewStatusLabel } from '../shared/analysis-status';
import { RunningIndicator } from './RunningIndicator';

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function ReviewHistory({ scans, selected, select }: ReviewHistoryProps) {
  return (
    <nav
      aria-label="Recent reviews"
      className="mx-2 hidden min-h-24 flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-1 py-1 md:block [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent]"
    >
      {!scans.length && (
        <div className="rounded-lg border border-dashed border-slate-200 px-3 py-5 text-center">
          <FolderGit2 className="mx-auto mb-2 size-4 text-slate-500" />
          <p className="text-sm text-slate-500">No reviews yet</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Your reviewed repositories will appear here.
          </p>
        </div>
      )}
      {scans.map((scan) => {
        const active = selected === scan.id;
        const name =
          scan.mode === 'demo'
            ? 'checkout-service'
            : scan.repository.split('/').slice(-2).join('/');
        const date = dateFormat.format(new Date(scan.createdAt));
        const status = reviewStatusLabel(scan);
        return (
          <Button
            variant="ghost"
            key={scan.id}
            aria-current={active ? 'page' : undefined}
            title={`${scan.id} · ${name} · ${scan.mode === 'demo' ? 'Demo fixture' : scan.repository} · ${status} · ${date}`}
            className={cn(
              'group w-full justify-start gap-2.5 rounded-lg border border-transparent px-3 py-4 text-left shadow-none',
              'hover:bg-slate-50 hover:text-slate-900',
              active ? 'border-slate-200 bg-slate-100 text-slate-900' : 'text-slate-600',
            )}
            onClick={() => select(scan.id)}
          >
            {['queued', 'running'].includes(scan.status) ? (
              <RunningIndicator compact label="" />
            ) : (
              <span
                aria-hidden="true"
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  scan.status === 'completed'
                    ? 'bg-slate-400'
                    : scan.status === 'failed'
                      ? 'bg-red-400'
                      : 'bg-amber-400',
                )}
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                <span className="shrink-0 font-mono text-xs font-normal text-slate-500">
                  {scan.id.slice(0, 6)}
                </span>
              </span>
              <span className="mt-1 block truncate text-xs font-normal text-slate-500">
                {status} · {date}
              </span>
            </span>
          </Button>
        );
      })}
    </nav>
  );
}
