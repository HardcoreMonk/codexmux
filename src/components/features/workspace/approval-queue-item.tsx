import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Spinner from '@/components/ui/spinner';
import { ackNotificationInput } from '@/hooks/use-agent-status';
import {
  cleanApprovalOptionLabel,
  getApprovalQueueFallbackText,
  hasUsableApprovalOptions,
} from '@/lib/approval-queue';
import { cn } from '@/lib/utils';

type TApprovalPhase = 'loading' | 'ready' | 'failed';

interface IApprovalQueueItemProps {
  tabId: string;
  sessionName: string | null;
  workspaceId: string;
  workspaceName: string;
  tabName: string;
  lastUserMessage?: string | null;
  lastEventSeq?: number;
  isActiveTab?: boolean;
  onNavigate?: (workspaceId: string, tabId: string) => void;
}

const fetchPermissionOptions = async (sessionName: string): Promise<string[]> => {
  try {
    const res = await fetch(`/api/tmux/permission-options?session=${encodeURIComponent(sessionName)}`);
    if (!res.ok) return [];
    const data = await res.json() as { options?: unknown };
    return Array.isArray(data.options) ? data.options.filter((option): option is string => typeof option === 'string') : [];
  } catch {
    return [];
  }
};

const sendSelection = async (sessionName: string, optionIndex: number): Promise<boolean> => {
  try {
    const res = await fetch('/api/tmux/send-input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: sessionName, input: String(optionIndex + 1) }),
    });
    return res.ok;
  } catch {
    return false;
  }
};

const ApprovalQueueItem = ({
  tabId,
  sessionName,
  workspaceId,
  workspaceName,
  tabName,
  lastUserMessage,
  lastEventSeq,
  isActiveTab,
  onNavigate,
}: IApprovalQueueItemProps) => {
  const t = useTranslations('notification');
  const [phase, setPhase] = useState<TApprovalPhase>('loading');
  const [options, setOptions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 새 notification event가 들어오면 이전 선택 상태를 즉시 버려야 한다.
    setPhase('loading');
    setOptions([]);
    setSelectedIndex(null);
    setSent(false);

    if (!sessionName) {
      setPhase('failed');
      return () => { cancelled = true; };
    }

    fetchPermissionOptions(sessionName)
      .then((nextOptions) => {
        if (cancelled) return;
        if (!hasUsableApprovalOptions(nextOptions)) {
          setPhase('failed');
          return;
        }
        setOptions(nextOptions);
        setPhase('ready');
      })
      .catch(() => {
        if (!cancelled) setPhase('failed');
      });

    return () => { cancelled = true; };
  }, [sessionName, lastEventSeq]);

  const promptText = useMemo(
    () => getApprovalQueueFallbackText({ lastUserMessage, tabName }),
    [lastUserMessage, tabName],
  );

  const handleNavigate = useCallback(() => {
    onNavigate?.(workspaceId, tabId);
  }, [onNavigate, workspaceId, tabId]);

  const handleSelect = useCallback(
    async (idx: number) => {
      if (!sessionName || selectedIndex !== null || sent) return;

      setSelectedIndex(idx);
      const ok = await sendSelection(sessionName, idx);
      if (!ok) {
        setSelectedIndex(null);
        toast.error(t('approvalSendFailed'));
        return;
      }
      if (lastEventSeq !== undefined) {
        ackNotificationInput(tabId, lastEventSeq);
      }
      setSent(true);
    },
    [sessionName, selectedIndex, sent, lastEventSeq, tabId, t],
  );

  return (
    <div
      className={cn(
        'rounded-md border border-border/70 px-3 py-2.5',
        isActiveTab ? 'bg-agent-active/10' : 'bg-background',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{workspaceName}</p>
          <p className={cn('truncate text-sm', isActiveTab ? 'text-foreground' : 'text-muted-foreground')}>
            {promptText}
          </p>
        </div>
        {sent && <Check className="h-4 w-4 shrink-0 text-agent-active" />}
      </div>

      {phase === 'loading' && (
        <div className="flex items-center gap-2 rounded border border-agent-active/20 bg-agent-active/5 px-2.5 py-2 text-xs text-agent-active">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="truncate">{t('approvalLoading')}</span>
        </div>
      )}

      {phase === 'failed' && (
        <div className="flex items-center justify-between gap-2 rounded border border-ui-amber/30 bg-ui-amber/5 px-2.5 py-2">
          <span className="inline-flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-ui-amber" />
            <span className="truncate">{t('approvalFallback')}</span>
          </span>
          {!isActiveTab && (
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={handleNavigate}>
              {t('navigate')}
            </Button>
          )}
        </div>
      )}

      {phase === 'ready' && (
        <div className="flex flex-col gap-1.5">
          {options.map((option, idx) => {
            const selected = selectedIndex === idx;
            const disabled = selectedIndex !== null || sent;

            return (
              <button
                key={`${idx}-${option}`}
                type="button"
                disabled={disabled}
                onClick={() => handleSelect(idx)}
                className={cn(
                  'flex min-h-9 items-center gap-2 rounded border border-border/60 px-2.5 py-1.5 text-left text-sm transition-colors',
                  selected
                    ? 'border-agent-active/50 bg-agent-active/10'
                    : 'hover:border-agent-active/30 hover:bg-agent-active/5',
                  disabled && !selected && 'opacity-50',
                )}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                  {selected && !sent ? <Spinner size={10} /> : idx + 1}
                </span>
                <span className="min-w-0 truncate">{cleanApprovalOptionLabel(option)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ApprovalQueueItem;
