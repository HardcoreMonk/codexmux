import { useState, useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';

interface IQuickPrompt {
  id: string;
  name: string;
  prompt: string;
  enabled: boolean;
}

interface IQuickPromptsData {
  builtins: IQuickPrompt[];
  custom: IQuickPrompt[];
}

interface IUseQuickPromptsReturn {
  prompts: IQuickPrompt[];
  builtinPrompts: IQuickPrompt[];
  customPrompts: IQuickPrompt[];
  isLoading: boolean;
  toggleBuiltin: (id: string, enabled: boolean) => Promise<void>;
  saveCustom: (prompts: IQuickPrompt[]) => Promise<void>;
  resetAll: () => Promise<void>;
}

const useQuickPrompts = (): IUseQuickPromptsReturn => {
  const [data, setData] = useState<IQuickPromptsData>({ builtins: [], custom: [] });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchPrompts = async () => {
      try {
        const res = await fetch('/api/quick-prompts');
        if (!res.ok) throw new Error('fetch failed');
        const result = await res.json();
        if (!cancelled) setData(result);
      } catch {
        // fallback handled by server
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchPrompts();
    return () => {
      cancelled = true;
    };
  }, []);

  const prompts = useMemo(
    () => [...data.builtins, ...data.custom].filter((p) => p.enabled),
    [data],
  );

  const persist = useCallback(async (builtins: IQuickPrompt[], custom: IQuickPrompt[]) => {
    const disabledBuiltinIds = builtins.filter((b) => !b.enabled).map((b) => b.id);
    try {
      const res = await fetch('/api/quick-prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom, disabledBuiltinIds }),
      });
      if (!res.ok) throw new Error('save failed');
    } catch {
      toast.error('설정을 저장할 수 없습니다');
    }
  }, []);

  const toggleBuiltin = useCallback(async (id: string, enabled: boolean) => {
    setData((prev) => {
      const nextBuiltins = prev.builtins.map((b) => (b.id === id ? { ...b, enabled } : b));
      persist(nextBuiltins, prev.custom);
      return { ...prev, builtins: nextBuiltins };
    });
  }, [persist]);

  const saveCustom = useCallback(async (custom: IQuickPrompt[]) => {
    setData((prev) => {
      persist(prev.builtins, custom);
      return { ...prev, custom };
    });
  }, [persist]);

  const resetAll = useCallback(async () => {
    setData((prev) => {
      const nextBuiltins = prev.builtins.map((b) => ({ ...b, enabled: true }));
      persist(nextBuiltins, []);
      return { builtins: nextBuiltins, custom: [] };
    });
  }, [persist]);

  return {
    prompts,
    builtinPrompts: data.builtins,
    customPrompts: data.custom,
    isLoading,
    toggleBuiltin,
    saveCustom,
    resetAll,
  };
};

export default useQuickPrompts;
export type { IQuickPrompt };
