import { useEffect, useRef } from 'react';
import useTabStore from '@/hooks/use-tab-store';
import type { TClaudeProcess } from '@/hooks/use-tab-store';
import type { TCliState, TSessionStatus, TTimelineConnectionStatus } from '@/types/timeline';

interface ITimelineStoreSyncOptions {
  tabId: string | undefined;
  sessionStatus: TSessionStatus;
  cliState: TCliState;
  isTimelineLoading: boolean;
  wsStatus: TTimelineConnectionStatus;
  sessionsCount: number;
  claudeProcess: TClaudeProcess;
  retrySession: () => void;
}

const useTimelineStoreSync = ({
  tabId,
  sessionStatus,
  cliState,
  isTimelineLoading,
  wsStatus,
  sessionsCount,
  claudeProcess,
  retrySession,
}: ITimelineStoreSyncOptions) => {
  useEffect(() => {
    if (!tabId) return;
    useTabStore.getState().setSessionStatus(tabId, sessionStatus);
  }, [tabId, sessionStatus]);

  useEffect(() => {
    if (!tabId) return;
    useTabStore.getState().setCliState(tabId, cliState);
  }, [tabId, cliState]);

  useEffect(() => {
    if (!tabId) return;
    useTabStore.getState().setTimelineLoading(tabId, isTimelineLoading);
  }, [tabId, isTimelineLoading]);

  useEffect(() => {
    if (!tabId) return;
    useTabStore.getState().setTimelineWsStatus(tabId, wsStatus);
  }, [tabId, wsStatus]);

  useEffect(() => {
    if (!tabId) return;
    useTabStore.getState().setHasSessions(tabId, sessionsCount > 0);
  }, [tabId, sessionsCount]);

  const prevClaudeProcessRef = useRef(claudeProcess);

  useEffect(() => {
    const prev = prevClaudeProcessRef.current;
    prevClaudeProcessRef.current = claudeProcess;

    if (prev !== 'running' && claudeProcess === 'running' && sessionStatus !== 'active') {
      retrySession();
    }
  }, [claudeProcess, sessionStatus, retrySession]);
};

export default useTimelineStoreSync;
