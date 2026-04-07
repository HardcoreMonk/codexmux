import useSystemResources from '@/hooks/use-system-resources';

const formatMB = (bytes: number) => Math.round(bytes / (1024 * 1024));

const SystemResources = () => {
  const resources = useSystemResources();

  if (!resources) return null;

  return (
    <div className="flex items-center gap-2 text-[9px] text-muted-foreground/60">
      <span className="tabular-nums">CPU {resources.cpu.toFixed(1)}%</span>
      <span className="tabular-nums">MEM {formatMB(resources.memory.used)}MB</span>
      <span className="tabular-nums">TMUX {resources.tmuxSessions}</span>
    </div>
  );
};

export default SystemResources;
