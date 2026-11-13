import { LoaderCircle } from 'lucide-react';
import type { RunningIndicatorProps } from './types';

export function RunningIndicator({ label = 'Running', compact = false }: RunningIndicatorProps) {
  return (
    <span
      role="status"
      aria-label={label || 'Analysis running'}
      className={`inline-flex items-center gap-2 ${compact ? 'text-sm' : 'text-base font-medium'} text-blue-700`}
    >
      <LoaderCircle
        aria-hidden="true"
        className={`${compact ? 'size-4' : 'size-6'} shrink-0 animate-spin motion-reduce:animate-none`}
      />
      <span>{label}</span>
    </span>
  );
}
