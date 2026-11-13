import { actionPlan } from '../shared/action-plan';
import { Button } from './components/ui/button';
import { severityClasses } from './presentation';
import { ArrowDown, ListChecks } from 'lucide-react';
import type { ActionSummaryProps } from './types';

export function ActionSummary({ scan, select }: ActionSummaryProps) {
  const groups = actionPlan(scan);
  if (!groups.length) return null;
  return (
    <section
      aria-label="Recommended actions"
      className="mb-8 rounded-xl border border-slate-200 bg-white p-6"
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <ListChecks size={22} /> Your action plan
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        Related findings are grouped into work you can tackle together. Ordered by highest reported
        severity.
      </p>
      {['queued', 'running'].includes(scan.status) && (
        <p className="mt-2 text-sm text-blue-700">The plan updates as checks return results.</p>
      )}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <div key={group.id} className="rounded-lg border border-slate-200 p-5">
            <span
              className={`rounded px-2 py-1 text-xs font-medium ${severityClasses[group.severity]}`}
            >
              {group.severity} · highest reported severity
            </span>
            <h3 className="mt-3 text-base font-semibold">{group.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{group.reason}</p>
            {!!group.packages.length && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-slate-700">
                  Affected packages ({group.packages.length})
                </summary>
                <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-slate-600">
                  {group.packages.map((pkg) => (
                    <li key={`${pkg.ecosystem}:${pkg.name}`}>
                      <strong>{pkg.name}</strong> · {pkg.versions.join(', ')}{' '}
                      <small>({pkg.ecosystem})</small>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <Button variant="outline" className="mt-4" onClick={() => select(group.id)}>
              Review {group.findings.length} {group.findings.length === 1 ? 'finding' : 'findings'}{' '}
              <ArrowDown size={16} />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
