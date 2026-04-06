import { useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface IPanePathInputOverlayProps {
  hint: string;
  onSubmit: (value: string) => void;
  onDismiss: () => void;
}

const PanePathInputOverlay = ({ hint, onSubmit, onDismiss }: IPanePathInputOverlayProps) => {
  const t = useTranslations('terminal');
  const tc = useTranslations('common');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="absolute bottom-3 left-3 right-3 z-30 rounded-lg border border-border bg-card shadow-lg animate-[fadeIn_150ms_ease-out]">
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <span className="text-xs text-muted-foreground">
          {t('dragDropNotSupported')}
        </span>
        <button
          className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          onClick={onDismiss}
          aria-label={tc('close')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-3 pt-1 pb-2.5">
        <div className="flex items-center gap-2 rounded border border-border bg-background px-2 py-1.5">
          <span className="shrink-0 text-xs text-muted-foreground/60">{hint}</span>
          <input
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
            placeholder={t('fullPathPlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit(e.currentTarget.value);
              else if (e.key === 'Escape') onDismiss();
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default PanePathInputOverlay;
