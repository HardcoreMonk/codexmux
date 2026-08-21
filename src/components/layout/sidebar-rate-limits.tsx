import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import dayjs from 'dayjs';
import useRateLimitsStore from '@/hooks/use-rate-limits-store';
import type { IRateLimitWindow } from '@/types/status';
import { getRateLimitWindowView, type TRateLimitPeriod } from '@/lib/rate-limit-view';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const formatRemaining = (
  secs: number,
  t: ReturnType<typeof useTranslations<'sidebar.rateLimits'>>,
): string => {
  if (secs <= 0) return t('now');
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return t('daysHours', { days: d, hours: h });
  if (h > 0) return t('hoursMinutes', { hours: h, minutes: m });
  return t('minutes', { minutes: m });
};

const barColor = (pct: number): string => {
  if (pct >= 80) return 'bg-ui-red';
  if (pct >= 50) return 'bg-ui-amber';
  return 'bg-ui-teal';
};

const LimitBar = ({ label, window }: { label: TRateLimitPeriod; window: IRateLimitWindow }) => {
  const t = useTranslations('sidebar.rateLimits');
  const view = getRateLimitWindowView(window, label);
  const remaining = formatRemaining(view.remainingSeconds, t);
  const observedAt = view.observedAt ? dayjs(view.observedAt).format('YYYY-MM-DD HH:mm') : null;

  return (
    <Tooltip>
      <TooltipTrigger render={<div className="w-full cursor-default space-y-0.5" />}>
        <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground/60">
          <span>{label}</span>
          {view.stale ? (
            <span>{t('awaitingUpdate')}</span>
          ) : (
            <span>
              {remaining} ({view.usedPercentage}%
              {view.projectedPercentage !== null && (
                <span className="text-muted-foreground/40"> → {view.projectedPercentage}%</span>
              )}
              )
            </span>
          )}
        </div>
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted-foreground/10">
          {!view.stale && view.projectedPercentage !== null && (
            <div
              className={`absolute left-0 top-0 h-full rounded-full opacity-30 transition-all duration-300 ${barColor(view.projectedPercentage)}`}
              style={{ width: `${view.projectedPercentage}%` }}
            />
          )}
          {!view.stale && (
            <div
              className={`absolute left-0 top-0 h-full rounded-full transition-all duration-300 ${barColor(view.usedPercentage)}`}
              style={{ width: `${view.usedPercentage}%` }}
            />
          )}
          {view.stale && (
            <div className="absolute inset-0 bg-muted-foreground/10" />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px]">
        <div className="flex flex-col gap-0.5 text-left">
          {view.stale ? (
            <div>{t('awaitingUpdateDescription')}</div>
          ) : (
            <>
              <div>{t('usedReset', { percentage: view.usedPercentage, remaining })}</div>
              {view.projectedPercentage !== null && (
                <div className="opacity-70">
                  {t('projected', { percentage: view.projectedPercentage })}
                </div>
              )}
            </>
          )}
          {observedAt && (
            <div className="opacity-60">{t('observedAt', { time: observedAt })}</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

const SidebarRateLimits = () => {
  const data = useRateLimitsStore((s) => s.data);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!data) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [data]);

  if (!data) return null;
  if (!data.five_hour && !data.seven_day) return null;

  return (
    <TooltipProvider delay={200}>
      <div className="space-y-1 px-3 py-1.5">
        {data.five_hour && <LimitBar label="5h" window={data.five_hour} />}
        {data.seven_day && <LimitBar label="7d" window={data.seven_day} />}
      </div>
    </TooltipProvider>
  );
};

export default SidebarRateLimits;
