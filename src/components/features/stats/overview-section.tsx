import { useMemo, memo } from 'react';
import { useTranslations } from 'next-intl';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Activity, DollarSign, CalendarDays, TrendingUp } from 'lucide-react';
import dayjs from 'dayjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { IOverviewResponse } from '@/types/stats';
import { formatNumberWithComma, formatCostWithComma, formatDate, formatAxisTick, getChangeRate } from '@/components/features/stats/stats-utils';

interface IOverviewSectionProps {
  data: IOverviewResponse;
}

const OverviewSection = ({ data }: IOverviewSectionProps) => {
  const t = useTranslations('stats');

  const chartConfig: ChartConfig = {
    sessions: { label: t('sessions'), color: 'var(--ui-blue)' },
    messages: { label: t('messages'), color: 'var(--ui-teal)' },
  };

  const chartData = useMemo(() => {
    return data.dailyActivity
      .slice(-30)
      .map((d) => ({
        date: d.date,
        sessions: d.sessionCount,
        messages: d.messageCount,
      }));
  }, [data.dailyActivity]);

  const sessionChange = getChangeRate(data.totalSessions, data.previousSessions);
  const costChange = getChangeRate(data.totalCost, data.previousCost);

  const cards = [
    { label: t('totalSessions'), value: formatNumberWithComma(data.totalSessions), icon: Activity, change: sessionChange },
    { label: t('totalCost'), value: formatCostWithComma(data.totalCost), icon: DollarSign, change: costChange },
    { label: t('todayCost'), value: formatCostWithComma(data.todayCost), icon: CalendarDays, change: null },
    { label: t('thisMonthCost'), value: formatCostWithComma(data.thisMonthCost), icon: TrendingUp, change: null },
  ];

  return (
    <section className="space-y-3">
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
                {card.change && (
                  <p className={`text-xs tabular-nums ${card.change.startsWith('+') ? 'text-ui-teal' : 'text-ui-coral'}`}>
                    {card.change} {t('vsPreviousPeriod')}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {chartData.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('dailyActivityTrend')}</CardTitle>
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
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  tickFormatter={formatAxisTick}
                  width={48}
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

export default memo(OverviewSection);
