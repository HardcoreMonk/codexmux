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
  if (status === 'idle') return null;
  if (status === 'needs-attention' && isActive) return null;

  if (status === 'busy') {
    return (
      <>
        <Loader2
          className="h-3 w-3 shrink-0 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
        <span className="sr-only">처리 중,</span>
      </>
    );
  }

  return (
    <>
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-ui-red"
        aria-hidden="true"
      />
      <span className="sr-only">확인 필요,</span>
    </>
  );
};

export default TabStatusIndicator;
