import { useState, useEffect } from 'react';
import { Loader2, WifiOff, RefreshCw } from 'lucide-react';
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
  const [displayStatus, setDisplayStatus] = useState(status);

  useEffect(() => {
    if (isVisible) {
      setDisplayStatus(status);
    }
  }, [status, isVisible]);

  return (
    <div
      className={cn(
        'absolute top-3 right-3 z-10 flex items-center gap-2 rounded-md bg-[#1e1f29]/90 px-3 py-2 text-sm transition-opacity duration-150',
        isVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      {displayStatus === 'connecting' && (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
          <span className="text-zinc-400">연결 중...</span>
        </>
      )}

      {displayStatus === 'reconnecting' && (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
          <span className="text-zinc-400">
            재연결 중... ({retryCount}/{5})
          </span>
        </>
      )}

      {displayStatus === 'disconnected' && (
        <>
          <WifiOff className="h-4 w-4 text-zinc-500" />
          <span className="text-zinc-400">
            {disconnectReason === 'max-connections'
              ? '동시 접속 초과'
              : disconnectReason === 'pty-error'
                ? '터미널 시작 실패'
                : '연결 끊김'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-1 h-7 gap-1 px-2 text-zinc-300 hover:text-zinc-100"
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
