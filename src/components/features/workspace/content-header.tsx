import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { TLayoutNode, TPanelType } from '@/types/terminal';
import { collectPanes } from '@/hooks/use-layout';
import useTabMetadataStore from '@/hooks/use-tab-metadata-store';
import useConfigStore from '@/hooks/use-config-store';
import useIsMac from '@/hooks/use-is-mac';
import isElectron from '@/hooks/use-is-electron';
import SystemResources from '@/components/layout/system-resources';
import { buildEditorUrl, isSafeEditorTarget, isWebEditorUrl } from '@/lib/editor-url';

const EqualizeIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="4" x2="8" y2="20" />
    <line x1="16" y1="4" x2="16" y2="20" />
  </svg>
);

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

interface IContentHeaderProps {
  activePaneId: string | null;
  root: TLayoutNode;
  paneCount: number;
  canSplit: boolean;
  isSplitting: boolean;
  onSplitPane: (paneId: string, orientation: 'horizontal' | 'vertical') => void;
  onEqualizeRatios: () => void;
  onUpdateTabPanelType: (paneId: string, tabId: string, panelType: TPanelType) => void;
}

const ContentHeader = ({
  activePaneId,
  root,
  paneCount,
  canSplit,
  isSplitting,
  onSplitPane,
  onEqualizeRatios,
  onUpdateTabPanelType,
}: IContentHeaderProps) => {
  const t = useTranslations('terminal');
  const isMac = useIsMac();
  const mod = isMac ? '⌘' : 'Ctrl+';
  const [isToggling, setIsToggling] = useState(false);

  const panes = collectPanes(root);
  const focusedPane = panes.find((p) => p.id === activePaneId) ?? panes[0];
  const activeTab = focusedPane?.tabs.find((t) => t.id === focusedPane.activeTabId);
  const activePanelType: TPanelType = activeTab?.panelType ?? 'terminal';

  const activeTabCwd = useTabMetadataStore(
    (state) => (activeTab?.id ? state.metadata[activeTab.id]?.cwd : undefined),
  );

  const editorUrl = useConfigStore((state) => state.editorUrl);
  const editorPreset = useConfigStore((state) => state.editorPreset);

  const handlePanelSwitch = (value: string) => {
    if (isToggling || !focusedPane || !activeTab) return;
    const next = value as TPanelType;
    if (next === activePanelType) return;
    setIsToggling(true);
    onUpdateTabPanelType(focusedPane.id, activeTab.id, next);
    setTimeout(() => setIsToggling(false), 150);
  };

  const paneId = focusedPane?.id;

  return (
    <div className="shrink-0 bg-background">
      <div
        className="relative z-40 flex h-12 shrink-0 items-center border-b border-border px-3"
        {...(isElectron ? { style: { WebkitAppRegion: 'drag' } as React.CSSProperties } : {})}
      >
      <div className="mr-auto" {...(isElectron ? { style: { WebkitAppRegion: 'no-drag' } as React.CSSProperties } : {})}>
        <SystemResources />
      </div>
      <TooltipProvider>
        <div
          className="flex items-center gap-1"
          {...(isElectron ? { style: { WebkitAppRegion: 'no-drag' } as React.CSSProperties } : {})}
        >
          <div className={cn('flex items-center gap-px border-r border-border pr-2', isToggling && 'pointer-events-none opacity-80')}>
            {([
              { value: 'terminal', label: 'TERMINAL' },
              { value: 'claude-code', label: 'CLAUDE' },
              { value: 'diff', label: 'DIFF' },
            ] as const).map((item) => (
              <button
                key={item.value}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide transition-colors',
                  activePanelType === item.value
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground/60 hover:text-muted-foreground',
                )}
                onClick={() => handlePanelSwitch(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground/60 transition-colors hover:text-muted-foreground"
            onClick={() => {
              const folder = activeTabCwd || '/';
              const target = buildEditorUrl(editorPreset, editorUrl, folder);
              if (!target) {
                toast.info(t('editorUrlNotSet'));
                return;
              }
              if (!isSafeEditorTarget(target)) {
                toast.error(t('editorUrlNotSet'));
                return;
              }
              if (isWebEditorUrl(target)) {
                window.open(target, '_blank', 'noopener,noreferrer');
                return;
              }
              const api = (window as unknown as { electronAPI?: { openExternal: (url: string) => void } }).electronAPI;
              if (api?.openExternal) {
                api.openExternal(target);
                return;
              }
              const iframe = document.createElement('iframe');
              iframe.style.display = 'none';
              iframe.src = target;
              document.body.appendChild(iframe);
              setTimeout(() => iframe.remove(), 1000);
            }}
            aria-label={t('openEditor')}
          >
            EDITOR
            <ExternalLink className="h-2.5 w-2.5" />
          </button>

          <Tooltip>
            <TooltipTrigger
              className={cn(
                'flex h-7 w-7 items-center justify-center text-muted-foreground',
                canSplit
                  ? 'hover:text-foreground'
                  : 'cursor-not-allowed opacity-30',
              )}
              onClick={canSplit && paneId ? () => onSplitPane(paneId, 'horizontal') : undefined}
              disabled={!canSplit}
              aria-label={t('splitVertical')}
            >
              {isSplitting ? (
                <Spinner className="h-3 w-3" />
              ) : (
                <SplitVerticalIcon className="h-3.5 w-3.5" />
              )}
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('splitVerticalShortcut', { shortcut: `${mod}D` })}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              className={cn(
                'flex h-7 w-7 items-center justify-center text-muted-foreground',
                canSplit
                  ? 'hover:text-foreground'
                  : 'cursor-not-allowed opacity-30',
              )}
              onClick={canSplit && paneId ? () => onSplitPane(paneId, 'vertical') : undefined}
              disabled={!canSplit}
              aria-label={t('splitHorizontal')}
            >
              {isSplitting ? (
                <Spinner className="h-3 w-3" />
              ) : (
                <SplitHorizontalIcon className="h-3.5 w-3.5" />
              )}
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('splitHorizontalShortcut', { shortcut: `${mod}⇧D` })}</TooltipContent>
          </Tooltip>

          {paneCount >= 2 && (
            <Tooltip>
              <TooltipTrigger
                className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground"
                onClick={onEqualizeRatios}
                aria-label={t('equalSplit')}
              >
                <EqualizeIcon className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('equalSplit')}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>
      </div>
    </div>
  );
};

export default ContentHeader;
