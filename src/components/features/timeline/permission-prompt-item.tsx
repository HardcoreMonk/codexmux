import { useState, useEffect, memo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface IPermissionPromptItemProps {
  sessionName: string;
}

const fetchPermissionOptions = async (session: string): Promise<string[]> => {
  try {
    const res = await fetch(`/api/tmux/permission-options?session=${encodeURIComponent(session)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.options ?? [];
  } catch {
    return [];
  }
};

const sendSelection = async (session: string, optionIndex: number): Promise<boolean> => {
  try {
    const res = await fetch('/api/tmux/send-input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, input: String(optionIndex + 1) }),
    });
    return res.ok;
  } catch {
    return false;
  }
};

const stripNumberPrefix = (label: string) => label.replace(/^\d+\.\s+/, '');

const POLL_INTERVAL = 500;
const POLL_TIMEOUT = 3_000;

const PermissionPromptItem = ({ sessionName }: IPermissionPromptItemProps) => {
  const t = useTranslations('timeline');
  const [localSelected, setLocalSelected] = useState<number | null>(null);
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      const fetched = await fetchPermissionOptions(sessionName);
      if (cancelled) return;
      if (fetched.length > 0) {
        setOptions(fetched);
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      }
    };

    poll();
    interval = setInterval(poll, POLL_INTERVAL);

    const timeout = setTimeout(() => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    }, POLL_TIMEOUT);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [sessionName]);

  const isSelectable = localSelected === null;

  const handleSelect = useCallback(
    async (idx: number) => {
      if (localSelected !== null) return;

      setLocalSelected(idx);
      const ok = await sendSelection(sessionName, idx);
      if (!ok) {
        setLocalSelected(null);
        toast.error(t('selectionFailed'));
      }
    },
    [sessionName, localSelected, t],
  );

  if (options.length === 0) return null;

  return (
    <div className="animate-in fade-in duration-150 mt-2">
      <div className="rounded-lg border border-claude-active/20 bg-claude-active/5 px-4 py-3">
        <div className="mb-2.5 flex items-center gap-2 text-xs font-medium text-claude-active">
          <ShieldCheck size={14} />
          <span>{t('permissionRequired')}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          {options.map((label, idx) => {
            const isSelected = localSelected === idx;
            const dimmed = localSelected !== null && !isSelected;

            return (
              <button
                key={idx}
                type="button"
                disabled={!isSelectable}
                onClick={() => handleSelect(idx)}
                className={cn(
                  'flex items-start gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  isSelected
                    ? 'border-claude-active/40 bg-claude-active/10'
                    : dimmed
                      ? 'border-border/30 opacity-50'
                      : 'border-border/50',
                  isSelectable && 'cursor-pointer hover:border-claude-active/30 hover:bg-claude-active/5',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-medium',
                    isSelected
                      ? 'bg-claude-active text-white'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {idx + 1}
                </span>
                <span className="min-w-0 flex-1 font-medium">{stripNumberPrefix(label)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default memo(PermissionPromptItem);
