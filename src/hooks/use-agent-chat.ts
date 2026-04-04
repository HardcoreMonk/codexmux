import { useEffect, useReducer, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import useAgentStore from '@/hooks/use-agent-store';
import type {
  IChatMessage,
  IChatHistoryResponse,
  ISendMessageResponse,
  TAgentServerMessage,
} from '@/types/agent';

interface IChatState {
  messages: IChatMessage[];
  sessionId: string;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  isSending: boolean;
  isAtBottom: boolean;
  isConnected: boolean;
  connectionError: boolean;
  loadError: boolean;
  failedMessageIds: Set<string>;
}

type TChatAction =
  | { type: 'INIT_START' }
  | { type: 'INIT_SUCCESS'; payload: IChatHistoryResponse }
  | { type: 'INIT_ERROR' }
  | { type: 'LOAD_MORE_START' }
  | { type: 'LOAD_MORE_SUCCESS'; payload: { messages: IChatMessage[]; hasMore: boolean } }
  | { type: 'LOAD_MORE_ERROR' }
  | { type: 'ADD_OPTIMISTIC'; payload: IChatMessage }
  | { type: 'SEND_SUCCESS'; payload: { tempId: string; realId: string; status: 'sent' | 'queued' } }
  | { type: 'SEND_FAILURE'; payload: { tempId: string } }
  | { type: 'RECEIVE_MESSAGE'; payload: IChatMessage }
  | { type: 'SET_AT_BOTTOM'; payload: boolean }
  | { type: 'SET_CONNECTED'; payload: boolean }
  | { type: 'SET_CONNECTION_ERROR'; payload: boolean }
  | { type: 'SET_SENDING'; payload: boolean }
  | { type: 'REMOVE_FAILED'; payload: string }
  | { type: 'SYNC_MESSAGES'; payload: IChatHistoryResponse };

const initialState: IChatState = {
  messages: [],
  sessionId: '',
  hasMore: false,
  isLoading: true,
  isLoadingMore: false,
  isSending: false,
  isAtBottom: true,
  isConnected: false,
  connectionError: false,
  loadError: false,
  failedMessageIds: new Set(),
};

const chatReducer = (state: IChatState, action: TChatAction): IChatState => {
  switch (action.type) {
    case 'INIT_START':
      return { ...state, isLoading: true };
    case 'INIT_SUCCESS':
      return {
        ...state,
        isLoading: false,
        loadError: false,
        messages: action.payload.messages,
        sessionId: action.payload.sessionId,
        hasMore: action.payload.hasMore,
      };
    case 'INIT_ERROR':
      return { ...state, isLoading: false, loadError: true };
    case 'LOAD_MORE_START':
      return { ...state, isLoadingMore: true };
    case 'LOAD_MORE_SUCCESS':
      return {
        ...state,
        isLoadingMore: false,
        messages: [...action.payload.messages, ...state.messages],
        hasMore: action.payload.hasMore,
      };
    case 'LOAD_MORE_ERROR':
      return { ...state, isLoadingMore: false };
    case 'ADD_OPTIMISTIC':
      return {
        ...state,
        isSending: true,
        messages: [...state.messages, action.payload],
      };
    case 'SEND_SUCCESS': {
      const updated = state.messages.map((m) =>
        m.id === action.payload.tempId
          ? { ...m, id: action.payload.realId, metadata: action.payload.status === 'queued' ? { queued: true } : m.metadata }
          : m,
      );
      return { ...state, isSending: false, messages: updated };
    }
    case 'SEND_FAILURE': {
      const failed = new Set(state.failedMessageIds);
      failed.add(action.payload.tempId);
      return { ...state, isSending: false, failedMessageIds: failed };
    }
    case 'RECEIVE_MESSAGE': {
      const exists = state.messages.some((m) => m.id === action.payload.id);
      if (exists) return state;
      return { ...state, messages: [...state.messages, action.payload] };
    }
    case 'SET_AT_BOTTOM':
      return { ...state, isAtBottom: action.payload };
    case 'SET_CONNECTED':
      return { ...state, isConnected: action.payload, connectionError: false };
    case 'SET_CONNECTION_ERROR':
      return { ...state, connectionError: action.payload, isConnected: false };
    case 'SET_SENDING':
      return { ...state, isSending: action.payload };
    case 'REMOVE_FAILED': {
      const next = new Set(state.failedMessageIds);
      next.delete(action.payload);
      return {
        ...state,
        failedMessageIds: next,
        messages: state.messages.filter((m) => m.id !== action.payload),
      };
    }
    case 'SYNC_MESSAGES': {
      const existingIds = new Set(state.messages.map((m) => m.id));
      const newMessages = action.payload.messages.filter((m) => !existingIds.has(m.id));
      if (newMessages.length === 0) return state;
      return { ...state, messages: [...state.messages, ...newMessages] };
    }
    default:
      return state;
  }
};

const RECONNECT_DELAY = 3000;
const MAX_RETRIES = 5;

const useAgentChat = (agentId: string) => {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  const retriesRef = useRef(0);
  const sendingRef = useRef(false);

  const fetchHistory = useCallback(async () => {
    dispatch({ type: 'INIT_START' });
    try {
      const res = await fetch(`/api/agent/${agentId}/chat`);
      if (!res.ok) throw new Error();
      const data: IChatHistoryResponse = await res.json();
      dispatch({ type: 'INIT_SUCCESS', payload: data });
    } catch {
      dispatch({ type: 'INIT_ERROR' });
      toast.error('채팅 이력을 불러올 수 없습니다');
    }
  }, [agentId]);

  const loadMore = useCallback(async () => {
    if (state.isLoadingMore || !state.hasMore || state.messages.length === 0) return;
    dispatch({ type: 'LOAD_MORE_START' });
    const oldestId = state.messages[0].id;
    try {
      const res = await fetch(
        `/api/agent/${agentId}/chat?before=${oldestId}&sessionId=${state.sessionId}`,
      );
      if (!res.ok) throw new Error();
      const data: IChatHistoryResponse = await res.json();
      dispatch({
        type: 'LOAD_MORE_SUCCESS',
        payload: { messages: data.messages, hasMore: data.hasMore },
      });
    } catch {
      dispatch({ type: 'LOAD_MORE_ERROR' });
    }
  }, [agentId, state.isLoadingMore, state.hasMore, state.messages, state.sessionId]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (sendingRef.current || !content.trim()) return;
      sendingRef.current = true;

      const tempId = `temp-${Date.now()}`;
      const optimistic: IChatMessage = {
        id: tempId,
        timestamp: new Date().toISOString(),
        role: 'user',
        type: 'text',
        content: content.trim(),
      };
      dispatch({ type: 'ADD_OPTIMISTIC', payload: optimistic });

      try {
        const res = await fetch(`/api/agent/${agentId}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: content.trim() }),
        });
        if (!res.ok) throw new Error();
        const data: ISendMessageResponse = await res.json();
        dispatch({
          type: 'SEND_SUCCESS',
          payload: { tempId, realId: data.id, status: data.status },
        });
      } catch {
        dispatch({ type: 'SEND_FAILURE', payload: { tempId } });
        toast.error('메시지 전송에 실패했습니다');
      } finally {
        sendingRef.current = false;
      }
    },
    [agentId],
  );

  const resendMessage = useCallback(
    async (messageId: string) => {
      const msg = state.messages.find((m) => m.id === messageId);
      if (!msg) return;
      dispatch({ type: 'REMOVE_FAILED', payload: messageId });
      await sendMessage(msg.content);
    },
    [state.messages, sendMessage],
  );

  const setAtBottom = useCallback((val: boolean) => {
    dispatch({ type: 'SET_AT_BOTTOM', payload: val });
  }, []);

  // WebSocket connection
  useEffect(() => {
    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current) return;
      if (retriesRef.current >= MAX_RETRIES) {
        dispatch({ type: 'SET_CONNECTION_ERROR', payload: true });
        return;
      }

      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${location.host}/api/agent-status`);
      wsRef.current = ws;

      ws.onopen = () => {
        retriesRef.current = 0;
        dispatch({ type: 'SET_CONNECTED', payload: true });
      };

      ws.onmessage = (event) => {
        try {
          const data: TAgentServerMessage = JSON.parse(event.data);

          if (data.type === 'agent:sync') {
            useAgentStore.getState().syncFromServer(data.agents);
          }

          if (data.type === 'agent:status') {
            useAgentStore.getState().updateStatus(data.agentId, data.status);
          }

          if (data.type === 'agent:message' && data.agentId === agentId) {
            dispatch({ type: 'RECEIVE_MESSAGE', payload: data.message });
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        dispatch({ type: 'SET_CONNECTED', payload: false });
        if (mountedRef.current) {
          retriesRef.current += 1;
          timerRef.current = setTimeout(connect, RECONNECT_DELAY);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [agentId]);

  // Fetch initial history
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Re-sync on reconnect
  useEffect(() => {
    if (state.isConnected && !state.isLoading && state.sessionId) {
      const syncMissed = async () => {
        try {
          const res = await fetch(`/api/agent/${agentId}/chat?sessionId=${state.sessionId}`);
          if (!res.ok) return;
          const data: IChatHistoryResponse = await res.json();
          dispatch({ type: 'SYNC_MESSAGES', payload: data });
        } catch {
          // silent
        }
      };
      syncMissed();
    }
  }, [state.isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    messages: state.messages,
    hasMore: state.hasMore,
    isLoading: state.isLoading,
    isLoadingMore: state.isLoadingMore,
    isSending: state.isSending,
    isAtBottom: state.isAtBottom,
    isConnected: state.isConnected,
    connectionError: state.connectionError,
    loadError: state.loadError,
    failedMessageIds: state.failedMessageIds,
    sendMessage,
    resendMessage,
    loadMore,
    setAtBottom,
    fetchHistory,
  };
};

export default useAgentChat;
