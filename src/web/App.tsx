import { Input } from './components/ui/input';
import { Button } from './components/ui/button';
import { cn } from './lib/utils';
import { useState } from 'react';
import { ChevronRight, KeyRound, LockKeyhole, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { NewScan } from './NewScan';
import { ScanView } from './ScanView';
import { useWorkspace } from './useWorkspace';
import { setAccessToken } from './api';

export function App() {
  const w = useWorkspace();
  const [showToken, setShowToken] = useState(false);
  const [token, setToken] = useState('');
  return (
    <div className={cn('min-h-screen bg-slate-50 text-slate-800 md:flex')}>
      <Sidebar
        scans={w.scans}
        selected={w.selected}
        select={w.select}
        worker={!!w.service?.worker}
      />
      <main className={cn('min-w-0 flex-1 md:ml-72')}>
        <header
          className={cn(
            'flex min-h-20 items-center gap-4 border-b border-slate-200 bg-white px-6 md:px-9 [&>div]:flex',
            '[&>div]:items-center [&>div]:gap-3 [&>div]:text-sm [&>div]:text-slate-500',
            '[&_strong]:font-medium [&_strong]:text-slate-600',
          )}
        >
          <div>
            Workspace
            <ChevronRight size={14} />
            <strong>Security reviews</strong>
          </div>
          <span className={cn('ml-auto hidden items-center gap-2 text-sm text-slate-500 sm:flex')}>
            <LockKeyhole size={13} /> Local workspace
          </span>
          <Button
            variant="ghost"
            className={cn('inline-flex rounded p-1.5 text-slate-500 hover:bg-slate-100')}
            aria-label="Configure API access token"
            onClick={() => setShowToken(!showToken)}
          >
            <KeyRound size={17} />
          </Button>
        </header>
        {showToken && (
          <form
            className={cn(
              'flex flex-wrap items-center gap-4 bg-emerald-50 px-6 py-4 text-sm [&_small]:mt-1',
              '[&_small]:block [&_input]:min-w-0 [&_input]:flex-1',
            )}
            onSubmit={(e) => {
              e.preventDefault();
              setAccessToken(token);
              setToken('');
              setShowToken(false);
              w.setError('');
              void w.refresh().catch(() => w.setError('Token rejected or service unavailable.'));
            }}
          >
            <label htmlFor="access-token">
              API token <small>Kept in memory for this tab only</small>
            </label>
            <Input
              id="access-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <Button
              variant="ghost"
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3',
                'py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50',
              )}
            >
              Connect
            </Button>
          </form>
        )}
        {w.error && (
          <div
            className={cn(
              'mx-6 mt-5 flex items-center justify-between rounded-lg bg-red-50 p-4 text-sm text-red-800',
            )}
            role="alert"
          >
            <span>{w.error}</span>
            <Button
              variant="ghost"
              className={cn('inline-flex rounded p-1.5 text-slate-500 hover:bg-slate-100')}
              aria-label="Dismiss error"
              onClick={() => w.setError('')}
            >
              <X size={16} />
            </Button>
          </div>
        )}
        {w.service && !w.service.worker && (
          <div
            className={cn('mx-6 mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-800')}
            role="status"
          >
            The scan worker is offline. Existing evidence is available; new jobs will wait safely in
            the queue.
          </div>
        )}
        {w.scan ? (
          <ScanView
            key={w.scan.id}
            scan={w.scan}
            retry={() => void w.retry()}
            recheck={() => void w.recheck()}
            continueDependencies={() => void w.continueDependencies()}
            download={() => void w.download()}
            remove={w.remove}
            busy={w.busy}
          />
        ) : w.selected ? (
          <p className="p-10 text-base text-slate-500" role="status">
            {w.error ? 'The selected review could not be loaded.' : 'Loading review…'}
          </p>
        ) : (
          <NewScan onStart={w.start} busy={w.busy} />
        )}
        <footer
          className={cn(
            'flex justify-between gap-4 border-t border-slate-200 px-6 py-6 text-xs text-slate-500',
            'md:px-9 [&>span:first-child]:tracking-wider',
          )}
        >
          <span>TRACE / EVIDENCE-LED SECURITY</span>
          <span>Findings backed by evidence.</span>
        </footer>
      </main>
    </div>
  );
}
