import { useState, useCallback, useRef, useEffect } from 'react';
import { SendHorizontal, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { TAgentStatus } from '@/types/agent';

const MAX_ROWS = 5;
const LINE_HEIGHT = 20;
const PADDING_Y = 16;

const DRAFT_KEY_PREFIX = 'agent-input-draft:';

const getDraftKey = (agentId: string) => `${DRAFT_KEY_PREFIX}${agentId}`;

const saveDraft = (agentId: string, value: string) => {
  try {
    if (value) {
      localStorage.setItem(getDraftKey(agentId), value);
    } else {
      localStorage.removeItem(getDraftKey(agentId));
    }
  } catch {
    /* quota exceeded 등 무시 */
  }
};

const loadDraft = (agentId: string): string => {
  try {
    return localStorage.getItem(getDraftKey(agentId)) ?? '';
  } catch {
    return '';
  }
};

const clearDraft = (agentId: string) => {
  try {
    localStorage.removeItem(getDraftKey(agentId));
  } catch {
    /* ignore */
  }
};

interface IChatInputProps {
  agentId: string;
  onSend: (content: string) => void;
  agentStatus: TAgentStatus;
  isSending: boolean;
}

const ChatInput = ({ agentId, onSend, agentStatus, isSending }: IChatInputProps) => {
  const [value, setValue] = useState(() => loadDraft(agentId));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const [isFocused, setIsFocused] = useState(false);

  const isDisabled = agentStatus === 'working' || agentStatus === 'offline' || isSending;
  const hasValue = value.trim().length > 0;

  const placeholder =
    agentStatus === 'working'
      ? '응답 대기 중...'
      : agentStatus === 'offline'
        ? '에이전트 오프라인'
        : '메시지를 입력하세요...';

  // Draft auto-save
  useEffect(() => {
    if (!agentId) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => saveDraft(agentId, value), 300);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [agentId, value]);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    if (!value) return;
    const maxHeight = LINE_HEIGHT * MAX_ROWS + PADDING_Y;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, [value]);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isDisabled) return;

    if (debounceRef.current) return;
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
    }, 300);

    onSend(trimmed);
    setValue('');
    clearDraft(agentId);
  }, [value, isDisabled, onSend, agentId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="px-3 pb-3 pt-0">
      <div
        className={cn(
          'relative flex items-end gap-2 rounded-lg border px-3 py-2 transition-colors duration-150',
          isFocused && !isDisabled
            ? 'border-ring bg-background'
            : 'border-border bg-black/5 dark:bg-white/5',
          isDisabled && 'opacity-50',
        )}
        onFocusCapture={() => setIsFocused(true)}
        onBlurCapture={() => setIsFocused(false)}
      >
        {agentStatus === 'working' && (
          <Loader2 className="mb-1 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled}
          aria-label="메시지 입력"
          className={cn(
            'flex-1 resize-none bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground',
            isDisabled && 'cursor-not-allowed opacity-70',
          )}
          rows={1}
          style={{
            lineHeight: `${LINE_HEIGHT}px`,
            maxHeight: `${LINE_HEIGHT * MAX_ROWS + PADDING_Y}px`,
            overflowY: 'auto',
          }}
        />

        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground',
            hasValue && !isDisabled && 'text-ui-purple',
            isDisabled && 'opacity-30',
          )}
          onClick={handleSubmit}
          disabled={isDisabled}
          aria-label="메시지 전송"
        >
          <SendHorizontal size={16} />
        </Button>
      </div>
    </div>
  );
};

export default ChatInput;
