import { useState, memo, useCallback } from 'react';
import { ShieldCheck, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface IPermissionOption {
  label: string;
  description?: string;
}

const TOOL_OPTIONS: Record<string, IPermissionOption[]> = {
  Edit: [
    { label: 'Yes' },
    { label: 'Yes, allow all edits this session' },
    { label: 'No' },
  ],
  Write: [
    { label: 'Yes' },
    { label: 'Yes, allow all writes this session' },
    { label: 'No' },
  ],
  Bash: [
    { label: 'Yes' },
    { label: 'Yes, allow all commands this session' },
    { label: 'No' },
  ],
};

const DEFAULT_OPTIONS: IPermissionOption[] = [
  { label: 'Yes' },
  { label: 'Yes, allow all this session' },
  { label: 'No' },
];

interface IPermissionPromptItemProps {
  sessionName: string;
  toolName: string;
}

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

const PermissionPromptItem = ({ sessionName, toolName }: IPermissionPromptItemProps) => {
  const [localSelected, setLocalSelected] = useState<number | null>(null);
  const [resolved, setResolved] = useState(false);

  const options = TOOL_OPTIONS[toolName] ?? DEFAULT_OPTIONS;
  const isSelectable = localSelected === null && !resolved;

  const handleSelect = useCallback(
    async (idx: number) => {
      if (localSelected !== null || resolved) return;

      setLocalSelected(idx);
      const ok = await sendSelection(sessionName, idx);
      if (!ok) {
        setLocalSelected(null);
        toast.error('선택 전송에 실패했습니다');
        return;
      }
      setResolved(true);
    },
    [sessionName, localSelected, resolved],
  );

  return (
    <div className="animate-in fade-in duration-150 mt-2">
      <div className="rounded-lg border border-ui-purple/20 bg-ui-purple/5 px-4 py-3">
        <div className="mb-2.5 flex items-center gap-2 text-xs font-medium text-ui-purple">
          <ShieldCheck size={14} />
          <span>권한 승인 필요</span>
        </div>

        <div className="flex flex-col gap-1.5">
          {options.map((option, idx) => {
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
                <span className="min-w-0 flex-1 font-medium">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default memo(PermissionPromptItem);
