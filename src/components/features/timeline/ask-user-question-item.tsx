import { useState, memo } from 'react';
import { useTranslations } from 'next-intl';
import { MessageCircleQuestion, Check } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ITimelineAskUserQuestion } from '@/types/timeline';

interface IAskUserQuestionItemProps {
  entry: ITimelineAskUserQuestion;
  sessionName?: string;
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

const AskUserQuestionItem = ({ entry, sessionName }: IAskUserQuestionItemProps) => {
  const t = useTranslations('timeline');
  const [localSelected, setLocalSelected] = useState<number | null>(null);
  const isAnswered = entry.status === 'success';
  const question = entry.questions[0];

  if (!question) return null;

  const isSelectable = !isAnswered && localSelected === null && !!sessionName;

  const handleSelect = async (idx: number) => {
    if (!isSelectable) return;

    setLocalSelected(idx);
    const ok = await sendSelection(sessionName, idx);
    if (!ok) {
      setLocalSelected(null);
      toast.error(t('selectionFailed'));
    }
  };

  return (
    <div className="animate-in fade-in duration-150">
      <div className="rounded-lg border border-agent-active/20 bg-agent-active/5 px-4 py-3">
        <div className="mb-2.5 flex items-center gap-2 text-xs font-medium text-agent-active">
          <MessageCircleQuestion size={14} />
          <span>{question.header}</span>
        </div>

        <p className="mb-3 text-sm">{question.question}</p>

        <div className="flex flex-col gap-1.5">
          {question.options.map((option, idx) => {
            const isSelected = isAnswered
              ? entry.answer === option.label
              : localSelected === idx;
            const isLocalPending = localSelected === idx && !isAnswered;
            const dimmed = (isAnswered || localSelected !== null) && !isSelected;

            return (
              <button
                key={idx}
                type="button"
                disabled={!isSelectable}
                onClick={() => handleSelect(idx)}
                className={cn(
                  'flex items-start gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  isSelected
                    ? 'border-agent-active/40 bg-agent-active/10'
                    : dimmed
                      ? 'border-border/30 opacity-50'
                      : 'border-border/50',
                  isSelectable && 'cursor-pointer hover:border-agent-active/30 hover:bg-agent-active/5',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-medium',
                    isSelected
                      ? 'bg-agent-active text-white'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {isLocalPending ? (
                    <Spinner size={10} />
                  ) : isSelected ? (
                    <Check size={12} />
                  ) : (
                    idx + 1
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{option.label}</span>
                  {option.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{option.description}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default memo(AskUserQuestionItem);
