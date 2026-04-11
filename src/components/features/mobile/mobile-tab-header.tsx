import { X, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import ClaudeCodeIcon from '@/components/icons/claude-code-icon';
import TabStatusIndicator from '@/components/features/terminal/tab-status-indicator';
import useTabStore from '@/hooks/use-tab-store';
import { getProcessIcon } from '@/lib/process-icon';
import OpenAIIcon from '@/components/icons/openai-icon';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { TPanelType } from '@/types/terminal';

const PANEL_MODES = [
  { type: 'terminal' as const, label: 'TERMINAL' },
  { type: 'claude-code' as const, label: 'CLAUDE' },
  { type: 'diff' as const, label: 'DIFF' },
] as const;

interface IMobileTabHeaderProps {
  tabId: string;
  tabName: string;
  panelType: TPanelType;
  onSwitchPanelType: (type: TPanelType) => void;
  onCreateTab: () => void;
  onClose: () => void;
}

const MobileTabHeader = ({
  tabId,
  tabName,
  panelType,
  onSwitchPanelType,
  onCreateTab,
  onClose,
}: IMobileTabHeaderProps) => {
  const t = useTranslations('mobile');
  const tc = useTranslations('common');
  const tabEntry = useTabStore((s) => s.tabs[tabId]);
  const isCodex = tabEntry?.currentProcess === 'codex';
  const processIcon = getProcessIcon(tabEntry?.currentProcess);
  const nerdColor = tabEntry?.terminalStatus === 'server'
    ? 'text-ui-green'
    : tabEntry?.terminalStatus === 'running'
      ? 'text-ui-blue'
      : 'text-muted-foreground/50';

  return (
    <div className="flex h-10 shrink-0 items-center border-b border-border/50 bg-background">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
        <TabStatusIndicator tabId={tabId} panelType={panelType} />
        {panelType === 'claude-code' ? (
          <ClaudeCodeIcon size={16} />
        ) : isCodex ? (
          <OpenAIIcon size={14} className={`shrink-0 ${nerdColor}`} />
        ) : (
          <span
            className={`mt-0.5 shrink-0 text-sm leading-none ${nerdColor}`}
            style={{ fontFamily: 'MesloLGLDZ, monospace' }}
            aria-hidden="true"
          >
            {processIcon}
          </span>
        )}
        <span className="truncate text-xs text-foreground">{tabName}</span>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 pr-0.5">
        <div className="flex items-center gap-px">
          {PANEL_MODES.map((mode) => (
            <button
              key={mode.type}
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide transition-colors',
                panelType === mode.type
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground/60 hover:text-muted-foreground',
              )}
              onClick={() => onSwitchPanelType(mode.type)}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <button
          className="flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors"
          onClick={onCreateTab}
          aria-label={t('newTab')}
        >
          <Plus size={16} />
        </button>

        <AlertDialog>
          <AlertDialogTrigger
            className="flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors"
            aria-label={t('closeTab')}
          >
            <X size={16} />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('closeTab')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('closeTabConfirm', { name: tabName })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-ui-red hover:bg-ui-red/80"
                onClick={onClose}
              >
                {tc('close')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default MobileTabHeader;
