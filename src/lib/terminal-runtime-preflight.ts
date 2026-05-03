import type { TDisconnectReason } from '@/types/terminal';
import type { TTerminalWebSocketEndpoint } from '@/lib/terminal-websocket-url';

type TPreflightFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ITerminalRuntimePreflightOptions {
  endpoint: TTerminalWebSocketEndpoint;
  fetcher?: TPreflightFetch;
}

export interface ITerminalRuntimePreflightResult {
  ok: boolean;
  reason?: Extract<TDisconnectReason, 'runtime-v2-disabled'>;
}

export const preflightTerminalRuntime = async ({
  endpoint,
  fetcher = fetch,
}: ITerminalRuntimePreflightOptions): Promise<ITerminalRuntimePreflightResult> => {
  if (endpoint !== '/api/v2/terminal') return { ok: true };

  try {
    const res = await fetcher('/api/v2/runtime/health', {
      headers: { Accept: 'application/json' },
    });
    const body = await res.json().catch(() => null) as { error?: unknown } | null;
    if (res.status === 404 && body?.error === 'runtime-v2-disabled') {
      return { ok: false, reason: 'runtime-v2-disabled' };
    }
    if (res.status === 200 && (body as { terminalV2Mode?: unknown } | null)?.terminalV2Mode === 'off') {
      return { ok: false, reason: 'runtime-v2-disabled' };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
};
