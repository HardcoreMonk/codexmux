import { Loader2, WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TConnectionStatus } from '@/types/terminal';

interface IConnectionStatusProps {
  status: TConnectionStatus;
  retryCount: number;
  onReconnect: () => void;
}

const ConnectionStatus = ({
  status,
  retryCount,
  onReconnect,
}: IConnectionStatusProps) => {
  if (status === 'connected') return null;

  return (
    <div
      className={`absolute top-3 right-3 z-10 flex items-center gap-2 rounded-md bg-zinc-900/80 px-3 py-2 text-sm backdrop-blur-sm transition-opacity duration-150 ${
        status === 'connected' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {status === 'connecting' && (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
          <span className="text-zinc-400">연결 중...</span>
        </>
      )}

      {status === 'reconnecting' && (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
          <span className="text-zinc-400">
            재연결 중... ({retryCount}/{5})
          </span>
        </>
      )}

      {status === 'disconnected' && (
        <>
          <WifiOff className="h-4 w-4 text-zinc-500" />
          <span className="text-zinc-400">연결 끊김</span>
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
