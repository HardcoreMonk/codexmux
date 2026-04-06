import { useRouter } from 'next/router';
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { IAgentTab } from '@/types/agent';

interface IAgentTabItemProps {
  tab: IAgentTab;
  workspaceId: string;
  agentId: string;
}

const statusIcon: Record<IAgentTab['status'], React.ReactNode> = {
  running: (
    <span className="flex h-3.5 w-3.5 items-center justify-center">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ui-teal" />
    </span>
  ),
  completed: <CheckCircle2 size={14} className="text-positive" />,
  idle: (
    <span className="inline-block h-3.5 w-3.5 rounded-full border border-muted-foreground/40" />
  ),
  failed: <XCircle size={14} className="text-negative" />,
};

const AgentTabItem = ({ tab, workspaceId, agentId }: IAgentTabItemProps) => {
  const t = useTranslations('agent');
  const router = useRouter();

  const handleView = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      router.push(`/?workspace=${workspaceId}&tab=${tab.tabId}&observe=true&agentId=${agentId}`);
    },
    [router, workspaceId, tab.tabId, agentId],
  );

  return (
    <div className="flex items-center gap-2 rounded px-2 py-2 hover:bg-muted/50">
      <span className="flex-shrink-0">{statusIcon[tab.status]}</span>
      <span className="flex-1 text-sm">{tab.taskTitle ?? tab.tabName}</span>
      <span className="text-xs text-muted-foreground">{tab.tabName}</span>
      {tab.status === 'running' && (
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleView}>
          {t('viewTab')}
        </Button>
      )}
    </div>
  );
};

export default AgentTabItem;
