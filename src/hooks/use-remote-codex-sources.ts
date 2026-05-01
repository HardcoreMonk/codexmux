import { useCallback, useEffect, useState } from 'react';
import type { IRemoteCodexSourceStatus } from '@/types/timeline';

interface IUseRemoteCodexSourcesOptions {
  enabled: boolean;
}

interface IUseRemoteCodexSourcesReturn {
  sources: IRemoteCodexSourceStatus[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const useRemoteCodexSources = ({
  enabled,
}: IUseRemoteCodexSourcesOptions): IUseRemoteCodexSourcesReturn => {
  const [sources, setSources] = useState<IRemoteCodexSourceStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSources = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/remote/codex/sources');
      if (!res.ok) throw new Error('Windows source 상태를 불러올 수 없습니다');
      const data = await res.json();
      setSources(Array.isArray(data.sources) ? data.sources : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Windows source 상태를 불러올 수 없습니다');
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
    sources,
    isLoading,
    error,
    refetch: fetchSources,
  };
};

export default useRemoteCodexSources;
