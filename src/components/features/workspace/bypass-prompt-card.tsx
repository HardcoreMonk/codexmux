import { useState, type ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

interface IBypassPromptCardProps {
  sessionName: string;
  options: string[];
  fallback?: ReactNode;
}

const stripNumberPrefix = (label: string) => label.replace(/^\d+\.\s+/, '');

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

const BypassPromptCard = ({ sessionName, options, fallback }: IBypassPromptCardProps) => {
  const t = useTranslations('terminal');
  const [sent, setSent] = useState(false);

  const handleSelect = async (index: number) => {
    if (sent) return;
    setSent(true);
    const ok = await sendSelection(sessionName, index);
    if (!ok) {
      setSent(false);
      toast.error(t('bypassSendFailed'));
    }
  };

  return (
    <div className="mt-4 w-full max-w-xs rounded-lg border border-ui-amber/20 bg-ui-amber/5 px-4 py-3">
      <div className="mb-2.5 flex items-center gap-2 text-xs font-medium text-ui-amber">
        <ShieldAlert size={14} />
        <span>{t('bypassPermissions')}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {options.map((option, i) => (
          <button
            key={i}
            disabled={sent}
            onClick={() => handleSelect(i)}
            className="flex items-center gap-2.5 rounded-md border border-border/50 px-3 py-2 text-left text-sm transition-colors hover:border-ui-amber/30 hover:bg-ui-amber/5 disabled:opacity-50"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-muted-foreground">
              {i + 1}
            </span>
            <span className="font-medium">{stripNumberPrefix(option)}</span>
          </button>
        ))}
      </div>
      {fallback && <div className="mt-2 text-center">{fallback}</div>}
    </div>
  );
};

export default BypassPromptCard;
