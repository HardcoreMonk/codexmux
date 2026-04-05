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
          <span className="text-muted-foreground">연결 중...</span>
        </>
      )}

      {status === 'reconnecting' && (
        <>
          <Spinner className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">
            재연결 중... ({retryCount}/{5})
          </span>
        </>
      )}

      {status === 'disconnected' && (
        <>
          <WifiOff className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {disconnectReason === 'max-connections'
              ? '동시 접속 초과'
              : disconnectReason === 'pty-error'
                ? '터미널 시작 실패'
                : '연결 끊김'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-1 h-7 gap-1 px-2 text-foreground hover:text-foreground"
            onClick={onReconnect}
          >
            <RefreshCw className="h-3 w-3" />
            다시 연결
          </Button>
        </>
      )}
    </div>
  );
};

export default ConnectionStatus;
