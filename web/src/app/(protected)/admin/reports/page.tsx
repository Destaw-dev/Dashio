'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { hasPermission } from '@/lib/permissions';

export default function AdminReportsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManageReports = hasPermission(user, 'reports.manage');

  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [emails, setEmails] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const schedulesQuery = useQuery({
    queryKey: ['admin', 'reports', 'schedules'],
    queryFn: () => adminApi.reports.list(),
    enabled: canManageReports,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      adminApi.reports.create({
        name: name.trim(),
        frequency,
        emails: emails
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      setName('');
      setFrequency('weekly');
      setEmails('');
      setMessage('Schedule created.');
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports', 'schedules'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  const runDueMutation = useMutation({
    mutationFn: () => adminApi.reports.runDue(),
    onSuccess: (data) => {
      setMessage(`Ran ${data.ran} report schedule(s).`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports', 'schedules'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.reports.delete(id),
    onSuccess: () => {
      setMessage('Schedule deleted.');
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports', 'schedules'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => adminApi.reports.update(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'reports', 'schedules'] }),
    onError: (err: Error) => setMessage(err.message),
  });

  if (!canManageReports) {
    return <div className="card p-6 text-sm text-red-600 dark:text-red-300">Missing permission: reports.manage</div>;
  }

  const items = schedulesQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      {message && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
          {message}
        </div>
      )}

      <div className="card p-4 space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Create schedule</h2>
        <div className="grid gap-2 sm:grid-cols-4">
          <input
            className="input-field"
            placeholder="Schedule name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select className="input-field" value={frequency} onChange={(e) => setFrequency(e.target.value as 'weekly' | 'monthly')}>
            <option value="weekly">weekly</option>
            <option value="monthly">monthly</option>
          </select>
          <input
            className="input-field sm:col-span-2"
            placeholder="Recipients (comma separated emails)"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={createMutation.isPending || !name.trim()}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? 'Creating…' : 'Create schedule'}
          </button>
          <button type="button" className="btn-secondary" disabled={runDueMutation.isPending} onClick={() => runDueMutation.mutate()}>
            {runDueMutation.isPending ? 'Running…' : 'Run due now'}
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Scheduled reports</h2>
        </div>
        <div className="p-4 space-y-2">
          {schedulesQuery.isLoading && <p className="text-sm text-slate-500">Loading schedules…</p>}
          {schedulesQuery.isError && <p className="text-sm text-red-600">Failed to load schedules.</p>}
          {!schedulesQuery.isLoading && !schedulesQuery.isError && items.length === 0 && (
            <p className="text-sm text-slate-500">No schedules yet.</p>
          )}
          {items.map((item) => (
            <div key={item._id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {item.frequency} · next run {new Date(item.nextRunAt).toLocaleString()} · recipients: {item.emails.length}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary py-1.5"
                  onClick={() => toggleEnabledMutation.mutate({ id: item._id, enabled: !item.enabled })}
                >
                  {item.enabled ? 'Disable' : 'Enable'}
                </button>
                <button type="button" className="btn-danger py-1.5" onClick={() => deleteMutation.mutate(item._id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
