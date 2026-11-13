import { GitFork } from 'lucide-react';
import { cn } from './lib/utils';
import type { FindingDetailProps } from './types';
export function PathPanel({ finding: f }: FindingDetailProps) {
  return (
    <div className={cn('pt-5 [&>p]:text-sm [&>p]:leading-6 [&>p]:text-slate-500')}>
      <div className={cn('mb-3 text-xs font-semibold tracking-wider text-slate-500')}>
        POTENTIAL PATH
      </div>
      {f.path.length > 0 ? (
        <ol
          className={cn(
            'space-y-5 [&_li]:flex [&_li]:gap-3 [&_li>div]:min-w-0 [&_li>div]:flex-1 [&_strong]:mb-2',
            '[&_strong]:block [&_strong]:text-sm [&_strong]:text-slate-800 [&_code]:block',
            '[&_code]:break-all [&_code]:rounded-md [&_code]:bg-slate-50/60 [&_code]:p-3',
            '[&_code]:text-xs [&_small]:mt-1 [&_small]:block [&_small]:text-xs',
            '[&_small]:text-slate-500',
          )}
        >
          {f.path.map((step, i) => (
            <li key={i}>
              <span
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs',
                  'text-slate-800',
                )}
              >
                {i + 1}
              </span>
              <div>
                <strong>{step.label}</strong>
                <code>{step.detail}</code>
                {step.line && (
                  <small>
                    {step.evidence?.path || f.evidence.path}:{step.line}
                  </small>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div
          className={cn(
            'rounded-lg border border-dashed border-slate-200 bg-slate-50/30 p-5 text-slate-800',
            '[&_p]:text-sm [&_p]:leading-6 [&_p]:text-slate-500',
          )}
        >
          <GitFork size={23} />
          <h3>Investigate application reachability</h3>
          <p>Trace component usage, attacker-controlled inputs, and runtime reachability.</p>
        </div>
      )}
      <h3>Prerequisites</h3>
      <ul className={cn('list-disc space-y-1.5 pl-4 text-xs leading-5 text-slate-500')}>
        {f.prerequisites.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}
