import { cn } from '@/lib/utils';
import MissionProgress from '@/components/features/agent/mission-progress';
import TaskTree from '@/components/features/agent/task-tree';
import type { IMission, TMissionStatus } from '@/types/mission';

interface IMissionCardProps {
  mission: IMission;
  agentId: string;
  defaultExpanded?: boolean;
}

const statusBadge: Record<TMissionStatus, { label: string; className: string }> = {
  pending: { label: '대기', className: 'text-muted-foreground' },
  running: { label: '진행 중', className: 'text-ui-teal' },
  blocked: { label: '차단됨', className: 'text-ui-amber' },
  completed: { label: '완료', className: 'text-positive' },
  failed: { label: '실패', className: 'text-negative' },
};

const MissionCard = ({ mission, agentId, defaultExpanded = true }: IMissionCardProps) => {
  const badge = statusBadge[mission.status];

  return (
    <div className="rounded-lg border p-4 mb-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{mission.title}</span>
        <span className={cn('ml-auto text-xs', badge.className)}>{badge.label}</span>
      </div>

      <div className="mt-2">
        <MissionProgress tasks={mission.tasks} status={mission.status} />
      </div>

      {defaultExpanded && (
        <TaskTree
          tasks={mission.tasks}
          agentId={agentId}
          missionId={mission.id}
          collapsible
        />
      )}
    </div>
  );
};

export default MissionCard;
