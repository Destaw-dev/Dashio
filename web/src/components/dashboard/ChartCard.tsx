'use client';

import type { EChartsOption } from 'echarts';
import type { SeriesResponse } from '@/lib/api';
import { BaseChart } from '@/components/charts/BaseChart';
import { useTheme } from '@/providers/ThemeProvider';

type ChartCardProps = {
  title: string;
  description: string;
  query: { isLoading: boolean; isError: boolean; data?: SeriesResponse };
  emptyMessage: string;
};

export function ChartCard({ title, description, query, emptyMessage }: ChartCardProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  if (query.isError) {
    return (
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-0.5">{title}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{description}</p>
        <p className="text-sm text-red-600 dark:text-red-400">Failed to load data.</p>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="card p-5 animate-pulse space-y-4">
        <div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-3 w-40 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-44 w-full rounded-lg bg-slate-100 dark:bg-slate-800" />
      </div>
    );
  }

  const series = query.data?.series ?? [];
  if (!series.length) {
    return (
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-0.5">{title}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{description}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">{emptyMessage}</p>
      </div>
    );
  }

  const axisColor = isDark ? '#64748b' : '#6B7280';
  const lineColor = isDark ? '#334155' : '#E5E7EB';
  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: isDark ? '#1e293b' : undefined,
      borderColor: isDark ? '#475569' : undefined,
      textStyle: { color: isDark ? '#e2e8f0' : undefined },
    },
    grid: { left: 40, right: 16, top: 32, bottom: 32 },
    xAxis: {
      type: 'category',
      data: series.map((p) => p.date),
      axisLine: { lineStyle: { color: lineColor } },
      axisLabel: { color: axisColor },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: lineColor } },
      axisLabel: { color: axisColor },
    },
    series: [
      {
        type: 'line',
        data: series.map((p) => p.count),
        smooth: true,
        areaStyle: {
          color: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(37, 99, 235, 0.08)',
        },
        lineStyle: {
          color: isDark ? '#60a5fa' : '#2563EB',
          width: 2,
        },
        symbolSize: 6,
        itemStyle: {
          color: isDark ? '#60a5fa' : '#2563EB',
        },
      },
    ],
  };

  return (
    <div className="card p-5 transition-shadow hover:shadow-card-hover">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-0.5">{title}</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{description}</p>
      <BaseChart option={option} />
    </div>
  );
}

