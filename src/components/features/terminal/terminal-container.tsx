import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface ITerminalContainerProps {
  className?: string;
}

const TerminalContainer = forwardRef<HTMLDivElement, ITerminalContainerProps>(
  ({ className }, ref) => (
    <div className={cn('min-w-0 h-full w-full overflow-hidden p-2', className)}>
      <div ref={ref} className="min-w-0 h-full w-full overflow-hidden" />
    </div>
  ),
);

TerminalContainer.displayName = 'TerminalContainer';

export default TerminalContainer;
