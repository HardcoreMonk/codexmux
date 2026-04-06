import { memo } from 'react';
import { useTranslations } from 'next-intl';
import dayjs from 'dayjs';
import { Trophy, Zap, Flame, Timer, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { IUptimeResponse, IStreak } from '@/types/stats';
import { formatDuration } from '@/components/features/stats/stats-utils';

interface IUptimeSectionProps {
  data: IUptimeResponse;
}

const COMBO_COLORS = [
  '', '', 'bg-ui-purple/50', 'bg-ui-amber/60', 'bg-ui-coral/70',
];

const getComboColor = (concurrent: number): string => {
  if (concurrent <= 0) return 'bg-foreground/[0.03]';
  if (concurrent === 1) return 'bg-ui-teal/40';
  return COMBO_COLORS[Math.min(concurrent, COMBO_COLORS.length - 1)] ?? 'bg-ui-coral/70';
};

const getComboTextColor = (concurrent: number): string => {
  if (concurrent <= 1) return 'text-muted-foreground';
  if (concurrent === 2) return 'text-ui-purple';
  if (concurrent === 3) return 'text-ui-amber';
  return 'text-ui-coral';
};

const HOUR_MARKS = [0, 6, 12, 18];
const TOP_STREAK_COUNT = 5;

const UptimeSection = ({ data }: IUptimeSectionProps) => {
  const t = useTranslations('stats');

  const streakCards = [
    {
      label: t('longestStreak'),
      value: formatDuration(data.longestStreakMinutes * 60_000),
      icon: Trophy,
    },
    {
      label: t('currentStreak'),
      value: data.currentStreak.active
        ? formatDuration(data.currentStreak.minutes * 60_000)
        : '-',
      icon: Zap,
    },
    {
      label: t('streakCount'),
      value: t('streakCountValue', { count: data.totalStreaks }),
      icon: Flame,
    },
    {
      label: t('avgStreak'),
      value: formatDuration(data.averageStreakMinutes * 60_000),
      icon: Timer,
    },
  ];

  const comboCards = Object.entries(data.comboMinutes)
    .map(([k, v]) => ({ level: Number(k), value: v }))
    .filter((c) => c.value > 0)
    .sort((a, b) => a.level - b.level);

  const hasActivity = data.totalActiveMinutes > 0;
  const topStreaks = [...data.streaks]
    .sort((a, b) => b.durationMinutes - a.durationMinutes)
    .slice(0, TOP_STREAK_COUNT);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-medium text-muted-foreground">{t('continuousUptime')}</h2>
        <TooltipProvider delay={0}>
          <Tooltip>
            <TooltipTrigger
              render={<Info className="h-3.5 w-3.5 text-muted-foreground/50" />}
            />
            <TooltipContent side="right" className="max-w-56 text-xs leading-relaxed">
              {t('uptimeDescription')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {streakCards.map((card) => (
          <Card key={card.label} size="sm">
            <CardContent className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <card.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className="text-xl font-semibold tabular-nums">{card.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t('weeklyTimeline')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <div className="flex items-end">
              <div className="w-10 shrink-0" />
              <div className="relative flex-1">
                {HOUR_MARKS.map((h) => (
                  <span
                    key={h}
                    className="absolute text-[9px] text-muted-foreground"
                    style={{ left: `${(h / 24) * 100}%` }}
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>

            <TooltipProvider delay={100}>
              {data.days.map((day) => {
                const label = dayjs(day.date).format('MM/DD');
                return (
                  <div key={day.date} className="flex items-center gap-0">
                    <div className="flex w-10 shrink-0 items-center">
                      <span className="text-[10px] text-muted-foreground">{label}</span>
                    </div>
                    <div className="relative h-3 flex-1 rounded-sm bg-foreground/[0.03]">
                      {day.segments.map((seg, i) => {
                        const left = (seg.startMinuteOfDay / 1440) * 100;
                        const width = Math.max((seg.durationMinutes / 1440) * 100, 0.15);
                        return (
                          <Tooltip key={i}>
                            <TooltipTrigger
                              render={
                                <div
                                  className={`absolute top-0 h-full rounded-sm ${getComboColor(seg.maxConcurrent)}`}
                                  style={{ left: `${left}%`, width: `${width}%` }}
                                />
                              }
                            />
                            <TooltipContent side="top" className="text-xs">
                              <p>
                                {label}{' '}
                                {Math.floor(seg.startMinuteOfDay / 60)}:
                                {String(seg.startMinuteOfDay % 60).padStart(2, '0')}
                                {' ~ '}
                                {Math.floor((seg.startMinuteOfDay + seg.durationMinutes) / 60)}:
                                {String((seg.startMinuteOfDay + seg.durationMinutes) % 60).padStart(2, '0')}
                              </p>
                              <p className="font-medium">
                                {formatDuration(seg.durationMinutes * 60_000)}
                                {seg.maxConcurrent >= 2 && ` · x${seg.maxConcurrent}`}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </TooltipProvider>

            <div className="flex items-end">
              <div className="w-10 shrink-0" />
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  <div className="h-[11px] w-[11px] rounded-[2px] bg-ui-teal/40" />
                  <span className="text-[10px] text-muted-foreground">x1</span>
                </div>
                {Array.from({ length: Math.max(0, data.maxConcurrent - 1) }, (_, i) => i + 2).map((lvl) => (
                  <div key={lvl} className="flex items-center gap-1">
                    <div className={`h-[11px] w-[11px] rounded-[2px] ${getComboColor(lvl)}`} />
                    <span className={`text-[10px] ${getComboTextColor(lvl)}`}>x{lvl}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {topStreaks.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('streakTop')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {topStreaks.map((streak, i) => (
                <StreakRow key={streak.startMs} streak={streak} rank={i} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {comboCards.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('concurrentUsage')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {comboCards.map((combo) => (
                <div key={combo.level} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${getComboColor(combo.level)}`} />
                    <span className={`text-sm font-medium ${getComboTextColor(combo.level)}`}>
                      x{combo.level}+
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t('concurrentOrMore', { level: combo.level })}
                    </span>
                  </div>
                  <span className="text-sm tabular-nums">
                    {t('accumulated', { duration: formatDuration(combo.value * 60_000) })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!hasActivity && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {t('noRecentActivity')}
        </p>
      )}

      {data.currentStreak.active && (
        <div className="flex items-center gap-2 rounded-lg bg-ui-teal/10 px-4 py-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-ui-teal" />
          <span className="text-xs text-ui-teal">
            {t('currentlyRunning', { duration: formatDuration(data.currentStreak.minutes * 60_000) })}
            {data.currentStreak.maxConcurrent >= 2 &&
              ` (x${data.currentStreak.maxConcurrent})`}
          </span>
        </div>
      )}
    </section>
  );
};

const StreakRow = ({ streak, rank }: { streak: IStreak; rank: number }) => {
  const start = dayjs(streak.startMs);
  const end = dayjs(streak.endMs);
  const sameDay = start.format('MM/DD') === end.format('MM/DD');
  const timeRange = sameDay
    ? `${start.format('MM/DD HH:mm')}~${end.format('HH:mm')}`
    : `${start.format('MM/DD HH:mm')}~${end.format('MM/DD HH:mm')}`;

  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center">
        {rank === 0 ? (
          <Trophy className="h-3.5 w-3.5 text-ui-amber" />
        ) : (
          <span className="text-xs text-muted-foreground/50">{rank + 1}</span>
        )}
      </div>
      <span className="font-medium tabular-nums">
        {formatDuration(streak.durationMinutes * 60_000)}
      </span>
      <span className="text-xs text-muted-foreground">{timeRange}</span>
      {streak.maxConcurrent >= 2 && (
        <span className={`text-xs font-medium ${getComboTextColor(streak.maxConcurrent)}`}>
          x{streak.maxConcurrent}
        </span>
      )}
      {streak.active && (
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-ui-teal" />
      )}
    </div>
  );
};

export default memo(UptimeSection);
