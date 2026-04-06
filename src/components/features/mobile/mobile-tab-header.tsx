import { X, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import ClaudeCodeIcon from '@/components/icons/claude-code-icon';
import TabStatusIndicator from '@/components/features/terminal/tab-status-indicator';
import useTabStore from '@/hooks/use-tab-store';
import { getProcessIcon } from '@/lib/process-icon';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { TPanelType } from '@/types/terminal';

interface IMobileTabHeaderProps {
  tabId: string;
  tabName: string;
  panelType: TPanelType;
  onToggleClaude: () => void;
  onCreateTab: () => void;
  onClose: () => void;
}

const MobileTabHeader = ({
  tabId,
  tabName,
  panelType,
  onToggleClaude,
  onCreateTab,
  onClose,
}: IMobileTabHeaderProps) => {
  const t = useTranslations('mobile');
  const tc = useTranslations('common');
  const tabEntry = useTabStore((s) => s.tabs[tabId]);
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
        <Tabs value={panelType} onValueChange={() => onToggleClaude()} className="gap-0">
          <TabsList className="h-7">
            <TabsTrigger value="terminal" className="h-full px-2 text-[10px] tracking-wide">
              TERMINAL
            </TabsTrigger>
            <TabsTrigger value="claude-code" className="h-full px-2 text-[10px] tracking-wide">
              CLAUDE
            </TabsTrigger>
          </TabsList>
        </Tabs>

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
