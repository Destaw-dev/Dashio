'use client';

export function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-5 transition-shadow hover:shadow-card-hover">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

