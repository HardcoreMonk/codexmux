import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { SendHorizontal, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import useWebInput from '@/hooks/use-web-input';
import useIsMobileDevice from '@/hooks/use-is-mobile-device';
import InterruptDialog from '@/components/features/terminal/interrupt-dialog';
import type { TCliState } from '@/types/timeline';

const DEFAULT_MAX_ROWS = 5;
const LINE_HEIGHT = 20;
const PADDING_Y = 16;

interface IWebInputBarProps {
  tabId?: string;
  cliState: TCliState;
  sendStdin: (data: string) => void;
  terminalWsConnected: boolean;
  visible: boolean;
  focusTerminal: () => void;
  focusInputRef: React.MutableRefObject<(() => void) | undefined>;
  setInputValueRef: React.MutableRefObject<((v: string) => void) | undefined>;
  maxRows?: number;
  onRestartSession?: () => void;
}

const WebInputBar = ({
  tabId,
  cliState,
  sendStdin,
  terminalWsConnected,
  visible,
  focusTerminal,
  focusInputRef,
  setInputValueRef,
  maxRows = DEFAULT_MAX_ROWS,
  onRestartSession,
}: IWebInputBarProps) => {
  const { value, setValue, mode, send, interrupt, textareaRef, focusInput } = useWebInput(
    cliState,
    sendStdin,
    terminalWsConnected,
    { tabId, onRestartSession },
  );
  const isMobileDevice = useIsMobileDevice();

  const [interruptDialogOpen, setInterruptDialogOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    focusInputRef.current = focusInput;
    setInputValueRef.current = setValue;
    return () => {
      focusInputRef.current = undefined;
      setInputValueRef.current = undefined;
    };
  }, [focusInput, focusInputRef, setValue, setInputValueRef]);

  useEffect(() => {
    if (!visible) {
      setValue('');
    }
  }, [visible, setValue]);


  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = LINE_HEIGHT * maxRows + PADDING_Y;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, [textareaRef, maxRows]);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      textareaRef.current?.blur();
      focusTerminal();
      return;
    }

    if (e.key === 'Enter' && !isMobileDevice) {
      if (e.shiftKey) return;
      e.preventDefault();
      send();
      return;
    }
  };

  const handleSendClick = () => {
    send();
    if (isMobileDevice) {
      textareaRef.current?.blur();
    } else {
      textareaRef.current?.focus();
    }
  };

  const handleInterruptClick = () => {
    setInterruptDialogOpen(true);
  };

  const handleInterruptConfirm = () => {
    interrupt();
  };

  const handleFocusIn = () => setIsFocused(true);
  const handleFocusOut = () => setIsFocused(false);

  const isDisabled = mode === 'disabled';
  const hasValue = value.trim().length > 0;

  return (
    <>
      <div
        className={cn(
          'grid',
          visible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="px-3 pt-0 pb-0">
          <div
            ref={containerRef}
            className={cn(
              'relative z-10 flex items-end gap-2 rounded-lg border px-3 py-2 transition-colors duration-150',
              isFocused && !isDisabled
                ? 'border-ring bg-background'
                : 'border-border bg-black/5 dark:bg-white/5',
              mode === 'disabled' && 'opacity-50',
            )}
            onFocusCapture={handleFocusIn}
            onBlurCapture={handleFocusOut}
          >
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isDisabled}
              placeholder={
                mode === 'disabled'
                  ? 'Claude Code가 실행 중이 아닙니다'
                  : '메시지를 입력하세요...'
              }
              aria-label="Claude Code 메시지 입력"
              className={cn(
                'flex-1 resize-none bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground',
                isDisabled && 'cursor-not-allowed opacity-70',
              )}
              rows={1}
              style={{
                lineHeight: `${LINE_HEIGHT}px`,
                maxHeight: `${LINE_HEIGHT * maxRows + PADDING_Y}px`,
                overflowY: 'auto',
              }}
            />

            {mode === 'interrupt' && !hasValue ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 p-0 text-ui-red hover:text-ui-red/80"
                onClick={handleInterruptClick}
                aria-label="작업 중단"
              >
                <Square size={14} fill="currentColor" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground',
                  hasValue && !isDisabled && 'text-ui-purple',
                  isDisabled && 'opacity-30',
                )}
                onClick={handleSendClick}
                disabled={isDisabled}
                aria-label="메시지 전송"
              >
                <SendHorizontal size={16} />
              </Button>
            )}
          </div>
          </div>
        </div>
      </div>

      <InterruptDialog
        open={interruptDialogOpen}
        onOpenChange={setInterruptDialogOpen}
        onConfirm={handleInterruptConfirm}
      />
    </>
  );
};

export default WebInputBar;
