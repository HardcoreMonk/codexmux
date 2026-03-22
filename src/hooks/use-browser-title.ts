import { useEffect, useMemo } from 'react';
import useClaudeStatusStore, { getGlobalStatus } from '@/hooks/use-claude-status-store';

const useBrowserTitle = (baseTitle: string) => {
  const tabs = useClaudeStatusStore((state) => state.tabs);
  const { attentionCount } = useMemo(() => getGlobalStatus(tabs), [tabs]);

  useEffect(() => {
    try {
      document.title = attentionCount > 0
        ? `(${attentionCount}) ${baseTitle}`
        : baseTitle;
    } catch {
      // non-critical
    }
  }, [attentionCount, baseTitle]);
};

export default useBrowserTitle;
