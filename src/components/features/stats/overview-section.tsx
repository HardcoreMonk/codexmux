import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Activity, MessageSquare, CalendarDays, TrendingUp } from 'lucide-react';
import dayjs from 'dayjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { IOverviewResponse } from '@/types/stats';
import { formatNumber, formatDate } from '@/components/features/stats/stats-utils';

interface IOverviewSectionProps {
  data: IOverviewResponse;
}

const chartConfig: ChartConfig = {
  sessions: { label: '세션', color: 'var(--ui-blue)' },
  messages: { label: '메시지', color: 'var(--ui-teal)' },
};

const OverviewSection = ({ data }: IOverviewSectionProps) => {
  const todayActivity = useMemo(() => {
    const today = dayjs().format('YYYY-MM-DD');
    const entry = data.dailyActivity.find((d) => d.date === today);
    return entry?.messageCount ?? 0;
  }, [data.dailyActivity]);

  const thisMonthActivity = useMemo(() => {
    const startOfMonth = dayjs().startOf('month');
    return data.dailyActivity
      .filter((d) => dayjs(d.date).isAfter(startOfMonth) || dayjs(d.date).isSame(startOfMonth))
      .reduce((sum, d) => sum + d.messageCount, 0);
  }, [data.dailyActivity]);

  const chartData = useMemo(() => {
    return data.dailyActivity
      .slice(-30)
      .map((d) => ({
        date: d.date,
        sessions: d.sessionCount,
        messages: d.messageCount,
      }));
  }, [data.dailyActivity]);

  const cards = [
    { label: '총 세션 수', value: formatNumber(data.totalSessions), icon: Activity },
    { label: '총 메시지 수', value: formatNumber(data.totalMessages), icon: MessageSquare },
    { label: '오늘 사용량', value: formatNumber(todayActivity), icon: CalendarDays },
    { label: '이번 달 사용량', value: formatNumber(thisMonthActivity), icon: TrendingUp },
  ];

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">개요</h2>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} size="sm">
            <CardContent className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <card.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className="text-2xl font-semibold tabular-nums">{card.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {chartData.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">일별 활동 추이</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="aspect-auto h-48 w-full">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="fillSessions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--ui-blue)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--ui-blue)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatDate}
                  tick={{ fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  width={32}
                />
                <ChartTooltip
                  content={<ChartTooltipContent />}
                  labelFormatter={(v) => dayjs(v).format('YYYY-MM-DD')}
                />
                <Area
                  dataKey="messages"
                  type="monotone"
                  fill="url(#fillSessions)"
                  stroke="var(--ui-blue)"
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </section>
  );
};

export default OverviewSection;
