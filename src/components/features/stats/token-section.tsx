import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Cell,
  Pie,
  PieChart,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { IOverviewResponse } from '@/types/stats';
import { formatNumber } from '@/components/features/stats/stats-utils';

interface ITokenSectionProps {
  data: IOverviewResponse;
}

const MODEL_COLORS: Record<string, string> = {
  opus: 'var(--ui-purple)',
  sonnet: 'var(--ui-blue)',
  haiku: 'var(--ui-teal)',
};

const getModelColor = (model: string): string => {
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return MODEL_COLORS.opus;
  if (lower.includes('sonnet')) return MODEL_COLORS.sonnet;
  if (lower.includes('haiku')) return MODEL_COLORS.haiku;
  return 'var(--ui-gray)';
};

const getModelLabel = (model: string): string => {
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 'Opus';
  if (lower.includes('sonnet')) return 'Sonnet';
  if (lower.includes('haiku')) return 'Haiku';
  return model;
};

const barChartConfig: ChartConfig = {
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
        total: tokens.input + tokens.output,
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
                  <YAxis type="category" dataKey="model" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={52} />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    formatter={(value: number) => formatNumber(value)}
                  />
                  <Bar dataKey="input" stackId="a" fill="var(--ui-blue)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="output" stackId="a" fill="var(--ui-teal)" radius={[0, 4, 4, 0]} />
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
                    content={<ChartTooltipContent hideLabel />}
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
    </section>
  );
};

export default TokenSection;
