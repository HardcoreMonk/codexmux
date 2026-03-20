import dayjs from 'dayjs';
import type { ITimelineAgentGroup } from '@/types/timeline';

interface IAgentGroupItemProps {
  entry: ITimelineAgentGroup;
}

const AgentGroupItem = ({ entry }: IAgentGroupItemProps) => (
  <div className="animate-in fade-in duration-150">
    <span className="text-xs text-muted-foreground">
      {dayjs(entry.timestamp).format('HH:mm')}
    </span>
    <div className="mt-1 rounded-md bg-muted/30 px-3 py-2 text-muted-foreground">
      <div className="text-sm">
        ▸ Agent: {entry.agentType} — {entry.description}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        ({entry.stepCount} 단계 완료)
      </div>
    </div>
  </div>
);

export default AgentGroupItem;
