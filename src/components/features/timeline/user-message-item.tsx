import { memo, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ITimelineUserMessage } from '@/types/timeline';

const PENDING_FADE_DELAY_MS = 3000;

interface IUserMessageItemProps {
  entry: ITimelineUserMessage;
}

const UserMessageItem = ({ entry }: IUserMessageItemProps) => {
  const [delayed, setDelayed] = useState(false);
  const [lastPending, setLastPending] = useState(entry.pending);

  if (lastPending !== entry.pending) {
    setLastPending(entry.pending);
    setDelayed(false);
  }

  useEffect(() => {
    if (!entry.pending) return;
    const timer = setTimeout(() => setDelayed(true), PENDING_FADE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [entry.pending]);

  const faded = entry.pending && delayed;

  return (
    <div className="animate-in fade-in duration-150 flex justify-end">
      <div
        className={cn(
          'bg-ui-blue/10 rounded-lg px-4 py-2.5 max-w-[85%] transition-opacity duration-500',
          faded && 'opacity-50',
        )}
      >
        <p className="text-sm whitespace-pre-wrap break-words">{entry.text}</p>
      </div>
    </div>
  );
};

export default memo(UserMessageItem);
