'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { hasPermission } from '@/lib/permissions';

function MetaPreview({ value }: { value: unknown }) {
  if (!value) return <span className="text-slate-400">—</span>;
  const str = JSON.stringify(value);
  if (str.length <= 80) return <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{str}</span>;
  return (
    <span className="font-mono text-xs text-slate-600 dark:text-slate-300" title={str}>
      {str.slice(0, 78)}…
    </span>
  );
}

export default function AdminAuditPage() {
  const { user } = useAuth();
  const canReadAudit = hasPermission(user, 'admin.audit.read');

  const [limit, setLimit] = useState(50);
  const [actionFilter, setActionFilter] = useState('');
  const [queryText, setQueryText] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'audit', { limit, actionFilter, queryText, from, to }],
    queryFn: () =>
      adminApi.audit.list({
        limit,
        action: actionFilter || undefined,
        q: queryText || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to).toISOString() : undefined,
      }),
    enabled: canReadAudit,
  });

  if (!canReadAudit) {
    return <div className="card p-6 text-sm text-red-600 dark:text-red-300">Missing permission: admin.audit.read</div>;
  }

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      {message && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
          {message}
        </div>
      )}

      <div className="card p-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block mb-1 text-slate-600 dark:text-slate-300">Limit</span>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="input-field py-2">
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="block mb-1 text-slate-600 dark:text-slate-300">Action</span>
          <input value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="input-field py-2" placeholder="auth.login" />
        </label>
        <label className="text-sm">
          <span className="block mb-1 text-slate-600 dark:text-slate-300">Search</span>
          <input value={queryText} onChange={(e) => setQueryText(e.target.value)} className="input-field py-2" placeholder="email / user id" />
        </label>
        <label className="text-sm">
          <span className="block mb-1 text-slate-600 dark:text-slate-300">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input-field py-2" />
        </label>
        <label className="text-sm">
          <span className="block mb-1 text-slate-600 dark:text-slate-300">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input-field py-2" />
        </label>
        <button
          type="button"
          className="btn-secondary py-2"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            setMessage(null);
            try {
              await adminApi.audit.exportCsv({
                limit,
                action: actionFilter || undefined,
                q: queryText || undefined,
                from: from ? new Date(from).toISOString() : undefined,
                to: to ? new Date(to).toISOString() : undefined,
              });
              setMessage('Audit CSV downloaded.');
            } catch (err) {
              setMessage(err instanceof Error ? err.message : 'Export failed');
            } finally {
              setExporting(false);
            }
          }}
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Audit log</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{items.length} entries</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60">
                <th className="px-5 py-3 text-left text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400">Time</th>
                <th className="px-5 py-3 text-left text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400">Action</th>
                <th className="px-5 py-3 text-left text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400">Meta</th>
                <th className="px-5 py-3 text-left text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400">Before</th>
                <th className="px-5 py-3 text-left text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400">After</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-500">Loading audit entries…</td>
                </tr>
              )}
              {isError && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-red-600">Failed to load audit log.</td>
                </tr>
              )}
              {!isLoading && !isError && items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-500">No audit entries found.</td>
                </tr>
              )}
              {items.map((entry) => (
                <tr key={entry._id} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex rounded px-2 py-1 text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-5 py-3"><MetaPreview value={entry.meta} /></td>
                  <td className="px-5 py-3"><MetaPreview value={entry.before} /></td>
                  <td className="px-5 py-3"><MetaPreview value={entry.after} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
