import { useCallback, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { IQuickPrompt } from '@/hooks/use-quick-prompts';
import type { TCliState } from '@/types/timeline';

interface IQuickPromptBarProps {
  prompts: IQuickPrompt[];
  cliState: TCliState;
  visible: boolean;
  onSelect: (prompt: string) => void;
}

const QuickPromptBar = ({ prompts, cliState, visible, onSelect }: IQuickPromptBarProps) => {
  const barRef = useRef<HTMLDivElement>(null);
  const isDisabled = cliState !== 'idle';
  const hasPrompts = prompts.length > 0;

  const handleClick = useCallback(
    (prompt: string) => {
      if (isDisabled) return;
      onSelect(prompt);
    },
    [isDisabled, onSelect],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const buttons = barRef.current?.querySelectorAll<HTMLButtonElement>('[data-quick-prompt]');
      if (!buttons?.length) return;

      const currentIndex = Array.from(buttons).findIndex((b) => b === document.activeElement);
      let nextIndex = -1;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextIndex = currentIndex < buttons.length - 1 ? currentIndex + 1 : 0;
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        nextIndex = currentIndex > 0 ? currentIndex - 1 : buttons.length - 1;
      }

      if (nextIndex >= 0) buttons[nextIndex].focus();
    },
    [],
  );

  if (!visible || !hasPrompts) return null;

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="빠른 프롬프트"
      className="flex gap-2 overflow-x-auto px-3 py-1.5 scrollbar-none"
      onKeyDown={handleKeyDown}
    >
      {prompts.map((p) => (
        <Button
          key={p.id}
          data-quick-prompt={p.id}
          variant="outline"
          size="sm"
          tabIndex={0}
          disabled={isDisabled}
          className={cn(
            'shrink-0 rounded-full px-3 py-1 text-xs text-muted-foreground hover:border-foreground/30 hover:text-foreground',
            isDisabled && 'pointer-events-none opacity-50',
          )}
          onClick={() => handleClick(p.prompt)}
        >
          {p.name}
        </Button>
      ))}
    </div>
  );
};

export default QuickPromptBar;
