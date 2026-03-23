import { useState, useEffect, useCallback } from 'react';

interface ITmuxInfo {
  cwd: string | null;
  command: string | null;
  lastCommand: string | null;
  pid: number | null;
  width: number | null;
  height: number | null;
  sessionCreated: number | null;
  sessionName: string;
}

const useTmuxInfo = (sessionName: string, enabled: boolean) => {
  const [info, setInfo] = useState<ITmuxInfo | null>(null);

  const fetchInfo = useCallback(async () => {
    if (!sessionName) return;
    try {
      const res = await fetch(`/api/tmux/info?session=${encodeURIComponent(sessionName)}`);
      if (!res.ok) return;
      const data = await res.json();
      setInfo(data);
    } catch {
      // ignore
    }
  }, [sessionName]);

  useEffect(() => {
    if (!enabled) return;
    fetchInfo();
  }, [enabled, fetchInfo]);

  return info;
};

export default useTmuxInfo;
