import { useMemo, memo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { IProjectsResponse } from '@/types/stats';
import { formatNumber, formatNumberWithComma } from '@/components/features/stats/stats-utils';

interface IProjectSectionProps {
  data: IProjectsResponse;
}

const PROJECT_COLORS = [
  'var(--ui-purple)',
  'var(--ui-coral)',
  'var(--ui-pink)',
  'var(--ui-amber)',
  'var(--ui-blue)',
  'var(--ui-teal)',
  'var(--ui-green)',
  'var(--ui-gray)',
];

const chartConfig: ChartConfig = {
  totalTokens: { label: '토큰', color: 'var(--ui-purple)' },
};

const ProjectSection = ({ data }: IProjectSectionProps) => {
  const barData = useMemo(() => {
    return data.projects
      .slice(0, 10)
      .map((p, i) => {
        const segments = p.project.split('/');
        return {
          name: segments[segments.length - 1] || p.project,
          totalTokens: p.totalTokens,
          sessionCount: p.sessionCount,
          messageCount: p.messageCount,
          fill: PROJECT_COLORS[i % PROJECT_COLORS.length],
        };
      });
  }, [data.projects]);

  if (barData.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">프로젝트별 분석</h2>
        <Card size="sm">
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">프로젝트 데이터가 없습니다</p>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">프로젝트별 분석</h2>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            프로젝트별 토큰 사용량 (TOP {barData.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
            <BarChart
              data={barData}
              layout="vertical"
              margin={{ top: 0, right: 4, bottom: 0, left: 0 }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => formatNumber(v)}
              />
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                width={100}
              />
              <ChartTooltip
                content={<ChartTooltipContent />}
              />
              <Bar dataKey="totalTokens" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {barData.slice(0, 4).map((project) => (
          <Card key={project.name} size="sm">
            <CardContent>
              <p className="truncate text-xs text-muted-foreground">{project.name}</p>
              <p className="text-lg font-semibold tabular-nums">{formatNumberWithComma(project.totalTokens)}</p>
              <p className="text-xs text-muted-foreground">
                {formatNumberWithComma(project.sessionCount)}세션 · {formatNumberWithComma(project.messageCount)}메시지
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
};

export default memo(ProjectSection);
