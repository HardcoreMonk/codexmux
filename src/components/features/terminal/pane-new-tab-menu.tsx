import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Terminal, Globe, GitCompareArrows } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import ClaudeCodeIcon from '@/components/icons/claude-code-icon';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { TPanelType } from '@/types/terminal';
import useConfigStore from '@/hooks/use-config-store';
import useIsMobile from '@/hooks/use-is-mobile';
import useIsMac from '@/hooks/use-is-mac';

interface IPaneNewTabMenuProps {
  isCreating: boolean;
  onCreateTab: (panelType?: TPanelType, options?: { command?: string }) => void;
}

const PaneNewTabMenu = ({ isCreating, onCreateTab }: IPaneNewTabMenuProps) => {
  const t = useTranslations('terminal');
  const isMac = useIsMac();
  const mod = isMac ? '⌘' : 'Ctrl+';
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const allMenuItems = [
    { key: 'claude-new', type: 'claude-code' as const, icon: <ClaudeCodeIcon className="h-3.5 w-3.5" />, label: t('claudeNewConversation'), startClaude: true },
    { key: 'claude', type: 'claude-code' as const, icon: <ClaudeCodeIcon className="h-3.5 w-3.5" />, label: t('claudeSessionList') },
    { key: 'terminal', type: 'terminal' as const, icon: <Terminal className="h-3.5 w-3.5 text-muted-foreground" />, label: 'Terminal' },
    { key: 'diff', type: 'diff' as const, icon: <GitCompareArrows className="h-3.5 w-3.5 text-muted-foreground" />, label: 'Diff' },
    { key: 'web-browser', type: 'web-browser' as const, icon: <Globe className="h-3.5 w-3.5 text-muted-foreground" />, label: 'Web Browser' },
  ];

  const menuItems = isMobile ? allMenuItems.filter((item) => item.key !== 'web-browser') : allMenuItems;

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
                aria-label={t('openNewTab')}
              />
            }
          >
            {isCreating ? (
              <Spinner className="h-3 w-3" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('newTabTooltip', { shortcut: `${mod}T` })}</TooltipContent>
        </Tooltip>
        <PopoverContent side="bottom" align="start" className="w-44 gap-0 p-0.5">
          {menuItems.map((item) => (
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
