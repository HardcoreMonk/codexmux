import { useMemo, memo } from 'react';
import { useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import dayjs from 'dayjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { IOverviewResponse } from '@/types/stats';
import { WEEKDAY_LABELS, formatDate, formatNumber, formatAxisTick } from '@/components/features/stats/stats-utils';

interface IActivitySectionProps {
  data: IOverviewResponse;
}

const HEATMAP_INTENSITIES = [
  'bg-ui-teal/5',
  'bg-ui-teal/15',
  'bg-ui-teal/30',
  'bg-ui-teal/50',
  'bg-ui-teal/80',
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

const getIntensityClass = (count: number, max: number): string => {
  if (count === 0 || max === 0) return HEATMAP_INTENSITIES[0];
  const ratio = count / max;
  if (ratio <= 0.25) return HEATMAP_INTENSITIES[1];
  if (ratio <= 0.5) return HEATMAP_INTENSITIES[2];
  if (ratio <= 0.75) return HEATMAP_INTENSITIES[3];
  return HEATMAP_INTENSITIES[4];
};

const ActivitySection = ({ data }: IActivitySectionProps) => {
  const t = useTranslations('stats');

  const dailyChartConfig: ChartConfig = {
    messageCount: { label: t('messages'), color: 'var(--ui-blue)' },
    sessionCount: { label: t('sessions'), color: 'var(--ui-teal)' },
    toolCallCount: { label: t('toolCalls'), color: 'var(--ui-coral)' },
  };

  const weekdayChartConfig: ChartConfig = {
    average: { label: t('avgMessages'), color: 'var(--ui-purple)' },
  };

  const { grid, maxCount } = useMemo(() => {
    const dist = data.dayHourDistribution ?? {};
    let max = 0;
    const cells: { dow: number; hour: number; count: number }[][] = [];

    for (let dow = 0; dow < 7; dow++) {
      const row: { dow: number; hour: number; count: number }[] = [];
      for (const hour of HOURS) {
        const count = dist[`${dow}-${hour}`] ?? 0;
        if (count > max) max = count;
        row.push({ dow, hour, count });
      }
      cells.push(row);
    }

    return { grid: cells, maxCount: Math.max(1, max) };
  }, [data.dayHourDistribution]);

  const dailyChartData = useMemo(() => {
    return data.dailyActivity.slice(-30).map((d) => ({
      date: d.date,
      messageCount: d.messageCount,
      sessionCount: d.sessionCount,
      toolCallCount: d.toolCallCount,
    }));
  }, [data.dailyActivity]);

  const weekdayData = useMemo(() => {
    const totals = Array(7).fill(0);
    const counts = Array(7).fill(0);

    data.dailyActivity.forEach((d) => {
      const dow = dayjs(d.date).day();
      totals[dow] += d.messageCount;
      counts[dow] += 1;
    });

    return WEEKDAY_LABELS.map((label, i) => ({
      day: label,
      average: counts[i] > 0 ? Math.round(totals[i] / counts[i]) : 0,
    }));
  }, [data.dailyActivity]);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">{t('activityPatternTitle')}</h2>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">{t('peakHour')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="flex flex-col gap-[3px]">
              <div className="flex gap-[3px]">
                <div className="w-6 shrink-0" />
                {HOURS.map((h) => (
                  <div key={h} className="flex h-[11px] w-[11px] shrink-0 items-center justify-center md:w-auto md:flex-1">
                    {h % 3 === 0 && (
                      <span className="text-[9px] text-muted-foreground">{h}</span>
                    )}
                  </div>
                ))}
              </div>
              <TooltipProvider delay={100}>
                {grid.map((row, dow) => (
                  <div key={dow} className="flex gap-[3px]">
                    <div className="flex w-6 shrink-0 items-center">
                      <span className="text-[10px] text-muted-foreground">{WEEKDAY_LABELS[dow]}</span>
                    </div>
                    {row.map((cell) => (
                      <Tooltip key={cell.hour}>
                        <TooltipTrigger
                          render={
                            <div
                              className={`h-[11px] w-[11px] shrink-0 rounded-[2px] md:h-3 md:w-auto md:flex-1 md:rounded-sm ${getIntensityClass(cell.count, maxCount)}`}
                            />
                          }
                        />
                        <TooltipContent side="top" className="text-xs">
                          <p>{WEEKDAY_LABELS[cell.dow]} {cell.hour}{t('hourSuffix')}</p>
                          <p className="font-medium">{t('messageCount', { count: cell.count })}</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                ))}
              </TooltipProvider>
            </div>
            <div className="mt-2 flex items-center justify-end gap-1.5">
              <span className="text-[10px] text-muted-foreground">{t('less')}</span>
              {HEATMAP_INTENSITIES.map((cls, i) => (
                <div key={i} className={`h-[11px] w-[11px] rounded-[2px] ${cls}`} />
              ))}
              <span className="text-[10px] text-muted-foreground">{t('more')}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {dailyChartData.length > 0 && (
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{t('dailyActivity')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={dailyChartConfig} className="aspect-auto h-48 w-full">
                <BarChart data={dailyChartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatDate}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={formatAxisTick} width={48} />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    labelFormatter={(v) => dayjs(v).format('YYYY-MM-DD')}
                  />
                  <Bar dataKey="messageCount" fill="var(--ui-blue)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="sessionCount" fill="var(--ui-teal)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="toolCallCount" fill="var(--ui-coral)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('weekdayAverage')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={weekdayChartConfig} className="aspect-auto h-48 w-full">
              <BarChart data={weekdayData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={formatAxisTick} width={48} />
                <ChartTooltip
                  content={<ChartTooltipContent />}
                  formatter={(value) => formatNumber(Number(value))}
                />
                <Bar dataKey="average" fill="var(--ui-purple)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

export default memo(ActivitySection);
