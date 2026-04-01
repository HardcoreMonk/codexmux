import { useMemo, memo } from 'react';
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

  const weekdayChartConfig: ChartConfig = {
    average: { label: '평균 메시지', color: 'var(--ui-purple)' },
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">활동 패턴</h2>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">피크 아워</CardTitle>
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
                          <p>{WEEKDAY_LABELS[cell.dow]} {cell.hour}시</p>
                          <p className="font-medium">{cell.count} 메시지</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
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
