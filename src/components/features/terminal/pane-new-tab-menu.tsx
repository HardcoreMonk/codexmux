import { useState } from 'react';
import { Plus, Terminal, Globe } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import ClaudeCodeIcon from '@/components/icons/claude-code-icon';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { TPanelType } from '@/types/terminal';
import useConfigStore from '@/hooks/use-config-store';
import { isMac } from '@/lib/keyboard-shortcuts';

const mod = isMac ? '⌘' : 'Ctrl+';

interface IPaneNewTabMenuProps {
  isCreating: boolean;
  onCreateTab: (panelType?: TPanelType, options?: { command?: string }) => void;
}

const MENU_ITEMS = [
  { key: 'claude-new', type: 'claude-code' as const, icon: <ClaudeCodeIcon className="h-3.5 w-3.5" />, label: 'Claude 새 대화', startClaude: true },
  { key: 'claude', type: 'claude-code' as const, icon: <ClaudeCodeIcon className="h-3.5 w-3.5" />, label: 'Claude 세션 목록' },
  { key: 'terminal', type: 'terminal' as const, icon: <Terminal className="h-3.5 w-3.5 text-muted-foreground" />, label: 'Terminal' },
  { key: 'web-browser', type: 'web-browser' as const, icon: <Globe className="h-3.5 w-3.5 text-muted-foreground" />, label: 'Web Browser' },
] as const;

const PaneNewTabMenu = ({ isCreating, onCreateTab }: IPaneNewTabMenuProps) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center border-l border-r border-border px-0.5">
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                className={cn(
                  'flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground',
                  isCreating && 'pointer-events-none opacity-50',
                )}
                disabled={isCreating}
                aria-label="새 탭"
              />
            }
          >
            {isCreating ? (
              <Spinner className="h-3 w-3" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
          </TooltipTrigger>
          <TooltipContent side="bottom">새 탭 열기 ({mod}T)</TooltipContent>
        </Tooltip>
        <PopoverContent side="bottom" align="start" className="w-44 gap-0 p-0.5">
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
              {item.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default PaneNewTabMenu;
