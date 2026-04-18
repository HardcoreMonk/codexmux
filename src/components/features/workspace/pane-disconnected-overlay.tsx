import { useTranslations } from 'next-intl';
import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface IPaneDisconnectedOverlayProps {
  cwd?: string;
  lastCommand?: string | null;
  onRestartWithCommand: (command: string) => void;
  onRestartNew: () => void;
}

const PaneDisconnectedOverlay = ({
  cwd,
  lastCommand,
  onRestartWithCommand,
  onRestartNew,
}: IPaneDisconnectedOverlayProps) => {
  const t = useTranslations('terminal');

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3">
      <WifiOff className="h-5 w-5 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">
        {t('disconnectedSessionNotFound')}
      </span>
      <div className="flex flex-col items-center gap-3">
        {cwd && (
          <span className="max-w-72 truncate text-xs text-muted-foreground/60">
            {cwd.replace(/^\/Users\/[^/]+/, '~')}
          </span>
        )}
        {lastCommand && (
          <div className="flex flex-col items-center gap-2">
            <code className="max-w-64 truncate rounded bg-muted px-2 py-1 text-xs">
              {lastCommand}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRestartWithCommand(lastCommand)}
            >
              {t('restartWithCommand')}
            </Button>
          </div>
        )}
        {lastCommand && (
          <div className="flex w-40 items-center gap-2 text-muted-foreground/40">
            <div className="h-px flex-1 bg-current" />
            <span className="text-[11px]">{t('or')}</span>
            <div className="h-px flex-1 bg-current" />
          </div>
        )}
        <Button variant="outline" size="sm" onClick={onRestartNew}>
          {t('restartNewTerminal')}
        </Button>
      </div>
    </div>
  );
};

export default PaneDisconnectedOverlay;
