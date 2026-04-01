import { useState, useEffect, memo, useCallback } from 'react';
import { ShieldCheck, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface IPermissionPromptItemProps {
  sessionName: string;
  onResolved?: () => void;
}

const fetchPermissionOptions = async (
  sessionName: string,
): Promise<{ options: string[]; focusedIndex: number }> => {
  try {
    const res = await fetch(
      `/api/tmux/permission-options?session=${encodeURIComponent(sessionName)}`,
    );
    if (!res.ok) return { options: [], focusedIndex: 0 };
    const data = await res.json();
    return {
      options: Array.isArray(data.options) ? data.options : [],
      focusedIndex: typeof data.focusedIndex === 'number' ? data.focusedIndex : 0,
    };
  } catch {
    return { options: [], focusedIndex: 0 };
  }
};

const sendPermissionSelection = async (
  session: string,
  targetIndex: number,
): Promise<boolean> => {
  try {
    const res = await fetch('/api/tmux/send-permission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, targetIndex }),
    });
    return res.ok;
  } catch {
    return false;
  }
};

const PermissionPromptItem = ({ sessionName, onResolved }: IPermissionPromptItemProps) => {
  const [options, setOptions] = useState<string[]>([]);
  const [localSelected, setLocalSelected] = useState<number | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const tryFetch = async () => {
      await new Promise((r) => setTimeout(r, 500));
      if (cancelled) return;

      const result = await fetchPermissionOptions(sessionName);
      if (!cancelled && result.options.length > 0) {
        setOptions(result.options);
      }
    };

    tryFetch();
    return () => {
      cancelled = true;
    };
  }, [sessionName]);

  const handleSelect = useCallback(
    async (idx: number) => {
      if (localSelected !== null || resolved) return;

      setLocalSelected(idx);
      const ok = await sendPermissionSelection(sessionName, idx);
      if (!ok) {
        setLocalSelected(null);
        toast.error('선택 전송에 실패했습니다');
        return;
      }
      setResolved(true);
      onResolved?.();
    },
    [sessionName, localSelected, resolved, onResolved],
  );

  if (options.length === 0) return null;

  const isSelectable = localSelected === null && !resolved;

  return (
    <div className="animate-in fade-in duration-150 mt-2">
      <div className="rounded-lg border border-ui-purple/20 bg-ui-purple/5 px-4 py-3">
        <div className="mb-2.5 flex items-center gap-2 text-xs font-medium text-ui-purple">
          <ShieldCheck size={14} />
          <span>권한 승인 필요</span>
        </div>

        <div className="flex flex-col gap-1.5">
          {options.map((label, idx) => {
            const isSelected = localSelected === idx;
            const isLocalPending = isSelected && !resolved;
            const dimmed = (localSelected !== null || resolved) && !isSelected;

            return (
              <button
                key={idx}
                type="button"
                disabled={!isSelectable}
                onClick={() => handleSelect(idx)}
                className={cn(
                  'flex items-start gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  isSelected
                    ? 'border-ui-purple/40 bg-ui-purple/10'
                    : dimmed
                      ? 'border-border/30 opacity-50'
                      : 'border-border/50',
                  isSelectable && 'cursor-pointer hover:border-ui-purple/30 hover:bg-ui-purple/5',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-medium',
                    isSelected
                      ? 'bg-ui-purple text-white'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {isLocalPending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : isSelected && resolved ? (
                    <Check size={12} />
                  ) : (
                    idx + 1
                  )}
                </span>
                <span className="min-w-0 flex-1 font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default memo(PermissionPromptItem);
