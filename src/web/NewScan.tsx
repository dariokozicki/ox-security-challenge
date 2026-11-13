import { Input } from './components/ui/input';
import { Card } from './components/ui/card';
import { Button } from './components/ui/button';
import { cn } from './lib/utils';
import { useState } from 'react';
import {
  ArrowRight,
  Braces,
  FileSearch,
  GitBranch,
  Github,
  Layers,
  LockKeyhole,
  Play,
  ShieldCheck,
} from 'lucide-react';
import type { NewScanProps } from './types';

export function NewScan({ busy, onStart }: NewScanProps) {
  const [repository, setRepository] = useState('');
  return (
    <div className={cn('mx-auto max-w-5xl px-6 py-10 md:px-12 md:py-16')}>
      <div
        className={cn(
          'flex items-center gap-2 text-xs font-semibold tracking-widest text-emerald-700',
        )}
      >
        <span className={cn('inline-block size-1.5 shrink-0 rounded-full bg-emerald-500')} />{' '}
        EVIDENCE BEFORE ASSUMPTIONS
      </div>
      <h1 className="mb-5 mt-5 text-4xl font-semibold leading-tight tracking-tight lg:text-5xl">
        Understand the risk.
        <br />
        <span className="text-slate-500">Know what to do next.</span>
      </h1>
      <p className={cn('mb-9 text-base leading-7 text-slate-500')}>
        A focused security review of your repository, from the first finding
        <br className={cn('hidden sm:block')} /> to the source evidence and a clear path forward.
      </p>
      <Card className={cn('rounded-xl border border-slate-200 bg-white p-6 shadow-xs')}>
        <div
          className={cn(
            'mb-6 flex items-center gap-3 [&_h2]:mb-1 [&_h2]:text-base [&_h2]:font-semibold [&_p]:m-0',
            '[&_p]:text-sm [&_p]:text-slate-500',
          )}
        >
          <span
            className={cn(
              'grid size-11 place-items-center rounded-lg border border-emerald-100 bg-emerald-50',
              'text-emerald-800',
            )}
          >
            <GitBranch size={21} />
          </span>
          <div>
            <h2>Start a repository review</h2>
            <p>Public GitHub repositories · multiple languages and ecosystems</p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onStart('live', repository);
          }}
        >
          <label htmlFor="repository">Repository URL</label>
          <div
            className={cn(
              'mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-1.5',
              'focus-within:ring-2 focus-within:ring-emerald-100 sm:flex-nowrap [&>svg]:ml-2 [&>svg]:shrink-0',
              '[&>svg]:text-slate-500 [&_input]:min-w-0 [&_input]:flex-1',
            )}
          >
            <Github size={20} />
            <Input
              id="repository"
              type="url"
              required
              value={repository}
              onChange={(e) => setRepository(e.target.value)}
              placeholder="https://github.com/owner/repository"
              autoComplete="off"
            />
            <Button
              variant="ghost"
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-md bg-emerald-900 px-4 py-2.5 text-sm',
                'font-medium text-white hover:bg-emerald-800 disabled:opacity-50',
              )}
              disabled={busy}
              type="submit"
            >
              Start review <ArrowRight size={17} />
            </Button>
          </div>
        </form>
        <div className={cn('mt-4 flex items-center gap-2 text-xs text-slate-500')}>
          <LockKeyhole size={14} /> Read-only source analysis.
        </div>
      </Card>
      <Button
        variant="ghost"
        className={cn(
          'mt-4 flex w-full items-center gap-3 rounded-xl border border-dashed border-emerald-200',
          'bg-emerald-50/50 p-5 text-left text-emerald-900 hover:bg-emerald-50 [&_strong]:text-sm',
          '[&_small]:mt-1 [&_small]:block [&_small]:text-xs [&_small]:text-emerald-700/70',
          '[&>svg]:shrink-0',
        )}
        onClick={() => void onStart('demo')}
        disabled={busy}
      >
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-100')}>
          <Play size={19} />
        </span>
        <span>
          <strong>Explore an example review</strong>
          <small>
            Authored code and PHP examples, plus one cached dependency advisory. No AI calls.
          </small>
        </span>
        <span
          className={cn(
            'ml-auto hidden whitespace-nowrap rounded border border-emerald-200 px-2 py-1 text-xs',
            'tracking-wider sm:block',
          )}
        >
          DEMO FIXTURE
        </span>
        <ArrowRight size={19} />
      </Button>
      <div
        className={cn(
          'my-10 grid gap-7 sm:grid-cols-3 [&_svg]:mb-4 [&_svg]:text-emerald-700/65 [&_h3]:mb-2',
          '[&_h3]:text-sm [&_h3]:font-semibold [&_p]:text-sm [&_p]:leading-6 [&_p]:text-slate-500',
        )}
      >
        <div>
          <FileSearch size={22} />
          <h3>Every finding has a source</h3>
          <p>Commit-pinned code, detector versions, and traceable advisory references.</p>
        </div>
        <div>
          <Layers size={22} />
          <h3>Context for each finding</h3>
          <p>Trace potential paths and review their prerequisites.</p>
        </div>
        <div>
          <ShieldCheck size={22} />
          <h3>Useful through failures</h3>
          <p>Durable jobs and partial results keep completed evidence available.</p>
        </div>
      </div>
      <div
        className={cn(
          'flex gap-2 border-t border-slate-200 pt-5 text-xs leading-6 text-slate-500 [&_svg]:mt-1',
          '[&_svg]:shrink-0',
        )}
      >
        <Braces size={16} />
        <p>
          <strong>Evidence-led review.</strong> AI code investigation, package advisories and
          emerging disclosures. Live AI reviews send selected public repository text to the
          configured model provider.
        </p>
      </div>
    </div>
  );
}
