'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi, type KpiResponse } from '@/lib/api';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { ChartCard } from '@/components/dashboard/ChartCard';

type RangePreset = '30d' | '90d' | '365d';

function getRange(preset: RangePreset): { from: string; to: string } {
  const to = new Date();
  const days = preset === '30d' ? 30 : preset === '90d' ? 90 : 365;
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function DashboardPage() {
  const [preset, setPreset] = useState<RangePreset>('90d');
  const range = useMemo(() => getRange(preset), [preset]);

  const kpisQuery = useQuery<KpiResponse>({
    queryKey: ['analytics', 'kpis', range],
    queryFn: () => analyticsApi.kpis(range),
  });

  const newCustomersQuery = useQuery({
    queryKey: ['analytics', 'new-customers', range],
    queryFn: () => analyticsApi.newCustomers({ ...range, groupBy: 'month' }),
  });

  const activityQuery = useQuery({
    queryKey: ['analytics', 'activity', range],
    queryFn: () => analyticsApi.activityTrend({ ...range, groupBy: 'month' }),
  });

  const churnQuery = useQuery({
    queryKey: ['analytics', 'churn', range],
    queryFn: () => analyticsApi.churn({ ...range, groupBy: 'month' }),
  });

  const cohortQuery = useQuery({
    queryKey: ['analytics', 'cohort-retention', range],
    queryFn: () => analyticsApi.cohortRetention({ ...range, horizonMonths: 6 }),
  });

  const loading =
    kpisQuery.isLoading || newCustomersQuery.isLoading || activityQuery.isLoading || churnQuery.isLoading;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Customer analytics overview</p>
        </div>
        <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 shadow-card">
          {([
            { id: '30d', label: 'Last 30 days' },
            { id: '90d', label: 'Last 90 days' },
            { id: '365d', label: 'Last 12 months' },
          ] as const).map((r) => (
            <button
              key={r.id}
              type="button"
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                preset === r.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              }`}
              onClick={() => setPreset(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <section>
        {kpisQuery.isError && (
          <div className="card mb-4 border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            Failed to load KPIs. Please try again.
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="card p-5 animate-pulse space-y-3">
                  <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-7 w-20 rounded bg-slate-200 dark:bg-slate-700" />
                </div>
              ))
            : kpisQuery.data && (
                <>
                  <KpiCard
                    label="Total customers"
                    value={kpisQuery.data.totalCustomers}
                  />
                  <KpiCard
                    label="Active customers"
                    value={kpisQuery.data.activeCustomers}
                  />
                  <KpiCard
                    label="New in period"
                    value={kpisQuery.data.newInPeriod}
                  />
                  <KpiCard
                    label="Churned in period"
                    value={kpisQuery.data.churnedInPeriod}
                  />
                </>
              )}
        </div>
      </section>

      {/* Charts */}
      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="New customers"
          description="New customers over time."
          query={newCustomersQuery}
          emptyMessage="No new customers in this period."
        />
        <ChartCard
          title="Activity trend"
          description="Customer activity events."
          query={activityQuery}
          emptyMessage="No activity in this period."
        />
        <ChartCard
          title="Churn"
          description="Churn events over time."
          query={churnQuery}
          emptyMessage="No churn events in this period."
        />
      </section>

      <section className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Cohort retention</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Retention by customer signup month</p>
        </div>
        <div className="p-4">
          {cohortQuery.isLoading && <p className="text-sm text-slate-500">Loading cohort data…</p>}
          {cohortQuery.isError && <p className="text-sm text-red-600">Failed to load cohort retention.</p>}
          {cohortQuery.data && cohortQuery.data.series.length === 0 && (
            <p className="text-sm text-slate-500">No cohort data in this date range.</p>
          )}
          {cohortQuery.data && cohortQuery.data.series.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left px-3 py-2 text-xs uppercase tracking-wide text-slate-500">Cohort</th>
                    <th className="text-left px-3 py-2 text-xs uppercase tracking-wide text-slate-500">Size</th>
                    {[0, 1, 2, 3, 4, 5].map((offset) => (
                      <th key={offset} className="text-left px-3 py-2 text-xs uppercase tracking-wide text-slate-500">
                        M{offset}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohortQuery.data.series.map((row) => (
                    <tr key={row.cohort} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{row.cohort}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.size}</td>
                      {[0, 1, 2, 3, 4, 5].map((offset) => {
                        const point = row.retention.find((r) => r.monthOffset === offset);
                        const rate = point?.retentionRate ?? 0;
                        const level =
                          rate >= 75 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' :
                          rate >= 50 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' :
                          rate >= 25 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' :
                          'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
                        return (
                          <td key={offset} className="px-3 py-2">
                            <span className={`inline-flex min-w-14 justify-center rounded-md px-2 py-1 text-xs font-medium ${level}`}>
                              {point ? `${rate}%` : '—'}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
