import { Wrench } from 'lucide-react';
import { cn } from './lib/utils';
import type { FindingDetailProps } from './types';
import { verificationChecks } from '../shared/action-plan';
export function ActionPanel({ finding: f, runtime }: FindingDetailProps) {
  return (
    <div className={cn('pt-5 [&>p]:text-sm [&>p]:leading-6 [&>p]:text-slate-500')}>
      {runtime && (
        <>
          <h3>Check the deployed version</h3>
          <p>
            Check your deployment for the running {runtime.name} version and compare it with the
            affected versions. The repository declares <code>{runtime.version}</code>.
          </p>
        </>
      )}
      <div className={cn('mb-3 text-xs font-semibold tracking-wider text-slate-500')}>
        RECOMMENDED NEXT ACTION
      </div>
      <div
        className={cn(
          'flex gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-5 text-slate-800',
          '[&_svg]:shrink-0 [&_p]:text-sm [&_p]:leading-6',
        )}
      >
        <Wrench size={20} />
        <p>{f.remediation}</p>
      </div>
      <h3>Verify the change</h3>
      <ul className="mt-3 list-disc space-y-3 pl-5 text-sm leading-6 text-slate-600">
        {verificationChecks(f).map((check) => (
          <li key={check}>{check}</li>
        ))}
      </ul>
    </div>
  );
}
