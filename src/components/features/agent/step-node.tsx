import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TStepStatus } from '@/types/mission';

interface IStepNodeProps {
  title: string;
  status: TStepStatus;
}

const statusIcon: Record<TStepStatus, React.ReactNode> = {
  pending: (
    <span className="inline-block h-3.5 w-3.5 rounded-full border border-muted-foreground/40" />
  ),
  running: (
    <span className="flex h-3.5 w-3.5 items-center justify-center">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ui-teal" />
    </span>
  ),
  completed: <CheckCircle2 size={14} className="text-positive" />,
  failed: <XCircle size={14} className="text-negative" />,
};

const statusText: Record<TStepStatus, string> = {
  pending: 'text-muted-foreground',
  running: 'text-foreground font-medium',
  completed: 'text-muted-foreground',
  failed: 'text-negative',
};

const StepNode = ({ title, status }: IStepNodeProps) => (
  <div className="flex items-center gap-2 py-1 ml-6" role="treeitem" aria-selected={false}>
    <span className="flex-shrink-0">{statusIcon[status]}</span>
    <span className={cn('text-sm', statusText[status])}>{title}</span>
  </div>
);

export default StepNode;
