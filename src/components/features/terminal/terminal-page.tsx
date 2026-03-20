import { useState, useRef, useCallback, useEffect } from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { TDisconnectReason } from '@/types/terminal';
import useTerminal from '@/hooks/use-terminal';
import useTerminalWebSocket from '@/hooks/use-terminal-websocket';

const DISCONNECT_MESSAGES: Record<NonNullable<TDisconnectReason>, string> = {
  'max-connections': '동시 접속 수를 초과했습니다',
  'pty-error': '터미널을 시작할 수 없습니다',
};
import TerminalContainer from '@/components/features/terminal/terminal-container';
import ConnectionStatus from '@/components/features/terminal/connection-status';
import SessionEndedOverlay from '@/components/features/terminal/session-ended-overlay';

interface ITermActions {
  write: (data: Uint8Array) => void;
  clear: () => void;
  fit: () => { cols: number; rows: number };
  focus: () => void;
}

interface IWsActions {
  sendResize: (cols: number, rows: number) => void;
}

const NOOP_TERM_ACTIONS: ITermActions = {
  write: () => {},
  clear: () => {},
  fit: () => ({ cols: 80, rows: 24 }),
  focus: () => {},
};

const NOOP_WS_ACTIONS: IWsActions = {
  sendResize: () => {},
};

const TerminalPage = () => {
  const [hasConnected, setHasConnected] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);

  const termActionsRef = useRef<ITermActions>(NOOP_TERM_ACTIONS);
  const wsActionsRef = useRef<IWsActions>(NOOP_WS_ACTIONS);

  const { status, retryCount, disconnectReason, sendStdin, sendResize, reconnect } =
    useTerminalWebSocket({
      onData: (data) => termActionsRef.current.write(data),
      onConnected: () => {
        setHasConnected(true);
        setSessionEnded(false);
        termActionsRef.current.clear();
        const { cols, rows } = termActionsRef.current.fit();
        wsActionsRef.current.sendResize(cols, rows);
        termActionsRef.current.focus();
      },
      onSessionEnded: () => setSessionEnded(true),
    });

  const { terminalRef, write, clear, fit, focus } = useTerminal({
    onInput: sendStdin,
    onResize: (cols, rows) => wsActionsRef.current.sendResize(cols, rows),
  });

  useEffect(() => {
    termActionsRef.current = { write, clear, fit, focus };
    wsActionsRef.current = { sendResize };
  });

  const handleNewSession = useCallback(() => {
    setSessionEnded(false);
    reconnect();
  }, [reconnect]);

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ backgroundColor: '#1e1f29' }}
    >
      <TerminalContainer
        ref={terminalRef}
        className={cn(
          'transition-opacity duration-150',
          hasConnected ? 'opacity-100' : 'opacity-0',
        )}
      />

      <div
        className={cn(
          'absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 transition-opacity duration-150',
          hasConnected ? 'pointer-events-none opacity-0' : 'opacity-100',
        )}
      >
        {(status === 'connecting' || status === 'reconnecting') && (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            <span className="text-sm text-zinc-500">연결 중...</span>
          </>
        )}
        {status === 'disconnected' && (
          <>
            <WifiOff className="h-5 w-5 text-zinc-500" />
            <span className="text-sm text-zinc-400">
              {(disconnectReason && DISCONNECT_MESSAGES[disconnectReason]) ??
                '서버에 연결할 수 없습니다'}
            </span>
            <Button variant="outline" size="sm" onClick={reconnect}>
              다시 연결
            </Button>
          </>
        )}
      </div>

      {hasConnected && (
        <ConnectionStatus
          status={status}
          retryCount={retryCount}
          disconnectReason={disconnectReason}
          onReconnect={reconnect}
        />
      )}

      <SessionEndedOverlay
        visible={sessionEnded}
        onNewSession={handleNewSession}
      />
    </div>
  );
};

export default TerminalPage;
