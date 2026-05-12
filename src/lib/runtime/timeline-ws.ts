import { WebSocket } from 'ws';
import { recordPerfCounter } from '@/lib/perf-metrics';
import type { IAgentProvider } from '@/lib/providers';
import type { IRuntimeTimelineSessionChangedEvent } from '@/lib/runtime/contracts';
import { getRuntimeSupervisor, type IRuntimeSupervisor } from '@/lib/runtime/supervisor';
import { subscribeTimelineSessionClaimRefresh } from '@/lib/timeline-server-state';
import type { ISessionInfo, TTimelineClientMessage, TTimelineServerMessage } from '@/types/timeline';

export interface IResolvedTimelineJsonl {
  jsonlPath: string;
  sessionId: string;
}

export interface IRuntimeTimelineConnectionInput {
  sessionName: string;
  panePid: number;
  panelType: string;
  provider: IAgentProvider;
  supervisor?: IRuntimeSupervisor;
  detectActiveSession?: () => Promise<ISessionInfo>;
  resolveInitialJsonl: (info: ISessionInfo) => Promise<IResolvedTimelineJsonl | null>;
  handleResume: (
    payload: { sessionId: string; tmuxSession: string },
  ) => Promise<IResolvedTimelineJsonl | null | void> | IResolvedTimelineJsonl | null | void;
  resolveClaimedJsonl?: (currentJsonlPath: string | null) => Promise<IResolvedTimelineJsonl | null>;
  updateTabAgentSessionId: (sessionId: string) => Promise<void> | void;
}

interface IRuntimeTimelineConnectionState {
  cleaned: boolean;
  liveSubscriberId: string | null;
  sessionWatchSubscriberId: string | null;
  currentJsonlPath: string | null;
  liveSubscribeGeneration: number;
}

const HEARTBEAT_INTERVAL = 30_000;
const HEARTBEAT_TIMEOUT = 90_000;
const CLAIM_REFRESH_DELAYS_MS = [0, 250, 750, 1500, 3000, 5000];

const sendJson = (ws: WebSocket, msg: TTimelineServerMessage): void => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
};

const closeRetryable = (ws: WebSocket, reason: string): void => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.close(1001, reason);
  }
};

export const handleRuntimeTimelineConnection = async (
  ws: WebSocket,
  input: IRuntimeTimelineConnectionInput,
): Promise<void> => {
  const supervisor = input.supervisor ?? getRuntimeSupervisor();
  const state: IRuntimeTimelineConnectionState = {
    cleaned: false,
    liveSubscriberId: null,
    sessionWatchSubscriberId: null,
    currentJsonlPath: null,
    liveSubscribeGeneration: 0,
  };
  let lastHeartbeat = Date.now();
  const claimRefreshTimers = new Set<ReturnType<typeof setTimeout>>();
  let unsubscribeClaimRefresh: (() => void) | null = null;
  let claimRefreshInFlight = false;

  const heartbeatTimer = setInterval(() => {
    if (Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT) {
      closeRetryable(ws, 'Heartbeat timeout');
      return;
    }
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, HEARTBEAT_INTERVAL);

  const cleanup = async (): Promise<void> => {
    if (state.cleaned) return;
    state.cleaned = true;
    clearInterval(heartbeatTimer);
    for (const timer of claimRefreshTimers) {
      clearTimeout(timer);
    }
    claimRefreshTimers.clear();
    unsubscribeClaimRefresh?.();
    unsubscribeClaimRefresh = null;
    const liveSubscriberId = state.liveSubscriberId;
    const sessionWatchSubscriberId = state.sessionWatchSubscriberId;
    state.liveSubscriberId = null;
    state.sessionWatchSubscriberId = null;
    state.currentJsonlPath = null;

    const unsubscribeLive = liveSubscriberId
      ? supervisor.unsubscribeTimelineLive(liveSubscriberId).catch(() => {
        recordPerfCounter('runtime_v2.timeline_ws.default.live_unsubscribe_error');
      })
      : Promise.resolve();
    const unsubscribeSessionWatch = sessionWatchSubscriberId
      ? supervisor.unsubscribeTimelineSessionWatch(sessionWatchSubscriberId).catch(() => {
        recordPerfCounter('runtime_v2.timeline_ws.default.session_watch_unsubscribe_error');
      })
      : Promise.resolve();

    await Promise.all([unsubscribeLive, unsubscribeSessionWatch]);
  };

  const subscribeLive = async (resolved: IResolvedTimelineJsonl): Promise<void> => {
    const generation = ++state.liveSubscribeGeneration;
    if (state.cleaned) return;

    const previousSubscriberId = state.liveSubscriberId;
    if (previousSubscriberId) {
      state.liveSubscriberId = null;
      await supervisor.unsubscribeTimelineLive(previousSubscriberId).catch(() => {
        recordPerfCounter('runtime_v2.timeline_ws.default.live_unsubscribe_error');
      });
    }
    if (state.cleaned || generation !== state.liveSubscribeGeneration) return;

    const result = await supervisor.subscribeTimelineLive({
      jsonlPath: resolved.jsonlPath,
      sessionName: input.sessionName,
      sessionId: resolved.sessionId,
      panelType: input.panelType,
      onAppend: (event) => {
        recordPerfCounter('runtime_v2.timeline_ws.default.append');
        sendJson(ws, { type: 'timeline:append', entries: event.entries });
      },
      onError: (event) => {
        recordPerfCounter('runtime_v2.timeline_ws.default.error');
        sendJson(ws, { type: 'timeline:error', code: event.code, message: event.message });
      },
    });
    if (state.cleaned || generation !== state.liveSubscribeGeneration) {
      await supervisor.unsubscribeTimelineLive(result.subscriberId).catch(() => {
        recordPerfCounter('runtime_v2.timeline_ws.default.live_unsubscribe_error');
      });
      return;
    }
    state.liveSubscriberId = result.subscriberId;
    state.currentJsonlPath = resolved.jsonlPath;
    recordPerfCounter('runtime_v2.timeline_ws.default.init');
    sendJson(ws, result.init);
    await input.updateTabAgentSessionId(result.init.sessionId);
  };

  const refreshClaimedJsonl = async (): Promise<void> => {
    if (state.cleaned || !input.resolveClaimedJsonl || claimRefreshInFlight) return;

    claimRefreshInFlight = true;
    try {
      const resolved = await input.resolveClaimedJsonl(state.currentJsonlPath);
      if (state.cleaned || !resolved || resolved.jsonlPath === state.currentJsonlPath) return;

      sendJson(ws, {
        type: 'timeline:session-changed',
        newSessionId: resolved.sessionId,
        reason: 'new-session-started',
      });
      recordPerfCounter('runtime_v2.timeline_ws.default.session_changed');
      await subscribeLive(resolved);
    } finally {
      claimRefreshInFlight = false;
    }
  };

  const scheduleClaimRefresh = (sessionName: string): void => {
    if (state.cleaned || sessionName !== input.sessionName || !input.resolveClaimedJsonl) return;

    for (const delayMs of CLAIM_REFRESH_DELAYS_MS) {
      const timer = setTimeout(() => {
        claimRefreshTimers.delete(timer);
        void refreshClaimedJsonl();
      }, delayMs);
      (timer as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.();
      claimRefreshTimers.add(timer);
    }
  };

  if (input.resolveClaimedJsonl) {
    unsubscribeClaimRefresh = subscribeTimelineSessionClaimRefresh(scheduleClaimRefresh);
  }

  const handleSessionChanged = async (event: IRuntimeTimelineSessionChangedEvent): Promise<void> => {
    if (state.cleaned) return;

    const { info } = event;
    const resolved = await input.resolveInitialJsonl(info);
    if (state.cleaned) return;

    if (resolved && resolved.jsonlPath !== state.currentJsonlPath) {
      sendJson(ws, {
        type: 'timeline:session-changed',
        newSessionId: resolved.sessionId,
        reason: 'new-session-started',
      });
      recordPerfCounter('runtime_v2.timeline_ws.default.session_changed');
      await subscribeLive(resolved);
      return;
    }

    if (info.status === 'running' && info.sessionId && !resolved) {
      sendJson(ws, {
        type: 'timeline:session-changed',
        newSessionId: info.sessionId,
        reason: 'session-waiting',
      });
      recordPerfCounter('runtime_v2.timeline_ws.default.session_changed');
    }
    if (info.status === 'not-running' && !resolved) {
      sendJson(ws, { type: 'timeline:session-changed', newSessionId: '', reason: 'session-ended' });
    }
  };

  const ensureSessionWatch = async (): Promise<void> => {
    if (state.cleaned || state.sessionWatchSubscriberId) return;
    const watch = await supervisor.subscribeTimelineSessionWatch({
      sessionName: input.sessionName,
      panePid: input.panePid,
      panelType: input.panelType,
      skipInitial: true,
      onChanged: (event) => {
        void handleSessionChanged(event);
      },
    });
    if (state.cleaned) {
      await supervisor.unsubscribeTimelineSessionWatch(watch.subscriberId).catch(() => {
        recordPerfCounter('runtime_v2.timeline_ws.default.session_watch_unsubscribe_error');
      });
      return;
    }
    state.sessionWatchSubscriberId = watch.subscriberId;
  };

  ws.on('pong', () => {
    lastHeartbeat = Date.now();
  });

  ws.on('message', (raw) => {
    void (async () => {
      try {
        const msg = JSON.parse(raw.toString()) as TTimelineClientMessage;
        if (msg.type === 'timeline:unsubscribe') {
          state.liveSubscribeGeneration++;
          const liveSubscriberId = state.liveSubscriberId;
          if (liveSubscriberId) {
            state.liveSubscriberId = null;
            state.currentJsonlPath = null;
            await supervisor.unsubscribeTimelineLive(liveSubscriberId);
          }
          return;
        }
        if (msg.type === 'timeline:subscribe' && msg.jsonlPath) {
          await subscribeLive({ jsonlPath: msg.jsonlPath, sessionId: '' });
          return;
        }
        if (msg.type === 'timeline:resume' && msg.sessionId && msg.tmuxSession) {
          const resolved = await input.handleResume({ sessionId: msg.sessionId, tmuxSession: msg.tmuxSession });
          if (resolved) {
            await subscribeLive(resolved);
          }
        }
      } catch {
        recordPerfCounter('runtime_v2.timeline_ws.default.message_error');
      }
    })();
  });

  ws.on('close', () => {
    void cleanup();
  });
  ws.on('error', () => {
    void cleanup();
  });

  try {
    const detectActiveSession = input.detectActiveSession ?? (() => input.provider.detectActiveSession(input.panePid));
    const info = await detectActiveSession();
    if (state.cleaned) return;

    if (info.status === 'not-installed') {
      sendJson(ws, {
        type: 'timeline:error',
        code: 'not-installed',
        message: `${input.provider.displayName} is not installed`,
      });
      sendJson(ws, {
        type: 'timeline:init',
        entries: [],
        sessionId: '',
        totalEntries: 0,
        startByteOffset: 0,
        hasMore: false,
      });
      return;
    }

    await ensureSessionWatch();
    if (state.cleaned) return;

    if (info.status === 'running' && info.sessionId) {
      sendJson(ws, {
        type: 'timeline:session-changed',
        newSessionId: info.sessionId,
        reason: 'session-waiting',
      });
    }

    const resolved = await input.resolveInitialJsonl(info);
    if (state.cleaned) return;

    if (resolved) {
      await subscribeLive(resolved);
    } else {
      sendJson(ws, {
        type: 'timeline:init',
        entries: [],
        sessionId: info.sessionId ?? '',
        totalEntries: 0,
        startByteOffset: 0,
        hasMore: false,
        isAgentStarting: info.status === 'starting',
      });
    }
    if (state.cleaned) return;
  } catch (err) {
    recordPerfCounter('runtime_v2.timeline_ws.default.start_error');
    sendJson(ws, {
      type: 'timeline:error',
      code: 'runtime-v2-timeline-start-failed',
      message: err instanceof Error ? err.message : 'Runtime v2 timeline start failed',
    });
    closeRetryable(ws, 'Runtime v2 timeline unavailable');
  }
};
