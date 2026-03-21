import { useMemo } from 'react';
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

const dailyChartConfig: ChartConfig = {
  messageCount: { label: '메시지', color: 'var(--ui-blue)' },
  sessionCount: { label: '세션', color: 'var(--ui-teal)' },
  toolCallCount: { label: '도구 호출', color: 'var(--ui-coral)' },
};

const HEATMAP_INTENSITIES = [
  'bg-ui-teal/5',
  'bg-ui-teal/15',
  'bg-ui-teal/30',
  'bg-ui-teal/50',
  'bg-ui-teal/80',
];

const getIntensityClass = (count: number, max: number): string => {
  if (count === 0 || max === 0) return HEATMAP_INTENSITIES[0];
  const ratio = count / max;
  if (ratio <= 0.25) return HEATMAP_INTENSITIES[1];
  if (ratio <= 0.5) return HEATMAP_INTENSITIES[2];
  if (ratio <= 0.75) return HEATMAP_INTENSITIES[3];
  return HEATMAP_INTENSITIES[4];
};

const ActivitySection = ({ data }: IActivitySectionProps) => {
  const heatmapData = useMemo(() => {
    const activityMap = new Map<string, number>();
    data.dailyActivity.forEach((d) => {
      activityMap.set(d.date, d.messageCount);
    });

    const weeks: { date: string; count: number; dayOfWeek: number }[][] = [];
    const today = dayjs();
    const startDate = today.subtract(51, 'week').startOf('week');

    let currentWeek: { date: string; count: number; dayOfWeek: number }[] = [];

    for (let d = startDate; d.isBefore(today) || d.isSame(today, 'day'); d = d.add(1, 'day')) {
      const dateStr = d.format('YYYY-MM-DD');
      const dayOfWeek = d.day();

      if (dayOfWeek === 0 && currentWeek.length > 0) {
        weeks.push(currentWeek);
        currentWeek = [];
      }

      currentWeek.push({
        date: dateStr,
        count: activityMap.get(dateStr) ?? 0,
        dayOfWeek,
      });
    }

    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    return weeks;
  }, [data.dailyActivity]);

  const maxCount = useMemo(() => {
    return Math.max(1, ...data.dailyActivity.map((d) => d.messageCount));
  }, [data.dailyActivity]);

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

  const weekdayChartConfig: ChartConfig = {
    average: { label: '평균 메시지', color: 'var(--ui-purple)' },
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">활동 패턴</h2>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">활동 히트맵</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="flex gap-[3px]">
              <div className="flex shrink-0 flex-col gap-[3px] pr-1 pt-0">
                {WEEKDAY_LABELS.map((label, i) => (
                  <div key={i} className="flex h-[11px] items-center">
                    {i % 2 === 1 && (
                      <span className="text-[10px] text-muted-foreground">{label}</span>
                    )}
                  </div>
                ))}
              </div>
              <TooltipProvider delay={100}>
                {heatmapData.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[3px]">
                    {Array.from({ length: 7 }).map((_, di) => {
                      const cell = week.find((c) => c.dayOfWeek === di);
                      if (!cell) {
                        return <div key={di} className="h-[11px] w-[11px]" />;
                      }
                      return (
                        <Tooltip key={di}>
                          <TooltipTrigger
                            render={
                              <div
                                className={`h-[11px] w-[11px] rounded-[2px] ${getIntensityClass(cell.count, maxCount)}`}
                              />
                            }
                          />
                          <TooltipContent side="top" className="text-xs">
                            <p>{cell.date}</p>
                            <p className="font-medium">{cell.count} 메시지</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                ))}
              </TooltipProvider>
            </div>
            <div className="mt-2 flex items-center justify-end gap-1.5">
              <span className="text-[10px] text-muted-foreground">적음</span>
              {HEATMAP_INTENSITIES.map((cls, i) => (
                <div key={i} className={`h-[11px] w-[11px] rounded-[2px] ${cls}`} />
              ))}
              <span className="text-[10px] text-muted-foreground">많음</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {dailyChartData.length > 0 && (
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">일별 활동</CardTitle>
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
                    interval="preserveStartEnd"
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
            <CardTitle className="text-sm font-medium text-muted-foreground">요일별 평균</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={weekdayChartConfig} className="aspect-auto h-48 w-full">
              <BarChart data={weekdayData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={formatAxisTick} width={48} />
                <ChartTooltip
                  content={<ChartTooltipContent />}
                  formatter={(value: number) => formatNumber(value)}
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

export default ActivitySection;
