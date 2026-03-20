import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface ITerminalContainerProps {
  className?: string;
}

const TerminalContainer = forwardRef<HTMLDivElement, ITerminalContainerProps>(
  ({ className }, ref) => (
    <div ref={ref} className={cn('h-full w-full px-3 py-2', className)} />
  ),
);

TerminalContainer.displayName = 'TerminalContainer';

export default TerminalContainer;
