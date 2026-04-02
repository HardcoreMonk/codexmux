import { useState } from 'react';
import { Plus, Loader2, Terminal, Globe } from 'lucide-react';
import ClaudeCodeIcon from '@/components/icons/claude-code-icon';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { TPanelType } from '@/types/terminal';
import useConfigStore from '@/hooks/use-config-store';
import { isMac } from '@/lib/keyboard-shortcuts';

const SplitVerticalIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="12" y1="3" x2="12" y2="21" />
  </svg>
);

const SplitHorizontalIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="12" x2="21" y2="12" />
  </svg>
);

const mod = isMac ? '⌘' : 'Ctrl';

interface IPaneNewTabMenuProps {
  isCreating: boolean;
  canSplit: boolean;
  onCreateTab: (panelType?: TPanelType, options?: { command?: string }) => void;
  onSplitPane: (orientation: 'horizontal' | 'vertical') => void;
}

const MENU_ITEMS = [
  { key: 'claude-new', type: 'claude-code' as const, icon: <ClaudeCodeIcon className="h-3.5 w-3.5" />, label: 'Claude 새 대화', startClaude: true },
  { key: 'claude', type: 'claude-code' as const, icon: <ClaudeCodeIcon className="h-3.5 w-3.5" />, label: 'Claude 세션 목록' },
  { key: 'terminal', type: 'terminal' as const, icon: <Terminal className="h-3.5 w-3.5 text-muted-foreground" />, label: 'Terminal' },
  { key: 'web-browser', type: 'web-browser' as const, icon: <Globe className="h-3.5 w-3.5 text-muted-foreground" />, label: 'Web Browser' },
] as const;

const PaneNewTabMenu = ({ isCreating, canSplit, onCreateTab, onSplitPane }: IPaneNewTabMenuProps) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center border-l border-r border-border px-0.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            'flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground',
            isCreating && 'pointer-events-none opacity-50',
          )}
          disabled={isCreating}
          aria-label="새 탭"
        >
          {isCreating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
        </PopoverTrigger>
        <PopoverContent side="bottom" align="start" className="w-52 gap-0 p-0.5">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.key}
              className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-xs text-foreground hover:bg-accent"
              onClick={() => {
                setOpen(false);
                if ('startClaude' in item && item.startClaude) {
                  const dangerous = useConfigStore.getState().dangerouslySkipPermissions;
                  const settings = '--settings ~/.purplemux/hooks.json';
                  const cmd = dangerous ? `claude ${settings} --dangerously-skip-permissions` : `claude ${settings}`;
                  onCreateTab(item.type, { command: cmd });
                } else {
                  onCreateTab(item.type);
                }
              }}
            >
              {item.icon}
              <span className="flex-1 text-left">{item.label}</span>
              {item.key === 'terminal' && (
                <kbd className="text-[10px] text-muted-foreground">{mod}T</kbd>
              )}
            </button>
          ))}
          <div className="mx-2 my-0.5 border-t border-border" />
          <button
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-xs',
              canSplit
                ? 'text-foreground hover:bg-accent'
                : 'cursor-not-allowed text-muted-foreground/50',
            )}
            disabled={!canSplit}
            onClick={() => {
              setOpen(false);
              onSplitPane('horizontal');
            }}
          >
            <SplitVerticalIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1 text-left">수직 분할</span>
            <kbd className="text-[10px] text-muted-foreground">{mod}D</kbd>
          </button>
          <button
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-xs',
              canSplit
                ? 'text-foreground hover:bg-accent'
                : 'cursor-not-allowed text-muted-foreground/50',
            )}
            disabled={!canSplit}
            onClick={() => {
              setOpen(false);
              onSplitPane('vertical');
            }}
          >
            <SplitHorizontalIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1 text-left">수평 분할</span>
            <kbd className="text-[10px] text-muted-foreground">{mod}⇧D</kbd>
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default PaneNewTabMenu;
