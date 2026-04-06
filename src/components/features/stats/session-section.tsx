import { useMemo, memo } from 'react';
import { useTranslations } from 'next-intl';
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Pie,
  PieChart,
} from 'recharts';
import { Clock, Maximize2, Wrench } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { ISessionsResponse, IFacetsResponse, IHistoryResponse } from '@/types/stats';
import { formatNumberWithComma, formatDuration, formatAxisTick } from '@/components/features/stats/stats-utils';
import SectionSkeleton from '@/components/features/stats/section-skeleton';

interface ISessionSectionProps {
  sessions: ISessionsResponse;
  facets: IFacetsResponse | null;
  history: IHistoryResponse | null;
  facetsLoading: boolean;
  historyLoading: boolean;
  totalToolCalls: number;
}

const CATEGORY_COLORS = [
  'var(--ui-purple)',
  'var(--ui-coral)',
  'var(--ui-pink)',
  'var(--ui-amber)',
  'var(--ui-blue)',
  'var(--ui-teal)',
  'var(--ui-green)',
  'var(--ui-gray)',
];

const OUTCOME_COLORS: Record<string, string> = {
  success: 'var(--ui-teal)',
  partial: 'var(--ui-amber)',
  failure: 'var(--ui-red)',
};

const SessionSection = ({ sessions, facets, history, facetsLoading, historyLoading, totalToolCalls }: ISessionSectionProps) => {
  const t = useTranslations('stats');

  const cards = [
    {
      label: t('avgSessionLength'),
      value: formatDuration(sessions.averageDurationMs),
      icon: Clock,
    },
    {
      label: t('longestSession'),
      value: sessions.longestSession
        ? formatDuration(sessions.longestSession.duration)
        : '-',
      icon: Maximize2,
    },
    {
      label: t('totalToolCalls'),
      value: formatNumberWithComma(totalToolCalls),
      icon: Wrench,
    },
  ];

  const categoryDonutData = useMemo(() => {
    if (!facets) return [];
    return Object.entries(facets.categoryDistribution)
      .map(([name, value], i) => ({
        name,
        value,
        fill: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [facets]);

  const categoryConfig: ChartConfig = useMemo(() => {
    const cfg: ChartConfig = {};
    categoryDonutData.forEach((d) => {
      cfg[d.name] = { label: d.name, color: d.fill };
    });
    return cfg;
  }, [categoryDonutData]);

  const outcomeData = useMemo(() => {
    if (!facets) return [];
    return Object.entries(facets.outcomeDistribution)
      .map(([name, value]) => ({
        name,
        value,
        fill: OUTCOME_COLORS[name] ?? 'var(--ui-gray)',
      }))
      .filter((d) => d.value > 0);
  }, [facets]);

  const outcomeConfig: ChartConfig = useMemo(() => {
    const cfg: ChartConfig = {};
    outcomeData.forEach((d) => {
      cfg[d.name] = { label: d.name, color: d.fill };
    });
    return cfg;
  }, [outcomeData]);

  const commandData = useMemo(() => {
    if (!history) return [];
    return history.topCommands.slice(0, 10);
  }, [history]);

  const commandConfig: ChartConfig = {
    count: { label: t('count'), color: 'var(--ui-purple)' },
  };

  const inputDistData = useMemo(() => {
    if (!history) return [];
    return history.inputLengthDistribution;
  }, [history]);

  const inputDistConfig: ChartConfig = {
    count: { label: t('cases'), color: 'var(--ui-blue)' },
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">{t('sessionAnalysis')}</h2>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((card) => (
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

      {facetsLoading ? (
        <SectionSkeleton hasChart />
      ) : (
        facets && (
          <div className="grid gap-3 lg:grid-cols-2">
            {categoryDonutData.length > 0 && (
              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t('categoryDistribution')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={categoryConfig} className="aspect-auto h-48 w-full">
                    <PieChart>
                      <ChartTooltip
                        content={<ChartTooltipContent hideLabel />}
                        formatter={(value) => formatNumberWithComma(Number(value))}
                      />
                      <Pie
                        data={categoryDonutData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={72}
                        strokeWidth={2}
                        stroke="var(--background)"
                      />
                      <text
                        x="50%"
                        y="48%"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="fill-foreground text-lg font-semibold"
                      >
                        {formatNumberWithComma(facets.totalFacets)}
                      </text>
                      <text
                        x="50%"
                        y="60%"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="fill-muted-foreground text-xs"
                      >
                        {t('totalSessionsPie')}
                      </text>
                    </PieChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {outcomeData.length > 0 && (
              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t('goalAchievement')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={outcomeConfig} className="aspect-auto h-48 w-full">
                    <BarChart
                      data={outcomeData}
                      layout="vertical"
                      margin={{ top: 0, right: 4, bottom: 0, left: 0 }}
                    >
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                      <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={60} />
                      <ChartTooltip
                        content={<ChartTooltipContent />}
                        formatter={(value) => formatNumberWithComma(Number(value))}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}
          </div>
        )
      )}

      {historyLoading ? (
        <SectionSkeleton hasChart />
      ) : (
        history && (
          <div className="grid gap-3 lg:grid-cols-2">
            {commandData.length > 0 && (
              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t('topCommands')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={commandConfig} className="aspect-auto h-64 w-full">
                    <BarChart
                      data={commandData}
                      layout="vertical"
                      margin={{ top: 0, right: 4, bottom: 0, left: 0 }}
                    >
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                      <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="command"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 10 }}
                        width={140}
                      />
                      <ChartTooltip
                        content={<ChartTooltipContent />}
                        formatter={(value) => formatNumberWithComma(Number(value))}
                      />
                      <Bar dataKey="count" fill="var(--ui-purple)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {inputDistData.length > 0 && (
              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t('inputLengthDist')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={inputDistConfig} className="aspect-auto h-64 w-full">
                    <BarChart data={inputDistData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={formatAxisTick} width={48} />
                      <ChartTooltip
                        content={<ChartTooltipContent />}
                        formatter={(value) => formatNumberWithComma(Number(value))}
                      />
                      <Bar dataKey="count" fill="var(--ui-blue)" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}
          </div>
        )
      )}
    </section>
  );
};

export default memo(SessionSection);
