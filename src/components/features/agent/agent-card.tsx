import { Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import useAgentStore from '@/hooks/use-agent-store';
import type { IAgentInfo, TAgentStatus } from '@/types/agent';

interface IAgentCardProps {
  agent: IAgentInfo;
  onClick: () => void;
  onSettingsClick: () => void;
  isFadingOut?: boolean;
}

const statusConfig: Record<TAgentStatus, { className: string; labelKey: string }> = {
  idle: { className: 'bg-muted-foreground/20', labelKey: 'statusIdle' },
  working: { className: 'bg-ui-teal animate-pulse', labelKey: 'statusWorking' },
  blocked: { className: 'bg-ui-amber animate-pulse', labelKey: 'statusBlockedCard' },
  offline: { className: 'bg-muted-foreground/10', labelKey: 'statusOffline' },
};

const AgentCard = ({ agent, onClick, onSettingsClick, isFadingOut }: IAgentCardProps) => {
  const t = useTranslations('agent');
  const hasUnread = useAgentStore((s) => s.unreadAgentIds.has(agent.id));
  const status = statusConfig[agent.status];
  const statusLabel = t(status.labelKey);

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSettingsClick();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onClick();
  };

  return (
    <div
      role="listitem"
      tabIndex={0}
      className={`group relative cursor-pointer rounded-lg border p-4 transition-all duration-200 hover:border-foreground/30${isFadingOut ? ' scale-95 opacity-0' : ''}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${status.className}`}
            aria-label={t('statusLabel', { label: statusLabel })}
          />
          <span className="text-sm font-medium">{agent.name}</span>
          {hasUnread && (
            <span className="h-1.5 w-1.5 rounded-full bg-ui-teal" />
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          className="opacity-0 transition-opacity group-hover:opacity-100"
          onClick={handleSettingsClick}
          aria-label={t('agentSettings')}
        >
          <Settings className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>

      {agent.role && (
        <p className="mt-0.5 text-xs text-muted-foreground">{agent.role}</p>
      )}

    </div>
  );
};

export default AgentCard;
