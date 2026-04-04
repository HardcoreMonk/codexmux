import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
const EXIT_DURATION = 300;

const EMPTY_SET = new Set<string>();

interface IExitSnapshot {
  order: string[];
  removed: Map<string, ITask>;
}

const useExitAnimation = (tasks: ITask[]) => {
  const prevTasksRef = useRef(tasks);
  const [snapshot, setSnapshot] = useState<IExitSnapshot | null>(null);

  useEffect(() => {
    const prev = prevTasksRef.current;
    prevTasksRef.current = tasks;

    const currentIds = new Set(tasks.map((t) => t.id));
    const removed = new Map<string, ITask>();

    for (const t of prev) {
      if (!currentIds.has(t.id)) removed.set(t.id, t);
    }

    if (removed.size === 0) {
      setSnapshot((s) => (s === null ? s : null));
      return;
    }

    setSnapshot({ order: prev.map((t) => t.id), removed });
    const timer = setTimeout(() => setSnapshot(null), EXIT_DURATION);
    return () => clearTimeout(timer);
  }, [tasks]);

  const mergedTasks = useMemo(() => {
    if (!snapshot) return tasks;

    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const merged: ITask[] = [];
    const seen = new Set<string>();

    for (const id of snapshot.order) {
      if (taskMap.has(id)) {
        merged.push(taskMap.get(id)!);
        seen.add(id);
      } else if (snapshot.removed.has(id)) {
        merged.push(snapshot.removed.get(id)!);
        seen.add(id);
      }
    }
    for (const t of tasks) {
      if (!seen.has(t.id)) merged.push(t);
    }
    return merged;
  }, [tasks, snapshot]);

  const exitingIds = useMemo(
    () => (snapshot ? new Set(snapshot.removed.keys()) : EMPTY_SET),
    [snapshot],
  );

  return { mergedTasks, exitingIds };
};

const TaskTree = ({ tasks, agentId, missionId, collapsible }: ITaskTreeProps) => {
  const { mergedTasks, exitingIds } = useExitAnimation(tasks);
  const completedTasks = mergedTasks.filter((t) => t.status === 'completed');
  const shouldCollapse = collapsible && completedTasks.length >= COLLAPSE_THRESHOLD;

  const [completedExpanded, setCompletedExpanded] = useState(false);

  const toggleCompleted = useCallback(() => {
    setCompletedExpanded((prev) => !prev);
  }, []);

  const exitClass = (id: string) =>
    exitingIds.has(id)
      ? 'opacity-0 transition-opacity duration-300'
      : 'opacity-100 transition-opacity duration-300';

  if (!shouldCollapse) {
    return (
      <div className="ml-2 mt-3" role="tree">
        {mergedTasks.map((task, idx) => (
          <div key={task.id} className={exitClass(task.id)}>
            <TaskNode
              task={task}
              agentId={agentId}
              missionId={missionId}
              isLast={idx === mergedTasks.length - 1}
            />
          </div>
        ))}
      </div>
    );
  }

  const activeTasks = mergedTasks.filter((t) => t.status !== 'completed');

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
            <div key={task.id} className={exitClass(task.id)}>
              <TaskNode
                task={task}
                agentId={agentId}
                missionId={missionId}
                isLast={idx === completedTasks.length - 1 && activeTasks.length === 0}
              />
            </div>
          ))}
        </>
      )}

      {activeTasks.map((task, idx) => (
        <div key={task.id} className={exitClass(task.id)}>
          <TaskNode
            task={task}
            agentId={agentId}
            missionId={missionId}
            isLast={idx === activeTasks.length - 1}
          />
        </div>
      ))}
    </div>
  );
};

export default TaskTree;
