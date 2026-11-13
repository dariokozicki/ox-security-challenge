import { ChevronDown, CodeXml, GitFork, Wrench } from 'lucide-react';
import { EvidencePanel } from './EvidencePanel';
import { PathPanel } from './PathPanel';
import { ActionPanel } from './ActionPanel';
import { IntelligencePanel } from './IntelligencePanel';
import type { FindingDetailProps } from './types';

export function FindingSections({ finding, revision, runtime }: FindingDetailProps) {
  const sections = [
    {
      title: 'Evidence',
      icon: CodeXml,
      content: (
        <>
          <EvidencePanel finding={finding} revision={revision} />
          {finding.intelligence && <IntelligencePanel intelligence={finding.intelligence} />}
        </>
      ),
    },
    { title: 'Potential path', icon: GitFork, content: <PathPanel finding={finding} /> },
    {
      title: 'Next action',
      icon: Wrench,
      content: <ActionPanel finding={finding} runtime={runtime} />,
    },
  ];
  return (
    <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
      {sections.map(({ title, icon: Icon, content }) => (
        <details key={title} className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 py-4 text-sm font-medium text-slate-700 [&::-webkit-details-marker]:hidden">
            <Icon className="size-4" />
            {title}
            <ChevronDown className="ml-auto size-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="pb-5">{content}</div>
        </details>
      ))}
    </div>
  );
}
