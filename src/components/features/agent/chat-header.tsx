import { useRouter } from 'next/router';
import { ArrowLeft, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { IAgentInfo, TAgentStatus } from '@/types/agent';

interface IChatHeaderProps {
  agent: IAgentInfo | null;
  onSettingsClick: () => void;
  onBack?: () => void;
}

const statusConfig: Record<TAgentStatus, { className: string; label: string }> = {
  idle: { className: 'bg-muted-foreground/20', label: '대기 중' },
  working: { className: 'bg-ui-teal animate-pulse', label: '작업 중' },
  blocked: { className: 'bg-ui-amber animate-pulse', label: '응답 대기' },
  offline: { className: 'bg-muted-foreground/10', label: '오프라인' },
};

const ChatHeader = ({ agent, onSettingsClick, onBack }: IChatHeaderProps) => {
  const router = useRouter();

  if (!agent) return null;

  const status = statusConfig[agent.status];

  return (
    <div className="flex items-center gap-3 border-b px-4 py-3">
      <Button
        variant="ghost"
        size="icon"
        onClick={onBack ?? (() => router.push('/agents'))}
        aria-label="에이전트 목록으로 돌아가기"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <div className="flex flex-col">
        <span className="text-sm font-medium">{agent.name}</span>
        <span className="text-[10px] text-muted-foreground">{agent.role}</span>
      </div>

      <div className="flex items-center gap-1.5">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${status.className}`}
          aria-label={`상태: ${status.label}`}
        />
        <span className="text-xs text-muted-foreground">{status.label}</span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onSettingsClick}
          aria-label="에이전트 설정"
        >
          <Settings className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
};

export default ChatHeader;
