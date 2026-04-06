import { ChevronDown, Plus, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { IAgentInfo, TAgentStatus } from '@/types/agent';

interface IChatHeaderProps {
  agent: IAgentInfo | null;
  onSettingsClick: () => void;
  agents?: IAgentInfo[];
  onCreateClick?: () => void;
  onAgentSelect?: (agentId: string) => void;
}

const statusConfig: Record<TAgentStatus, { className: string; labelKey: string }> = {
  idle: { className: 'bg-muted-foreground/20', labelKey: 'statusIdle' },
  working: { className: 'bg-ui-teal animate-pulse', labelKey: 'statusWorking' },
  blocked: { className: 'bg-ui-amber animate-pulse', labelKey: 'statusBlocked' },
  offline: { className: 'bg-muted-foreground/10', labelKey: 'statusOffline' },
};

const AgentAvatar = ({ agent, size = 'sm' }: { agent: IAgentInfo; size?: 'sm' | 'default' }) => (
  <Avatar size={size}>
    {agent.avatar && <AvatarImage src={agent.avatar} alt={agent.name} />}
    <AvatarFallback>{agent.name[0]?.toUpperCase()}</AvatarFallback>
  </Avatar>
);

const ChatHeader = ({ agent, onSettingsClick, agents, onCreateClick, onAgentSelect }: IChatHeaderProps) => {
  const t = useTranslations('agent');
  if (!agent) return null;

  const status = statusConfig[agent.status];
  const statusLabel = t(status.labelKey);
  const otherAgents = agents?.filter((a) => a.id !== agent.id) ?? [];
  const hasSelector = otherAgents.length > 0 && onAgentSelect;

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
      <AgentAvatar agent={agent} />

      <div className="flex min-w-0 flex-1 items-center gap-2">
        {hasSelector ? (
          <Popover>
            <PopoverTrigger
              render={
                <button className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-accent" />
              }
            >
              <span className="truncate text-sm font-medium">{agent.name}</span>
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={6} className="w-56 p-1">
              {otherAgents.map((a) => {
                const s = statusConfig[a.status];
                return (
                  <button
                    key={a.id}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                    onClick={() => onAgentSelect(a.id)}
                  >
                    <AgentAvatar agent={a} size="sm" />
                    <span className="truncate font-medium">{a.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{t(s.labelKey)}</span>
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        ) : (
          <span className="truncate text-sm font-medium">{agent.name}</span>
        )}

        {agent.status !== 'idle' && (
          agent.status === 'working' ? (
            <div className="flex shrink-0 items-center gap-1">
              <span className="text-xs text-ui-teal">{t('statusTyping')}</span>
              <span className="flex gap-[2px]">
                <span className="typing-dot h-[3px] w-[3px] rounded-full bg-ui-teal" />
                <span className="typing-dot h-[3px] w-[3px] rounded-full bg-ui-teal" />
                <span className="typing-dot h-[3px] w-[3px] rounded-full bg-ui-teal" />
              </span>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-1.5">
              <span
                className={cn('inline-block h-1.5 w-1.5 rounded-full', status.className)}
                aria-label={t('statusLabel', { label: statusLabel })}
              />
              <span className="text-xs text-muted-foreground">{statusLabel}</span>
            </div>
          )
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {onCreateClick && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onCreateClick}
            aria-label={t('createAgent')}
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onSettingsClick}
          aria-label={t('agentSettings')}
        >
          <Settings className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
};

export default ChatHeader;
