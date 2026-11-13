import { Plus, Radar, ShieldCheck } from 'lucide-react';
import { Button } from './components/ui/button';
import { ReviewHistory } from './ReviewHistory';
import type { SidebarProps } from './types';

export function Sidebar({ scans, selected, select, worker }: SidebarProps) {
  return (
    <aside
      className={[
        'flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white p-4 text-slate-600',
        'md:fixed md:inset-y-0 md:left-0 md:w-72 md:flex-col md:flex-nowrap md:items-stretch',
        'md:gap-0 md:overflow-x-hidden md:overflow-y-auto md:border-b-0 md:border-r md:p-0',
        'md:[scrollbar-width:thin]',
      ].join(' ')}
    >
      <a
        className="flex shrink-0 items-center gap-2.5 text-2xl font-semibold tracking-tight text-slate-900 no-underline md:h-20 md:border-b md:border-slate-100 md:px-5"
        href="#"
        onClick={(event) => {
          event.preventDefault();
          select(null);
        }}
      >
        <Radar className="size-6 text-emerald-700" />
        <span>
          trace<span className="text-emerald-600">.</span>
        </span>
      </a>
      <div className="hidden shrink-0 px-3 pb-5 pt-6 md:block">
        <p className="mb-3 px-2 text-sm font-medium text-slate-500">Personal workspace</p>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2.5 rounded-lg bg-slate-100 px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-200 hover:text-slate-900"
          onClick={() => select(null)}
        >
          <ShieldCheck className="size-4" />
          Security reviews
          <span className="ml-auto rounded-md bg-white/80 px-1.5 py-0.5 text-xs tabular-nums text-slate-600">
            {scans.length}
          </span>
        </Button>
      </div>
      <Button
        variant="outline"
        className="ml-auto gap-2 rounded-lg border-slate-200 bg-white text-sm text-slate-600 shadow-none hover:bg-slate-50 md:mx-3 md:mb-6"
        onClick={() => select(null)}
      >
        <Plus className="size-4 text-slate-500" /> New review
      </Button>
      <select
        aria-label="Recent reviews"
        className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-600 md:hidden"
        value={selected || ''}
        onChange={(event) => select(event.target.value || null)}
      >
        <option value="">New review</option>
        {scans.map((scan) => (
          <option key={scan.id} value={scan.id}>
            {scan.mode === 'demo' ? 'Demo fixture' : scan.repository.split('/').slice(-2).join('/')}
            {' · '}
            {scan.status}
            {' · '}
            {scan.id.slice(0, 8)}
          </option>
        ))}
      </select>
      <div className="hidden shrink-0 items-center justify-between border-t border-slate-100 px-5 pb-2 pt-5 md:flex">
        <h2 className="text-sm font-medium text-slate-500">Recent reviews</h2>
        <span className="text-xs tabular-nums text-slate-500">{scans.length}</span>
      </div>
      <ReviewHistory scans={scans} selected={selected} select={select} />
      <div className="mt-4 hidden shrink-0 items-center gap-2 border-t border-slate-100 px-5 py-4 text-xs text-slate-500 md:flex">
        <span className={`size-1.5 rounded-full ${worker ? 'bg-slate-400' : 'bg-amber-500'}`} />
        {worker ? 'Worker connected' : 'Worker unavailable'}
        <span className="ml-auto text-slate-500">v0.1</span>
      </div>
    </aside>
  );
}
