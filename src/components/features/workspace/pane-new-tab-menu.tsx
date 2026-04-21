import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Terminal, Globe, GitCompareArrows } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import ClaudeCodeIcon from '@/components/icons/claude-code-icon';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { TPanelType } from '@/types/terminal';
import useConfigStore from '@/hooks/use-config-store';
import { useLayoutStore } from '@/hooks/use-layout';
import useIsMobile from '@/hooks/use-is-mobile';
import useIsMac from '@/hooks/use-is-mac';

interface IPaneNewTabMenuProps {
  paneId: string;
  isCreating: boolean;
  activePanelType?: TPanelType;
  onCreateTab: (panelType?: TPanelType, options?: { command?: string }) => void;
}

const defaultKeyForPanelType = (panelType?: TPanelType): string => {
  switch (panelType) {
    case 'terminal': return 'terminal';
    case 'web-browser': return 'web-browser';
    case 'diff':
    case 'claude-code':
    default: return 'claude-new';
  }
};

const PaneNewTabMenu = ({ paneId, isCreating, activePanelType, onCreateTab }: IPaneNewTabMenuProps) => {
  const t = useTranslations('terminal');
  const isMac = useIsMac();
  const mod = isMac ? '⌘' : 'Ctrl+';
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const wsId = useLayoutStore((s) => s.workspaceId);

  const menuItems = useMemo(() => {
    const all = [
      { key: 'claude-new', type: 'claude-code' as const, icon: <ClaudeCodeIcon className="h-3.5 w-3.5" />, label: t('claudeNewConversation'), startClaude: true },
      { key: 'claude', type: 'claude-code' as const, icon: <ClaudeCodeIcon className="h-3.5 w-3.5" />, label: t('claudeSessionList') },
      { key: 'terminal', type: 'terminal' as const, icon: <Terminal className="h-3.5 w-3.5 text-muted-foreground" />, label: 'Terminal' },
      { key: 'diff', type: 'diff' as const, icon: <GitCompareArrows className="h-3.5 w-3.5 text-muted-foreground" />, label: 'Diff' },
      { key: 'web-browser', type: 'web-browser' as const, icon: <Globe className="h-3.5 w-3.5 text-muted-foreground" />, label: 'Web Browser' },
    ];
    return isMobile ? all.filter((item) => item.key !== 'web-browser') : all;
  }, [isMobile, t]);

  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const openMenu = useCallback(() => {
    const targetKey = defaultKeyForPanelType(activePanelType);
    const idx = menuItems.findIndex((i) => i.key === targetKey);
    setActiveIndex(idx >= 0 ? idx : 0);
    setOpen(true);
  }, [activePanelType, menuItems]);

  const handleOpenChange = (next: boolean) => {
    if (next) openMenu();
    else setOpen(false);
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ paneId: string }>).detail;
      if (detail?.paneId !== paneId) return;
      openMenu();
    };
    window.addEventListener('open-new-tab-menu', handler);
    return () => window.removeEventListener('open-new-tab-menu', handler);
  }, [paneId, openMenu]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  const handleSelect = (item: typeof menuItems[number]) => {
    setOpen(false);
    if ('startClaude' in item && item.startClaude) {
      const dangerous = useConfigStore.getState().dangerouslySkipPermissions;
      const settings = '--settings ~/.purplemux/hooks.json';
      const prompt = wsId ? `--append-system-prompt-file ~/.purplemux/workspaces/${wsId}/claude-prompt.md` : '';
      const flags = [settings, prompt].filter(Boolean).join(' ');
      const cmd = dangerous ? `claude ${flags} --dangerously-skip-permissions` : `claude ${flags}`;
      onCreateTab(item.type, { command: cmd });
    } else {
      onCreateTab(item.type);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % menuItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + menuItems.length) % menuItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = menuItems[activeIndex];
      if (item) handleSelect(item);
    }
  };

  return (
    <div className="flex items-center border-l border-r border-border px-0.5">
      <Popover open={open} onOpenChange={handleOpenChange}>
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
        <PopoverContent side="bottom" align="start" className="w-44 gap-0 p-0.5" onKeyDown={handleKeyDown}>
          {menuItems.map((item, idx) => (
            <button
              key={item.key}
              ref={(el) => { itemRefs.current[idx] = el; }}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-xs text-foreground hover:bg-accent focus:outline-none',
                activeIndex === idx && 'bg-accent',
              )}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => handleSelect(item)}
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
