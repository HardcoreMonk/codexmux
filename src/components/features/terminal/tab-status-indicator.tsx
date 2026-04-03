import { memo } from 'react';
import { Loader2 } from 'lucide-react';
import useTabStore, { selectTabDisplayStatus } from '@/hooks/use-tab-store';
import type { TPanelType } from '@/types/terminal';

interface ITabStatusIndicatorProps {
  tabId: string;
  panelType?: TPanelType;
}

const TabStatusIndicator = ({ tabId, panelType }: ITabStatusIndicatorProps) => {
  const status = useTabStore(
    (state) => selectTabDisplayStatus(state.tabs, tabId),
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
      ) : status === 'ready-for-review' || status === 'needs-input' ? (
        <span
          className="h-2 w-2 shrink-0 rounded-full bg-ui-purple animate-pulse"
          aria-hidden="true"
        />
      ) : null}
      {visible && <span className="sr-only">{status === 'busy' ? '처리 중,' : status === 'needs-input' ? '입력 대기,' : '확인 필요,'}</span>}
    </span>
  );
};

export default memo(TabStatusIndicator);
