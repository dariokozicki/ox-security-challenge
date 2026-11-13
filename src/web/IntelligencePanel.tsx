import type { Intelligence } from '../shared/intelligence-types';

export function IntelligencePanel({ intelligence: item }: { intelligence: Intelligence }) {
  return (
    <section className="my-5 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
      <p className="mb-3 text-sm font-medium text-amber-900">Public disclosure · AI assessment</p>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">Report credibility</dt>
          <dd className="mt-1 font-medium">{item.credibility.replaceAll('_', ' ')}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Repository applicability</dt>
          <dd className="mt-1 font-medium">{item.applicability}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Patch status at check time</dt>
          <dd className="mt-1 font-medium">{item.patch}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm leading-6">{item.affectedVersions}</p>
      <p className="mt-2 text-sm leading-6">
        <strong>Mitigation: </strong>
        {item.mitigation}
      </p>
      <p className="mt-3 text-xs text-slate-500">
        Published: {item.publishedAt || 'unknown'} · Checked:{' '}
        {new Date(item.checkedAt).toLocaleString()}
      </p>
    </section>
  );
}
