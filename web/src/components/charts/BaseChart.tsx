'use client';

import * as echarts from 'echarts';
import type { ECharts, EChartsOption } from 'echarts';
import { useEffect, useRef } from 'react';

type BaseChartProps = {
  option: EChartsOption;
  height?: number;
};

export function BaseChart({ option, height = 260 }: BaseChartProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    chart.setOption(option);

    const handleResize = () => {
      chart.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setOption(option, { notMerge: true });
    }
  }, [option]);

  return <div ref={ref} style={{ width: '100%', height }} />;
}

