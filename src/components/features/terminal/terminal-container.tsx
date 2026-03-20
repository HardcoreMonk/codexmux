import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface ITerminalContainerProps {
  className?: string;
}

const TerminalContainer = forwardRef<HTMLDivElement, ITerminalContainerProps>(
  ({ className }, ref) => (
    <div className={cn('h-full w-full p-2', className)}>
      <div ref={ref} className="h-full w-full" />
    </div>
  ),
);

TerminalContainer.displayName = 'TerminalContainer';

export default TerminalContainer;
