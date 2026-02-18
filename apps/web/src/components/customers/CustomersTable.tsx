'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customersApi, type CustomersResponse } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { hasPermission } from '@/lib/permissions';

type SortBy = 'name' | 'createdAt';

export function CustomersTable() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canRead = hasPermission(user, 'customers.read');
  const canWrite = hasPermission(user, 'customers.write');

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'churned'>('all');
  const [sortBy, setSortBy] = useState<SortBy>('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [segmentId, setSegmentId] = useState('');
  const [activeViewId, setActiveViewId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [newSegmentName, setNewSegmentName] = useState('');
  const [newSegmentStatus, setNewSegmentStatus] = useState<'all' | 'active' | 'churned'>('all');
  const [newSegmentInactivity, setNewSegmentInactivity] = useState<number>(30);

  const query = useQuery<CustomersResponse>({
    queryKey: ['customers', { page, search, status, sortBy, order, segmentId }],
    queryFn: () =>
      customersApi.list({
        page,
        limit: 20,
        q: search || undefined,
        status: status === 'all' ? undefined : status,
        sortBy,
        order,
        segmentId: segmentId || undefined,
      }),
    enabled: canRead,
  });

  const viewsQuery = useQuery({
    queryKey: ['customers', 'views'],
    queryFn: () => customersApi.views.list(),
    enabled: canRead,
  });

  const segmentsQuery = useQuery({
    queryKey: ['customers', 'segments'],
    queryFn: () => customersApi.segments.list(),
    enabled: canRead,
  });

  const createViewMutation = useMutation({
    mutationFn: (name: string) =>
      customersApi.views.create({
        name,
        config: {
          q: search || undefined,
          status: status === 'all' ? undefined : status,
          sortBy,
          order,
          segmentId: segmentId || undefined,
        },
      }),
    onSuccess: () => {
      setMessage('View saved.');
      queryClient.invalidateQueries({ queryKey: ['customers', 'views'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  const deleteViewMutation = useMutation({
    mutationFn: (id: string) => customersApi.views.delete(id),
    onSuccess: () => {
      setMessage('View deleted.');
      setActiveViewId('');
      queryClient.invalidateQueries({ queryKey: ['customers', 'views'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  const createSegmentMutation = useMutation({
    mutationFn: () =>
      customersApi.segments.create({
        name: newSegmentName,
        rules: {
          status: newSegmentStatus === 'all' ? undefined : newSegmentStatus,
          inactivityDaysGte: newSegmentInactivity || undefined,
        },
      }),
    onSuccess: () => {
      setMessage('Segment created.');
      setNewSegmentName('');
      setNewSegmentStatus('all');
      setNewSegmentInactivity(30);
      queryClient.invalidateQueries({ queryKey: ['customers', 'segments'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  const bulkMutation = useMutation({
    mutationFn: (action: { kind: 'status'; status: 'active' | 'churned' } | { kind: 'segment'; segment?: string } | { kind: 'delete' }) => {
      if (action.kind === 'status') {
        return customersApi.bulk({ action: 'updateStatus', ids: selectedIds, status: action.status });
      }
      if (action.kind === 'segment') {
        return customersApi.bulk({ action: 'updateSegment', ids: selectedIds, segment: action.segment });
      }
      return customersApi.bulk({ action: 'delete', ids: selectedIds });
    },
    onSuccess: (data) => {
      setMessage(`Bulk action completed. Updated ${data.affected} customer(s).`);
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.limit)) : 1;
  const allVisibleIds = useMemo(() => query.data?.items.map((c) => c._id) ?? [], [query.data]);
  const allVisibleSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.includes(id));

  const handleSort = (field: SortBy) => {
    setActiveViewId('');
    if (sortBy === field) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setOrder('asc');
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !allVisibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...allVisibleIds])));
    }
  };

  const applyView = (viewId: string) => {
    const view = viewsQuery.data?.items.find((v) => v._id === viewId);
    setActiveViewId(viewId);
    if (!view) return;
    setPage(1);
    setSearch(view.config.q ?? '');
    setStatus(view.config.status ?? 'all');
    setSortBy((view.config.sortBy as SortBy) ?? 'createdAt');
    setOrder(view.config.order ?? 'desc');
    setSegmentId(view.config.segmentId ?? '');
  };

  const handleExportCsv = async () => {
    setMessage(null);
    setExporting(true);
    try {
      await customersApi.exportCsv({
        q: search || undefined,
        status: status === 'all' ? undefined : status,
        sortBy,
        order,
        limit: 5000,
        segmentId: segmentId || undefined,
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (!canRead) {
    return <div className="card p-6 text-sm text-red-600 dark:text-red-300">Missing permission: customers.read</div>;
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Customers</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Search, segment and run bulk actions</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
                setActiveViewId('');
              }}
              placeholder="Search by name or email"
              className="input-field w-full sm:w-56 py-2"
            />
            <select
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value as typeof status);
                setActiveViewId('');
              }}
              className="input-field w-auto min-w-[140px] py-2"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="churned">Churned</option>
            </select>
            <select
              value={segmentId}
              onChange={(e) => {
                setPage(1);
                setSegmentId(e.target.value);
                setActiveViewId('');
              }}
              className="input-field w-auto min-w-[160px] py-2"
            >
              <option value="">All segments</option>
              {segmentsQuery.data?.items.map((segment) => (
                <option key={segment._id} value={segment._id}>
                  {segment.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={handleExportCsv} disabled={exporting} className="btn-secondary py-2">
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        </div>

        <div className="card p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={activeViewId}
              onChange={(e) => applyView(e.target.value)}
              className="input-field w-auto min-w-[220px] py-2"
            >
              <option value="">Saved views</option>
              {viewsQuery.data?.items.map((view) => (
                <option key={view._id} value={view._id}>
                  {view.name}
                </option>
              ))}
            </select>
            {canWrite && (
              <button
                type="button"
                className="btn-secondary py-2"
                onClick={() => {
                  const name = window.prompt('View name');
                  if (name && name.trim()) createViewMutation.mutate(name.trim());
                }}
              >
                Save current view
              </button>
            )}
            {canWrite && activeViewId && (
              <button type="button" className="btn-danger py-2" onClick={() => deleteViewMutation.mutate(activeViewId)}>
                Delete view
              </button>
            )}
          </div>

          {canWrite && (
            <div className="grid gap-2 sm:grid-cols-4">
              <input
                value={newSegmentName}
                onChange={(e) => setNewSegmentName(e.target.value)}
                className="input-field"
                placeholder="New segment name"
              />
              <select
                value={newSegmentStatus}
                onChange={(e) => setNewSegmentStatus(e.target.value as typeof newSegmentStatus)}
                className="input-field"
              >
                <option value="all">Any status</option>
                <option value="active">Active only</option>
                <option value="churned">Churned only</option>
              </select>
              <input
                type="number"
                min={1}
                max={3650}
                value={newSegmentInactivity}
                onChange={(e) => setNewSegmentInactivity(Number(e.target.value))}
                className="input-field"
                placeholder="Inactivity days >="
              />
              <button
                type="button"
                className="btn-primary"
                disabled={createSegmentMutation.isPending || !newSegmentName.trim()}
                onClick={() => createSegmentMutation.mutate()}
              >
                {createSegmentMutation.isPending ? 'Creating…' : 'Create segment'}
              </button>
            </div>
          )}
        </div>

        {canWrite && selectedIds.length > 0 && (
          <div className="card p-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600 dark:text-slate-300">{selectedIds.length} selected</span>
            <button type="button" className="btn-secondary py-1.5" onClick={() => bulkMutation.mutate({ kind: 'status', status: 'active' })}>
              Set active
            </button>
            <button type="button" className="btn-secondary py-1.5" onClick={() => bulkMutation.mutate({ kind: 'status', status: 'churned' })}>
              Set churned
            </button>
            <button
              type="button"
              className="btn-secondary py-1.5"
              onClick={() => {
                const segment = window.prompt('Segment value (empty to clear)', '');
                if (segment === null) return;
                bulkMutation.mutate({ kind: 'segment', segment: segment.trim() || undefined });
              }}
            >
              Set segment
            </button>
            <button
              type="button"
              className="btn-danger py-1.5"
              onClick={() => {
                if (window.confirm(`Delete ${selectedIds.length} customers?`)) {
                  bulkMutation.mutate({ kind: 'delete' });
                }
              }}
            >
              Delete selected
            </button>
          </div>
        )}
      </div>

      {message && (
        <p className="text-sm text-slate-700 dark:text-slate-300" role="alert">
          {message}
        </p>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/80 dark:bg-slate-900/60">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
                </th>
                <Th sortable field="name" label="Name" sortBy={sortBy} order={order} onSort={handleSort} />
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Email</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Status</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Segment</th>
                <Th sortable field="createdAt" label="Created" sortBy={sortBy} order={order} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {query.isLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-500 dark:text-slate-400">Loading customers…</td>
                </tr>
              )}
              {query.isError && !query.isLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-red-600 dark:text-red-400 text-sm">Failed to load customers. Please try again.</td>
                </tr>
              )}
              {query.data && !query.isLoading && query.data.items.length === 0 && !query.isError && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-500 dark:text-slate-400 text-sm">No customers found for this filter.</td>
                </tr>
              )}
              {query.data &&
                query.data.items.map((c) => (
                  <tr key={c._id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selectedIds.includes(c._id)} onChange={() => toggleRow(c._id)} />
                    </td>
                    <td className="px-5 py-3 text-slate-900 dark:text-slate-100">
                      <Link href={`/customers/${c._id}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-700 dark:text-slate-200">
                      <Link href={`/customers/${c._id}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                        {c.email}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                          c.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                        }`}
                      >
                        {c.status === 'active' ? 'Active' : 'Churned'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{c.segment || '—'}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{new Date(c.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 dark:border-slate-800 px-3 py-2 text-xs text-gray-600 dark:text-slate-300">
          <div>
            {query.data && (
              <span>
                Page {query.data.page} of {totalPages} · {query.data.total.toLocaleString()} customers
              </span>
            )}
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || query.isLoading}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => { if (!query.data) return; setPage((p) => (p < totalPages ? p + 1 : p)); }}
              disabled={query.isLoading || (query.data ? page >= totalPages : true)}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 border-l border-slate-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Th({
  sortable,
  field,
  label,
  sortBy,
  order,
  onSort,
}: {
  sortable?: boolean;
  field: SortBy;
  label: string;
  sortBy: SortBy;
  order: 'asc' | 'desc';
  onSort: (field: SortBy) => void;
}) {
  if (!sortable) {
    return (
      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
        {label}
      </th>
    );
  }
  const isActive = sortBy === field;
  const direction = isActive ? order : undefined;
  return (
    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
      <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
        {label}
        <span className="text-[10px] text-slate-400">
          {direction === 'asc' && '▲'}
          {direction === 'desc' && '▼'}
          {!direction && '⋮'}
        </span>
      </button>
    </th>
  );
}
