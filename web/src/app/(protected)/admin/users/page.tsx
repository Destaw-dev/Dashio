'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, type Permission } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { hasPermission } from '@/lib/permissions';

const permissionOptions: Permission[] = [
  'analytics.read',
  'customers.read',
  'customers.write',
  'admin.users.read',
  'admin.users.write',
  'admin.audit.read',
  'alerts.manage',
  'reports.manage',
];

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [showAddUser, setShowAddUser] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addName, setAddName] = useState('');
  const [addRole, setAddRole] = useState<'admin' | 'viewer'>('viewer');
  const [addPermissions, setAddPermissions] = useState<Permission[]>(['analytics.read', 'customers.read']);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const canReadUsers = hasPermission(currentUser, 'admin.users.read');
  const canWriteUsers = hasPermission(currentUser, 'admin.users.write');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => adminApi.users.list(),
    enabled: canReadUsers,
  });

  const createUserMutation = useMutation({
    mutationFn: () =>
      adminApi.users.create({
        email: addEmail.trim(),
        password: addPassword,
        name: addName.trim() || undefined,
        role: addRole,
        permissions: addRole === 'admin' ? [] : addPermissions,
      }),
    onSuccess: () => {
      setShowAddUser(false);
      setAddEmail('');
      setAddPassword('');
      setAddName('');
      setAddRole('viewer');
      setAddPermissions(['analytics.read', 'customers.read']);
      setMessage({ type: 'success', text: 'User created.' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err: Error) => setMessage({ type: 'error', text: err.message }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'admin' | 'viewer' }) => adminApi.users.updateRole(userId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (err: Error) => setMessage({ type: 'error', text: err.message }),
  });

  const updatePermissionsMutation = useMutation({
    mutationFn: ({ userId, permissions }: { userId: string; permissions: Permission[] }) =>
      adminApi.users.updatePermissions(userId, permissions),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (err: Error) => setMessage({ type: 'error', text: err.message }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      adminApi.users.resetPassword(userId, password),
    onSuccess: () => setMessage({ type: 'success', text: 'Password reset.' }),
    onError: (err: Error) => setMessage({ type: 'error', text: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => adminApi.users.delete(userId),
    onSuccess: () => {
      setMessage({ type: 'success', text: 'User deleted.' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err: Error) => setMessage({ type: 'error', text: err.message }),
  });

  if (!canReadUsers) {
    return <div className="card p-6 text-sm text-red-600 dark:text-red-300">Missing permission: admin.users.read</div>;
  }

  if (isLoading) {
    return <div className="card p-6 text-sm text-slate-500">Loading users…</div>;
  }

  if (isError) {
    return <div className="card p-6 text-sm text-red-600">Failed to load users.</div>;
  }

  const users = data?.items ?? [];

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Users</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{users.length} users</p>
          </div>
          {canWriteUsers && (
            <button type="button" className="btn-primary" onClick={() => setShowAddUser((s) => !s)}>
              {showAddUser ? 'Close' : 'Add user'}
            </button>
          )}
        </div>

        {canWriteUsers && showAddUser && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <input className="input-field" placeholder="Email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} />
            <input className="input-field" placeholder="Password" type="password" value={addPassword} onChange={(e) => setAddPassword(e.target.value)} />
            <input className="input-field" placeholder="Name (optional)" value={addName} onChange={(e) => setAddName(e.target.value)} />
            <select className="input-field" value={addRole} onChange={(e) => setAddRole(e.target.value as 'admin' | 'viewer')}>
              <option value="viewer">viewer</option>
              <option value="admin">admin</option>
            </select>
            {addRole === 'viewer' && (
              <div className="sm:col-span-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Permissions</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {permissionOptions.map((perm) => (
                    <label key={perm} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={addPermissions.includes(perm)}
                        onChange={(e) =>
                          setAddPermissions((prev) =>
                            e.target.checked ? Array.from(new Set([...prev, perm])) : prev.filter((p) => p !== perm)
                          )
                        }
                      />
                      <span>{perm}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              className="btn-primary sm:col-span-2"
              disabled={createUserMutation.isPending || !addEmail.trim() || addPassword.length < 8}
              onClick={() => createUserMutation.mutate()}
            >
              {createUserMutation.isPending ? 'Creating…' : 'Create user'}
            </button>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Email</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Role</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Permissions</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <td className="px-5 py-3 text-slate-900 dark:text-slate-100">{u.email}</td>
                  <td className="px-5 py-3">
                    {canWriteUsers ? (
                      <select
                        value={u.role}
                        className="input-field py-1.5"
                        onChange={(e) => updateRoleMutation.mutate({ userId: u._id, role: e.target.value as 'admin' | 'viewer' })}
                        disabled={currentUser?.id === u._id}
                      >
                        <option value="viewer">viewer</option>
                        <option value="admin">admin</option>
                      </select>
                    ) : (
                      <span>{u.role}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-600 dark:text-slate-300">
                    {u.role === 'admin' ? 'all permissions' : (u.permissions.length ? u.permissions.join(', ') : 'none')}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {canWriteUsers && (
                      <div className="flex flex-wrap justify-end gap-2">
                        {u.role !== 'admin' && (
                          <button
                            type="button"
                            className="btn-secondary py-1.5"
                            onClick={() => {
                              const current = u.permissions.join(',');
                              const raw = window.prompt('Comma-separated permissions', current);
                              if (raw === null) return;
                              const permissions = raw
                                .split(',')
                                .map((v) => v.trim())
                                .filter(Boolean)
                                .filter((v): v is Permission => permissionOptions.includes(v as Permission));
                              updatePermissionsMutation.mutate({ userId: u._id, permissions });
                            }}
                          >
                            Edit perms
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-secondary py-1.5"
                          onClick={() => {
                            const pw = window.prompt('New password (min 8 chars)');
                            if (!pw || pw.length < 8) return;
                            resetPasswordMutation.mutate({ userId: u._id, password: pw });
                          }}
                        >
                          Reset pw
                        </button>
                        <button
                          type="button"
                          className="btn-danger py-1.5"
                          disabled={currentUser?.id === u._id}
                          onClick={() => {
                            if (window.confirm(`Delete ${u.email}?`)) {
                              deleteMutation.mutate(u._id);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
