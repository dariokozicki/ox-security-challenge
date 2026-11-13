import { ArrowUpRight } from 'lucide-react';
import { Badge } from './components/ui/badge';
import { severityClasses } from './presentation';
import { cn } from './lib/utils';
import { FindingSections } from './FindingSections';
import type { FindingDetailProps } from './types';

export function FindingDetail({ finding: f, revision, runtime }: FindingDetailProps) {
  const sources = [
    ...(f.evidence.url
      ? [{ title: `${f.evidence.path}:${f.evidence.line}`, url: f.evidence.url }]
      : []),
    ...f.references.filter((ref) => ref.url !== f.evidence.url),
  ];
  return (
    <article className="min-w-0 p-5 lg:p-6 [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-sm [&_h3]:font-semibold">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          <Badge variant="outline" className={cn('text-xs uppercase', severityClasses[f.severity])}>
            {f.severity}
          </Badge>
          <Badge variant="secondary" className="text-xs uppercase">
            {f.category === 'code'
              ? 'Source code'
              : f.category === 'emerging'
                ? 'Public disclosure'
                : 'Dependency'}
          </Badge>
        </div>
        <span className="break-all text-xs text-slate-500">{f.rule}</span>
      </div>
      <h2 className="mb-3 mt-4 text-xl font-semibold tracking-tight">{f.title}</h2>
      <p className="text-base leading-6 text-slate-700">{f.summary}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {sources.map((ref) => (
          <a
            key={ref.url}
            href={ref.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-slate-600 underline underline-offset-2"
          >
            {ref.title}
            <ArrowUpRight size={13} />
          </a>
        ))}
      </div>
      {f.intelligence && (
        <p className="mt-3 text-sm text-slate-600">
          <strong>Patch status:</strong> {f.intelligence.patch} at last check.{' '}
          <span>Applicability: {f.intelligence.applicability}.</span>
        </p>
      )}
      {!!f.routeContext?.length && (
        <details className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <summary className="cursor-pointer">Route and middleware context</summary>
          {f.routeContext.map((route) => (
            <div key={`${route.method}:${route.route}`} className="mt-3">
              <strong>
                {route.method} {route.route}
              </strong>
              <p>
                Registered middleware: {route.middleware.join(', ') || 'None on this registration'}
              </p>
              <p>
                {route.registration.path}:{route.registration.line}
              </p>
              {route.sessionChecks.map((check) => (
                <pre
                  key={`${check.path}:${check.line}`}
                  className="mt-2 whitespace-pre-wrap break-words text-xs"
                >
                  {check.snippet}
                </pre>
              ))}
            </div>
          ))}
        </details>
      )}
      <FindingSections finding={f} revision={revision} runtime={runtime} />
    </article>
  );
}
