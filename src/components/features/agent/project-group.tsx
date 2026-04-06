import { useRouter } from 'next/router';
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Folder } from 'lucide-react';
import AgentTabItem from '@/components/features/agent/agent-tab-item';
import type { IProjectGroup } from '@/types/agent';

interface IProjectGroupProps {
  group: IProjectGroup;
  agentId: string;
}

const ProjectGroup = ({ group, agentId }: IProjectGroupProps) => {
  const t = useTranslations('agent');
  const router = useRouter();

  const handleWorkspaceClick = useCallback(() => {
    router.push(`/?workspace=${group.workspaceId}`);
  }, [router, group.workspaceId]);

  return (
    <div
      className="mb-3 rounded-lg border p-3"
      role="region"
      aria-label={t('tabListAria', { name: group.workspaceName })}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <Folder size={14} className="text-muted-foreground" />
        {group.workspaceName}
        <button
          type="button"
          className="ml-auto text-xs text-ui-blue hover:underline"
          onClick={handleWorkspaceClick}
        >
          {t('openWorkspace')}
        </button>
      </div>

      <div className="mt-2" role="list">
        {group.tabs.map((tab) => (
          <AgentTabItem
            key={tab.tabId}
            tab={tab}
            workspaceId={group.workspaceId}
            agentId={agentId}
          />
        ))}
      </div>
    </div>
  );
};

export default ProjectGroup;
