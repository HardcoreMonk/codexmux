import { useState, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';
import TaskNode from '@/components/features/agent/task-node';
import type { ITask } from '@/types/mission';

interface ITaskTreeProps {
  tasks: ITask[];
  agentId: string;
  missionId: string;
  collapsible?: boolean;
}

const COLLAPSE_THRESHOLD = 20;

const TaskTree = ({ tasks, agentId, missionId, collapsible }: ITaskTreeProps) => {
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const shouldCollapse = collapsible && completedTasks.length >= COLLAPSE_THRESHOLD;

  const [completedExpanded, setCompletedExpanded] = useState(false);

  const toggleCompleted = useCallback(() => {
    setCompletedExpanded((prev) => !prev);
  }, []);

  if (!shouldCollapse) {
    return (
      <div className="ml-2 mt-3" role="tree">
        {tasks.map((task, idx) => (
          <TaskNode
            key={task.id}
            task={task}
            agentId={agentId}
            missionId={missionId}
            isLast={idx === tasks.length - 1}
          />
        ))}
      </div>
    );
  }

  const activeTasks = tasks.filter((t) => t.status !== 'completed');

  return (
    <div className="ml-2 mt-3" role="tree">
      {!completedExpanded && completedTasks.length > 0 && (
        <button
          type="button"
          className="flex items-center gap-1 py-1 text-sm text-muted-foreground hover:text-foreground"
          onClick={toggleCompleted}
        >
          <ChevronRight size={14} />
          완료된 Task ({completedTasks.length})
        </button>
      )}

      {completedExpanded && (
        <>
          <button
            type="button"
            className="flex items-center gap-1 py-1 text-sm text-muted-foreground hover:text-foreground"
            onClick={toggleCompleted}
          >
            <ChevronRight size={14} className="rotate-90 transition-transform" />
            완료된 Task ({completedTasks.length})
          </button>
          {completedTasks.map((task, idx) => (
            <TaskNode
              key={task.id}
              task={task}
              agentId={agentId}
              missionId={missionId}
              isLast={idx === completedTasks.length - 1 && activeTasks.length === 0}
            />
          ))}
        </>
      )}

      {activeTasks.map((task, idx) => (
        <TaskNode
          key={task.id}
          task={task}
          agentId={agentId}
          missionId={missionId}
          isLast={idx === activeTasks.length - 1}
        />
      ))}
    </div>
  );
};

export default TaskTree;
