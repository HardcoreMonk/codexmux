import { ChevronDown, Plus, Settings } from 'lucide-react';
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

const statusConfig: Record<TAgentStatus, { className: string; label: string }> = {
  idle: { className: 'bg-muted-foreground/20', label: '대기 중' },
  working: { className: 'bg-ui-teal animate-pulse', label: '작업 중' },
  blocked: { className: 'bg-ui-amber animate-pulse', label: '응답 대기' },
  offline: { className: 'bg-muted-foreground/10', label: '오프라인' },
};

const AgentAvatar = ({ agent, size = 'sm' }: { agent: IAgentInfo; size?: 'sm' | 'default' }) => (
  <Avatar size={size}>
    {agent.avatar && <AvatarImage src={agent.avatar} alt={agent.name} />}
    <AvatarFallback>{agent.name[0]?.toUpperCase()}</AvatarFallback>
  </Avatar>
);

const ChatHeader = ({ agent, onSettingsClick, agents, onCreateClick, onAgentSelect }: IChatHeaderProps) => {
  if (!agent) return null;

  const status = statusConfig[agent.status];
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
                    <span className="ml-auto text-xs text-muted-foreground">{s.label}</span>
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
              <span className="text-xs text-ui-teal">입력중</span>
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
                aria-label={`상태: ${status.label}`}
              />
              <span className="text-xs text-muted-foreground">{status.label}</span>
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
            aria-label="새 에이전트 만들기"
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onSettingsClick}
          aria-label="에이전트 설정"
        >
          <Settings className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
};

export default ChatHeader;
