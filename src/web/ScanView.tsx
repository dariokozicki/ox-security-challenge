import { Button } from './components/ui/button';
import { categoryCounts, runtimeForFinding, severityClasses } from './presentation';
import { cn } from './lib/utils';
import { useState } from 'react';
import { ChevronRight, FileCode2, Package, Search, Circle } from 'lucide-react';
import { findingsOf } from '../shared/findings';
import type { ScanViewProps } from './types';
import { ScanHeader } from './ScanHeader';
import { FindingDetail } from './FindingDetail';
import { Coverage } from './Coverage';
import { InventoryPanel } from './InventoryPanel';
import { ActionSummary } from './ActionSummary';
import { RunningIndicator } from './RunningIndicator';
import { actionPlan } from '../shared/action-plan';

export function ScanView(props: ScanViewProps) {
  const { scan } = props;
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [actionId, setAction] = useState<string | null>(null);
  const action = actionPlan(scan).find((group) => group.id === actionId);
  const findings = findingsOf(scan);
  const counts = categoryCounts(findings);
  const visible = findings.filter(
    (f) =>
      (filter === 'all' || f.category === filter) &&
      (!action || action.findings.some((item) => item.id === f.id)) &&
      `${f.title} ${f.evidence.path} ${f.rule}`.toLowerCase().includes(query.toLowerCase()),
  );
  const finding = visible.find((f) => f.id === selected) || visible[0];
  return (
    <div className={cn('mx-auto max-w-[1600px] px-4 py-8 lg:px-9')}>
      <ScanHeader {...props} />
      <ActionSummary
        scan={scan}
        select={(id) => {
          setAction(id);
          setFilter('all');
          setQuery('');
          setSelected(null);
          document
            .getElementById('review-findings')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />
      {action && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-slate-200 p-3 text-sm">
          <span>{action.title}</span>
          <Button variant="ghost" onClick={() => setAction(null)}>
            Show all actions
          </Button>
        </div>
      )}
      <div id="review-findings" className="mb-4 flex flex-wrap items-center gap-4">
        <h2 className="sr-only">Findings</h2>
        <div
          className={cn(
            'flex flex-wrap items-center gap-1 [&_button]:rounded [&_button]:px-2.5 [&_button]:py-1.5',
            '[&_button]:text-sm [&_button]:text-slate-600 [&_button[aria-pressed=true]]:bg-slate-200',
            '[&_button[aria-pressed=true]]:text-slate-900',
          )}
          aria-label="Finding category"
        >
          {(['all', 'code', 'dependency', 'emerging'] as const).map((value) => (
            <Button
              variant="ghost"
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === 'all'
                ? 'All findings'
                : value === 'code'
                  ? 'Source code'
                  : value === 'emerging'
                    ? 'Disclosures'
                    : 'Dependencies'}
              <span className="rounded bg-white/80 px-1.5 text-xs tabular-nums">
                {counts[value]}
              </span>
            </Button>
          ))}
        </div>
        <label
          className={cn(
            'flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-slate-500',
            'xl:ml-auto [&_input]:w-32 [&_input]:border-0 [&_input]:text-sm',
          )}
        >
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search findings"
            aria-label="Search findings"
          />
        </label>
      </div>
      {visible.length ? (
        <div
          className={cn(
            'grid overflow-hidden rounded-xl border border-slate-200 bg-white',
            'xl:grid-cols-[320px_minmax(0,1fr)]',
          )}
        >
          <nav
            className={cn(
              'max-h-80 overflow-y-auto border-b border-slate-200 bg-slate-50/50 xl:max-h-[42rem] xl:border-b-0',
              'xl:border-r [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent]',
            )}
            aria-label="Findings"
          >
            {visible.map((f) => (
              <Button
                variant="ghost"
                key={f.id}
                onClick={() => setSelected(f.id)}
                aria-current={finding?.id === f.id ? 'true' : undefined}
                className={cn(
                  'block h-auto whitespace-normal w-full min-w-60 border-b border-l-2 border-b-slate-100 border-l-transparent p-6 text-left',
                  'hover:bg-slate-100 [&>div]:flex [&>div]:items-center [&>div]:justify-between',
                  '[&_h3]:my-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:leading-5 [&_p]:break-all',
                  '[&_p]:text-xs [&_p]:text-slate-500 [&_small]:mt-4 [&_small]:flex',
                  '[&_small]:justify-between [&_small]:text-sm [&_small]:text-slate-600',
                  finding?.id === f.id ? 'border-l-slate-700 bg-slate-100' : '',
                )}
              >
                <div>
                  <span
                    className={cn(
                      'inline-block rounded px-1.5 py-1 text-xs font-semibold uppercase tracking-wider',
                      severityClasses[f.severity],
                    )}
                  >
                    {f.severity}
                  </span>
                  <span className={cn('text-slate-500')}>
                    {f.category === 'code' ? <FileCode2 size={15} /> : <Package size={15} />}
                  </span>
                </div>
                <h3>{f.title}</h3>
                <p>
                  {f.evidence.path}
                  <span>:{f.evidence.line}</span>
                </p>
                <small>
                  {f.category === 'emerging'
                    ? 'Public disclosure · assess exposure'
                    : f.assurance === 'potential'
                      ? 'Potential static path'
                      : 'Exact-version advisory match'}
                  <ChevronRight size={14} />
                </small>
              </Button>
            ))}
          </nav>
          {finding && (
            <FindingDetail
              key={finding.id}
              finding={finding}
              revision={scan.snapshot?.revision}
              runtime={runtimeForFinding(finding, scan.inventory)}
            />
          )}
        </div>
      ) : (
        <div
          className={cn(
            'rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500 [&>svg]:mx-auto',
            '[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:font-semibold [&_p]:text-sm [&_p]:leading-6',
          )}
        >
          {findings.length ? (
            <Search size={28} />
          ) : ['queued', 'running'].includes(scan.status) ? (
            <RunningIndicator
              label={scan.status === 'queued' ? 'Waiting to start' : 'Analyzing repository'}
            />
          ) : (
            <Circle size={28} />
          )}
          <h3>
            {findings.length
              ? 'No findings match your filters'
              : ['queued', 'running'].includes(scan.status)
                ? 'Evidence is on its way'
                : 'No findings to display'}
          </h3>
          <p>
            {findings.length
              ? 'Try another category or search term.'
              : 'See coverage and activity below.'}
          </p>
        </div>
      )}
      <Coverage scan={scan} continueDependencies={props.continueDependencies} busy={props.busy} />
      <InventoryPanel inventory={scan.inventory} />
    </div>
  );
}
