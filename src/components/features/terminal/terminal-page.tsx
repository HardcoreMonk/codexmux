import { useState, useRef, useCallback, useEffect } from 'react';
import { Loader2, WifiOff, Power } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { TDisconnectReason } from '@/types/terminal';
import useTerminal from '@/hooks/use-terminal';
import useTerminalWebSocket from '@/hooks/use-terminal-websocket';
import TerminalContainer from '@/components/features/terminal/terminal-container';
import ConnectionStatus from '@/components/features/terminal/connection-status';
import SessionEndedOverlay from '@/components/features/terminal/session-ended-overlay';

const DISCONNECT_MESSAGES: Record<NonNullable<TDisconnectReason>, string> = {
  'max-connections': '동시 접속 수를 초과했습니다. 다른 탭을 닫아주세요.',
  'pty-error': '터미널을 시작할 수 없습니다',
};

interface ITermActions {
  write: (data: Uint8Array) => void;
  clear: () => void;
  fit: () => { cols: number; rows: number };
  focus: () => void;
}

interface IWsActions {
  sendStdin: (data: string) => void;
  sendResize: (cols: number, rows: number) => void;
}

const NOOP_TERM_ACTIONS: ITermActions = {
  write: () => {},
  clear: () => {},
  fit: () => ({ cols: 80, rows: 24 }),
  focus: () => {},
};

const NOOP_WS_ACTIONS: IWsActions = {
  sendStdin: () => {},
  sendResize: () => {},
};

const TerminalPage = () => {
  const [hasConnected, setHasConnected] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);

  const termActionsRef = useRef<ITermActions>(NOOP_TERM_ACTIONS);
  const wsActionsRef = useRef<IWsActions>(NOOP_WS_ACTIONS);
  const newSessionRef = useRef(false);

  const { terminalRef, write, clear, fit, focus, isReady } = useTerminal({
    onInput: (data) => wsActionsRef.current.sendStdin(data),
    onResize: (cols, rows) => wsActionsRef.current.sendResize(cols, rows),
  });

  const { status, retryCount, disconnectReason, sendStdin, sendResize, sendKillSession, reconnect } =
    useTerminalWebSocket({
      enabled: isReady,
      onData: (data) => termActionsRef.current.write(data),
      onConnected: () => {
        setHasConnected(true);
        setSessionEnded(false);
        if (newSessionRef.current) {
          termActionsRef.current.clear();
          newSessionRef.current = false;
        }
        const { cols, rows } = termActionsRef.current.fit();
        wsActionsRef.current.sendResize(cols, rows);
        termActionsRef.current.focus();
      },
      onSessionEnded: () => setSessionEnded(true),
    });

  useEffect(() => {
    termActionsRef.current = { write, clear, fit, focus };
    wsActionsRef.current = { sendStdin, sendResize };
  });

  const handleNewSession = useCallback(() => {
    newSessionRef.current = true;
    setSessionEnded(false);
    reconnect();
  }, [reconnect]);

  const ready = isReady && hasConnected;

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ backgroundColor: '#1e1f29' }}
    >
      <TerminalContainer
        ref={terminalRef}
        className={cn(
          'transition-opacity duration-150',
          ready ? 'opacity-100' : 'opacity-0',
        )}
      />

      <div
        className={cn(
          'absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 transition-opacity duration-150',
          ready ? 'pointer-events-none opacity-0' : 'opacity-100',
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

      {ready && status === 'connected' && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 z-10 h-auto w-auto p-1.5 text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-800 hover:text-zinc-300 hover:opacity-100 focus:opacity-100"
          onClick={sendKillSession}
          aria-label="세션 종료"
        >
          <Power className="h-4 w-4" />
        </Button>
      )}

      {ready && (
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
