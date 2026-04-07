import { useEffect, useRef, useState } from 'react';
import type { IPreflightResult } from '@/types/preflight';

interface IUsePreflightOptions {
  onReady?: (status: IPreflightResult) => void;
}

interface IUsePreflight {
  status: IPreflightResult | null;
  checking: boolean;
  recheck: () => void;
}

export const usePreflight = (options?: IUsePreflightOptions): IUsePreflight => {
  const [status, setStatus] = useState<IPreflightResult | null>(null);
  const [checking, setChecking] = useState(true);
  const onReadyRef = useRef(options?.onReady);
  onReadyRef.current = options?.onReady;

  const recheck = async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/auth/preflight');
      const data: IPreflightResult = await res.json();
      setStatus(data);
      onReadyRef.current?.(data);
    } catch {
      // preflight 실패 시 null 유지
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    recheck();
  }, []);

  return { status, checking, recheck };
};
