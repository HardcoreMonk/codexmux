import { memo, useEffect, useRef, useState } from 'react';
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
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const textRef = useRef<HTMLParagraphElement | null>(null);

  if (lastPending !== entry.pending) {
    setLastPending(entry.pending);
    setDelayed(false);
  }

  useEffect(() => {
    if (!entry.pending) return;
    const timer = setTimeout(() => setDelayed(true), PENDING_FADE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [entry.pending]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollHeight - el.clientHeight > 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [entry.text, expanded]);

  const faded = entry.pending && delayed;
  const hasImages = entry.images && entry.images.length > 0;
  const hasText = entry.text.length > 0;
  const clamp = !expanded;
  const showToggle = overflowing || expanded;

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
        {hasText && (
          <p
            ref={textRef}
            className={cn('text-sm whitespace-pre-wrap break-words', clamp && 'line-clamp-6')}
          >
            {entry.text}
          </p>
        )}
        {hasText && showToggle && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs mt-1.5 text-muted-foreground hover:underline"
          >
            {expanded ? '접기' : '더보기'}
          </button>
        )}
      </div>
    </div>
  );
};

export default memo(UserMessageItem);
