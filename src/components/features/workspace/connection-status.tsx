import { useTranslations } from 'next-intl';
import { WifiOff, RefreshCw } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { TConnectionStatus, TDisconnectReason } from '@/types/terminal';

interface IConnectionStatusProps {
  status: TConnectionStatus;
  retryCount: number;
  disconnectReason: TDisconnectReason;
  onReconnect: () => void;
}

const ConnectionStatus = ({
  status,
  retryCount,
  disconnectReason,
  onReconnect,
}: IConnectionStatusProps) => {
  const t = useTranslations('connection');
  const isVisible = status !== 'connected' && status !== 'session-ended';

  return (
    <div
      className={cn(
        'absolute top-3 right-3 z-10 flex items-center gap-2 rounded-md bg-terminal-bg/90 px-3 py-2 text-sm transition-opacity duration-150',
        isVisible ? 'animate-delayed-fade-in-long' : 'pointer-events-none opacity-0',
      )}
    >
      {status === 'connecting' && (
        <>
          <Spinner className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">{t('connecting')}</span>
        </>
      )}

      {status === 'reconnecting' && (
        <>
          <Spinner className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">
            {t('reconnecting', { count: retryCount })}
          </span>
        </>
      )}

      {status === 'disconnected' && (
        <>
          <WifiOff className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {disconnectReason === 'max-connections'
              ? t('maxConnections')
              : disconnectReason === 'pty-error'
                ? t('ptyError')
                : t('disconnected')}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-1 h-7 gap-1 px-2 text-foreground hover:text-foreground"
            onClick={onReconnect}
          >
            <RefreshCw className="h-3 w-3" />
            {t('reconnect')}
          </Button>
        </>
      )}
    </div>
  );
};

export default ConnectionStatus;
