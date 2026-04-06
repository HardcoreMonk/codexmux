import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { SendHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import useIsMobileDevice from '@/hooks/use-is-mobile-device';
import type { TAgentStatus } from '@/types/agent';

const DESKTOP_MAX_ROWS = 5;
const MOBILE_MAX_ROWS = 3;
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
  const t = useTranslations('agent');
  const [value, setValue] = useState(() => loadDraft(agentId));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const [isFocused, setIsFocused] = useState(false);
  const isMobileDevice = useIsMobileDevice();

  const isInputDisabled = agentStatus === 'offline';
  const isSendDisabled = agentStatus === 'offline' || isSending;
  const hasValue = value.trim().length > 0;
  const maxRows = isMobileDevice ? MOBILE_MAX_ROWS : DESKTOP_MAX_ROWS;

  const placeholder =
    agentStatus === 'offline' ? t('offlinePlaceholder') : t('messagePlaceholder');

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
    const maxHeight = LINE_HEIGHT * maxRows + PADDING_Y;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, [value, maxRows]);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isSendDisabled) return;

    if (debounceRef.current) return;
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
    }, 300);

    onSend(trimmed);
    setValue('');
    clearDraft(agentId);

    if (isMobileDevice) {
      textareaRef.current?.blur();
    } else {
      textareaRef.current?.focus();
    }
  }, [value, isSendDisabled, onSend, agentId, isMobileDevice]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;

    if (e.key === 'Enter' && !isMobileDevice) {
      if (e.shiftKey) return;
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="mx-auto w-full max-w-content px-3 pb-3 pt-0">
      <div
        className={cn(
          'relative flex items-end gap-2 rounded-lg border px-3 py-2 transition-colors duration-150',
          isFocused && !isInputDisabled
            ? 'border-ring bg-background'
            : 'border-border bg-black/5 dark:bg-white/5',
          isInputDisabled && 'opacity-50',
        )}
        onFocusCapture={() => setIsFocused(true)}
        onBlurCapture={() => setIsFocused(false)}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isInputDisabled}
          aria-label={t('messageInputAria')}
          className={cn(
            'flex-1 resize-none bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground',
            isInputDisabled && 'cursor-not-allowed opacity-70',
          )}
          rows={1}
          style={{
            lineHeight: `${LINE_HEIGHT}px`,
            maxHeight: `${LINE_HEIGHT * maxRows + PADDING_Y}px`,
            overflowY: 'auto',
          }}
        />

        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground',
            hasValue && !isSendDisabled && 'text-ui-purple',
            isSendDisabled && 'opacity-30',
          )}
          onClick={handleSubmit}
          disabled={isSendDisabled}
          aria-label={t('sendMessageAria')}
        >
          <SendHorizontal size={16} />
        </Button>
      </div>
    </div>
  );
};

export default ChatInput;
