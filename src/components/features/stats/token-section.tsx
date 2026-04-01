import { useMemo, memo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { IOverviewResponse } from '@/types/stats';
import { formatNumber, formatNumberWithComma, formatDate, formatAxisTick, formatCostWithComma } from '@/components/features/stats/stats-utils';

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
  total: { label: '토큰', color: 'var(--ui-blue)' },
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
        cost: tokens.cost,
        fill: getModelColor(model),
      }))
      .sort((a, b) => b.total - a.total);
  }, [data.modelTokens]);

  const totalCost = useMemo(() => {
    return modelBarData.reduce((sum, d) => sum + d.cost, 0);
  }, [modelBarData]);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">토큰 사용량</h2>

      {modelBarData.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">모델별 토큰</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
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
                    formatter={(value) => formatNumberWithComma(Number(value))}
                  />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
              <div className="flex flex-col justify-center space-y-1.5 lg:min-w-[180px]">
                {modelBarData.map((d) => (
                  <div key={d.model} className="flex items-center justify-between gap-4 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: d.fill }} />
                      <span>{d.model}</span>
                    </div>
                    <span className="tabular-nums font-medium">{formatCostWithComma(d.cost)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-4 border-t border-foreground/5 pt-1.5 text-xs font-medium">
                  <span className="text-muted-foreground">합계</span>
                  <span className="tabular-nums">{formatCostWithComma(totalCost)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {data.dailyTokens.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">일별 토큰 추이</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={trendChartConfig} className="aspect-auto h-48 w-full">
              <AreaChart data={data.dailyTokens} margin={{ top: 4, right: 4, bottom: 0, left: 8 }}>
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

export default memo(TokenSection);
