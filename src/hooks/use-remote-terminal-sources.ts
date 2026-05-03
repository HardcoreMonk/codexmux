import { useCallback, useEffect, useState } from 'react';
import type { IRemoteTerminalStatus } from '@/types/remote-terminal';

interface IUseRemoteTerminalSourcesOptions {
  enabled: boolean;
}

interface IUseRemoteTerminalSourcesReturn {
  terminals: IRemoteTerminalStatus[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const useRemoteTerminalSources = ({
  enabled,
}: IUseRemoteTerminalSourcesOptions): IUseRemoteTerminalSourcesReturn => {
  const [terminals, setTerminals] = useState<IRemoteTerminalStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSources = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/remote/terminal/sources');
      if (!res.ok) throw new Error('Windows terminal 상태를 불러올 수 없습니다');
      const data = await res.json();
      setTerminals(Array.isArray(data.terminals) ? data.terminals : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Windows terminal 상태를 불러올 수 없습니다');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      fetchSources();
    }
  }, [enabled, fetchSources]);

  return {
    terminals,
    isLoading,
    error,
    refetch: fetchSources,
  };
};

export default useRemoteTerminalSources;
