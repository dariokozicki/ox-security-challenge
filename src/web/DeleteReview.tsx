import { AlertDialog } from 'radix-ui';
import { Trash2 } from 'lucide-react';
import { Button } from './components/ui/button';
import type { DeleteReviewProps } from './types';

export function DeleteReview({ disabled, remove }: DeleteReviewProps) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <Button variant="ghost" disabled={disabled} aria-label="Delete review">
          <Trash2 size={16} />
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-slate-950/40" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,30rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl">
          <AlertDialog.Title className="text-lg font-semibold">
            Delete this review?
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-3 text-sm leading-6 text-slate-600">
            This removes its findings and evidence. The source snapshot is also removed when no
            other review uses it. This action cannot be undone.
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <Button variant="outline">Keep review</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="destructive" onClick={remove}>
                Delete review
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
