import useRateLimitsStore from '@/hooks/use-rate-limits-store';
import type { IRateLimitWindow } from '@/types/status';

const formatRemaining = (resetsAt: number): string => {
  const secs = Math.max(0, Math.floor(resetsAt - Date.now() / 1000));
  if (secs <= 0) return 'now';
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const barColor = (pct: number): string => {
  if (pct >= 80) return 'bg-ui-red';
  if (pct >= 50) return 'bg-ui-amber';
  return 'bg-ui-teal';
};

const LimitBar = ({ label, window }: { label: string; window: IRateLimitWindow }) => {
  const pct = Math.min(100, Math.round(window.used_percentage));
  const remaining = formatRemaining(window.resets_at);

  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground/60">
        <span>{label}</span>
        <span>{remaining}</span>
      </div>
      <div className="h-1 w-full rounded-full bg-muted-foreground/10">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

const SidebarRateLimits = () => {
  const data = useRateLimitsStore((s) => s.data);
  if (!data) return null;
  if (!data.five_hour && !data.seven_day) return null;

  return (
    <div className="space-y-1 px-3 py-1.5">
      {data.five_hour && <LimitBar label="5h" window={data.five_hour} />}
      {data.seven_day && <LimitBar label="7d" window={data.seven_day} />}
    </div>
  );
};

export default SidebarRateLimits;
