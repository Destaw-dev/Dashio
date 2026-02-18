'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { analyticsApi } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { hasPermission } from '@/lib/permissions';

export default function AlertsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState<'churn_spike' | 'activity_drop'>('churn_spike');
  const [thresholdPct, setThresholdPct] = useState(30);
  const [windowDays, setWindowDays] = useState(7);
  const [message, setMessage] = useState<string | null>(null);

  const canManageAlerts = hasPermission(user, 'alerts.manage');

  const rulesQuery = useQuery({
    queryKey: ['alerts', 'rules'],
    queryFn: () => analyticsApi.alerts.rules(),
    enabled: canManageAlerts,
  });

  const eventsQuery = useQuery({
    queryKey: ['alerts', 'events'],
    queryFn: () => analyticsApi.alerts.events(50),
    enabled: canManageAlerts,
  });

  const createRuleMutation = useMutation({
    mutationFn: () => analyticsApi.alerts.createRule({ name, type, thresholdPct, windowDays, enabled: true }),
    onSuccess: () => {
      setName('');
      setType('churn_spike');
      setThresholdPct(30);
      setWindowDays(7);
      setMessage('Rule created.');
      queryClient.invalidateQueries({ queryKey: ['alerts', 'rules'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  const toggleRuleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => analyticsApi.alerts.updateRule(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts', 'rules'] }),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => analyticsApi.alerts.deleteRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts', 'rules'] }),
  });

  const evaluateMutation = useMutation({
    mutationFn: () => analyticsApi.alerts.evaluate(),
    onSuccess: (data) => {
      setMessage(`Evaluation completed. Triggered ${data.triggered.length} alert(s).`);
      queryClient.invalidateQueries({ queryKey: ['alerts', 'events'] });
      queryClient.invalidateQueries({ queryKey: ['alerts', 'rules'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  if (!canManageAlerts) {
    return <div className="card p-6 text-sm text-red-600 dark:text-red-300">Missing permission: alerts.manage</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Alerts</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Smart anomaly rules and recent alert events</p>
      </div>

      {message && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
          {message}
        </div>
      )}

      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Create rule</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rule name"
            className="input-field"
          />
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="input-field">
            <option value="churn_spike">Churn spike</option>
            <option value="activity_drop">Activity drop</option>
          </select>
          <input
            type="number"
            min={1}
            max={1000}
            value={thresholdPct}
            onChange={(e) => setThresholdPct(Number(e.target.value))}
            className="input-field"
            placeholder="Threshold %"
          />
          <input
            type="number"
            min={1}
            max={90}
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            className="input-field"
            placeholder="Window days"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={() => createRuleMutation.mutate()}
            disabled={createRuleMutation.isPending || !name.trim()}
          >
            {createRuleMutation.isPending ? 'Creating…' : 'Create rule'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => evaluateMutation.mutate()}
            disabled={evaluateMutation.isPending}
          >
            {evaluateMutation.isPending ? 'Evaluating…' : 'Run evaluation'}
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Rules</h2>
        </div>
        <div className="p-4 space-y-2">
          {rulesQuery.isLoading && <p className="text-sm text-slate-500">Loading rules…</p>}
          {rulesQuery.isError && <p className="text-sm text-red-600">Failed to load rules.</p>}
          {rulesQuery.data?.items.length === 0 && <p className="text-sm text-slate-500">No rules yet.</p>}
          {rulesQuery.data?.items.map((rule) => (
            <div key={rule._id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{rule.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {rule.type} · {rule.thresholdPct}% · {rule.windowDays}d
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary py-1.5"
                  onClick={() => toggleRuleMutation.mutate({ id: rule._id, enabled: !rule.enabled })}
                >
                  {rule.enabled ? 'Disable' : 'Enable'}
                </button>
                <button type="button" className="btn-danger py-1.5" onClick={() => deleteRuleMutation.mutate(rule._id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent events</h2>
        </div>
        <div className="p-4 space-y-2">
          {eventsQuery.isLoading && <p className="text-sm text-slate-500">Loading events…</p>}
          {eventsQuery.isError && <p className="text-sm text-red-600">Failed to load events.</p>}
          {eventsQuery.data?.items.length === 0 && <p className="text-sm text-slate-500">No events yet.</p>}
          {eventsQuery.data?.items.map((event) => (
            <div key={event._id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{event.message}</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {new Date(event.createdAt).toLocaleString()} · {event.type}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
