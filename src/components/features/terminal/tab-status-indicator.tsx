import { Loader2 } from 'lucide-react';
import useClaudeStatusStore, { getTabStatus } from '@/hooks/use-claude-status-store';
import type { TPanelType } from '@/types/terminal';

interface ITabStatusIndicatorProps {
  tabId: string;
  isActive: boolean;
  panelType?: TPanelType;
}

const TabStatusIndicator = ({ tabId, isActive, panelType }: ITabStatusIndicatorProps) => {
  const status = useClaudeStatusStore(
    (state) => getTabStatus(state.tabs, tabId),
  );

  if (panelType !== 'claude-code') return null;

  const visible = status !== 'idle';

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden transition-all duration-200 ease-in-out"
      style={{
        width: visible ? 12 : 0,
        marginRight: visible ? 0 : -6,
        opacity: visible ? 1 : 0,
      }}
    >
      {status === 'busy' ? (
        <Loader2
          className="h-3 w-3 shrink-0 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      ) : status === 'needs-attention' ? (
        <span
          className="h-2 w-2 shrink-0 rounded-full bg-ui-purple"
          aria-hidden="true"
        />
      ) : null}
      {visible && <span className="sr-only">{status === 'busy' ? '처리 중,' : '확인 필요,'}</span>}
    </span>
  );
};

export default TabStatusIndicator;
