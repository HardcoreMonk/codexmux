import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Cell,
  Pie,
  PieChart,
} from 'recharts';
import dayjs from 'dayjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { IOverviewResponse } from '@/types/stats';
import { formatNumber, formatDate, formatAxisTick } from '@/components/features/stats/stats-utils';

interface ITokenSectionProps {
  data: IOverviewResponse;
}

const MODEL_COLOR_MAP: Record<string, string> = {
  'claude-opus-4-6': 'var(--ui-purple)',
  'claude-opus-4-5-20251101': 'var(--ui-pink)',
  'claude-sonnet-4-6': 'var(--ui-coral)',
  'claude-sonnet-4-5-20241022': 'var(--ui-amber)',
  'claude-haiku-4-5-20251001': 'var(--ui-teal)',
};

const getModelColor = (model: string): string => {
  if (MODEL_COLOR_MAP[model]) return MODEL_COLOR_MAP[model];
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 'var(--ui-purple)';
  if (lower.includes('sonnet')) return 'var(--ui-coral)';
  if (lower.includes('haiku')) return 'var(--ui-teal)';
  return 'var(--ui-gray)';
};

const MODEL_LABEL_MAP: Record<string, string> = {
  'claude-opus-4-6': 'Opus 4.6',
  'claude-opus-4-5-20251101': 'Opus 4.5',
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-sonnet-4-5-20241022': 'Sonnet 4.5',
  'claude-haiku-4-5-20251001': 'Haiku 4.5',
};

const getModelLabel = (model: string): string => {
  if (MODEL_LABEL_MAP[model]) return MODEL_LABEL_MAP[model];
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 'Opus';
  if (lower.includes('sonnet')) return 'Sonnet';
  if (lower.includes('haiku')) return 'Haiku';
  return model;
};

const barChartConfig: ChartConfig = {
  input: { label: '입력', color: 'var(--ui-blue)' },
  output: { label: '출력', color: 'var(--ui-teal)' },
  cache: { label: '캐시', color: 'var(--ui-amber)' },
};

const trendChartConfig: ChartConfig = {
  input: { label: '입력', color: 'var(--ui-blue)' },
  output: { label: '출력', color: 'var(--ui-teal)' },
};

const TokenSection = ({ data }: ITokenSectionProps) => {
  const modelBarData = useMemo(() => {
    return Object.entries(data.modelTokens)
      .map(([model, tokens]) => ({
        model: getModelLabel(model),
        input: tokens.input,
        output: tokens.output,
        cache: tokens.cache,
        total: tokens.input + tokens.output + tokens.cache,
        color: getModelColor(model),
      }))
      .sort((a, b) => b.total - a.total);
  }, [data.modelTokens]);

  const donutData = useMemo(() => {
    return Object.entries(data.modelTokens)
      .map(([model, tokens]) => ({
        name: getModelLabel(model),
        value: tokens.input + tokens.output,
        fill: getModelColor(model),
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [data.modelTokens]);

  const totalTokens = useMemo(() => {
    return donutData.reduce((sum, d) => sum + d.value, 0);
  }, [donutData]);

  const donutConfig: ChartConfig = useMemo(() => {
    const cfg: ChartConfig = {};
    donutData.forEach((d) => {
      cfg[d.name] = { label: d.name, color: d.fill };
    });
    return cfg;
  }, [donutData]);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">토큰 사용량</h2>

      <div className="grid gap-3 lg:grid-cols-2">
        {modelBarData.length > 0 && (
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">모델별 토큰</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={barChartConfig} className="aspect-auto h-48 w-full">
                <BarChart
                  data={modelBarData}
                  layout="vertical"
                  margin={{ top: 0, right: 4, bottom: 0, left: 0 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(v: number) => formatNumber(v)} />
                  <YAxis type="category" dataKey="model" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={100} />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    formatter={(value: number) => formatNumber(value)}
                  />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                    {modelBarData.map((entry) => (
                      <Cell key={entry.model} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {donutData.length > 0 && (
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">모델별 비율</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={donutConfig} className="aspect-auto h-48 w-full">
                <PieChart>
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    formatter={(value: number) => formatNumber(value)}
                  />
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={72}
                    strokeWidth={2}
                    stroke="var(--background)"
                  >
                    {donutData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <text
                    x="50%"
                    y="48%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-foreground text-lg font-semibold"
                  >
                    {formatNumber(totalTokens)}
                  </text>
                  <text
                    x="50%"
                    y="60%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-muted-foreground text-xs"
                  >
                    총 토큰
                  </text>
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {data.dailyTokens.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">일별 토큰 추이</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={trendChartConfig} className="aspect-auto h-48 w-full">
              <AreaChart data={data.dailyTokens} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="fillInput" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--ui-blue)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--ui-blue)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="fillOutput" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--ui-teal)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--ui-teal)" stopOpacity={0.02} />
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
                  width={48}
                  tickFormatter={formatAxisTick}
                />
                <ChartTooltip
                  content={<ChartTooltipContent />}
                  labelFormatter={(v) => dayjs(v).format('YYYY-MM-DD')}
                />
                <Area
                  dataKey="input"
                  type="monotone"
                  fill="url(#fillInput)"
                  stroke="var(--ui-blue)"
                  strokeWidth={1.5}
                  stackId="1"
                />
                <Area
                  dataKey="output"
                  type="monotone"
                  fill="url(#fillOutput)"
                  stroke="var(--ui-teal)"
                  strokeWidth={1.5}
                  stackId="1"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </section>
  );
};

export default TokenSection;
