import { memo, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ITimelineUserMessage } from '@/types/timeline';

const PENDING_FADE_DELAY_MS = 3000;

const openImageInNewTab = (src: string) => {
  const match = src.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    window.open(src, '_blank', 'noopener,noreferrer');
    return;
  }
  const [, mime, b64] = match;
  const bytes = atob(b64);
  const buf = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
  const blobUrl = URL.createObjectURL(new Blob([buf], { type: mime }));
  window.open(blobUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
};

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
  const hasImages = entry.images && entry.images.length > 0;
  const hasText = entry.text.length > 0;

  return (
    <div className="animate-in fade-in duration-150 flex justify-end">
      <div
        className={cn(
          'bg-ui-blue/10 rounded-lg px-4 py-2.5 max-w-[85%] transition-opacity duration-500',
          faded && 'opacity-50',
        )}
      >
        {hasImages && (
          <div className={cn('flex flex-wrap gap-2', hasText && 'mb-2')}>
            {entry.images!.map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => openImageInNewTab(src)}
                className="cursor-zoom-in"
              >
                <img
                  src={src}
                  alt=""
                  className="max-h-[200px] w-auto rounded-md object-contain"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
        {hasText && <p className="text-sm whitespace-pre-wrap break-words">{entry.text}</p>}
      </div>
    </div>
  );
};

export default memo(UserMessageItem);
