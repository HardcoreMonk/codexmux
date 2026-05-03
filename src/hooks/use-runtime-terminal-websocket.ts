import useTerminalWebSocket from '@/hooks/use-terminal-websocket';

type TRuntimeTerminalWebSocketOptions = Parameters<typeof useTerminalWebSocket>[0];

const useRuntimeTerminalWebSocket = (options: TRuntimeTerminalWebSocketOptions = {}) =>
  useTerminalWebSocket({
    ...options,
    endpoint: '/api/v2/terminal',
  });

export default useRuntimeTerminalWebSocket;
