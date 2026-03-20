import { useState, useEffect, useRef } from 'react';

interface ISessionInfo {
  command: string;
  cwd: string;
}

const SHELL_NAMES = new Set(['zsh', 'bash', 'fish', 'sh', 'dash', 'ksh', 'tcsh', 'csh', 'nu', 'elvish', 'xonsh']);
const POLL_INTERVAL = 2000;

const formatTitle = (info: ISessionInfo, homePath?: string): string => {
  if (SHELL_NAMES.has(info.command)) {
    if (homePath && info.cwd === homePath) return '~';
    const parts = info.cwd.split('/');
    const last = parts[parts.length - 1];
    return last || '/';
  }
  return info.command;
};

const useTabTitles = (sessions: string[]) => {
  const [titles, setTitles] = useState<Record<string, string>>({});
  const sessionsRef = useRef(sessions);
  const mountedRef = useRef(true);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    mountedRef.current = true;

    const poll = async () => {
      const currentSessions = sessionsRef.current;
      if (currentSessions.length === 0) return;

      try {
        const res = await fetch('/api/layout/tab-titles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessions: currentSessions }),
        });
        if (!res.ok || !mountedRef.current) return;
        const { titles: data, homePath } = await res.json() as {
          titles: Record<string, ISessionInfo>;
          homePath: string;
        };

        if (!mountedRef.current) return;

        const newTitles: Record<string, string> = {};
        for (const [session, info] of Object.entries(data)) {
          newTitles[session] = formatTitle(info, homePath);
        }
        setTitles(newTitles);
      } catch {
        // ignore
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  return titles;
};

export default useTabTitles;
